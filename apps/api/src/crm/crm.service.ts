import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { AvailabilityStatus, BookingStatus, Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { DateTime } from 'luxon';
import { PrismaService } from '../database/prisma.service.js';
import type { z } from 'zod';
import type {
  availabilityQuerySchema,
  bookingInputSchema,
  manageBookingSchema,
  overrideInputSchema,
  receptionistSettingsSchema,
  serviceInputSchema
  ,workspaceBookingUpdateSchema
} from './crm.schemas.js';

type BookingInput = z.infer<typeof bookingInputSchema>;
type ManageBookingInput = z.infer<typeof manageBookingSchema>;
type WorkspaceBookingUpdateInput = z.infer<typeof workspaceBookingUpdateSchema>;
type ServiceInput = z.infer<typeof serviceInputSchema>;
type OverrideInput = z.infer<typeof overrideInputSchema>;
type ReceptionistSettingsInput = z.infer<typeof receptionistSettingsSchema>;

const defaultSettings = {
  businessName: 'Your Business',
  timezone: 'Europe/Berlin',
  operatingWeekdays: [1, 2, 3, 4, 5],
  slotStartHours: [9, 10, 11, 13, 14, 15, 16],
  slotDurationMinutes: 60
};
const LEGACY_WORKSPACE_ID = 'legacy';

const defaultServices: ServiceInput[] = [
  {
    slug: 'consultation',
    name: 'Consultation',
    description: 'A focused appointment to discuss your needs.',
    priceLabel: 'From $60',
    durationMinutes: 60
  },
  {
    slug: 'standard-service',
    name: 'Standard Service',
    description: 'A standard appointment for common customer needs.',
    priceLabel: 'From $120',
    durationMinutes: 120
  }
];

@Injectable()
export class CrmService {
  constructor(private readonly prisma: PrismaService) {}

  async getBusiness(workspaceId = LEGACY_WORKSPACE_ID) {
    return this.prisma.businessSettings.upsert({
      where: { workspaceId },
      update: {},
      create: { ...defaultSettings, workspaceId }
    });
  }

  async updateReceptionistSettings(
    input: ReceptionistSettingsInput,
    workspaceId = LEGACY_WORKSPACE_ID
  ) {
    const settings = await this.prisma.businessSettings.upsert({
      where: { workspaceId },
      update: input,
      create: { ...defaultSettings, ...input, workspaceId }
    });
    await this.audit(
      'receptionist.settings.update',
      'businessSettings',
      settings.id,
      'admin',
      undefined,
      undefined,
      workspaceId
    );
    return settings;
  }

  async listServices(includeInactive = false, workspaceId = LEGACY_WORKSPACE_ID) {
    await this.ensureDefaults(workspaceId);
    return this.prisma.service.findMany({
      where: { workspaceId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { name: 'asc' }
    });
  }

  async upsertService(input: ServiceInput, workspaceId = LEGACY_WORKSPACE_ID) {
    const service = await this.prisma.service.upsert({
      where: { workspaceId_slug: { workspaceId, slug: input.slug } },
      update: input,
      create: { ...input, workspaceId, isActive: input.isActive ?? true }
    });
    await this.audit(
      'service.upsert',
      'service',
      service.id,
      'admin',
      undefined,
      {
        slug: service.slug
      },
      workspaceId
    );
    return service;
  }

  async getAvailability(
    input: z.input<typeof availabilityQuerySchema>,
    workspaceId = LEGACY_WORKSPACE_ID
  ) {
    const settings = await this.getBusiness(workspaceId);
    const duration = input.serviceId
      ? await this.getServiceDuration(input.serviceId, workspaceId)
      : settings.slotDurationMinutes;
    const days = input.days ?? 14;
    const zone = settings.timezone;
    const firstDay = DateTime.fromISO(input.start, { zone }).startOf('day');
    if (!firstDay.isValid) throw new ConflictException('Business timezone is invalid');
    const now = new Date();
    const start = firstDay.toUTC().toJSDate();
    const end = firstDay.plus({ days }).toUTC().toJSDate();
    const [bookings, overrides] = await Promise.all([
      this.prisma.booking.findMany({
        where: {
          workspaceId,
          status: BookingStatus.OPEN,
          appointmentAt: { lt: end },
          appointmentEndAt: { gt: start }
        },
        select: { appointmentAt: true, appointmentEndAt: true }
      }),
      this.prisma.availabilityOverride.findMany({
        where: { workspaceId, slotStartAt: { gte: start, lt: end } }
      })
    ]);
    const overrideByTime = new Map(
      overrides.map((item) => [item.slotStartAt.getTime(), item.status])
    );
    const availabilityDays = Array.from({ length: days }, (_, offset) => {
      const day = firstDay.plus({ days: offset });
      const weekday = day.weekday;
      const slots = settings.operatingWeekdays.includes(weekday)
        ? settings.slotStartHours.map((hour) => {
            const slotStartAt = day
              .set({ hour, minute: 0, second: 0, millisecond: 0 })
              .toUTC()
              .toJSDate();
            const slotEndAt = new Date(slotStartAt.getTime() + duration * 60_000);
            const override = overrideByTime.get(slotStartAt.getTime());
            const overlaps = bookings.some(
              (booking) =>
                booking.appointmentAt < slotEndAt && booking.appointmentEndAt > slotStartAt
            );
            return {
              startAt: slotStartAt.toISOString(),
              available: slotStartAt > now && override !== AvailabilityStatus.BUSY && !overlaps
            };
          })
        : [];
      return { date: day.toISODate()!, slots };
    });
    return { timezone: settings.timezone, days: availabilityDays };
  }

  async createBooking(input: BookingInput, workspaceId = LEGACY_WORKSPACE_ID) {
    const token = randomBytes(32).toString('base64url');
    const booking = await this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const settings = await tx.businessSettings.upsert({
            where: { workspaceId },
            update: {},
            create: { ...defaultSettings, workspaceId }
          });
          if (settings.bookingPaused)
            throw new ConflictException(
              settings.bookingPauseMessage || 'Bookings are temporarily paused'
            );
          const service = await tx.service.findFirst({
            where: { id: input.serviceId, workspaceId, isActive: true }
          });
          if (!service) throw new NotFoundException('Service not found');
          const appointmentAt = new Date(input.appointmentAt);
          const appointmentEndAt = new Date(
            appointmentAt.getTime() + service.durationMinutes * 60_000
          );
          this.assertSupportedSlot(settings, appointmentAt);
          await this.assertSlotAvailable(tx, appointmentAt, appointmentEndAt, undefined, workspaceId);
          const customer = await tx.customer.upsert({
            where: {
              workspaceId_email: { workspaceId, email: input.email.toLowerCase() }
            },
            update: { name: input.name, phone: input.phone },
            create: { workspaceId, name: input.name, email: input.email.toLowerCase(), phone: input.phone }
          });
          return tx.booking.create({
            data: {
              workspaceId,
              customerId: customer.id,
              serviceId: service.id,
              appointmentAt,
              appointmentEndAt,
              notes: input.notes,
              managementTokenHash: this.hashToken(token),
              managementTokenExpiry: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
            },
            include: { customer: true, service: true }
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      )
    );
    await this.audit('booking.create', 'booking', booking.id, 'customer', booking.customerId, undefined, workspaceId);
    return { booking: this.serializeBooking(booking), manageToken: token };
  }

  async getManageableBooking(token: string) {
    const booking = await this.findByToken(token);
    return this.serializeBooking(booking);
  }

  async assertManagedBookingWorkspace(token: string, workspaceId: string) {
    const booking = await this.findByToken(token);
    if (booking.workspaceId !== workspaceId)
      throw new UnauthorizedException('Booking link is invalid or expired');
  }

  async updateManagedBooking(input: ManageBookingInput) {
    const booking = await this.findByToken(input.token);
    if (booking.status !== BookingStatus.OPEN)
      throw new ConflictException('Only active bookings can be changed');
    const result = await this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const settings = await tx.businessSettings.upsert({
            where: { workspaceId: booking.workspaceId },
            update: {},
            create: { ...defaultSettings, workspaceId: booking.workspaceId }
          });
          const service = await tx.service.findFirst({
            where: { id: input.serviceId, workspaceId: booking.workspaceId, isActive: true }
          });
          if (!service) throw new NotFoundException('Service not found');
          const appointmentAt = new Date(input.appointmentAt);
          const appointmentEndAt = new Date(
            appointmentAt.getTime() + service.durationMinutes * 60_000
          );
          this.assertSupportedSlot(settings, appointmentAt);
          await this.assertSlotAvailable(tx, appointmentAt, appointmentEndAt, booking.id, booking.workspaceId);
          await tx.customer.update({
            where: { id: booking.customerId },
            data: { name: input.name, phone: input.phone }
          });
          return tx.booking.update({
            where: { id: booking.id },
            data: { serviceId: service.id, appointmentAt, appointmentEndAt, notes: input.notes },
            include: { customer: true, service: true }
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      )
    );
    await this.audit('booking.update', 'booking', booking.id, 'customer', booking.customerId, undefined, booking.workspaceId);
    return this.serializeBooking(result);
  }

  async cancelManagedBooking(token: string) {
    const booking = await this.findByToken(token);
    if (booking.status !== BookingStatus.OPEN)
      throw new ConflictException('Only active bookings can be cancelled');
    const result = await this.prisma.booking.update({
      where: { id: booking.id },
      data: { status: BookingStatus.CANCELED, canceledAt: new Date() },
      include: { customer: true, service: true }
    });
    await this.audit('booking.cancel', 'booking', booking.id, 'customer', booking.customerId, undefined, booking.workspaceId);
    return this.serializeBooking(result);
  }

  async listBookings(workspaceId = LEGACY_WORKSPACE_ID) {
    const bookings = await this.prisma.booking.findMany({
      where: { workspaceId },
      include: { customer: true, service: true },
      orderBy: { appointmentAt: 'asc' }
    });
    return bookings.map((booking) => this.serializeBooking(booking));
  }

  async listCustomers(workspaceId = LEGACY_WORKSPACE_ID) {
    return this.prisma.customer.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { bookings: true } } }
    });
  }

  async updateWorkspaceBooking(
    bookingId: string,
    input: WorkspaceBookingUpdateInput,
    workspaceId = LEGACY_WORKSPACE_ID
  ) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, workspaceId },
      include: { customer: true, service: true }
    });
    if (!booking) throw new NotFoundException('Booking was not found');
    if (booking.status !== BookingStatus.OPEN)
      throw new ConflictException('Only active bookings can be changed');
    const result = await this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const settings = await tx.businessSettings.findUnique({ where: { workspaceId } });
          if (!settings) throw new NotFoundException('Business settings were not found');
          const service = await tx.service.findFirst({ where: { id: input.serviceId, workspaceId, isActive: true } });
          if (!service) throw new NotFoundException('Service not found');
          const appointmentAt = new Date(input.appointmentAt);
          const appointmentEndAt = new Date(appointmentAt.getTime() + service.durationMinutes * 60_000);
          this.assertSupportedSlot(settings, appointmentAt);
          await this.assertSlotAvailable(tx, appointmentAt, appointmentEndAt, booking.id, workspaceId);
          await tx.customer.update({ where: { id: booking.customerId }, data: { name: input.name, phone: input.phone } });
          return tx.booking.update({
            where: { id: booking.id },
            data: { serviceId: service.id, appointmentAt, appointmentEndAt, notes: input.notes },
            include: { customer: true, service: true }
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      )
    );
    await this.audit('booking.update', 'booking', booking.id, 'workspace-owner', undefined, undefined, workspaceId);
    return this.serializeBooking(result);
  }

  async cancelWorkspaceBooking(bookingId: string, workspaceId = LEGACY_WORKSPACE_ID) {
    const booking = await this.prisma.booking.findFirst({ where: { id: bookingId, workspaceId }, include: { customer: true, service: true } });
    if (!booking) throw new NotFoundException('Booking was not found');
    if (booking.status !== BookingStatus.OPEN) throw new ConflictException('Only active bookings can be cancelled');
    const result = await this.prisma.booking.update({
      where: { id: booking.id }, data: { status: BookingStatus.CANCELED, canceledAt: new Date() }, include: { customer: true, service: true }
    });
    await this.audit('booking.cancel', 'booking', booking.id, 'workspace-owner', undefined, undefined, workspaceId);
    return this.serializeBooking(result);
  }

  async setOverride(input: OverrideInput, workspaceId = LEGACY_WORKSPACE_ID) {
    const value = await this.prisma.availabilityOverride.upsert({
      where: {
        workspaceId_slotStartAt: { workspaceId, slotStartAt: new Date(input.slotStartAt) }
      },
      update: { status: input.status },
      create: { workspaceId, slotStartAt: new Date(input.slotStartAt), status: input.status }
    });
    await this.audit(
      'availability.override',
      'availabilityOverride',
      value.id,
      'admin',
      undefined,
      { status: value.status }, workspaceId
    );
    return value;
  }

  private async ensureDefaults(workspaceId: string) {
    await this.getBusiness(workspaceId);
    if (workspaceId !== LEGACY_WORKSPACE_ID) return;
    for (const service of defaultServices)
      await this.prisma.service.upsert({
        where: { workspaceId_slug: { workspaceId, slug: service.slug } },
        update: {},
        create: { ...service, workspaceId, isActive: true }
      });
  }

  private async getServiceDuration(serviceId: string, workspaceId = LEGACY_WORKSPACE_ID) {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, workspaceId, isActive: true }
    });
    if (!service) throw new NotFoundException('Service not found');
    return service.durationMinutes;
  }

  private async assertSlotAvailable(
    tx: Prisma.TransactionClient,
    start: Date,
    end: Date,
    currentBookingId?: string,
    workspaceId = LEGACY_WORKSPACE_ID
  ) {
    const [overlap, override] = await Promise.all([
      tx.booking.findFirst({
        where: {
          workspaceId,
          status: BookingStatus.OPEN,
          appointmentAt: { lt: end },
          appointmentEndAt: { gt: start },
          ...(currentBookingId ? { id: { not: currentBookingId } } : {})
        }
      }),
      tx.availabilityOverride.findUnique({
        where: { workspaceId_slotStartAt: { workspaceId, slotStartAt: start } }
      })
    ]);
    if (override?.status === AvailabilityStatus.BUSY || overlap)
      throw new ConflictException('That appointment time is no longer available');
  }

  private assertSupportedSlot(
    settings: { timezone: string; operatingWeekdays: number[]; slotStartHours: number[] },
    appointmentAt: Date
  ) {
    if (appointmentAt <= new Date())
      throw new ConflictException('Choose a future business appointment time');
    const localAppointment = DateTime.fromJSDate(appointmentAt, { zone: settings.timezone });
    if (!localAppointment.isValid) throw new ConflictException('Business timezone is invalid');
    const weekday = localAppointment.weekday;
    if (
      localAppointment.minute !== 0 ||
      !settings.operatingWeekdays.includes(weekday) ||
      !settings.slotStartHours.includes(localAppointment.hour)
    ) {
      throw new ConflictException('Choose an available business appointment time');
    }
  }

  private async findByToken(token: string) {
    const booking = await this.prisma.booking.findFirst({
      where: {
        managementTokenHash: this.hashToken(token),
        managementTokenExpiry: { gt: new Date() }
      },
      include: { customer: true, service: true }
    });
    if (!booking) throw new UnauthorizedException('Booking link is invalid or expired');
    return booking;
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private serializeBooking(booking: {
    id: string;
    appointmentAt: Date;
    appointmentEndAt: Date;
    status: BookingStatus;
    notes: string | null;
    customer: { name: string; email: string; phone: string };
    service: { id: string; name: string; durationMinutes: number };
  }) {
    return {
      id: booking.id,
      appointmentAt: booking.appointmentAt.toISOString(),
      appointmentEndAt: booking.appointmentEndAt.toISOString(),
      status: booking.status,
      notes: booking.notes,
      customer: booking.customer,
      service: booking.service
    };
  }

  private async audit(
    action: string,
    targetType: string,
    targetId: string,
    actorType: string,
    actorId?: string,
    metadata?: Prisma.InputJsonValue,
    workspaceId = LEGACY_WORKSPACE_ID
  ) {
    await this.prisma.auditLog.create({
      data: { action, targetType, targetId, actorType, actorId, metadata, workspaceId }
    });
  }

  private async withSerializableRetry<T>(operation: () => Promise<T>): Promise<T> {
    const attempts = 3;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
        if (!retryable || attempt === attempts) throw error;
      }
    }
    throw new Error('Unreachable retry state');
  }
}
