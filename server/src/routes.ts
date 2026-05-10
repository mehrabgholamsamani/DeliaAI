import { Router, type Request } from "express";
import { DateTime } from "luxon";
import mongoose from "mongoose";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { config } from "./config.js";
import { sendMonitorLoginCodeEmail, sendMonitorTestEmail } from "./email.js";
import { enqueueEmailJob } from "./emailJobs.js";
import { logger } from "./logger.js";
import {
  clearAdminSession,
  clearMonitorSession,
  createAdminSession,
  createMonitorSession,
  getAdminCsrfToken,
  getMonitorCsrfToken,
  isAdminAuthenticated,
  isMonitorAuthenticated,
  requireAdminCsrf,
  requireAdminAuth,
  requireMonitorAuth,
  requireMonitorCsrf,
  verifyAdminPassword,
  verifyMonitorPassword
} from "./middleware/auth.js";
import { asyncHandler, createHttpError } from "./middleware/errorHandling.js";
import {
  adminLoginLimiter,
  adminMutationLimiter,
  bookingCreateLimiter,
  magicLinkLimiter
} from "./middleware/security.js";
import { getMetricsSnapshot } from "./metrics.js";
import { AdminAuditLog, type AdminAuditAction } from "./models/AdminAuditLog.js";
import { AlertState } from "./models/AlertState.js";
import { AvailabilityOverride } from "./models/AvailabilityOverride.js";
import { BrowserEvent, type BrowserEventDocument } from "./models/BrowserEvent.js";
import { Booking } from "./models/Booking.js";
import { EmailJob, type EmailJobDocument, type EmailJobStatus } from "./models/EmailJob.js";
import { HttpRequestLog, type HttpRequestLogDocument } from "./models/HttpRequestLog.js";
import { MonitorLoginChallenge } from "./models/MonitorLoginChallenge.js";
import { SystemEvent, type SystemEventDocument } from "./models/SystemEvent.js";
import {
  getBusinessSettings,
  getServiceById,
  updateBusinessSettings,
  type BusinessSettingsValue
} from "./services.js";

type LeanBooking = {
  _id: unknown;
  name?: string;
  email?: string;
  phone?: string;
  serviceId: string;
  serviceName: string;
  serviceDurationHours?: number;
  appointmentAt?: Date | string;
  appointmentEndAt?: Date | string;
  occupiedSlotStarts?: Date[] | string[];
  status?: "open" | "resolved" | "canceled";
  notes?: string;
  emailVerified?: boolean;
  emailVerifiedAt?: Date | string;
  emailVerificationExpiresAt?: Date | string;
  createdAt: Date | string;
  updatedAt?: Date | string;
  resolvedAt?: Date | string;
  canceledAt?: Date | string;
};

type BookingResponse = Omit<
  LeanBooking,
  "verificationTokenHash" | "reminderEmailSentAt" | "reviewEmailSentAt" | "occupiedSlotStarts"
> & {
  _id: unknown;
};

const bookingInputSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(80),
  email: z.string().trim().email("A valid email is required").max(120),
  phone: z.string().trim().min(7, "Phone number is required").max(30),
  serviceId: z.string().trim().min(1, "Choose a service"),
  appointmentAt: z
    .string()
    .trim()
    .min(1, "Choose an available appointment time")
    .refine((value) => !value || !Number.isNaN(Date.parse(value)), {
      message: "Choose a valid appointment time"
    }),
  notes: z.string().trim().max(500).optional().or(z.literal(""))
});

const bookingStatusQuerySchema = z
  .object({
    status: z.enum(["open", "resolved", "canceled", "all"]).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50)
  })
  .passthrough();
const bookingParamsSchema = z.object({
  bookingId: z.string().min(1)
});
const verifyBookingSchema = z.object({
  token: z.string().trim().min(32, "Verification token is required")
});
const manageTokenSchema = z.object({
  token: z.string().trim().min(32, "Magic link token is required")
});
const manageBookingInputSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(80),
  phone: z.string().trim().min(7, "Phone number is required").max(30),
  serviceId: z.string().trim().min(1, "Choose a service"),
  appointmentAt: z
    .string()
    .trim()
    .min(1, "Choose an available appointment time")
    .refine((value) => !value || !Number.isNaN(Date.parse(value)), {
      message: "Choose a valid appointment time"
    }),
  notes: z.string().trim().max(500).optional().or(z.literal(""))
});
const availabilityQuerySchema = z
  .object({
    start: z.string().trim().optional(),
    days: z.coerce.number().int().min(1).max(35).optional(),
    serviceId: z.string().trim().optional()
  })
  .passthrough();
const availabilityUpdateSchema = z.object({
  slotStartAt: z.string().trim().min(1),
  status: z.enum(["open", "busy"])
});
const serviceSettingsSchema = z.object({
  id: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  duration: z.string().trim().min(1).max(80),
  durationHours: z.number().int().min(1).max(12).default(2),
  price: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(500)
});
const businessSettingsUpdateSchema = z.object({
  businessName: z.string().trim().min(1).max(120).optional(),
  ownerEmail: z.string().trim().email().max(120).optional(),
  notificationEmailFromName: z.string().trim().min(1).max(120).optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
  operatingWeekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7).optional(),
  slotStartHours: z.array(z.number().int().min(0).max(23)).min(1).max(12).optional(),
  slotDurationHours: z.number().int().min(1).max(12).optional(),
  services: z.array(serviceSettingsSchema).min(1).max(24).optional()
});
const optionalUrlSchema = z
  .union([z.string().trim().url(), z.literal("")])
  .optional()
  .transform((value) => value || undefined);
const emailAutomationSettingsUpdateSchema = z.object({
  ownerBookingNoticeEnabled: z.boolean().optional(),
  bookingReminderEnabled: z.boolean().optional(),
  reviewRequestEnabled: z.boolean().optional(),
  reminderLeadHours: z.number().int().min(1).max(168).optional(),
  reviewRequestDelayHours: z.number().int().min(0).max(720).optional(),
  reviewUrl: optionalUrlSchema
});
const operationalControlsUpdateSchema = z.object({
  bookingsPaused: z.boolean().optional(),
  bookingPauseMessage: z.string().trim().max(240).optional().or(z.literal("")),
  maintenanceBannerEnabled: z.boolean().optional(),
  maintenanceBannerMessage: z.string().trim().max(240).optional().or(z.literal(""))
});
const adminLoginSchema = z.object({
  password: z.string().min(1, "Password is required")
});
const monitorLoginVerifySchema = z.object({
  challengeId: z.string().trim().min(32, "Login challenge is required").max(128),
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6 digit code")
});
const emailJobParamsSchema = z.object({
  jobId: z.string().min(1)
});
const monitorTestEmailSchema = z.object({
  to: z.string().trim().email().optional()
});
const browserTelemetrySchema = z.object({
  type: z.enum(["javascript_error", "unhandled_rejection", "web_vitals", "page_load"]),
  path: z.string().trim().min(1).max(500),
  message: z.string().trim().max(1000).optional(),
  source: z.string().trim().max(500).optional(),
  stack: z.string().trim().max(5000).optional(),
  metricName: z.string().trim().max(80).optional(),
  metricValue: z.number().finite().nonnegative().optional(),
  rating: z.enum(["good", "needs-improvement", "poor"]).optional()
});

export const router = Router();

const DEFAULT_AVAILABILITY_DAYS = 21;

async function recordAdminAudit({
  req,
  action,
  targetType,
  targetId,
  details
}: {
  req: Request;
  action: AdminAuditAction;
  targetType:
    | "businessSettings"
    | "operationalControls"
    | "availability"
    | "booking"
    | "emailJob"
    | "monitor";
  targetId?: string;
  details?: Record<string, unknown>;
}) {
  await AdminAuditLog.create({
    action,
    targetType,
    targetId,
    details,
    requestId: resLocalRequestId(req),
    ip: req.ip,
    userAgent: req.header("user-agent")
  });
}

