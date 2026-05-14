import type { RequestHandler } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import helmet from "helmet";
import { config, getAllowedOrigins } from "../config.js";
import { createHttpError } from "./errorHandling.js";
import { MongoRateLimitStore } from "../mongoRateLimitStore.js";

function createRateLimitMessage(message: string) {
  return {
    message,
    error: {
      code: "RATE_LIMITED",
      message
    }
  };
}

export const securityHeaders = helmet({
  contentSecurityPolicy: config.NODE_ENV === "production" ? undefined : false,
  crossOriginEmbedderPolicy: false
});

export function createCorsOptions() {
  const allowedOrigins = getAllowedOrigins();

  return {
    origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(createHttpError(403, "Origin is not allowed", "CORS_ORIGIN_DENIED"));
    }
  };
}

export const noStoreApiResponses: RequestHandler = (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
};

export const requestTimeout: RequestHandler = (req, res, next) => {
  req.setTimeout(15_000);
  res.setTimeout(20_000);
  next();
};

export const apiLimiter = rateLimit({
  windowMs: config.API_RATE_LIMIT_WINDOW_MS,
  limit: config.API_RATE_LIMIT_MAX,
  store: new MongoRateLimitStore("api"),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: createRateLimitMessage("Too many requests. Please try again shortly.")
});

export const bookingCreateLimiter = rateLimit({
  windowMs: config.BOOKING_RATE_LIMIT_WINDOW_MS,
  limit: config.BOOKING_RATE_LIMIT_MAX,
  store: new MongoRateLimitStore("booking-create"),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: createRateLimitMessage("Too many booking requests. Please try again later."),
  keyGenerator: (req) => {
    const email = typeof req.body?.email === "string" ? req.body.email.toLowerCase().trim() : "";
    return `${ipKeyGenerator(req.ip || "")}:${email}`;
  }
});

export const magicLinkLimiter = rateLimit({
  windowMs: config.MAGIC_LINK_RATE_LIMIT_WINDOW_MS,
  limit: config.MAGIC_LINK_RATE_LIMIT_MAX,
  store: new MongoRateLimitStore("magic-link"),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: createRateLimitMessage("Too many magic link requests. Please try again shortly.")
});

export const adminLoginLimiter = rateLimit({
  windowMs: config.ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS,
  limit: config.ADMIN_LOGIN_RATE_LIMIT_MAX,
  store: new MongoRateLimitStore("admin-login"),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: createRateLimitMessage("Too many admin login attempts. Please try again shortly.")
});

export const adminMutationLimiter = rateLimit({
  windowMs: config.ADMIN_MUTATION_RATE_LIMIT_WINDOW_MS,
  limit: config.ADMIN_MUTATION_RATE_LIMIT_MAX,
  store: new MongoRateLimitStore("admin-mutation"),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: createRateLimitMessage("Too many admin changes. Please try again shortly.")
});
