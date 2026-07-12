import { describe, expect, it } from 'vitest';
import { availabilityQuerySchema, bookingInputSchema, serviceInputSchema } from './crm.schemas.js';

describe('CRM contracts', () => {
  it('requires complete customer details and an ISO appointment', () => {
    expect(
      bookingInputSchema.safeParse({
        name: 'A',
        email: 'bad',
        phone: '1',
        serviceId: '',
        appointmentAt: 'tomorrow'
      }).success
    ).toBe(false);
  });

  it('defaults availability to fourteen days and rejects excessive ranges', () => {
    expect(availabilityQuerySchema.parse({ start: '2026-07-20' }).days).toBe(14);
    expect(availabilityQuerySchema.safeParse({ start: '2026-07-20', days: 36 }).success).toBe(
      false
    );
  });

  it('only accepts stable service slugs', () => {
    expect(
      serviceInputSchema.safeParse({
        slug: 'Deep Clean',
        name: 'Deep clean',
        description: 'x',
        priceLabel: '$10',
        durationMinutes: 60
      }).success
    ).toBe(false);
  });
});
