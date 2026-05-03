import dotenv from "dotenv";
import path from "node:path";
import { z } from "zod";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const productionRequiredEnv = [
  "APP_BASE_URL",
  "BUSINESS_OWNER_EMAIL",
  "MAIL_FROM",
  "SMTP_HOST"
] as const;
const testAdminPasswordHash =
  "$2b$12$ZS3Qird.jdD13D/0Y.7KPe/DeFEpD/pRdODc9eapK7vciB1/u3rvG";
const unsafeSecretPattern = /(change[-_ ]?me|test|development|localhost|password|secret)/i;
const testDatabasePattern = /(^|[_-])test([_-]|$)|booking_api_test/i;

function getMongoDatabaseName(url: string) {
  try {
    return new URL(url).pathname.replace(/^\//, "") || undefined;
  } catch {
    return undefined;
  }
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    RELEASE_VERSION: z.string().trim().optional(),
    BUILD_COMMIT: z.string().trim().optional(),
    BUILD_TIME: z.string().trim().optional(),
    MONGODB_URL: z.string().trim().min(1, "MONGODB_URL is required"),
    MONGODB_DB_NAME: z.string().trim().optional(),
    MONGODB_SERVER_SELECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    MONGODB_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    APP_BASE_URL: z.string().trim().url().default("http://localhost:5173"),
    BUSINESS_TIMEZONE: z.string().trim().default("Europe/Helsinki"),
    BUSINESS_OWNER_EMAIL: z.string().trim().email().default("owner@localhost.test"),
    CLIENT_ORIGIN: z.string().trim().optional(),
    SMTP_HOST: z.string().trim().default("127.0.0.1"),
    SMTP_PORT: z.coerce.number().int().positive().default(1025),
    SMTP_SECURE: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    SMTP_USER: z.string().trim().optional(),
    SMTP_PASS: z.string().optional(),
    MAIL_FROM: z.string().trim().default("Booking Test <no-reply@localhost.test>"),
    REVIEW_URL: z.string().trim().url().optional(),
    ALERTING_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    ALERT_EMAIL_TO: z.string().trim().email().optional(),
    ALERT_CHECK_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
    ALERT_COOLDOWN_MS: z.coerce.number().int().positive().default(30 * 60 * 1000),
    ALERT_LOOKBACK_MINUTES: z.coerce.number().int().positive().default(15),
    AUTOMATED_EMAILS_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    AUTOMATED_EMAIL_INTERVAL_MS: z.coerce.number().int().positive().default(5 * 60 * 1000),
    BOOKING_REMINDER_LEAD_HOURS: z.coerce.number().positive().default(24),
    REVIEW_REQUEST_DELAY_HOURS: z.coerce.number().min(0).default(2),
    EMAIL_JOB_WORKER_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    EMAIL_JOB_POLL_MS: z.coerce.number().int().positive().default(5_000),
    EMAIL_JOB_LOCK_MS: z.coerce.number().int().positive().default(5 * 60 * 1000),
    EMAIL_JOB_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    TRUST_PROXY: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    API_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
    API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    BOOKING_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60 * 60 * 1000),
    BOOKING_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
    MAGIC_LINK_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
    MAGIC_LINK_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
    ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
    ADMIN_LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(8),
    ADMIN_MUTATION_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
    ADMIN_MUTATION_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
    ADMIN_PASSWORD_HASH: z.string().trim().min(1, "ADMIN_PASSWORD_HASH is required"),
    ADMIN_SESSION_SECRET: z.string().trim().min(32, "ADMIN_SESSION_SECRET must be at least 32 characters"),
    ADMIN_SESSION_VERSION: z.string().trim().min(1).default("1"),
    ADMIN_SESSION_TTL_HOURS: z.coerce.number().positive().default(12),
    MONITOR_PASSWORD_HASH: z.string().trim().optional(),
    MONITOR_SESSION_SECRET: z.string().trim().optional(),
    MONITOR_SESSION_VERSION: z.string().trim().min(1).default("1"),
    MONITOR_SESSION_TTL_HOURS: z.coerce.number().positive().default(12),
    MONITOR_MFA_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    MONITOR_MFA_CODE_TTL_MINUTES: z.coerce.number().int().positive().max(60).default(10),
    MONITOR_MFA_MAX_ATTEMPTS: z.coerce.number().int().positive().max(20).default(5)
  })
  .superRefine((env, ctx) => {
    if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASS)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SMTP_USER"],
        message: "SMTP_USER and SMTP_PASS must be set together"
      });
    }

    if (!/^\$2[aby]\$\d{2}\$/.test(env.ADMIN_PASSWORD_HASH)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ADMIN_PASSWORD_HASH"],
        message: "ADMIN_PASSWORD_HASH must be a bcrypt hash"
      });
    }

    if (env.NODE_ENV !== "test" && env.ADMIN_PASSWORD_HASH === testAdminPasswordHash) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ADMIN_PASSWORD_HASH"],
        message: "ADMIN_PASSWORD_HASH must not use the shared test admin password"
      });
    }

    if (env.MONITOR_PASSWORD_HASH && !/^\$2[aby]\$\d{2}\$/.test(env.MONITOR_PASSWORD_HASH)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["MONITOR_PASSWORD_HASH"],
        message: "MONITOR_PASSWORD_HASH must be a bcrypt hash"
      });
    }

    if (env.MONITOR_SESSION_SECRET && env.MONITOR_SESSION_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["MONITOR_SESSION_SECRET"],
        message: "MONITOR_SESSION_SECRET must be at least 32 characters"
      });
    }

    if (env.NODE_ENV !== "test" && !env.MONITOR_PASSWORD_HASH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["MONITOR_PASSWORD_HASH"],
        message: "MONITOR_PASSWORD_HASH must be set explicitly"
      });
    }

    if (env.NODE_ENV !== "test" && !env.MONITOR_SESSION_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["MONITOR_SESSION_SECRET"],
        message: "MONITOR_SESSION_SECRET must be set explicitly"
      });
    }

    if (
      env.NODE_ENV !== "test" &&
      env.MONITOR_PASSWORD_HASH &&
      env.MONITOR_PASSWORD_HASH === env.ADMIN_PASSWORD_HASH
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["MONITOR_PASSWORD_HASH"],
        message: "MONITOR_PASSWORD_HASH must be different from ADMIN_PASSWORD_HASH"
      });
    }

    if (
      env.NODE_ENV !== "test" &&
      env.MONITOR_SESSION_SECRET &&
      env.MONITOR_SESSION_SECRET === env.ADMIN_SESSION_SECRET
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["MONITOR_SESSION_SECRET"],
        message: "MONITOR_SESSION_SECRET must be different from ADMIN_SESSION_SECRET"
      });
    }

    if (env.NODE_ENV !== "production") {
      return;
    }

    if (env.ALERTING_ENABLED && !env.ALERT_EMAIL_TO) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ALERT_EMAIL_TO"],
        message: "ALERT_EMAIL_TO must be set when alerting is enabled in production"
      });
    }

    for (const key of productionRequiredEnv) {
      if (!process.env[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} must be set explicitly in production`
        });
      }
    }

    if (env.APP_BASE_URL.includes("localhost") || env.APP_BASE_URL.includes("127.0.0.1")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["APP_BASE_URL"],
        message: "APP_BASE_URL must use the public website URL in production"
      });
    }

    if (env.BUSINESS_OWNER_EMAIL.endsWith("@localhost.test")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["BUSINESS_OWNER_EMAIL"],
        message: "BUSINESS_OWNER_EMAIL must use the real business owner email in production"
      });
    }

    if (env.MAIL_FROM.includes("@localhost.test")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["MAIL_FROM"],
        message: "MAIL_FROM must use a real sender address in production"
      });
    }

    if (!process.env.TRUST_PROXY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TRUST_PROXY"],
        message: "TRUST_PROXY must be set explicitly in production"
      });
    }

    if (env.SMTP_HOST === "localhost" || env.SMTP_HOST === "127.0.0.1") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SMTP_HOST"],
        message: "SMTP_HOST must point to a production mail service in production"
      });
    }

    if (unsafeSecretPattern.test(env.ADMIN_SESSION_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ADMIN_SESSION_SECRET"],
        message: "ADMIN_SESSION_SECRET contains an unsafe placeholder phrase"
      });
    }

    if (env.MONITOR_SESSION_SECRET && unsafeSecretPattern.test(env.MONITOR_SESSION_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["MONITOR_SESSION_SECRET"],
        message: "MONITOR_SESSION_SECRET contains an unsafe placeholder phrase"
      });
    }

    if (!env.MONITOR_MFA_ENABLED) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["MONITOR_MFA_ENABLED"],
        message: "MONITOR_MFA_ENABLED must be true in production"
      });
    }

    if (!env.ALERT_EMAIL_TO) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ALERT_EMAIL_TO"],
        message: "ALERT_EMAIL_TO must be set so monitoring login codes go to the operator"
      });
    }

    const databaseName = env.MONGODB_DB_NAME || getMongoDatabaseName(env.MONGODB_URL);

    if (databaseName && testDatabasePattern.test(databaseName)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["MONGODB_DB_NAME"],
        message: "Production must not use a test-looking MongoDB database name"
      });
    }
  });

export const config = envSchema.parse(process.env);

export function getAllowedOrigins() {
  const origins = new Set<string>([config.APP_BASE_URL]);

  if (config.CLIENT_ORIGIN) {
    config.CLIENT_ORIGIN.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
      .forEach((origin) => origins.add(origin));
  }

  if (config.NODE_ENV !== "production") {
    origins.add("http://localhost:5173");
    origins.add("http://127.0.0.1:5173");
  }

  return origins;
}
