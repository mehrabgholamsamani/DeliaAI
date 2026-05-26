import type { ErrorRequestHandler, RequestHandler } from "express";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { logger } from "../logger.js";
import { incrementMetric, observeRequestDuration } from "../metrics.js";
import { HttpRequestLog } from "../models/HttpRequestLog.js";
import { SystemEvent } from "../models/SystemEvent.js";

type ErrorDetails = Record<string, unknown> | string[] | undefined;

export class AppError extends Error {
  statusCode: number;
  code: string;
  details?: ErrorDetails;
  expose: boolean;

  constructor({
    message,
    statusCode,
    code,
    details,
    expose = true
  }: {
    message: string;
    statusCode: number;
    code: string;
    details?: ErrorDetails;
    expose?: boolean;
  }) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.expose = expose;
  }
}

export function createHttpError(
  statusCode: number,
  message: string,
  code = "REQUEST_ERROR",
  details?: ErrorDetails
) {
  return new AppError({ statusCode, message, code, details });
}

export function asyncHandler<T extends RequestHandler>(handler: T): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export const requestContext: RequestHandler = (req, res, next) => {
  const requestId = req.header("x-request-id") || randomUUID();

  res.locals.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
};

export const requestLogging: RequestHandler = (req, res, next) => {
  const startedAt = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    incrementMetric("httpRequestsTotal");
    observeRequestDuration(durationMs);

    if (res.statusCode >= 500) {
      incrementMetric("httpErrorsTotal");
    }

    logger.info("HTTP request completed", {
      requestId: res.locals.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs,
      ip: req.ip,
      userAgent: req.header("user-agent")
    });

    if (mongoose.connection.readyState === 1 && req.originalUrl.startsWith("/api")) {
      void HttpRequestLog.create({
        requestId: res.locals.requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs,
        ip: req.ip,
        userAgent: req.header("user-agent")
      }).catch((error) => {
        logger.warn("Failed to record request log", {
          requestId: res.locals.requestId,
          error
        });
      });
    }
  });

  next();
};

export const apiNotFoundHandler: RequestHandler = (req, _res, next) => {
  next(
    createHttpError(
      404,
      `API route ${req.method} ${req.originalUrl} was not found`,
      "API_ROUTE_NOT_FOUND"
    )
  );
};

function isJsonParseError(error: unknown) {
  return (
    error instanceof SyntaxError &&
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status?: number }).status === 400 &&
    "body" in error
  );
}

function isMongoDuplicateKeyError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: number }).code === 11000
  );
}

function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof ZodError) {
    return createHttpError(
      400,
      "Request validation failed",
      "VALIDATION_ERROR",
      error.flatten().fieldErrors
    );
  }

  if (isJsonParseError(error)) {
    return createHttpError(400, "Request body contains invalid JSON", "INVALID_JSON");
  }

  if (error instanceof mongoose.Error.ValidationError) {
    const details = Object.fromEntries(
      Object.entries(error.errors).map(([field, fieldError]) => [field, fieldError.message])
    );

    return createHttpError(400, "Database validation failed", "DATABASE_VALIDATION_ERROR", details);
  }

  if (error instanceof mongoose.Error.CastError) {
    return createHttpError(400, "Invalid database identifier or field value", "INVALID_DATABASE_VALUE", {
      path: error.path,
      value: error.value
    });
  }

  if (isMongoDuplicateKeyError(error)) {
    const keyPattern =
      typeof error === "object" && error !== null && "keyPattern" in error
        ? (error as { keyPattern?: Record<string, unknown> }).keyPattern
        : undefined;

    if (keyPattern?.appointmentAt || keyPattern?.occupiedSlotStarts) {
      return createHttpError(
        409,
        "This appointment time is already booked",
        "SLOT_BOOKED"
      );
    }

    return createHttpError(409, "A record with these unique details already exists", "DUPLICATE_RECORD");
  }

  if (error instanceof mongoose.Error.MongooseServerSelectionError) {
    return new AppError({
      statusCode: 503,
      message: "Database connection is unavailable",
      code: "DATABASE_UNAVAILABLE",
      expose: true
    });
  }

  return new AppError({
    statusCode: 500,
    message: "Internal server error",
    code: "INTERNAL_SERVER_ERROR",
    expose: false
  });
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const normalizedError = normalizeError(error);
  const isProduction = process.env.NODE_ENV === "production";
  const message =
    normalizedError.expose || !isProduction ? normalizedError.message : "Internal server error";
  const severity = "error";

  if (normalizedError.statusCode >= 500) {
    logger.error("Request failed", {
      requestId: res.locals.requestId,
      code: normalizedError.code,
      message: normalizedError.message,
      error
    });
  }

  if (normalizedError.statusCode >= 500 && mongoose.connection.readyState === 1) {
    void SystemEvent.create({
      severity,
      type: "http_error",
      message: normalizedError.message,
      code: normalizedError.code,
      requestId: res.locals.requestId,
      method: _req.method,
      path: _req.originalUrl,
      statusCode: normalizedError.statusCode,
      details:
        normalizedError.details && typeof normalizedError.details === "object"
          ? { details: normalizedError.details }
          : undefined
    }).catch((eventError) => {
      logger.warn("Failed to record system event", {
        requestId: res.locals.requestId,
        error: eventError
      });
    });
  }

  res.status(normalizedError.statusCode).json({
    message,
    error: {
      code: normalizedError.code,
      message,
      requestId: res.locals.requestId,
      ...(normalizedError.details ? { details: normalizedError.details } : {})
    }
  });
};
