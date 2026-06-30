import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service.js';
import type { Environment } from '../config/environment.js';
import type { z } from 'zod';
import type { onboardingSchema, signUpSchema, workspaceSettingsSchema } from './auth.schemas.js';

type SignUpInput = z.infer<typeof signUpSchema>;
type OnboardingInput = z.infer<typeof onboardingSchema>;
type WorkspaceSettingsInput = z.infer<typeof workspaceSettingsSchema>;

export const SESSION_COOKIE = 'receptionist_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export type AuthenticatedAccount = {
  userId: string;
  email: string;
  workspaceId: string;
  workspaceName: string;
  onboardingCompleted: boolean;
  csrfToken: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Environment, true>
  ) {}

  googleLoginEnabled() {
    return Boolean(
      this.config.get('GOOGLE_OAUTH_CLIENT_ID', { infer: true }) &&
        this.config.get('GOOGLE_OAUTH_CLIENT_SECRET', { infer: true })
    );
  }

  async signUp(input: SignUpInput) {
    const passwordHash = await bcrypt.hash(input.password, 12);
    try {
      const account = await this.prisma.$transaction(async (tx) => {
        const workspace = await tx.workspace.create({ data: { name: input.businessName } });
        const user = await tx.userAccount.create({
          data: { email: input.email, passwordHash, workspaceId: workspace.id }
        });
        await tx.businessSettings.create({
          data: { workspaceId: workspace.id, businessName: input.businessName }
        });
        return { user, workspace };
      });
      return this.createSession(account.user.id, account.user.email, account.workspace);
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException('An account already exists for this email');
      throw error;
    }
  }

  async login(email: string, password: string) {
    const user = await this.prisma.userAccount.findUnique({
      where: { email },
      include: { workspace: true }
    });
    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      throw new UnauthorizedException('Email or password is incorrect');
    return this.createSession(user.id, user.email, user.workspace);
  }

  async beginGoogleLogin() {
    const clientId = this.config.get('GOOGLE_OAUTH_CLIENT_ID', { infer: true });
    const clientSecret = this.config.get('GOOGLE_OAUTH_CLIENT_SECRET', { infer: true });
    if (!clientId || !clientSecret)
      throw new ServiceUnavailableException('Google sign-in is not configured yet');
    const state = randomBytes(32).toString('base64url');
    const codeVerifier = randomBytes(48).toString('base64url');
    const nonce = randomBytes(24).toString('base64url');
    await this.prisma.oAuthLoginAttempt.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    await this.prisma.oAuthLoginAttempt.create({
      data: {
        stateHash: this.hash(state),
        codeVerifier,
        nonce,
        expiresAt: new Date(Date.now() + 10 * 60_000)
      }
    });
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: this.config.get('GOOGLE_OAUTH_REDIRECT_URI', { infer: true }),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: createHash('sha256').update(codeVerifier).digest('base64url'),
      code_challenge_method: 'S256',
      prompt: 'select_account'
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async finishGoogleLogin(input: { code?: string; state?: string; error?: string }) {
    if (input.error) throw new BadRequestException('Google sign-in was cancelled or denied');
    if (!input.code || !input.state) throw new BadRequestException('Google sign-in response is incomplete');
    const attempt = await this.prisma.oAuthLoginAttempt.findUnique({
      where: { stateHash: this.hash(input.state) }
    });
    if (!attempt || attempt.expiresAt <= new Date()) {
      if (attempt) await this.prisma.oAuthLoginAttempt.delete({ where: { id: attempt.id } });
      throw new BadRequestException('Google sign-in session expired. Please try again.');
    }
    await this.prisma.oAuthLoginAttempt.delete({ where: { id: attempt.id } });
    const clientId = this.config.get('GOOGLE_OAUTH_CLIENT_ID', { infer: true });
    const clientSecret = this.config.get('GOOGLE_OAUTH_CLIENT_SECRET', { infer: true });
    if (!clientId || !clientSecret)
      throw new ServiceUnavailableException('Google sign-in is not configured yet');
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: input.code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: this.config.get('GOOGLE_OAUTH_REDIRECT_URI', { infer: true }),
        grant_type: 'authorization_code',
        code_verifier: attempt.codeVerifier
      })
    });
    const token = (await tokenResponse.json().catch(() => null)) as { id_token?: string } | null;
    if (!tokenResponse.ok || !token?.id_token)
      throw new UnauthorizedException('Google could not verify this sign-in');
    const verifyResponse = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token.id_token)}`
    );
    const claims = (await verifyResponse.json().catch(() => null)) as {
      sub?: string;
      email?: string;
      email_verified?: string;
      aud?: string;
      iss?: string;
      nonce?: string;
    } | null;
    if (
      !verifyResponse.ok ||
      !claims?.sub ||
      !claims.email ||
      claims.email_verified !== 'true' ||
      claims.aud !== clientId ||
      !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss || '') ||
      claims.nonce !== attempt.nonce
    )
      throw new UnauthorizedException('Google identity verification failed');
    const email = claims.email.toLowerCase();
    const googleSubject = claims.sub;
    const identity = await this.prisma.authIdentity.findUnique({
      where: { provider_providerSubject: { provider: 'google', providerSubject: googleSubject } },
      include: { user: { include: { workspace: true } } }
    });
    if (identity) return this.createSession(identity.user.id, identity.user.email, identity.user.workspace);
    const account = await this.prisma.$transaction(async (tx) => {
      let user = await tx.userAccount.findUnique({ where: { email }, include: { workspace: true } });
      if (!user) {
        const workspace = await tx.workspace.create({ data: { name: email.split('@')[0] } });
        user = await tx.userAccount.create({
          data: {
            email,
            passwordHash: await bcrypt.hash(randomBytes(32).toString('base64url'), 12),
            workspaceId: workspace.id
          },
          include: { workspace: true }
        });
        await tx.businessSettings.create({ data: { workspaceId: workspace.id, businessName: workspace.name } });
      }
      await tx.authIdentity.create({
        data: { userId: user.id, provider: 'google', providerSubject: googleSubject }
      });
      return user;
    });
    return this.createSession(account.id, account.email, account.workspace);
  }

  async getAccount(sessionToken?: string): Promise<AuthenticatedAccount> {
    if (!sessionToken) throw new UnauthorizedException();
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash: this.hash(sessionToken) },
      include: { user: { include: { workspace: true } } }
    });
    if (!session || session.expiresAt <= new Date()) {
      if (session) await this.prisma.authSession.delete({ where: { id: session.id } });
      throw new UnauthorizedException();
    }
    return {
      userId: session.user.id,
      email: session.user.email,
      workspaceId: session.user.workspace.id,
      workspaceName: session.user.workspace.name,
      onboardingCompleted: session.user.workspace.onboardingCompleted,
      csrfToken: session.csrfToken
    };
  }

  async logout(sessionToken?: string) {
    if (sessionToken)
      await this.prisma.authSession.deleteMany({ where: { tokenHash: this.hash(sessionToken) } });
  }

  async updateOnboarding(account: AuthenticatedAccount, input: OnboardingInput) {
    const result = await this.prisma.$transaction(async (tx) => {
      const business = await tx.businessSettings.update({
        where: { workspaceId: account.workspaceId },
        data: input
      });
      const workspace = await tx.workspace.update({
        where: { id: account.workspaceId },
        data: { name: input.businessName, onboardingCompleted: true }
      });
      return { business, workspace };
    });
    return { business: result.business, onboardingCompleted: result.workspace.onboardingCompleted };
  }

  async updateWorkspaceSettings(account: AuthenticatedAccount, input: WorkspaceSettingsInput) {
    const result = await this.prisma.$transaction(async (tx) => {
      const business = await tx.businessSettings.update({
        where: { workspaceId: account.workspaceId },
        data: input
      });
      const workspace = await tx.workspace.update({
        where: { id: account.workspaceId },
        data: { name: input.businessName, onboardingCompleted: true }
      });
      return { business, workspace };
    });
    return { business: result.business, onboardingCompleted: result.workspace.onboardingCompleted };
  }

  async workspace(account: AuthenticatedAccount) {
    const business = await this.prisma.businessSettings.findUnique({
      where: { workspaceId: account.workspaceId }
    });
    if (!business) throw new UnauthorizedException();
    return {
      user: { email: account.email },
      workspace: {
        id: account.workspaceId,
        name: account.workspaceName,
        onboardingCompleted: account.onboardingCompleted
      },
      business
    };
  }

  csrfMatches(account: AuthenticatedAccount, supplied?: string) {
    if (!supplied) return false;
    const expected = Buffer.from(account.csrfToken);
    const actual = Buffer.from(supplied);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  cookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
      sameSite: 'lax' as const,
      path: '/',
      maxAge: SESSION_TTL_MS
    };
  }

  private async createSession(
    userId: string,
    email: string,
    workspace: { id: string; name: string; onboardingCompleted: boolean }
  ) {
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(24).toString('base64url');
    await this.prisma.authSession.deleteMany({ where: { userId, expiresAt: { lte: new Date() } } });
    await this.prisma.authSession.create({
      data: {
        userId,
        tokenHash: this.hash(token),
        csrfToken,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS)
      }
    });
    return {
      token,
      account: {
        userId,
        email,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        onboardingCompleted: workspace.onboardingCompleted,
        csrfToken
      }
    };
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}

function isUniqueViolation(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
