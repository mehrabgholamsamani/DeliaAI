import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { ConflictException } from '@nestjs/common';
import { CrmService } from './crm.service.js';
import { PrismaService } from '../database/prisma.service.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  describe.skip('CRM PostgreSQL integration', () => {
    it('requires TEST_DATABASE_URL', () => undefined);
  });
} else
  describe('CRM PostgreSQL integration', () => {
    const prisma = new PrismaService({
      datasources: { db: { url: testDatabaseUrl! } }
    });
    const crm = new CrmService(prisma);
    beforeAll(async () => {
      await prisma.$connect();
    });

    beforeEach(async () => {
      await prisma.auditLog.deleteMany();
      await prisma.availabilityOverride.deleteMany();
      await prisma.booking.deleteMany();
      await prisma.customer.deleteMany();
      await prisma.service.deleteMany();
      await prisma.businessSettings.deleteMany();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it('uses the business timezone for availability and prevents concurrent double bookings', async () => {
      const services = await crm.listServices();
      const service = services[0]!;
      const timezone = 'America/New_York';
      await prisma.businessSettings.update({ where: { id: 'default' }, data: { timezone } });
      const start = DateTime.now().setZone(timezone).plus({ days: 7 }).toISODate()!;

      const availability = await crm.getAvailability({ start, days: 14, serviceId: service.id });
      const slot = availability.days.flatMap((day) => day.slots).find((item) => item.available);
      expect(slot).toBeDefined();
      expect(DateTime.fromISO(slot!.startAt).setZone(timezone).hour).toBe(9);

      const inputs = ['first@example.test', 'second@example.test'].map((email) => ({
        name: 'Reliable Customer',
        email,
        phone: '+15551234567',
        serviceId: service.id,
        appointmentAt: slot!.startAt
      }));
      const outcomes = await Promise.allSettled(inputs.map((input) => crm.createBooking(input)));

      expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
      const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
      expect(rejected?.status).toBe('rejected');
      if (rejected?.status === 'rejected')
        expect(rejected.reason).toBeInstanceOf(ConflictException);
    });
  });