function resLocalRequestId(req: Request) {
  return typeof req.res?.locals?.requestId === "string" ? req.res.locals.requestId : undefined;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function getMonitorMfaRecipient() {
  return config.ALERT_EMAIL_TO || config.BUSINESS_OWNER_EMAIL;
}

function buildMonitoringUrl() {
  return new URL("/monitoring", config.APP_BASE_URL).toString();
}

function hashMonitorLoginCode(challengeId: string, code: string) {
  const secret = config.MONITOR_SESSION_SECRET || config.ADMIN_SESSION_SECRET;

  return createHash("sha256").update(`${challengeId}:${code}:${secret}`).digest("hex");
}

function isMatchingHash(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function buildManageUrl(token: string) {
  const manageUrl = new URL("/manage-booking", config.APP_BASE_URL);
  manageUrl.searchParams.set("token", token);

  return manageUrl.toString();
}

function buildAdminUrl() {
  return new URL("/admin", config.APP_BASE_URL).toString();
}

function getBusinessDateTime(value: Date, timezone: string) {
  return DateTime.fromJSDate(value, { zone: "utc" }).setZone(timezone);
}

function startOfBusinessDay(timezone: string, value = new Date()) {
  return getBusinessDateTime(value, timezone).startOf("day");
}

function parseBusinessDate(value: string | undefined, timezone: string) {
  if (!value) {
    return startOfBusinessDay(timezone);
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (match) {
    return DateTime.fromObject(
      {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3])
      },
      { zone: timezone }
    ).startOf("day");
  }

  const parsed = DateTime.fromISO(value, { zone: timezone });

  if (!parsed.isValid) {
    throw createHttpError(400, "Choose a valid availability start date", "INVALID_AVAILABILITY_DATE");
  }

  return parsed.startOf("day");
}

function normalizeSlotStart(value: string | Date, timezone: string) {
  const parsed =
    value instanceof Date
      ? DateTime.fromJSDate(value, { zone: "utc" })
      : DateTime.fromISO(value, { setZone: true });

  if (!parsed.isValid || (typeof value === "string" && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value))) {
    throw createHttpError(400, "Choose a valid appointment time", "INVALID_APPOINTMENT_TIME");
  }

  const slotInBusinessZone = parsed.setZone(timezone);

  if (
    slotInBusinessZone.minute !== 0 ||
    slotInBusinessZone.second !== 0 ||
    slotInBusinessZone.millisecond !== 0
  ) {
    throw createHttpError(
      400,
      "Choose an exact available appointment slot",
      "INVALID_APPOINTMENT_TIME"
    );
  }

  return slotInBusinessZone.toUTC().toJSDate();
}

function ensureSupportedSlot(slotStartAt: Date, settings: BusinessSettingsValue) {
  const slotInBusinessZone = getBusinessDateTime(slotStartAt, settings.timezone);
  const day = slotInBusinessZone.weekday;
  const isWeekday = settings.operatingWeekdays.includes(day);
  const isSupportedHour =
    settings.slotStartHours.includes(slotInBusinessZone.hour) &&
    slotInBusinessZone.minute === 0 &&
    slotInBusinessZone.second === 0 &&
    slotInBusinessZone.millisecond === 0;

  if (!isWeekday || !isSupportedHour) {
    throw createHttpError(
      400,
      "Choose an available business slot",
      "UNSUPPORTED_APPOINTMENT_SLOT"
    );
  }
}

function getServiceDurationHours(serviceId: string | undefined, settings: BusinessSettingsValue) {
  if (!serviceId) {
    return settings.slotDurationHours;
  }

  return getServiceById(serviceId, settings)?.durationHours || settings.slotDurationHours;
}

function getSlotEnd(slotStartAt: Date, settings: BusinessSettingsValue, durationHours: number) {
  return getBusinessDateTime(slotStartAt, settings.timezone)
    .plus({ hours: durationHours })
    .toUTC()
    .toJSDate();
}

function buildOccupiedSlotStarts(slotStartAt: Date, slotEndAt: Date) {
  const occupiedSlotStarts: Date[] = [];
  let cursor = DateTime.fromJSDate(slotStartAt, { zone: "utc" });
  const end = DateTime.fromJSDate(slotEndAt, { zone: "utc" });

  while (cursor < end) {
    occupiedSlotStarts.push(cursor.toJSDate());
    cursor = cursor.plus({ hours: 1 });
  }

  return occupiedSlotStarts;
}

function getBookingDate(value: Date | string | undefined) {
  if (!value) {
    return undefined;
  }

  return value instanceof Date ? value : new Date(value);
}

function getBookingInterval(booking: LeanBooking, settings: BusinessSettingsValue) {
  const start = getBookingDate(booking.appointmentAt);

  if (!start) {
    return undefined;
  }

  return {
    start,
    end:
      getBookingDate(booking.appointmentEndAt) ||
      getSlotEnd(
        start,
        settings,
        booking.serviceDurationHours || getServiceDurationHours(booking.serviceId, settings)
      )
  };
}

function intervalsOverlap(
  leftStart: Date,
  leftEnd: Date,
  rightStart: Date,
  rightEnd: Date
) {
  return leftStart.getTime() < rightEnd.getTime() && leftEnd.getTime() > rightStart.getTime();
}

