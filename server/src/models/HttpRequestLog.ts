import mongoose, { Schema } from "mongoose";

export type HttpRequestLogDocument = {
  requestId?: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
};

const httpRequestLogSchema = new Schema<HttpRequestLogDocument>(
  {
    requestId: { type: String, trim: true, index: true },
    method: { type: String, required: true, trim: true, index: true },
    path: { type: String, required: true, trim: true, index: true },
    statusCode: { type: Number, required: true, index: true },
    durationMs: { type: Number, required: true, min: 0 },
    ip: { type: String, trim: true },
    userAgent: { type: String, trim: true }
  },
  { timestamps: true }
);

httpRequestLogSchema.index({ createdAt: -1 });
httpRequestLogSchema.index({ statusCode: 1, createdAt: -1 });

export const HttpRequestLog =
  mongoose.models.HttpRequestLog ||
  mongoose.model<HttpRequestLogDocument>("HttpRequestLog", httpRequestLogSchema);
