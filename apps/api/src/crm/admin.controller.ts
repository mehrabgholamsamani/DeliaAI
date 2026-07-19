import { BadRequestException, Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AdminTokenGuard } from './admin-token.guard.js';
import { CrmService } from './crm.service.js';
import {
  overrideInputSchema,
  receptionistSettingsSchema,
  serviceInputSchema
} from './crm.schemas.js';

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException(result.error.flatten());
  return result.data;
}

@ApiTags('admin')
@ApiSecurity('admin-token')
@UseGuards(AdminTokenGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly crm: CrmService) {}

  @Get('bookings')
  getBookings() {
    return this.crm.listBookings();
  }

  @Get('services')
  getServices() {
    return this.crm.listServices(true);
  }

  @Get('receptionist-settings')
  getReceptionistSettings() {
    return this.crm.getBusiness();
  }

  @Post('receptionist-settings')
  updateReceptionistSettings(@Body() body: unknown) {
    return this.crm.updateReceptionistSettings(parse(receptionistSettingsSchema, body));
  }

  @Post('services')
  upsertService(@Body() body: unknown) {
    return this.crm.upsertService(parse(serviceInputSchema, body));
  }

  @Post('availability-overrides')
  setOverride(@Body() body: unknown) {
    return this.crm.setOverride(parse(overrideInputSchema, body));
  }
}