function formatBusinessDay(value: Date, timezone: string) {
  return getBusinessDateTime(value, timezone).toLocaleString({
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

function formatBusinessTime(value: Date, timezone: string) {
  return getBusinessDateTime(value, timezone).toLocaleString(DateTime.TIME_SIMPLE);
}

function formatBusinessAppointment(value: Date, timezone: string) {
  return getBusinessDateTime(value, timezone).toLocaleString({
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  });
}

async function ensureSlotAvailable(
  slotStartAt: Date,
  settings: BusinessSettingsValue,
  durationHours: number,
  currentBookingId?: string
) {
  ensureSupportedSlot(slotStartAt, settings);

  if (slotStartAt.getTime() <= Date.now()) {
    throw createHttpError(409, "This appointment time has already passed", "SLOT_IN_PAST");
  }

  const slotEndAt = getSlotEnd(slotStartAt, settings, durationHours);
  const busySlots = await AvailabilityOverride.find({
    slotStartAt: {
      $gte: DateTime.fromJSDate(slotStartAt, { zone: "utc" })
        .minus({ hours: 12 })
        .toJSDate(),
      $lt: slotEndAt
    }
  }).lean();
  const overlappingBusySlot = busySlots.find((slot) => {
    const busySlotStartAt = slot.slotStartAt;
    const busySlotEndAt = getSlotEnd(busySlotStartAt, settings, settings.slotDurationHours);

    return intervalsOverlap(slotStartAt, slotEndAt, busySlotStartAt, busySlotEndAt);
  });

  if (overlappingBusySlot) {
    throw createHttpError(409, "This appointment time is no longer available", "SLOT_BUSY");
  }

  const existingBookings = await Booking.find(
    buildActiveAppointmentWindowFilter(slotStartAt, slotEndAt, currentBookingId)
  ).lean<LeanBooking[]>();
  const overlappingBooking = existingBookings.find((booking) => {
    const interval = getBookingInterval(booking, settings);

    return interval && intervalsOverlap(slotStartAt, slotEndAt, interval.start, interval.end);
  });

  if (overlappingBooking) {
    throw createHttpError(409, "This appointment time is already booked", "SLOT_BOOKED");
  }
}

function ensureBookingsNotPaused(settings: BusinessSettingsValue) {
  if (settings.operationalControls.bookingsPaused) {
    throw createHttpError(
      503,
      settings.operationalControls.bookingPauseMessage ||
        "Online booking is temporarily paused. Please contact us directly.",
      "BOOKINGS_PAUSED"
    );
  }
}

function ensureObjectId(bookingId: string) {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    throw createHttpError(400, "Invalid booking id", "INVALID_BOOKING_ID", { bookingId });
  }
}

async function findBookingOrThrow(bookingId: string) {
  ensureObjectId(bookingId);
  const booking = await Booking.findById(bookingId);

  if (!booking) {
    throw createHttpError(404, "Booking was not found", "BOOKING_NOT_FOUND", { bookingId });
  }

  return booking;
}

async function buildAvailabilityDays(
  start: DateTime,
  days: number,
  settings: BusinessSettingsValue,
  serviceId?: string,
  includeBookingDetails = false
) {
  const rangeStart = start.startOf("day");
  const rangeEnd = rangeStart.plus({ days });
  const durationHours = getServiceDurationHours(serviceId, settings);

  const [busySlots, bookedSlots] = await Promise.all([
    AvailabilityOverride.find({
      slotStartAt: { $gte: rangeStart.toUTC().toJSDate(), $lt: rangeEnd.toUTC().toJSDate() }
    }).lean(),
    Booking.find({
      appointmentAt: {
        $gte: rangeStart.minus({ hours: 12 }).toUTC().toJSDate(),
        $lt: rangeEnd.toUTC().toJSDate()
      },
      $or: [{ status: "open" }, { status: { $exists: false } }]
    })
      .select(
        includeBookingDetails
          ? "_id name email phone serviceId serviceName serviceDurationHours appointmentAt appointmentEndAt status notes emailVerified emailVerifiedAt createdAt"
          : "_id serviceId serviceDurationHours appointmentAt appointmentEndAt"
      )
      .lean<LeanBooking[]>()
  ]);
  const availabilityDays = [];
  const now = Date.now();

  for (let index = 0; index < days; index += 1) {
    const day = rangeStart.plus({ days: index });

    if (!settings.operatingWeekdays.includes(day.weekday)) {
      continue;
    }

    const dayStart = day.toUTC().toJSDate();

    availabilityDays.push({
      date: dayStart.toISOString(),
      dateLabel: formatBusinessDay(dayStart, settings.timezone),
      timezone: settings.timezone,
      slots: settings.slotStartHours.map((hour) => {
        const slotStartAt = day.set({ hour, minute: 0, second: 0, millisecond: 0 }).toUTC().toJSDate();
        const slotEndAt = getSlotEnd(slotStartAt, settings, durationHours);
        const slotTime = slotStartAt.getTime();
        const bookedSlot = bookedSlots.find((booking) => {
          const interval = getBookingInterval(booking, settings);

          return interval && intervalsOverlap(slotStartAt, slotEndAt, interval.start, interval.end);
        });
        const busySlot = busySlots.find((slot) => {
          const busySlotStartAt = slot.slotStartAt;
          const busySlotEndAt = getSlotEnd(busySlotStartAt, settings, settings.slotDurationHours);

          return intervalsOverlap(slotStartAt, slotEndAt, busySlotStartAt, busySlotEndAt);
        });
        const status =
          slotTime <= now
            ? "past"
            : bookedSlot
              ? "booked"
              : busySlot
                ? "busy"
                : "open";

        return {
          slotStartAt: slotStartAt.toISOString(),
          slotEndAt: slotEndAt.toISOString(),
          timeLabel: `${formatBusinessTime(slotStartAt, settings.timezone)} - ${formatBusinessTime(
            slotEndAt,
            settings.timezone
          )}`,
          status,
          isAvailable: status === "open",
          bookingId: bookedSlot ? String(bookedSlot._id) : undefined,
          booking:
            includeBookingDetails && bookedSlot
              ? {
                  _id: String(bookedSlot._id),
                  name: bookedSlot.name,
                  email: bookedSlot.email,
                  phone: bookedSlot.phone,
                  serviceId: bookedSlot.serviceId,
                  serviceName: bookedSlot.serviceName,
                  serviceDurationHours: bookedSlot.serviceDurationHours,
                  appointmentAt: getBookingDate(bookedSlot.appointmentAt)?.toISOString(),
                  appointmentEndAt: getBookingDate(bookedSlot.appointmentEndAt)?.toISOString(),
                  status: bookedSlot.status || "open",
                  notes: bookedSlot.notes,
                  emailVerified: Boolean(bookedSlot.emailVerified),
                  emailVerifiedAt: getBookingDate(bookedSlot.emailVerifiedAt)?.toISOString(),
                  createdAt: getBookingDate(bookedSlot.createdAt)?.toISOString()
                }
              : undefined
        };
      })
    });
  }

  return availabilityDays;
}

function buildBookingStatusFilter(status: "open" | "resolved" | "canceled" | "all" | undefined) {
  if (status === "resolved") {
    return { status: "resolved" };
  }

  if (status === "canceled") {
    return { status: "canceled" };
  }

  if (status === "all") {
    return {};
  }

  return { $or: [{ status: "open" }, { status: { $exists: false } }] };
}

function buildActiveAppointmentWindowFilter(
  slotStartAt: Date,
  slotEndAt: Date,
  currentBookingId?: string
) {
  const filter: Record<string, unknown> = {
    appointmentAt: {
      $gte: DateTime.fromJSDate(slotStartAt, { zone: "utc" })
        .minus({ hours: 12 })
        .toJSDate(),
      $lt: slotEndAt
    },
    $or: [{ status: "open" }, { status: { $exists: false } }]
  };

  if (currentBookingId) {
    filter._id = { $ne: currentBookingId };
  }

  return filter;
}

function normalizeBookingStatus<T extends { status?: string }>(booking: T) {
  return {
    ...booking,
    status: (booking.status || "open") as "open" | "resolved" | "canceled"
  };
}

function serializeBooking(booking: unknown): BookingResponse {
  const rawBooking =
    booking && typeof booking === "object" && "toObject" in booking
      ? (booking as { toObject: () => Record<string, unknown> }).toObject()
      : (booking as Record<string, unknown>);
  const {
    verificationTokenHash: _verificationTokenHash,
    reminderEmailSentAt: _reminderEmailSentAt,
    reviewEmailSentAt: _reviewEmailSentAt,
    occupiedSlotStarts: _occupiedSlotStarts,
    __v: _version,
    ...safeBooking
  } = rawBooking;

  return normalizeBookingStatus(safeBooking as LeanBooking);
}

function getPayloadEmail(job: Pick<EmailJobDocument, "payload">) {
  const to = job.payload?.to;

  return typeof to === "string" ? to : undefined;
}

function serializeEmailJob(job: EmailJobDocument & { _id: unknown }) {
  return {
    _id: String(job._id),
    type: job.type,
    status: job.status,
    to: getPayloadEmail(job),
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    runAt: job.runAt?.toISOString(),
    lockedUntil: job.lockedUntil?.toISOString(),
    lastError: job.lastError,
    sentAt: job.sentAt?.toISOString(),
    createdAt: job.createdAt?.toISOString(),
    updatedAt: job.updatedAt?.toISOString()
  };
}

function serializeSystemEvent(event: SystemEventDocument & { _id: unknown }) {
  return {
    _id: String(event._id),
    severity: event.severity,
    type: event.type,
    message: event.message,
    code: event.code,
    requestId: event.requestId,
    method: event.method,
    path: event.path,
    statusCode: event.statusCode,
    details: event.details,
    createdAt: event.createdAt?.toISOString()
  };
}

function serializeBrowserEvent(event: BrowserEventDocument & { _id: unknown }) {
  return {
    _id: String(event._id),
    type: event.type,
    path: event.path,
    message: event.message,
    source: event.source,
    stack: event.stack,
    metricName: event.metricName,
    metricValue: event.metricValue,
    rating: event.rating,
    userAgent: event.userAgent,
    createdAt: event.createdAt?.toISOString()
  };
}

function serializeRequestLog(log: HttpRequestLogDocument & { _id: unknown }) {
  return {
    _id: String(log._id),
    requestId: log.requestId,
    method: log.method,
    path: log.path,
    statusCode: log.statusCode,
    durationMs: log.durationMs,
    userAgent: log.userAgent,
    createdAt: log.createdAt?.toISOString()
  };
}

function getHourlyBucketExpression(field = "$createdAt") {
  return {
    $dateToString: {
      format: "%Y-%m-%dT%H:00:00.000Z",
      date: field,
      timezone: "UTC"
    }
  };
}

async function getDatabaseStats() {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    return {
      available: false,
      collections: 0,
      objects: 0,
      dataSizeMb: 0,
      storageSizeMb: 0,
      indexSizeMb: 0
    };
  }

  try {
    const stats = await mongoose.connection.db.stats();
    let connections: number | undefined;

    try {
      const serverStatus = await mongoose.connection.db.admin().serverStatus();
      connections = serverStatus.connections?.current;
    } catch {
      connections = undefined;
    }

    return {
      available: true,
      collections: stats.collections || 0,
      objects: stats.objects || 0,
      dataSizeMb: Math.round((stats.dataSize || 0) / 1024 / 1024),
      storageSizeMb: Math.round((stats.storageSize || 0) / 1024 / 1024),
      indexSizeMb: Math.round((stats.indexSize || 0) / 1024 / 1024),
      connections
    };
  } catch {
    return {
      available: false,
      collections: 0,
      objects: 0,
      dataSizeMb: 0,
      storageSizeMb: 0,
      indexSizeMb: 0
    };
  }
}

async function runSyntheticChecks(settings: BusinessSettingsValue) {
  const checks: Array<{
    name: string;
    status: "pass" | "fail" | "warn";
    durationMs: number;
    message: string;
  }> = [];

  async function check(name: string, task: () => Promise<string>) {
    const startedAt = Date.now();

    try {
      const message = await task();
      checks.push({ name, status: "pass", durationMs: Date.now() - startedAt, message });
    } catch (error) {
      checks.push({
        name,
        status: "fail",
        durationMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : "Synthetic check failed"
      });
    }
  }

  await check("Services load", async () => {
    if (settings.services.length === 0) {
      throw new Error("No services configured");
    }

    return `${settings.services.length} services configured`;
  });

  await check("Availability opens", async () => {
    const availabilityDays = await buildAvailabilityDays(
      startOfBusinessDay(settings.timezone),
      7,
      settings,
      settings.services[0]?.id
    );
    const openSlots = availabilityDays.flatMap((day) => day.slots).filter((slot) => slot.status === "open");

    if (openSlots.length === 0) {
      throw new Error("No open customer slots in the next 7 operating days");
    }

    return `${openSlots.length} open slots available`;
  });

  await check("Booking form operational", async () => {
    if (settings.operationalControls.bookingsPaused) {
      return "Bookings are intentionally paused";
    }

    if (!settings.services[0]) {
      throw new Error("No service available for booking form");
    }

    return "Booking form can accept requests";
  });

  return checks;
}

function summarizeCounts<T extends string>(items: { _id: T; count: number }[]) {
  return Object.fromEntries(items.map((item) => [item._id, item.count]));
}

function serializeMonitoringBooking(booking: LeanBooking) {
  return {
    _id: String(booking._id),
    name: booking.name,
    serviceName: booking.serviceName,
    appointmentAt: getBookingDate(booking.appointmentAt)?.toISOString(),
    status: booking.status || "open",
    emailVerified: Boolean(booking.emailVerified),
    createdAt: getBookingDate(booking.createdAt)?.toISOString()
  };
}

async function buildMonitoringDashboard() {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const staleEmailLockCutoff = new Date(now.getTime() - config.EMAIL_JOB_LOCK_MS);
  const pendingEmailAgeCutoff = new Date(now.getTime() - 15 * 60 * 1000);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const metrics = getMetricsSnapshot();
  const databaseReady = mongoose.connection.readyState === 1 && Boolean(mongoose.connection.db);
  const settings = await getBusinessSettings();

  const [
    bookingStatusCounts,
    bookingsToday,
    upcomingBookings24Hours,
    pastOpenBookings,
    bookingsLast7Days,
    unverifiedOpenBookings,
    recentBookings,
    emailStatusCounts,
    staleProcessingEmailJobs,
    oldPendingEmailJobs,
    oldestPendingEmailJob,
    lastSentEmailJob,
    recentEmailJobs,
    failedEmailJobs,
    recentAuditLogs,
    recentAlertStates,
    recentSystemEvents,
    recentBrowserEvents,
    browserEventCounts,
    poorWebVitals,
    recentRequestLogs,
    requestTrend,
    bookingTrend,
    emailFailureTrend,
    databaseStats,
    syntheticChecks
  ] = await Promise.all([
    Booking.aggregate<{ _id: "open" | "resolved" | "canceled"; count: number }>([
      { $group: { _id: { $ifNull: ["$status", "open"] }, count: { $sum: 1 } } }
    ]),
    Booking.countDocuments({ createdAt: { $gte: dayStart } }),
    Booking.countDocuments({
      appointmentAt: { $gte: now, $lte: next24Hours },
      $or: [{ status: "open" }, { status: { $exists: false } }]
    }),
    Booking.countDocuments({
      appointmentAt: { $lt: now },
      $or: [{ status: "open" }, { status: { $exists: false } }]
    }),
    Booking.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
    Booking.countDocuments({
      emailVerified: false,
      $or: [{ status: "open" }, { status: { $exists: false } }]
    }),
    Booking.find()
      .sort({ createdAt: -1 })
      .limit(8)
      .select("_id name serviceName appointmentAt status emailVerified createdAt")
      .lean<LeanBooking[]>(),
    EmailJob.aggregate<{ _id: EmailJobStatus; count: number }>([
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]),
    EmailJob.find({
      status: "processing",
      $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: { $lte: now } }, { updatedAt: { $lte: staleEmailLockCutoff } }]
    })
      .sort({ updatedAt: 1 })
      .limit(8)
      .lean<(EmailJobDocument & { _id: unknown })[]>(),
    EmailJob.countDocuments({
      status: "pending",
      runAt: { $lte: pendingEmailAgeCutoff }
    }),
    EmailJob.findOne({ status: "pending" })
      .sort({ runAt: 1, createdAt: 1 })
      .select("runAt createdAt")
      .lean<(EmailJobDocument & { _id: unknown }) | null>(),
    EmailJob.findOne({ status: "sent" })
      .sort({ sentAt: -1, updatedAt: -1 })
      .select("sentAt updatedAt")
      .lean<(EmailJobDocument & { _id: unknown }) | null>(),
    EmailJob.find()
      .sort({ createdAt: -1 })
      .limit(8)
      .lean<(EmailJobDocument & { _id: unknown })[]>(),
    EmailJob.find({ status: "failed" })
      .sort({ updatedAt: -1 })
      .limit(8)
      .lean<(EmailJobDocument & { _id: unknown })[]>(),
    AdminAuditLog.find()
      .sort({ createdAt: -1 })
      .limit(8)
      .select("_id action targetType targetId createdAt")
      .lean<
        {
          _id: unknown;
          action: AdminAuditAction;
          targetType: "businessSettings" | "availability" | "booking" | "emailJob" | "monitor";
          targetId?: string;
          createdAt: Date;
        }[]
      >(),
    AlertState.find()
      .sort({ updatedAt: -1 })
      .limit(12)
      .select("key status lastSentAt lastResolvedAt lastMessage updatedAt")
      .lean<
        {
          _id: unknown;
          key: string;
          status: "active" | "resolved";
          lastSentAt?: Date;
          lastResolvedAt?: Date;
          lastMessage?: string;
          updatedAt: Date;
        }[]
      >(),
    SystemEvent.find({ severity: { $in: ["warning", "error"] } })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean<(SystemEventDocument & { _id: unknown })[]>(),
    BrowserEvent.find()
      .sort({ createdAt: -1 })
      .limit(20)
      .lean<(BrowserEventDocument & { _id: unknown })[]>(),
    BrowserEvent.aggregate<{ _id: string; count: number }>([
      { $match: { createdAt: { $gte: dayAgo } } },
      { $group: { _id: "$type", count: { $sum: 1 } } }
    ]),
    BrowserEvent.countDocuments({
      createdAt: { $gte: dayAgo },
      type: "web_vitals",
      rating: "poor"
    }),
    HttpRequestLog.find()
      .sort({ createdAt: -1 })
      .limit(30)
      .lean<(HttpRequestLogDocument & { _id: unknown })[]>(),
    HttpRequestLog.aggregate<{
      _id: string;
      requests: number;
      errors: number;
      averageDurationMs: number;
    }>([
      { $match: { createdAt: { $gte: dayAgo } } },
      {
        $group: {
          _id: getHourlyBucketExpression(),
          requests: { $sum: 1 },
          errors: { $sum: { $cond: [{ $gte: ["$statusCode", 500] }, 1, 0] } },
          averageDurationMs: { $avg: "$durationMs" }
        }
      },
      { $sort: { _id: 1 } }
    ]),
    Booking.aggregate<{ _id: string; created: number }>([
      { $match: { createdAt: { $gte: dayAgo } } },
      { $group: { _id: getHourlyBucketExpression(), created: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]),
    EmailJob.aggregate<{ _id: string; failed: number }>([
      { $match: { updatedAt: { $gte: dayAgo }, status: "failed" } },
      { $group: { _id: getHourlyBucketExpression("$updatedAt"), failed: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]),
    getDatabaseStats(),
    runSyntheticChecks(settings)
  ]);

  const bookingsByStatus = summarizeCounts(bookingStatusCounts);
  const emailsByStatus = summarizeCounts(emailStatusCounts);
  const totalBookings = bookingStatusCounts.reduce((total, item) => total + item.count, 0);
  const queuedEmails = (emailsByStatus.pending || 0) + (emailsByStatus.processing || 0);
  const oldestPendingRunAt = oldestPendingEmailJob?.runAt || oldestPendingEmailJob?.createdAt;
  const oldestPendingAgeMinutes = oldestPendingRunAt
    ? Math.max(0, Math.round((now.getTime() - oldestPendingRunAt.getTime()) / 60_000))
    : 0;
  const errorRate =
    metrics.httpRequestsTotal === 0
      ? 0
      : Math.round((metrics.httpErrorsTotal / metrics.httpRequestsTotal) * 100);
  const browserCounts = summarizeCounts(browserEventCounts);
  const failedSyntheticChecks = syntheticChecks.filter((check) => check.status === "fail");
  const incidents = [
    ...(databaseReady
      ? []
      : [{ severity: "critical", message: "Database connection is not ready", action: "Check MongoDB connection and credentials" }]),
    ...(staleProcessingEmailJobs.length > 0
      ? [
          {
            severity: "critical",
            message: `${staleProcessingEmailJobs.length} email job${staleProcessingEmailJobs.length === 1 ? "" : "s"} stuck in processing`,
            action: "Unlock stale jobs and confirm the worker is running"
          }
        ]
      : []),
    ...(emailsByStatus.failed
      ? [
          {
            severity: "warning",
            message: `${emailsByStatus.failed} failed email job${emailsByStatus.failed === 1 ? "" : "s"}`,
            action: "Review the last error and retry after fixing SMTP or payload issues"
          }
        ]
      : []),
    ...(oldPendingEmailJobs > 0
      ? [
          {
            severity: "warning",
            message: `${oldPendingEmailJobs} pending email job${oldPendingEmailJobs === 1 ? "" : "s"} older than 15 minutes`,
            action: "Confirm the email worker is enabled and processing"
          }
        ]
      : []),
    ...(pastOpenBookings > 0
      ? [
          {
            severity: "warning",
            message: `${pastOpenBookings} open booking${pastOpenBookings === 1 ? "" : "s"} are in the past`,
            action: "Resolve, cancel, or follow up from the owner dashboard"
          }
        ]
      : []),
    ...(metrics.httpErrorsTotal > 0
      ? [
          {
            severity: "warning",
            message: `${metrics.httpErrorsTotal} server error${metrics.httpErrorsTotal === 1 ? "" : "s"} recorded since process start`,
            action: "Inspect recent system events"
          }
        ]
      : []),
    ...(browserCounts.javascript_error || browserCounts.unhandled_rejection
      ? [
          {
            severity: "warning",
            message: `${(browserCounts.javascript_error || 0) + (browserCounts.unhandled_rejection || 0)} frontend error${(browserCounts.javascript_error || 0) + (browserCounts.unhandled_rejection || 0) === 1 ? "" : "s"} in the last 24 hours`,
            action: "Review frontend health and recent browser events"
          }
        ]
      : []),
    ...(poorWebVitals > 0
      ? [
          {
            severity: "warning",
            message: `${poorWebVitals} poor web vital event${poorWebVitals === 1 ? "" : "s"} in the last 24 hours`,
            action: "Check affected pages and recent deploy changes"
          }
        ]
      : []),
    ...(failedSyntheticChecks.length > 0
      ? [
          {
            severity: "critical",
            message: `${failedSyntheticChecks.length} synthetic check${failedSyntheticChecks.length === 1 ? "" : "s"} failed`,
            action: "Open synthetic checks and repair the broken customer path"
          }
        ]
      : [])
  ];

  return {
    status: {
      generatedAt: now.toISOString(),
      api: "online",
      database: databaseReady ? "ready" : "not-ready",
      databaseName: mongoose.connection.db?.databaseName,
      environment: config.NODE_ENV,
      appBaseUrl: config.APP_BASE_URL,
      emailJobWorkerEnabled: config.EMAIL_JOB_WORKER_ENABLED,
      automatedSchedulerEnabled: config.AUTOMATED_EMAILS_ENABLED,
      uptimeSeconds: metrics.uptimeSeconds,
      averageRequestDurationMs: metrics.averageRequestDurationMs,
      memoryRssMb: Math.round(metrics.memory.rss / 1024 / 1024)
    },
    release: {
      version: config.RELEASE_VERSION || process.env.npm_package_version || "local",
      commit: config.BUILD_COMMIT || process.env.RENDER_GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA,
      buildTime: config.BUILD_TIME,
      nodeVersion: process.version
    },
    alerting: {
      enabled: config.ALERTING_ENABLED,
      recipient: config.ALERT_EMAIL_TO || config.BUSINESS_OWNER_EMAIL,
      checkIntervalMs: config.ALERT_CHECK_INTERVAL_MS,
      cooldownMs: config.ALERT_COOLDOWN_MS,
      lookbackMinutes: config.ALERT_LOOKBACK_MINUTES,
      recentStates: recentAlertStates.map((state) => ({
        _id: String(state._id),
        key: state.key,
        status: state.status,
        lastSentAt: state.lastSentAt?.toISOString(),
        lastResolvedAt: state.lastResolvedAt?.toISOString(),
        lastMessage: state.lastMessage,
        updatedAt: state.updatedAt.toISOString()
      }))
    },
    operationalControls: settings.operationalControls,
    traffic: {
      httpRequestsTotal: metrics.httpRequestsTotal,
      httpErrorsTotal: metrics.httpErrorsTotal,
      errorRate,
      recentRequests: recentRequestLogs.map(serializeRequestLog)
    },
    database: databaseStats,
    frontend: {
      eventsLast24Hours: browserCounts,
      poorWebVitals,
      recentEvents: recentBrowserEvents.map(serializeBrowserEvent)
    },
    syntheticChecks,
    trends: {
      requests: requestTrend.map((item) => ({
        bucket: item._id,
        requests: item.requests,
        errors: item.errors,
        averageDurationMs: Math.round(item.averageDurationMs || 0)
      })),
      bookings: bookingTrend.map((item) => ({ bucket: item._id, created: item.created })),
      emailFailures: emailFailureTrend.map((item) => ({ bucket: item._id, failed: item.failed }))
    },
    bookings: {
      total: totalBookings,
      open: bookingsByStatus.open || 0,
      resolved: bookingsByStatus.resolved || 0,
      canceled: bookingsByStatus.canceled || 0,
      today: bookingsToday,
      next24Hours: upcomingBookings24Hours,
      pastOpen: pastOpenBookings,
      last7Days: bookingsLast7Days,
      unverifiedOpen: unverifiedOpenBookings,
      recent: recentBookings.map(serializeMonitoringBooking)
    },
    emails: {
      queued: queuedEmails,
      sent: emailsByStatus.sent || 0,
      failed: emailsByStatus.failed || 0,
      staleProcessing: staleProcessingEmailJobs.length,
      oldPending: oldPendingEmailJobs,
      oldestPendingAgeMinutes,
      lastSentAt: lastSentEmailJob?.sentAt?.toISOString() || lastSentEmailJob?.updatedAt?.toISOString(),
      byStatus: emailsByStatus,
      recentJobs: recentEmailJobs.map(serializeEmailJob),
      failedJobs: failedEmailJobs.map(serializeEmailJob),
      staleJobs: staleProcessingEmailJobs.map(serializeEmailJob)
    },
    auditLogs: recentAuditLogs.map((log) => ({
      _id: String(log._id),
      action: log.action,
      targetType: log.targetType,
      targetId: log.targetId,
      createdAt: log.createdAt.toISOString()
    })),
    incidents,
    recentErrors: recentSystemEvents.map(serializeSystemEvent)
  };
}

async function getManageableBookingByToken(token: string) {
  const tokenHash = hashToken(token);
  const booking = await Booking.findOne({ verificationTokenHash: tokenHash });

  if (!booking) {
    throw createHttpError(404, "Booking magic link was not found", "BOOKING_MAGIC_LINK_NOT_FOUND");
  }

  if (
    booking.emailVerificationExpiresAt &&
    booking.emailVerificationExpiresAt.getTime() <= Date.now()
  ) {
    throw createHttpError(
      400,
      "Booking magic link is invalid or expired",
      "INVALID_BOOKING_MAGIC_LINK"
    );
  }

  if (!booking.emailVerified) {
    booking.emailVerified = true;
    booking.emailVerifiedAt = new Date();
    await booking.save();
  }

  return booking;
}

router.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

router.get(
  "/ready",
  asyncHandler(async (_req, res) => {
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
      throw createHttpError(503, "Database connection is not ready", "DATABASE_NOT_READY");
    }

    await mongoose.connection.db.admin().ping();
    res.json({ status: "ready", database: "ok" });
  })
);

router.get("/admin/metrics", requireAdminAuth, (_req, res) => {
  res.json({ metrics: getMetricsSnapshot() });
});

router.get("/monitor/me", (req, res) => {
  res.json({ authenticated: isMonitorAuthenticated(req) });
});

router.get("/monitor/csrf", requireMonitorAuth, (req, res) => {
  res.json({ csrfToken: getMonitorCsrfToken(req) });
});

router.post(
  "/monitor/login",
  adminLoginLimiter,
  asyncHandler(async (req, res) => {
    const { password } = adminLoginSchema.parse(req.body);
    const isValidPassword = await verifyMonitorPassword(password);

    if (!isValidPassword) {
      throw createHttpError(401, "Invalid monitor password", "INVALID_MONITOR_PASSWORD");
    }

    if (config.MONITOR_MFA_ENABLED) {
      const challengeId = randomBytes(24).toString("hex");
      const code = String(randomInt(100_000, 1_000_000));
      const expiresAt = new Date(Date.now() + config.MONITOR_MFA_CODE_TTL_MINUTES * 60 * 1000);

      await MonitorLoginChallenge.create({
        challengeId,
        codeHash: hashMonitorLoginCode(challengeId, code),
        expiresAt,
        attempts: 0,
        ip: req.ip,
        userAgent: req.header("user-agent")
      });

      try {
        await sendMonitorLoginCodeEmail({
          to: getMonitorMfaRecipient(),
          code,
          expiresAt: expiresAt.toISOString(),
          ip: req.ip,
          userAgent: req.header("user-agent"),
          monitoringUrl: buildMonitoringUrl()
        });
      } catch (error) {
        await MonitorLoginChallenge.deleteOne({ challengeId });
        logger.warn("Monitor MFA email failed", {
          error,
          challengeId,
          recipient: getMonitorMfaRecipient()
        });

        throw createHttpError(
          503,
          "Could not send monitor verification email",
          "MONITOR_MFA_EMAIL_FAILED"
        );
      }

      res.json({
        authenticated: false,
        mfaRequired: true,
        challengeId,
        expiresAt: expiresAt.toISOString(),
        emailDelivery: "sent"
      });
      return;
    }

    createMonitorSession(res);
    res.json({ authenticated: true, mfaRequired: false });
  })
);

router.post(
  "/monitor/login/verify",
  adminLoginLimiter,
  asyncHandler(async (req, res) => {
    const { challengeId, code } = monitorLoginVerifySchema.parse(req.body);
    const challenge = await MonitorLoginChallenge.findOne({ challengeId });

    if (!challenge || challenge.usedAt || challenge.expiresAt.getTime() <= Date.now()) {
      throw createHttpError(401, "Monitor login code is invalid or expired", "INVALID_MONITOR_MFA_CODE");
    }

    if (challenge.attempts >= config.MONITOR_MFA_MAX_ATTEMPTS) {
      throw createHttpError(429, "Too many monitor code attempts", "MONITOR_MFA_LOCKED");
    }

    const expectedHash = hashMonitorLoginCode(challengeId, code);

    if (!isMatchingHash(challenge.codeHash, expectedHash)) {
      challenge.attempts += 1;
      await challenge.save();
      throw createHttpError(401, "Monitor login code is invalid or expired", "INVALID_MONITOR_MFA_CODE");
    }

    challenge.usedAt = new Date();
    await challenge.save();

    createMonitorSession(res);
    res.json({ authenticated: true });
  })
);

router.post("/monitor/logout", requireMonitorAuth, requireMonitorCsrf, (req, res) => {
  clearMonitorSession(req, res);
  res.status(204).send();
});

router.get(
  "/monitor/dashboard",
  requireMonitorAuth,
  asyncHandler(async (_req, res) => {
    res.json(await buildMonitoringDashboard());
  })
);

router.patch(
  "/monitor/operational-controls",
  requireMonitorAuth,
  requireMonitorCsrf,
  adminMutationLimiter,
  asyncHandler(async (req, res) => {
    const input = operationalControlsUpdateSchema.parse(req.body);
    const currentSettings = await getBusinessSettings();
    const settings = await updateBusinessSettings({
      operationalControls: {
        ...currentSettings.operationalControls,
        ...input,
        bookingPauseMessage:
          input.bookingPauseMessage === ""
            ? undefined
            : input.bookingPauseMessage ?? currentSettings.operationalControls.bookingPauseMessage,
        maintenanceBannerMessage:
          input.maintenanceBannerMessage === ""
            ? undefined
            : input.maintenanceBannerMessage ??
              currentSettings.operationalControls.maintenanceBannerMessage
      }
    });

    await recordAdminAudit({
      req,
      action: "operational_controls.update",
      targetType: "operationalControls",
      targetId: "default",
      details: { changedFields: Object.keys(input) }
    });

    res.json({ operationalControls: settings.operationalControls });
  })
);

router.post(
  "/monitor/test-email",
  requireMonitorAuth,
  requireMonitorCsrf,
  adminMutationLimiter,
  asyncHandler(async (req, res) => {
    const input = monitorTestEmailSchema.parse(req.body);
    const to = input.to || config.BUSINESS_OWNER_EMAIL;
    const generatedAt = new Date().toISOString();

    await sendMonitorTestEmail({
      to,
      generatedAt,
      appBaseUrl: config.APP_BASE_URL
    });

    await recordAdminAudit({
      req,
      action: "monitor.test_email",
      targetType: "monitor",
      targetId: to,
      details: { generatedAt }
    });

    res.json({ sent: true, to, generatedAt });
  })
);

router.post(
  "/telemetry/frontend",
  asyncHandler(async (req, res) => {
    const input = browserTelemetrySchema.parse(req.body);

    await BrowserEvent.create({
      ...input,
      userAgent: req.header("user-agent")
    });

    res.status(204).send();
  })
);

router.get(
  "/admin/email-automations",
  requireAdminAuth,
  asyncHandler(async (_req, res) => {
    const settings = await getBusinessSettings();
    const [statusCounts, typeCounts, recentJobs, failedJobs] = await Promise.all([
      EmailJob.aggregate<{ _id: EmailJobStatus; count: number }>([
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]),
      EmailJob.aggregate<{ _id: string; count: number }>([
        { $group: { _id: "$type", count: { $sum: 1 } } }
      ]),
      EmailJob.find().sort({ createdAt: -1 }).limit(30).lean<(EmailJobDocument & { _id: unknown })[]>(),
      EmailJob.find({ status: "failed" })
        .sort({ updatedAt: -1 })
        .limit(20)
        .lean<(EmailJobDocument & { _id: unknown })[]>()
    ]);

    res.json({
      settings: {
        customerVerificationEnabled: true,
        ...settings.emailAutomations
      },
      runtime: {
        automatedSchedulerEnabled: config.AUTOMATED_EMAILS_ENABLED,
        emailJobWorkerEnabled: config.EMAIL_JOB_WORKER_ENABLED,
        smtpHost: config.SMTP_HOST,
        mailFrom: config.MAIL_FROM,
        maxAttempts: config.EMAIL_JOB_MAX_ATTEMPTS
      },
      summary: {
        byStatus: summarizeCounts(statusCounts),
        byType: summarizeCounts(typeCounts)
      },
      recentJobs: recentJobs.map(serializeEmailJob),
      failedJobs: failedJobs.map(serializeEmailJob)
    });
  })
);

router.patch(
  "/admin/email-automations",
  requireAdminAuth,
  requireAdminCsrf,
  adminMutationLimiter,
  asyncHandler(async (req, res) => {
    const input = emailAutomationSettingsUpdateSchema.parse(req.body);
    const currentSettings = await getBusinessSettings();
    const settings = await updateBusinessSettings({
      emailAutomations: {
        ...currentSettings.emailAutomations,
        ...input
      }
    });

    await recordAdminAudit({
      req,
      action: "email_automations.update",
      targetType: "businessSettings",
      targetId: "default",
      details: { changedFields: Object.keys(input) }
    });

    res.json({
      settings: {
        customerVerificationEnabled: true,
        ...settings.emailAutomations
      }
    });
  })
);

router.post(
  "/admin/email-jobs/:jobId/retry",
  requireAdminAuth,
  requireAdminCsrf,
  adminMutationLimiter,
  asyncHandler(async (req, res) => {
    const { jobId } = emailJobParamsSchema.parse(req.params);

    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      throw createHttpError(400, "Invalid email job id", "INVALID_EMAIL_JOB_ID", { jobId });
    }

    const job = await EmailJob.findById(jobId);

    if (!job) {
      throw createHttpError(404, "Email job was not found", "EMAIL_JOB_NOT_FOUND", { jobId });
    }

    if (job.status === "processing") {
      throw createHttpError(409, "Email job is already processing", "EMAIL_JOB_PROCESSING");
    }

    job.status = "pending";
    job.attempts = 0;
    job.runAt = new Date();
    job.lockedUntil = undefined;
    job.lastError = undefined;
    await job.save();

    await recordAdminAudit({
      req,
      action: "email_job.retry",
      targetType: "emailJob",
      targetId: jobId,
      details: { type: job.type }
    });

    res.json({ job: serializeEmailJob(job as EmailJobDocument & { _id: unknown }) });
  })
);

router.post(
  "/monitor/email-jobs/:jobId/retry",
  requireMonitorAuth,
  requireMonitorCsrf,
  adminMutationLimiter,
  asyncHandler(async (req, res) => {
    const { jobId } = emailJobParamsSchema.parse(req.params);

    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      throw createHttpError(400, "Invalid email job id", "INVALID_EMAIL_JOB_ID", { jobId });
    }

    const job = await EmailJob.findById(jobId);

    if (!job) {
      throw createHttpError(404, "Email job was not found", "EMAIL_JOB_NOT_FOUND", { jobId });
    }

    if (job.status === "processing") {
      throw createHttpError(409, "Email job is already processing", "EMAIL_JOB_PROCESSING");
    }

    job.status = "pending";
    job.attempts = 0;
    job.runAt = new Date();
    job.lockedUntil = undefined;
    job.lastError = undefined;
    await job.save();

    await recordAdminAudit({
      req,
      action: "email_job.retry",
      targetType: "emailJob",
      targetId: jobId,
      details: { type: job.type, source: "monitor" }
    });

    res.json({ job: serializeEmailJob(job as EmailJobDocument & { _id: unknown }) });
  })
);

