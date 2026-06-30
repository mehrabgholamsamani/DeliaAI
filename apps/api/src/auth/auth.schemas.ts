import { z } from 'zod';

const email = z.string().trim().toLowerCase().email().max(120);
const password = z.string().min(12).max(128);

export const signUpSchema = z.object({
  email,
  password,
  businessName: z.string().trim().min(2).max(120)
});

export const loginSchema = z.object({ email, password: z.string().min(1).max(128) });

export const onboardingSchema = z.object({
  businessName: z.string().trim().min(2).max(120),
  industry: z.string().trim().min(2).max(120),
  companyDescription: z.string().trim().min(20).max(4000),
  contactDetails: z.string().trim().min(5).max(1000),
  timezone: z.string().trim().min(2).max(100),
  greeting: z.string().trim().min(2).max(500),
  bookingInstructions: z.string().trim().min(2).max(2000),
  handoffInstructions: z.string().trim().min(2).max(2000)
});

export const workspaceSettingsSchema = onboardingSchema.extend({
  receptionistPersonaId: z.enum(['maya', 'john', 'sofia', 'leo', 'random'])
});
