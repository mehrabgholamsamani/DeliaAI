import { z } from 'zod';

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().positive().default(4000),
    PORT: z.coerce.number().int().positive().optional(),
    WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
    DATABASE_URL: z.string().url(),
    GEMINI_API_KEY: z.string().min(20).optional(),
    GEMINI_MODEL: z.string().default('gemini-3.1-flash-lite'),
    GEMINI_EMBEDDING_MODEL: z.string().default('text-embedding-004'),
    GOOGLE_TTS_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
    GOOGLE_TTS_VOICE: z.string().default('en-US-Neural2-F'),
    GOOGLE_TTS_LANGUAGE_CODE: z.string().default('en-US'),
    GOOGLE_TTS_MONTHLY_CHARACTER_LIMIT: z.coerce.number().int().min(1).max(1_000_000).default(100_000),
    GOOGLE_STT_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
    GOOGLE_CLOUD_PROJECT: z.string().optional(),
    GOOGLE_STT_LANGUAGE_CODE: z.string().default('en-US'),
    GOOGLE_STT_MONTHLY_SECONDS_LIMIT: z.coerce.number().int().min(60).max(21_600).default(3_600),
    GOOGLE_STT_MAX_TURN_SECONDS: z.coerce.number().int().min(5).max(90).default(45),
    GOOGLE_OAUTH_CLIENT_ID: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(20).optional()
    ),
    GOOGLE_OAUTH_CLIENT_SECRET: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(10).optional()
    ),
    GOOGLE_OAUTH_REDIRECT_URI: z.string().url().default('http://localhost:4000/api/auth/google/callback'),
    ADMIN_API_TOKEN: z.string().min(32).optional(),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    NOTIFICATION_FROM: z.string().email().optional()
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === 'production' && !value.ADMIN_API_TOKEN)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ADMIN_API_TOKEN'],
        message: 'ADMIN_API_TOKEN must be set in production'
      });
  });

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(config: Record<string, unknown>): Environment {
  return environmentSchema.parse(config);
}