router.post(
  "/monitor/email-jobs/:jobId/unlock",
  requireMonitorAuth,
  requireMonitorCsrf,
  adminMutationLimiter,
  asyncHandler(async (req, res) => {
    const { jobId } = emailJobParamsSchema.parse(req.params);

    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      throw createHttpError(400, "Invalid email job id", "INVALID_EMAIL_JOB_ID", { jobId });
    }

    const job = await EmailJob.findById(jobId);

    if (!job) {
      throw createHttpError(404, "Email job was not found", "EMAIL_JOB_NOT_FOUND", { jobId });
    }

    if (job.status !== "processing") {
      throw createHttpError(409, "Only processing email jobs can be unlocked", "EMAIL_JOB_NOT_PROCESSING");
    }

    if (job.lockedUntil && job.lockedUntil.getTime() > Date.now()) {
      throw createHttpError(
        409,
        "Email job lock has not expired yet",
        "EMAIL_JOB_LOCK_ACTIVE",
        { lockedUntil: job.lockedUntil.toISOString() }
      );
    }

    job.status = job.attempts >= job.maxAttempts ? "failed" : "pending";
    job.runAt = new Date();
    job.lockedUntil = undefined;
    job.lastError = job.status === "failed" ? "Unlocked from stale processing state after max attempts" : undefined;
    await job.save();

    await recordAdminAudit({
      req,
      action: "email_job.unlock",
      targetType: "emailJob",
      targetId: jobId,
      details: { type: job.type, status: job.status, source: "monitor" }
    });

    res.json({ job: serializeEmailJob(job as EmailJobDocument & { _id: unknown }) });
  })
);

