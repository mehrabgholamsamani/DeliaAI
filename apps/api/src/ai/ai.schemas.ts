import { z } from 'zod';

export const chatInputSchema = z.object({
  sessionId: z.string().cuid().optional(),
  message: z.string().trim().min(1).max(1200)
});

export const speechRequestSchema = z.object({
  sessionId: z.string().cuid()
});

export const startCallSchema = z.object({});

export const knowledgeArticleSchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/)
    .max(100),
  title: z.string().trim().min(1).max(160),
  content: z.string().trim().min(20).max(8000),
  isActive: z.boolean().optional(),
  category: z.enum(['COMPANY', 'SERVICE', 'POLICY', 'FAQ', 'PROMOTION', 'INTERNAL']).default('FAQ'),
  sourceLabel: z.string().trim().max(160).optional()
});

export const handoffRequestSchema = z.object({
  sessionId: z.string().cuid().optional(),
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120),
  phone: z.string().trim().min(7).max(30),
  message: z.string().trim().min(5).max(2000)
});
