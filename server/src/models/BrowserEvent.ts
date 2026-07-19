import mongoose, { Schema } from "mongoose";

export type BrowserEventType =
  | "javascript_error"
  | "unhandled_rejection"
  | "web_vitals"
  | "page_load";

export type BrowserEventDocument = {
  type: BrowserEventType;
  path: string;
  message?: string;
  source?: string;
  stack?: string;
  metricName?: string;
  metricValue?: number;
  rating?: "good" | "needs-improvement" | "poor";
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
};

const browserEventSchema = new Schema<BrowserEventDocument>(
  {
    type: {
      type: String,
      enum: ["javascript_error", "unhandled_rejection", "web_vitals", "page_load"],
      required: true,
      index: true
    },
    path: { type: String, required: true, trim: true, index: true },
    message: { type: String, trim: true },
    source: { type: String, trim: true },
    stack: { type: String },
    metricName: { type: String, trim: true, index: true },
    metricValue: { type: Number },
    rating: { type: String, enum: ["good", "needs-improvement", "poor"] },
    userAgent: { type: String, trim: true }
  },
  { timestamps: true }
);

browserEventSchema.index({ createdAt: -1 });
browserEventSchema.index({ type: 1, createdAt: -1 });

export const BrowserEvent =
  mongoose.models.BrowserEvent ||
  mongoose.model<BrowserEventDocument>("BrowserEvent", browserEventSchema);
