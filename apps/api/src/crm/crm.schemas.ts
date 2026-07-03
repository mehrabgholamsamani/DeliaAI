import { z } from 'zod';

export const bookingInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120),
  phone: z.string().trim().min(7).max(30),
  serviceId: z.string().min(1),
  appointmentAt: z.string().datetime(),
  notes: z.string().trim().max(500).optional()
});

export const manageBookingSchema = bookingInputSchema.omit({ email: true }).extend({
  token: z.string().min(32)
});

export const workspaceBookingUpdateSchema = bookingInputSchema.omit({ email: true });

export const manageTokenSchema = z.object({ token: z.string().min(32) });

export const availabilityQuerySchema = z.object({
  start: z.string().date(),
  days: z.coerce.number().int().min(1).max(35).default(14),
  serviceId: z.string().min(1).optional()
});

export const serviceInputSchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/)
    .max(80),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500),
  priceLabel: z.string().trim().min(1).max(80),
  durationMinutes: z.number().int().min(15).max(720),
  isActive: z.boolean().optional()
});

export const overrideInputSchema = z.object({
  slotStartAt: z.string().datetime(),
  status: z.enum(['OPEN', 'BUSY'])
});

export const receptionistSettingsSchema = z.object({
  businessName: z.string().trim().min(2).max(120),
  companyDescription: z.string().trim().max(4000),
  greeting: z.string().trim().min(2).max(500),
  assistantTone: z.string().trim().min(2).max(160),
  bookingInstructions: z.string().trim().min(2).max(2000),
  handoffInstructions: z.string().trim().min(2).max(2000),
  contactDetails: z.string().trim().max(1000)
});
