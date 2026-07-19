import { BadRequestException, Body, Controller, Get, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { z } from 'zod';
import { SessionAuthGuard, type AuthenticatedRequest } from '../auth/auth.guard.js';
import { WidgetService } from './widget.service.js';
import {
  widgetAvailabilitySchema,
  widgetChatSchema,
  widgetConfirmSchema,
  widgetHandoffSchema,
  widgetKeySchema,
  widgetPrepareSchema,
  widgetSessionSchema,
  widgetSettingsSchema
} from './widget.schemas.js';

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException(result.error.flatten());
  return result.data;
}

function origin(request: Request) {
  return typeof request.headers.origin === 'string' ? request.headers.origin : undefined;
}

@Controller('workspace/widget')
@UseGuards(SessionAuthGuard)
export class WorkspaceWidgetController {
  constructor(private readonly widget: WidgetService) {}

  @Get() settings(@Req() request: AuthenticatedRequest) { return this.widget.settings(request.account!.workspaceId); }
  @Put() update(@Req() request: AuthenticatedRequest, @Body() body: unknown) { return this.widget.updateSettings(request.account!.workspaceId, parse(widgetSettingsSchema, body)); }
  @Get('sessions') sessions(@Req() request: AuthenticatedRequest) { return this.widget.recentSessions(request.account!.workspaceId); }
}

@Controller('public/widget')
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class PublicWidgetController {
  constructor(private readonly widget: WidgetService) {}

  @Get('config') config(@Query() query: unknown, @Req() request: Request) { return this.widget.publicConfig(parse(widgetKeySchema, query).key, origin(request)); }
  @Post('sessions') start(@Body() body: unknown, @Req() request: Request) { return this.widget.start(parse(widgetSessionSchema, body).key, origin(request)); }
  @Post('chat') chat(@Body() body: unknown, @Req() request: Request) { return this.widget.chat(parse(widgetChatSchema, body), origin(request)); }
  @Get('availability') availability(@Query() query: unknown, @Req() request: Request) {
    const input = parse(widgetAvailabilitySchema, query);
    return this.widget.availability({ ...input, days: input.days ?? 14 }, origin(request));
  }
  @Post('actions/prepare') prepare(@Body() body: unknown, @Req() request: Request) { return this.widget.prepare(parse(widgetPrepareSchema, body), origin(request)); }
  @Post('actions/confirm') confirm(@Body() body: unknown, @Req() request: Request) { return this.widget.confirm(parse(widgetConfirmSchema, body), origin(request)); }
  @Post('handoff') handoff(@Body() body: unknown, @Req() request: Request) { return this.widget.handoff(parse(widgetHandoffSchema, body), origin(request)); }
}