router.get(
  "/services",
  asyncHandler(async (_req, res) => {
    const settings = await getBusinessSettings();

    res.json({ services: settings.services });
  })
);

router.get(
  "/operational-status",
  asyncHandler(async (_req, res) => {
    const settings = await getBusinessSettings();

    res.json({ operationalControls: settings.operationalControls });
  })
);

router.get("/admin/me", (req, res) => {
  res.json({ authenticated: isAdminAuthenticated(req) });
});

router.get("/admin/csrf", requireAdminAuth, (req, res) => {
  res.json({ csrfToken: getAdminCsrfToken(req) });
});

router.post(
  "/admin/login",
  adminLoginLimiter,
  asyncHandler(async (req, res) => {
    const { password } = adminLoginSchema.parse(req.body);
    const isValidPassword = await verifyAdminPassword(password);

    if (!isValidPassword) {
      throw createHttpError(401, "Invalid admin password", "INVALID_ADMIN_PASSWORD");
    }

    createAdminSession(res);
    res.json({ authenticated: true });
  })
);

router.post("/admin/logout", requireAdminAuth, requireAdminCsrf, (req, res) => {
  clearAdminSession(req, res);
  res.status(204).send();
});

router.get(
  "/business-settings",
  requireAdminAuth,
  asyncHandler(async (_req, res) => {
    const settings = await getBusinessSettings();

    res.json({ settings });
  })
);

