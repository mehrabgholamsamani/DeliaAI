import mongoose, { Schema } from "mongoose";

export type BookingDocument = {
  name: string;
  email: string;
  phone: string;
  serviceId: string;
  serviceName: string;
  serviceDurationHours?: number;
  appointmentAt?: Date;
  appointmentEndAt?: Date;
  occupiedSlotStarts?: Date[];
  status: "open" | "resolved" | "canceled";
  notes?: string;
  emailVerified: boolean;
  emailVerifiedAt?: Date;
  emailVerificationExpiresAt?: Date;
  verificationTokenHash?: string;
  reminderEmailSentAt?: Date;
  reviewEmailSentAt?: Date;
  resolvedAt?: Date;
  canceledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

const bookingSchema = new Schema<BookingDocument>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    serviceId: { type: String, required: true, trim: true },
    serviceName: { type: String, required: true, trim: true },
    serviceDurationHours: { type: Number, min: 1, max: 12 },
    appointmentAt: { type: Date },
    appointmentEndAt: { type: Date },
    occupiedSlotStarts: [{ type: Date }],
    status: { type: String, enum: ["open", "resolved", "canceled"], default: "open", index: true },
    notes: { type: String, trim: true, maxlength: 500 },
    emailVerified: { type: Boolean, default: false, index: true },
    emailVerifiedAt: { type: Date },
    emailVerificationExpiresAt: { type: Date },
    verificationTokenHash: { type: String, trim: true },
    reminderEmailSentAt: { type: Date },
    reviewEmailSentAt: { type: Date },
    resolvedAt: { type: Date },
    canceledAt: { type: Date }
  },
  { timestamps: true }
);

bookingSchema.index({ createdAt: -1 });
bookingSchema.index({ status: 1, createdAt: -1 });
bookingSchema.index({ emailVerified: 1, createdAt: -1 });
bookingSchema.index({ appointmentAt: 1, appointmentEndAt: 1 });
bookingSchema.index(
  { occupiedSlotStarts: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: "open",
      occupiedSlotStarts: { $exists: true }
    }
  }
);
bookingSchema.index({ reminderEmailSentAt: 1, appointmentAt: 1 });
bookingSchema.index({ reviewEmailSentAt: 1, appointmentEndAt: 1 });
bookingSchema.index(
  { appointmentAt: 1 },
  {
    unique: true,
    partialFilterExpression: {
      appointmentAt: { $exists: true },
      status: "open"
    }
  }
);
bookingSchema.index(
  { verificationTokenHash: 1 },
  { unique: true, sparse: true }
);

export const Booking =
  mongoose.models.Booking ||
  mongoose.model<BookingDocument>("Booking", bookingSchema);
