import { z } from "zod";
import { config } from "./config.js";
import {
  sendBookingReminderEmail,
  sendBookingVerificationEmail,
  sendOwnerBookingNoticeEmail,
  sendReviewRequestEmail
} from "./email.js";
import { logger } from "./logger.js";
import { incrementMetric } from "./metrics.js";
import { Booking } from "./models/Booking.js";
import { EmailJob, type EmailJobDocument, type EmailJobType } from "./models/EmailJob.js";

const bookingVerificationPayloadSchema = z.object({
  to: z.string().email(),
  name: z.string(),
  serviceName: z.string(),
  manageUrl: z.string().url()
});

const ownerBookingNoticePayloadSchema = z.object({
  to: z.string().email(),
  businessName: z.string(),
  customerName: z.string(),
  customerEmail: z.string().email(),
  customerPhone: z.string(),
  serviceName: z.string(),
  appointmentLabel: z.string(),
  notes: z.string().optional(),
  adminUrl: z.string().url()
});

const bookingReminderPayloadSchema = z.object({
  bookingId: z.string(),
  to: z.string().email(),
  name: z.string(),
  businessName: z.string(),
  serviceName: z.string(),
  appointmentLabel: z.string()
});

const reviewRequestPayloadSchema = z.object({
  bookingId: z.string(),
  to: z.string().email(),
  name: z.string(),
  businessName: z.string(),
  serviceName: z.string(),
  reviewUrl: z.string().url()
});

type EnqueueEmailJobInput = {
  type: EmailJobType;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  runAt?: Date;
};

let emailWorker: NodeJS.Timeout | undefined;
let isProcessingEmailJobs = false;

function getRetryRunAt(attempts: number) {
  const retryDelayMs = Math.min(60 * 60 * 1000, 2 ** Math.max(attempts - 1, 0) * 60 * 1000);

  return new Date(Date.now() + retryDelayMs);
}

async function sendEmailJob(job: EmailJobDocument) {
  if (job.type === "bookingVerification") {
    await sendBookingVerificationEmail(bookingVerificationPayloadSchema.parse(job.payload));
    return;
  }

  if (job.type === "ownerBookingNotice") {
    await sendOwnerBookingNoticeEmail(ownerBookingNoticePayloadSchema.parse(job.payload));
    return;
  }

  if (job.type === "bookingReminder") {
    const payload = bookingReminderPayloadSchema.parse(job.payload);
    await sendBookingReminderEmail(payload);
    await Booking.updateOne(
      { _id: payload.bookingId, reminderEmailSentAt: { $exists: false } },
      { $set: { reminderEmailSentAt: new Date() } }
    );
    return;
  }

  const payload = reviewRequestPayloadSchema.parse(job.payload);
  await sendReviewRequestEmail(payload);
  await Booking.updateOne(
    { _id: payload.bookingId, reviewEmailSentAt: { $exists: false } },
    { $set: { reviewEmailSentAt: new Date() } }
  );
}

export async function enqueueEmailJob(input: EnqueueEmailJobInput) {
  const result = await EmailJob.findOneAndUpdate(
    { idempotencyKey: input.idempotencyKey },
    {
      $setOnInsert: {
        type: input.type,
        status: "pending",
        idempotencyKey: input.idempotencyKey,
        payload: input.payload,
        runAt: input.runAt || new Date(),
        maxAttempts: config.EMAIL_JOB_MAX_ATTEMPTS
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, rawResult: true }
  );

  if (!result.lastErrorObject?.updatedExisting) {
    incrementMetric("emailJobsEnqueuedTotal");
  }

  return result.value;
}

export async function processDueEmailJobs(limit = 25) {
  const processedJobs = [];

  for (let index = 0; index < limit; index += 1) {
    const now = new Date();
    const job = await EmailJob.findOneAndUpdate(
      {
        status: { $in: ["pending", "failed"] },
        runAt: { $lte: now },
        attempts: { $lt: config.EMAIL_JOB_MAX_ATTEMPTS },
        $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: { $lte: now } }]
      },
      {
        $set: {
          status: "processing",
          lockedUntil: new Date(Date.now() + config.EMAIL_JOB_LOCK_MS)
        },
        $inc: { attempts: 1 }
      },
      { sort: { runAt: 1, createdAt: 1 }, new: true }
    );

    if (!job) {
      break;
    }

    try {
      await sendEmailJob(job);
      job.status = "sent";
      job.sentAt = new Date();
      job.lockedUntil = undefined;
      job.lastError = undefined;
      await job.save();
      incrementMetric("emailJobsSentTotal");
      processedJobs.push(job);
    } catch (error) {
      job.status = "failed";
      job.lockedUntil = undefined;
      job.lastError = error instanceof Error ? error.message : "Unknown email job error";
      job.runAt = getRetryRunAt(job.attempts);
      await job.save();
      incrementMetric("emailJobsFailedTotal");
      logger.error("Email job failed", {
        error,
        jobId: String(job._id),
        type: job.type,
        attempts: job.attempts
      });
    }
  }

  return processedJobs;
}

export function startEmailJobWorker() {
  if (!config.EMAIL_JOB_WORKER_ENABLED || emailWorker) {
    return () => undefined;
  }

  async function runSafely() {
    if (isProcessingEmailJobs) {
      return;
    }

    isProcessingEmailJobs = true;

    try {
      await processDueEmailJobs();
    } catch (error) {
      logger.error("Failed to process email jobs", { error });
    } finally {
      isProcessingEmailJobs = false;
    }
  }

  emailWorker = setInterval(() => {
    void runSafely();
  }, config.EMAIL_JOB_POLL_MS);

  void runSafely();

  return () => {
    if (emailWorker) {
      clearInterval(emailWorker);
      emailWorker = undefined;
    }
  };
}