router.patch(
  "/business-settings",
  requireAdminAuth,
  requireAdminCsrf,
  adminMutationLimiter,
  asyncHandler(async (req, res) => {
    const input = businessSettingsUpdateSchema.parse(req.body);

    if (input.timezone && !DateTime.now().setZone(input.timezone).isValid) {
      throw createHttpError(400, "Choose a valid IANA timezone", "INVALID_TIMEZONE");
    }

    if (input.services) {
      const ids = new Set(input.services.map((service) => service.id));

      if (ids.size !== input.services.length) {
        throw createHttpError(400, "Service ids must be unique", "DUPLICATE_SERVICE_IDS");
      }
    }

    if (input.operatingWeekdays) {
      input.operatingWeekdays = [...new Set(input.operatingWeekdays)].sort((left, right) => left - right);
    }

    if (input.slotStartHours) {
      input.slotStartHours = [...new Set(input.slotStartHours)].sort((left, right) => left - right);
    }

    const settings = await updateBusinessSettings(input);
    await recordAdminAudit({
      req,
      action: "business_settings.update",
      targetType: "businessSettings",
      targetId: "default",
      details: { changedFields: Object.keys(input) }
    });

    res.json({ settings });
  })
);

router.get(
  "/availability",
  asyncHandler(async (req, res) => {
    const settings = await getBusinessSettings();
    const { start, days = DEFAULT_AVAILABILITY_DAYS, serviceId } = availabilityQuerySchema.parse(req.query);

    if (serviceId && !getServiceById(serviceId, settings)) {
      throw createHttpError(400, "Unknown service selected", "UNKNOWN_SERVICE", { serviceId });
    }

    const availabilityDays = await buildAvailabilityDays(
      parseBusinessDate(start, settings.timezone),
      days,
      settings,
      serviceId,
      isAdminAuthenticated(req)
    );

    res.json({ days: availabilityDays, timezone: settings.timezone });
  })
);

