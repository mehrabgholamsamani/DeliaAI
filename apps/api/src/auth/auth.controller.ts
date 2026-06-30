import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Query,
  Param,
  Put,
  Req,
  Res,
  UseGuards
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { SessionAuthGuard, type AuthenticatedRequest } from './auth.guard.js';
import { AuthService, SESSION_COOKIE } from './auth.service.js';
import type { Environment } from '../config/environment.js';
import { ConfigService } from '@nestjs/config';
import { loginSchema, onboardingSchema, signUpSchema, workspaceSettingsSchema } from './auth.schemas.js';
import { AiService } from '../ai/ai.service.js';
import { KnowledgeService } from '../ai/knowledge.service.js';
import { chatInputSchema, knowledgeArticleSchema } from '../ai/ai.schemas.js';
import { CrmService } from '../crm/crm.service.js';
import { availabilityQuerySchema, serviceInputSchema, workspaceBookingUpdateSchema } from '../crm/crm.schemas.js';
import { ReceptionistWorkflowService } from '../ai/receptionist-workflow.service.js';
import { confirmActionSchema, prepareActionSchema } from '../ai/receptionist-workflow.schemas.js';

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException(result.error.flatten());
  return result.data;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Environment, true>
  ) {}

  @Post('signup')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async signUp(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.signUp(parse(signUpSchema, body));
    response.cookie(SESSION_COOKIE, result.token, this.auth.cookieOptions());
    return { account: result.account };
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const input = parse(loginSchema, body);
    const result = await this.auth.login(input.email, input.password);
    response.cookie(SESSION_COOKIE, result.token, this.auth.cookieOptions());
    return { account: result.account };
  }

  @Get('google/status')
  googleStatus() {
    return { enabled: this.auth.googleLoginEnabled() };
  }

  @Get('google')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async google(@Res() response: Response) {
    response.redirect(await this.auth.beginGoogleLogin());
  }

  @Get('google/callback')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async googleCallback(
    @Query() query: { code?: string; state?: string; error?: string },
    @Res() response: Response
  ) {
    const result = await this.auth.finishGoogleLogin(query);
    response.cookie(SESSION_COOKIE, result.token, this.auth.cookieOptions());
    const destination = result.account.onboardingCompleted ? '/dashboard' : '/onboarding';
    response.redirect(`${this.config.get('WEB_ORIGIN', { infer: true })}${destination}`);
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  me(@Req() request: AuthenticatedRequest) {
    return { account: request.account };
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(SessionAuthGuard)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(request.cookies?.[SESSION_COOKIE]);
    response.clearCookie(SESSION_COOKIE, this.auth.cookieOptions());
  }
}

@Controller('workspace')
@UseGuards(SessionAuthGuard)
export class WorkspaceController {
  constructor(
    private readonly auth: AuthService,
    private readonly ai: AiService,
    private readonly knowledge: KnowledgeService,
    private readonly crm: CrmService,
    private readonly workflow: ReceptionistWorkflowService
  ) {}

  @Get()
  getWorkspace(@Req() request: AuthenticatedRequest) {
    return this.auth.workspace(request.account!);
  }

  @Put('onboarding')
  updateOnboarding(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.auth.updateOnboarding(request.account!, parse(onboardingSchema, body));
  }

  @Put('settings')
  updateSettings(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.auth.updateWorkspaceSettings(
      request.account!,
      parse(workspaceSettingsSchema, body)
    );
  }

  @Get('knowledge')
  listKnowledge(@Req() request: AuthenticatedRequest) {
    return this.knowledge.list(true, request.account!.workspaceId);
  }

  @Post('knowledge')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  saveKnowledge(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.knowledge.upsert(parse(knowledgeArticleSchema, body), request.account!.workspaceId);
  }

  @Delete('knowledge/:slug')
  removeKnowledge(@Req() request: AuthenticatedRequest, @Param('slug') slug: string) {
    return this.knowledge.remove(slug, request.account!.workspaceId);
  }

  @Post('chat')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  chat(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.ai.chat({
      ...parse(chatInputSchema, body),
      workspaceId: request.account!.workspaceId
    });
  }

  @Get('services')
  services(@Req() request: AuthenticatedRequest) {
    return this.crm.listServices(false, request.account!.workspaceId);
  }

  @Post('services')
  saveService(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.crm.upsertService(parse(serviceInputSchema, body), request.account!.workspaceId);
  }

  @Get('crm/bookings')
  crmBookings(@Req() request: AuthenticatedRequest) {
    return this.crm.listBookings(request.account!.workspaceId);
  }

  @Get('crm/customers')
  crmCustomers(@Req() request: AuthenticatedRequest) {
    return this.crm.listCustomers(request.account!.workspaceId);
  }

  @Put('crm/bookings/:id')
  updateCrmBooking(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.crm.updateWorkspaceBooking(id, parse(workspaceBookingUpdateSchema, body), request.account!.workspaceId);
  }

  @Post('crm/bookings/:id/cancel')
  cancelCrmBooking(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.crm.cancelWorkspaceBooking(id, request.account!.workspaceId);
  }

  @Get('availability')
  availability(@Req() request: AuthenticatedRequest, @Query() query: unknown) {
    return this.crm.getAvailability(
      parse(availabilityQuerySchema, query),
      request.account!.workspaceId
    );
  }

  @Post('calls')
  startCall(@Req() request: AuthenticatedRequest) {
    return this.ai.startCall(request.account!.workspaceId);
  }

  @Post('actions/prepare')
  prepareAction(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.workflow.prepare(parse(prepareActionSchema, body), request.account!.workspaceId);
  }

  @Post('actions/confirm')
  confirmAction(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.workflow.confirm(parse(confirmActionSchema, body), request.account!.workspaceId);
  }
}
