import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService, type AuthenticatedAccount, SESSION_COOKIE } from './auth.service.js';

export type AuthenticatedRequest = Request & { account?: AuthenticatedAccount };

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const account = await this.auth.getAccount(request.cookies?.[SESSION_COOKIE]);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const csrf = request.header('x-csrf-token');
      if (!this.auth.csrfMatches(account, csrf))
        throw new UnauthorizedException('Invalid CSRF token');
    }
    request.account = account;
    return true;
  }
}