router.patch(
  "/availability",
  requireAdminAuth,
  requireAdminCsrf,
  adminMutationLimiter,
  asyncHandler(async (req, res) => {
    const settings = await getBusinessSettings();
    const input = availabilityUpdateSchema.parse(req.body);
    const slotStartAt = normalizeSlotStart(input.slotStartAt, settings.timezone);
    ensureSupportedSlot(slotStartAt, settings);

    const slotEndAt = getSlotEnd(slotStartAt, settings, settings.slotDurationHours);
    const overlappingBookings = await Booking.find(
      buildActiveAppointmentWindowFilter(slotStartAt, slotEndAt)
    ).lean<LeanBooking[]>();
    const existingBooking = overlappingBookings.find((booking) => {
      const interval = getBookingInterval(booking, settings);

      return interval && intervalsOverlap(slotStartAt, slotEndAt, interval.start, interval.end);
    });

    if (existingBooking && input.status === "busy") {
      throw createHttpError(409, "A booking already uses this slot", "SLOT_ALREADY_BOOKED");
    }

    if (input.status === "open") {
      await AvailabilityOverride.deleteOne({ slotStartAt });
    } else {
      await AvailabilityOverride.findOneAndUpdate(
        { slotStartAt },
        { $set: { slotStartAt, status: "busy" } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    await recordAdminAudit({
      req,
      action: "availability.update",
      targetType: "availability",
      targetId: slotStartAt.toISOString(),
      details: { status: input.status }
    });

    const availabilityDays = await buildAvailabilityDays(
      startOfBusinessDay(settings.timezone, slotStartAt),
      1,
      settings
    );

    res.json({ days: availabilityDays, timezone: settings.timezone });
  })
);

router.get(
  "/bookings",
  requireAdminAuth,
  asyncHandler(async (req, res) => {
    const { status, page, limit } = bookingStatusQuerySchema.parse(req.query);
    const filter = buildBookingStatusFilter(status);
    const [bookings, total] = await Promise.all([
      Booking.find(filter)
      .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<LeanBooking[]>(),
      Booking.countDocuments(filter)
    ]);

    res.json({
      bookings: bookings.map(serializeBooking),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  })
);

router.get(
  "/leads/summary",
  requireAdminAuth,
  asyncHandler(async (_req, res) => {
    const settings = await getBusinessSettings();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [statusCounts, serviceCounts, newestLead, newLeadsLast7Days] = await Promise.all([
      Booking.aggregate<{ _id: "open" | "resolved" | "canceled"; count: number }>([
        { $group: { _id: { $ifNull: ["$status", "open"] }, count: { $sum: 1 } } }
      ]),
      Booking.aggregate<{
        _id: { serviceId: string; status: "open" | "resolved" | "canceled" };
        count: number;
      }>([
        {
          $group: {
            _id: {
              serviceId: "$serviceId",
              status: { $ifNull: ["$status", "open"] }
            },
            count: { $sum: 1 }
          }
        }
      ]),
      Booking.findOne().sort({ createdAt: -1 }).select("serviceName").lean<LeanBooking>(),
      Booking.countDocuments({ createdAt: { $gte: sevenDaysAgo } })
    ]);
    const totalsByStatus = new Map(statusCounts.map((item) => [item._id, item.count]));
    const totalLeads = statusCounts.reduce((total, item) => total + item.count, 0);
    const resolvedLeads = totalsByStatus.get("resolved") || 0;
    const serviceStatusCounts = new Map(
      serviceCounts.map((item) => [
        `${item._id.serviceId}:${item._id.status}`,
        item.count
      ])
    );
    const leadsByService = settings.services.map((service) => {
      const open = serviceStatusCounts.get(`${service.id}:open`) || 0;
      const resolved = serviceStatusCounts.get(`${service.id}:resolved`) || 0;
      const canceled = serviceStatusCounts.get(`${service.id}:canceled`) || 0;

      return {
        serviceId: service.id,
        serviceName: service.name,
        total: open + resolved + canceled,
        open,
        resolved,
        canceled
      };
    });

    res.json({
      summary: {
        totalLeads,
        openLeads: totalsByStatus.get("open") || 0,
        resolvedLeads,
        canceledLeads: totalsByStatus.get("canceled") || 0,
        newLeadsLast7Days,
        resolutionRate: totalLeads === 0 ? 0 : Math.round((resolvedLeads / totalLeads) * 100),
        newestLeadService: newestLead?.serviceName || null,
        leadsByService
      }
    });
  })
);

router.post(
  "/bookings",
  bookingCreateLimiter,
  asyncHandler(async (req, res) => {
    const settings = await getBusinessSettings();
    ensureBookingsNotPaused(settings);
    const input = bookingInputSchema.parse(req.body);
    const service = getServiceById(input.serviceId, settings);

    if (!service) {
      throw createHttpError(400, "Unknown service selected", "UNKNOWN_SERVICE", {
        serviceId: input.serviceId
      });
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const emailVerificationExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const email = input.email.toLowerCase();
    const appointmentAt = normalizeSlotStart(input.appointmentAt, settings.timezone);
    const serviceDurationHours = service.durationHours || settings.slotDurationHours;
    const appointmentEndAt = getSlotEnd(appointmentAt, settings, serviceDurationHours);
    const occupiedSlotStarts = buildOccupiedSlotStarts(appointmentAt, appointmentEndAt);

    await ensureSlotAvailable(appointmentAt, settings, serviceDurationHours);

    const booking = await Booking.create({
      name: input.name,
      email,
      phone: input.phone,
      serviceId: service.id,
      serviceName: service.name,
      serviceDurationHours,
      appointmentAt,
      appointmentEndAt,
      occupiedSlotStarts,
      status: "open",
      emailVerified: false,
      verificationTokenHash: tokenHash,
      emailVerificationExpiresAt,
      notes: input.notes || undefined
    });

    const emailJobs: Promise<unknown>[] = [
      enqueueEmailJob({
        type: "bookingVerification",
        idempotencyKey: `booking-verification:${booking._id}`,
        payload: {
          to: email,
          name: input.name,
          serviceName: service.name,
          manageUrl: buildManageUrl(token)
        }
      })
    ];

    if (settings.emailAutomations.ownerBookingNoticeEnabled) {
      emailJobs.push(
        enqueueEmailJob({
          type: "ownerBookingNotice",
          idempotencyKey: `owner-booking-notice:${booking._id}`,
          payload: {
            to: settings.ownerEmail,
            businessName: settings.businessName,
            customerName: input.name,
            customerEmail: email,
            customerPhone: input.phone,
            serviceName: service.name,
            appointmentLabel: formatBusinessAppointment(appointmentAt, settings.timezone),
            notes: input.notes || undefined,
            adminUrl: buildAdminUrl()
          }
        })
      );
    }

    await Promise.all(emailJobs);

    res.status(201).json({
      booking: serializeBooking(booking),
      message: "Booking sent. You can verify your email from the message we send."
    });
  })
);

router.post(
  "/bookings/manage",
  magicLinkLimiter,
  asyncHandler(async (req, res) => {
    const { token } = manageTokenSchema.parse(req.body);
    const booking = await getManageableBookingByToken(token);

    res.json({ booking: serializeBooking(booking) });
  })
);

router.patch(
  "/bookings/manage",
  magicLinkLimiter,
  asyncHandler(async (req, res) => {
    const { token, ...rawInput } = z
      .object({ token: z.string().trim().min(32) })
      .and(manageBookingInputSchema)
      .parse(req.body);
    const booking = await getManageableBookingByToken(token);

    if (booking.status !== "open") {
      throw createHttpError(
        409,
        "Only active bookings can be edited",
        "BOOKING_NOT_EDITABLE"
      );
    }

    const settings = await getBusinessSettings();
    ensureBookingsNotPaused(settings);
    const service = getServiceById(rawInput.serviceId, settings);

    if (!service) {
      throw createHttpError(400, "Unknown service selected", "UNKNOWN_SERVICE", {
        serviceId: rawInput.serviceId
      });
    }

    booking.name = rawInput.name;
    booking.phone = rawInput.phone;
    booking.serviceId = service.id;
    booking.serviceName = service.name;
    booking.serviceDurationHours = service.durationHours || settings.slotDurationHours;
    const appointmentAt = normalizeSlotStart(rawInput.appointmentAt, settings.timezone);
    await ensureSlotAvailable(
      appointmentAt,
      settings,
      booking.serviceDurationHours,
      String(booking._id)
    );
    booking.appointmentAt = appointmentAt;
    booking.appointmentEndAt = getSlotEnd(appointmentAt, settings, booking.serviceDurationHours);
    booking.occupiedSlotStarts = buildOccupiedSlotStarts(
      booking.appointmentAt,
      booking.appointmentEndAt
    );
    booking.notes = rawInput.notes || undefined;
    await booking.save();

    res.json({ booking: serializeBooking(booking) });
  })
);

router.patch(
  "/bookings/manage/cancel",
  magicLinkLimiter,
  asyncHandler(async (req, res) => {
    const { token } = manageTokenSchema.parse(req.body);
    const booking = await getManageableBookingByToken(token);

    if (booking.status !== "open") {
      throw createHttpError(
        409,
        "Only active bookings can be canceled",
        "BOOKING_NOT_CANCELABLE"
      );
    }

    booking.status = "canceled";
    booking.canceledAt = new Date();
    booking.resolvedAt = undefined;
    await booking.save();

    res.json({ booking: serializeBooking(booking) });
  })
);

router.post(
  "/bookings/verify",
  magicLinkLimiter,
  asyncHandler(async (req, res) => {
    const { token } = verifyBookingSchema.parse(req.body);
    const tokenHash = hashToken(token);
    const existingBooking = await Booking.findOne({ verificationTokenHash: tokenHash });

    if (existingBooking) {
      if (existingBooking.emailVerified) {
        res.json({ booking: serializeBooking(existingBooking) });
        return;
      }

      if (
        existingBooking.emailVerificationExpiresAt &&
        existingBooking.emailVerificationExpiresAt.getTime() <= Date.now()
      ) {
        throw createHttpError(
          400,
          "Verification link is invalid or expired",
          "INVALID_VERIFICATION_TOKEN"
        );
      }

      existingBooking.emailVerified = true;
      existingBooking.emailVerifiedAt = new Date();
      await existingBooking.save();

      res.json({ booking: serializeBooking(existingBooking) });
      return;
    }

    throw createHttpError(
      400,
      "Verification link is invalid or expired",
      "INVALID_VERIFICATION_TOKEN"
    );
  })
);

router.patch(
  "/bookings/:bookingId/resolve",
  requireAdminAuth,
  requireAdminCsrf,
  adminMutationLimiter,
  asyncHandler(async (req, res) => {
    const { bookingId } = bookingParamsSchema.parse(req.params);
    const booking = await findBookingOrThrow(bookingId);
    booking.status = "resolved";
    booking.resolvedAt = new Date();
    booking.canceledAt = undefined;
    await booking.save();
    await recordAdminAudit({
      req,
      action: "booking.resolve",
      targetType: "booking",
      targetId: bookingId
    });

    res.json({ booking: serializeBooking(booking) });
  })
);

router.patch(
  "/bookings/:bookingId/reopen",
  requireAdminAuth,
  requireAdminCsrf,
  adminMutationLimiter,
  asyncHandler(async (req, res) => {
    const { bookingId } = bookingParamsSchema.parse(req.params);
    const booking = await findBookingOrThrow(bookingId);
    const settings = await getBusinessSettings();

    if (booking.appointmentAt) {
      const serviceDurationHours =
        booking.serviceDurationHours || getServiceDurationHours(booking.serviceId, settings);

      await ensureSlotAvailable(booking.appointmentAt, settings, serviceDurationHours, bookingId);
      booking.serviceDurationHours = serviceDurationHours;
      booking.appointmentEndAt =
        booking.appointmentEndAt || getSlotEnd(booking.appointmentAt, settings, serviceDurationHours);
      booking.occupiedSlotStarts = buildOccupiedSlotStarts(
        booking.appointmentAt,
        booking.appointmentEndAt
      );
    }

    booking.status = "open";
    booking.resolvedAt = undefined;
    booking.canceledAt = undefined;
    await booking.save();
    await recordAdminAudit({
      req,
      action: "booking.reopen",
      targetType: "booking",
      targetId: bookingId
    });

    res.json({ booking: serializeBooking(booking) });
  })
);

router.delete(
  "/bookings/:bookingId",
  requireAdminAuth,
  requireAdminCsrf,
  adminMutationLimiter,
  asyncHandler(async (req, res) => {
    const { bookingId } = bookingParamsSchema.parse(req.params);
    await findBookingOrThrow(bookingId);
    await Booking.deleteOne({ _id: bookingId });
    await recordAdminAudit({
      req,
      action: "booking.delete",
      targetType: "booking",
      targetId: bookingId
    });

    res.status(204).send();
  })
);
