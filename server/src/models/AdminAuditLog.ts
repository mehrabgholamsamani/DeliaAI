import mongoose, { Schema } from "mongoose";

export type AdminAuditAction =
  | "business_settings.update"
  | "availability.update"
  | "booking.resolve"
  | "booking.reopen"
  | "booking.delete"
  | "email_automations.update"
  | "operational_controls.update"
  | "email_job.retry"
  | "email_job.unlock"
  | "monitor.test_email";

export type AdminAuditLogDocument = {
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
  requestId?: string;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
};

const adminAuditLogSchema = new Schema<AdminAuditLogDocument>(
  {
    action: { type: String, required: true, index: true },
    targetType: { type: String, required: true, index: true },
    targetId: { type: String, trim: true, index: true },
    details: { type: Schema.Types.Mixed },
    requestId: { type: String, trim: true, index: true },
    ip: { type: String, trim: true },
    userAgent: { type: String, trim: true }
  },
  { timestamps: true }
);

adminAuditLogSchema.index({ createdAt: -1 });

export const AdminAuditLog =
  mongoose.models.AdminAuditLog ||
  mongoose.model<AdminAuditLogDocument>("AdminAuditLog", adminAuditLogSchema);
