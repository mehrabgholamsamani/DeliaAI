import mongoose, { Schema } from "mongoose";

export type RateLimitCounterDocument = {
  _id: string;
  key: string;
  bucket: number;
  hits: number;
  resetTime: Date;
  expiresAt: Date;
};

const rateLimitCounterSchema = new Schema<RateLimitCounterDocument>(
  {
    _id: { type: String, required: true },
    key: { type: String, required: true, index: true },
    bucket: { type: Number, required: true },
    hits: { type: Number, required: true, default: 0 },
    resetTime: { type: Date, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } }
  },
  { versionKey: false }
);

rateLimitCounterSchema.index({ key: 1, bucket: 1 });

export const RateLimitCounter =
  mongoose.models.RateLimitCounter ||
  mongoose.model<RateLimitCounterDocument>("RateLimitCounter", rateLimitCounterSchema);
