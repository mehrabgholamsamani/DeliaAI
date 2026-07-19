import mongoose, { Schema } from "mongoose";

export type EmailJobType =
  | "bookingVerification"
  | "ownerBookingNotice"
  | "bookingReminder"
  | "reviewRequest";

export type EmailJobStatus = "pending" | "processing" | "sent" | "failed";

export type EmailJobDocument = {
  type: EmailJobType;
  status: EmailJobStatus;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  runAt: Date;
  lockedUntil?: Date;
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  sentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

const emailJobSchema = new Schema<EmailJobDocument>(
  {
    type: {
      type: String,
      enum: ["bookingVerification", "ownerBookingNotice", "bookingReminder", "reviewRequest"],
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ["pending", "processing", "sent", "failed"],
      default: "pending",
      required: true,
      index: true
    },
    idempotencyKey: { type: String, required: true, trim: true, unique: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
    runAt: { type: Date, required: true, default: Date.now, index: true },
    lockedUntil: { type: Date, index: true },
    attempts: { type: Number, required: true, default: 0 },
    maxAttempts: { type: Number, required: true, default: 5 },
    lastError: { type: String },
    sentAt: { type: Date }
  },
  { timestamps: true }
);

emailJobSchema.index({ status: 1, runAt: 1, lockedUntil: 1 });

export const EmailJob =
  mongoose.models.EmailJob || mongoose.model<EmailJobDocument>("EmailJob", emailJobSchema);
