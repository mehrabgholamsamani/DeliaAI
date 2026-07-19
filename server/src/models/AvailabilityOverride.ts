import mongoose, { Schema } from "mongoose";

export type AvailabilityOverrideDocument = {
  slotStartAt: Date;
  status: "busy";
  createdAt: Date;
  updatedAt: Date;
};

const availabilityOverrideSchema = new Schema<AvailabilityOverrideDocument>(
  {
    slotStartAt: { type: Date, required: true, unique: true, index: true },
    status: { type: String, enum: ["busy"], default: "busy", required: true }
  },
  { timestamps: true }
);

export const AvailabilityOverride =
  mongoose.models.AvailabilityOverride ||
  mongoose.model<AvailabilityOverrideDocument>(
    "AvailabilityOverride",
    availabilityOverrideSchema
  );
