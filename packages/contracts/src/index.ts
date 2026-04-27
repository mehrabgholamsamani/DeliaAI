import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('ai-receptionist-api'),
  timestamp: z.string().datetime()
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const receptionistToolSchemas = {
  getBusinessInfo: z.object({}),
  listServices: z.object({}),
  getServiceDetails: z.object({ serviceId: z.string().min(1) }),
  checkAvailability: z.object({
    serviceId: z.string().min(1),
    startDate: z.string().date(),
    endDate: z.string().date()
  }),
  createBooking: z.object({
    customerName: z.string().min(2).max(80),
    customerEmail: z.string().email(),
    customerPhone: z.string().min(7).max(30),
    serviceId: z.string().min(1),
    appointmentAt: z.string().datetime(),
    notes: z.string().max(500).optional()
  })
};

export const receptionistReplySchema = z.object({
  spokenText: z.string().min(1).max(2000),
  displayText: z.string().min(1).max(4000),
  intent: z.enum(['question', 'booking', 'update_booking', 'cancel_booking', 'handoff', 'unknown']),
  suggestedActions: z.array(z.string().max(120)).max(4),
  requiresConfirmation: z.boolean(),
  endCall: z.boolean(),
  plan: z
    .object({
      action: z.enum([
        'ANSWER',
        'COLLECT_BOOKING_DETAILS',
        'OFFER_AVAILABILITY',
        'PAUSE_BOOKING',
        'RESUME_BOOKING',
        'CORRECT_CONTACT',
        'REQUEST_CALLBACK',
        'HANDOFF',
        'CLARIFY',
        'RECOVER'
      ]),
      confidence: z.enum(['high', 'medium', 'low']),
      workflowStatus: z.enum(['idle', 'active', 'paused'])
    })
    .optional(),
  citedKnowledgeIds: z.array(z.string().max(120)).max(6),
  receptionist: z
    .object({
      id: z.string().max(40),
      name: z.string().min(1).max(80)
    })
    .optional(),
  bookingDetails: z
    .object({
      name: z.string().min(2).max(80).optional(),
      email: z.string().email().max(120).optional(),
      phone: z.string().min(7).max(30).optional(),
      serviceQuery: z.string().max(120).optional(),
      wantsEarliest: z.boolean().optional(),
      readyToReview: z.boolean().optional()
    })
    .optional()
});

export type ReceptionistReply = z.infer<typeof receptionistReplySchema>;
