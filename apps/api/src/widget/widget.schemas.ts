import { z } from 'zod';
import { availabilityQuerySchema } from '../crm/crm.schemas.js';
import { chatInputSchema } from '../ai/ai.schemas.js';
import { handoffRequestSchema } from '../ai/ai.schemas.js';
import { confirmActionSchema, prepareActionSchema } from '../ai/receptionist-workflow.schemas.js';

const publicKey = z.string().regex(/^dlw_[A-Za-z0-9_-]{24,}$/);

export const widgetSettingsSchema = z.object({
  allowedOrigins: z.array(z.string().url()).max(20),
  greeting: z.string().trim().max(500),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  isEnabled: z.boolean(),
  regenerateKey: z.boolean().optional()
});

export const widgetKeySchema = z.object({ key: publicKey });
export const widgetSessionSchema = z.object({ key: publicKey });
export const widgetChatSchema = chatInputSchema.extend({ key: publicKey, sessionId: z.string().cuid() });
export const widgetAvailabilitySchema = availabilityQuerySchema.extend({ key: publicKey });
export const widgetPrepareSchema = prepareActionSchema.and(z.object({ key: publicKey }));
export const widgetConfirmSchema = confirmActionSchema.extend({ key: publicKey });
export const widgetHandoffSchema = handoffRequestSchema.extend({ key: publicKey, sessionId: z.string().cuid() });
