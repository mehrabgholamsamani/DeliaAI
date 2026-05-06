import mongoose, { Schema } from "mongoose";

export type AlertStateDocument = {
  key: string;
  status: "active" | "resolved";
  lastSentAt?: Date;
  lastResolvedAt?: Date;
  lastMessage?: string;
  createdAt: Date;
  updatedAt: Date;
};

const alertStateSchema = new Schema<AlertStateDocument>(
  {
    key: { type: String, required: true, unique: true, trim: true, index: true },
    status: { type: String, enum: ["active", "resolved"], required: true, default: "resolved", index: true },
    lastSentAt: { type: Date },
    lastResolvedAt: { type: Date },
    lastMessage: { type: String, trim: true }
  },
  { timestamps: true }
);

export const AlertState =
  mongoose.models.AlertState ||
  mongoose.model<AlertStateDocument>("AlertState", alertStateSchema);
