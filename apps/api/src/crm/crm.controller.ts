import { BadRequestException, Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CrmService } from './crm.service.js';
import {
  availabilityQuerySchema,
  bookingInputSchema,
  manageBookingSchema,
  manageTokenSchema
} from './crm.schemas.js';

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException(result.error.flatten());
  return result.data;
}

@ApiTags('public booking')
@Controller()
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  @Get('business')
  getBusiness() {
    return this.crm.getBusiness();
  }

  @Get('services')
  getServices() {
    return this.crm.listServices();
  }

  @Get('availability')
  getAvailability(@Query() query: unknown) {
    return this.crm.getAvailability(parse(availabilityQuerySchema, query));
  }

  @Post('bookings')
  createBooking(@Body() body: unknown) {
    return this.crm.createBooking(parse(bookingInputSchema, body));
  }

  @Post('bookings/manage')
  getManagedBooking(@Body() body: unknown) {
    return this.crm.getManageableBooking(parse(manageTokenSchema, body).token);
  }

  @Patch('bookings/manage')
  updateManagedBooking(@Body() body: unknown) {
    return this.crm.updateManagedBooking(parse(manageBookingSchema, body));
  }

  @Patch('bookings/manage/cancel')
  cancelManagedBooking(@Body() body: unknown) {
    return this.crm.cancelManagedBooking(parse(manageTokenSchema, body).token);
  }
}
