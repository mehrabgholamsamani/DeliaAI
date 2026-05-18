import { DateTime } from "luxon";
import { config } from "./config.js";
import { enqueueEmailJob, processDueEmailJobs } from "./emailJobs.js";
import { logger } from "./logger.js";
import { Booking } from "./models/Booking.js";
import { getBusinessSettings } from "./services.js";

type BookingEmailTarget = {
  _id: unknown;
  name: string;
  email: string;
  serviceName: string;
  appointmentAt?: Date;
  appointmentEndAt?: Date;
};

let scheduler: NodeJS.Timeout | undefined;
let isProcessing = false;

function formatBusinessAppointment(value: Date, timezone: string) {
  return DateTime.fromJSDate(value, { zone: "utc" }).setZone(timezone).toLocaleString({
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  });
}

async function sendDueReminderEmails(now: Date) {
  const settings = await getBusinessSettings();
  const emailSettings = settings.emailAutomations;

  if (!emailSettings.bookingReminderEnabled) {
    return;
  }

  const reminderWindowEnd = DateTime.fromJSDate(now)
    .plus({ hours: emailSettings.reminderLeadHours })
    .toJSDate();
  const bookings = await Booking.find({
    status: "open",
    emailVerified: true,
    reminderEmailSentAt: { $exists: false },
    appointmentAt: {
      $gt: now,
      $lte: reminderWindowEnd
    }
  })
    .sort({ appointmentAt: 1 })
    .limit(25)
    .lean<BookingEmailTarget[]>();

  for (const booking of bookings) {
    if (!booking.appointmentAt) {
      continue;
    }

    await enqueueEmailJob({
      type: "bookingReminder",
      idempotencyKey: `booking-reminder:${booking._id}`,
      payload: {
        bookingId: String(booking._id),
        to: booking.email,
        name: booking.name,
        businessName: settings.businessName,
        serviceName: booking.serviceName,
        appointmentLabel: formatBusinessAppointment(booking.appointmentAt, settings.timezone)
      }
    });
  }
}

async function sendDueReviewEmails(now: Date) {
  const settings = await getBusinessSettings();
  const emailSettings = settings.emailAutomations;

  if (!emailSettings.reviewRequestEnabled) {
    return;
  }

  const reviewCutoff = DateTime.fromJSDate(now)
    .minus({ hours: emailSettings.reviewRequestDelayHours })
    .toJSDate();
  const bookings = await Booking.find({
    status: "resolved",
    emailVerified: true,
    reviewEmailSentAt: { $exists: false },
    $or: [
      { appointmentEndAt: { $exists: true, $lte: reviewCutoff } },
      {
        appointmentEndAt: { $exists: false },
        appointmentAt: { $lte: reviewCutoff }
      }
    ]
  })
    .sort({ appointmentEndAt: 1, appointmentAt: 1 })
    .limit(25)
    .lean<BookingEmailTarget[]>();

  for (const booking of bookings) {
    await enqueueEmailJob({
      type: "reviewRequest",
      idempotencyKey: `review-request:${booking._id}`,
      payload: {
        bookingId: String(booking._id),
        to: booking.email,
        name: booking.name,
        businessName: settings.businessName,
        serviceName: booking.serviceName,
        reviewUrl: emailSettings.reviewUrl || config.REVIEW_URL || config.APP_BASE_URL
      }
    });
  }
}

export async function processDueAutomatedBookingEmails(now = new Date()) {
  await sendDueReminderEmails(now);
  await sendDueReviewEmails(now);
  await processDueEmailJobs();
}

export function startAutomatedEmailScheduler() {
  if (!config.AUTOMATED_EMAILS_ENABLED || scheduler) {
    return () => undefined;
  }

  async function runSafely() {
    if (isProcessing) {
      return;
    }

    isProcessing = true;

    try {
      await processDueAutomatedBookingEmails();
    } catch (error) {
      logger.error("Failed to process automated booking emails", { error });
    } finally {
      isProcessing = false;
    }
  }

  scheduler = setInterval(() => {
    void runSafely();
  }, config.AUTOMATED_EMAIL_INTERVAL_MS);

  void runSafely();

  return () => {
    if (scheduler) {
      clearInterval(scheduler);
      scheduler = undefined;
    }
  };
}
