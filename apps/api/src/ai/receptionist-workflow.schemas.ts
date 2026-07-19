import { z } from 'zod';
import { bookingInputSchema, manageBookingSchema, manageTokenSchema } from '../crm/crm.schemas.js';

export const prepareActionSchema = z.discriminatedUnion('action', [
  z.object({
    sessionId: z.string().cuid(),
    action: z.literal('CREATE_BOOKING'),
    payload: bookingInputSchema
  }),
  z.object({
    sessionId: z.string().cuid(),
    action: z.literal('UPDATE_BOOKING'),
    payload: manageBookingSchema
  }),
  z.object({
    sessionId: z.string().cuid(),
    action: z.literal('CANCEL_BOOKING'),
    payload: manageTokenSchema
  })
]);

export const confirmActionSchema = z.object({
  sessionId: z.string().cuid(),
  draftId: z.string().cuid(),
  confirmed: z.literal(true)
});
