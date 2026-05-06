import mongoose, { Schema } from "mongoose";

export type SystemEventSeverity = "info" | "warning" | "error";

export type SystemEventDocument = {
  severity: SystemEventSeverity;
  type: string;
  message: string;
  code?: string;
  requestId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  details?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

const systemEventSchema = new Schema<SystemEventDocument>(
  {
    severity: { type: String, enum: ["info", "warning", "error"], required: true, index: true },
    type: { type: String, required: true, trim: true, index: true },
    message: { type: String, required: true, trim: true },
    code: { type: String, trim: true, index: true },
    requestId: { type: String, trim: true, index: true },
    method: { type: String, trim: true },
    path: { type: String, trim: true },
    statusCode: { type: Number, index: true },
    details: { type: Schema.Types.Mixed }
  },
  { timestamps: true }
);

systemEventSchema.index({ createdAt: -1 });
systemEventSchema.index({ severity: 1, createdAt: -1 });

export const SystemEvent =
  mongoose.models.SystemEvent ||
  mongoose.model<SystemEventDocument>("SystemEvent", systemEventSchema);
