import mongoose, { Schema } from "mongoose";
import type { Service } from "../services.js";

export type EmailAutomationSettings = {
  ownerBookingNoticeEnabled: boolean;
  bookingReminderEnabled: boolean;
  reviewRequestEnabled: boolean;
  reminderLeadHours: number;
  reviewRequestDelayHours: number;
  reviewUrl?: string;
};

export type OperationalControls = {
  bookingsPaused: boolean;
  bookingPauseMessage?: string;
  maintenanceBannerEnabled: boolean;
  maintenanceBannerMessage?: string;
};

export type BusinessSettingsDocument = {
  key: "default";
  businessName: string;
  ownerEmail: string;
  notificationEmailFromName: string;
  timezone: string;
  operatingWeekdays: number[];
  slotStartHours: number[];
  slotDurationHours: number;
  services: Service[];
  emailAutomations: EmailAutomationSettings;
  operationalControls: OperationalControls;
  createdAt: Date;
  updatedAt: Date;
};

const serviceSchema = new Schema<Service>(
  {
    id: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    duration: { type: String, required: true, trim: true },
    durationHours: { type: Number, required: true, min: 1, max: 12, default: 2 },
    price: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true }
  },
  { _id: false }
);

const businessSettingsSchema = new Schema<BusinessSettingsDocument>(
  {
    key: { type: String, enum: ["default"], default: "default", unique: true, index: true },
    businessName: { type: String, required: true, trim: true },
    ownerEmail: { type: String, required: true, lowercase: true, trim: true },
    notificationEmailFromName: { type: String, required: true, trim: true },
    timezone: { type: String, required: true, trim: true },
    operatingWeekdays: [{ type: Number, required: true, min: 1, max: 7 }],
    slotStartHours: [{ type: Number, required: true, min: 0, max: 23 }],
    slotDurationHours: { type: Number, required: true, min: 1, max: 12 },
    services: { type: [serviceSchema], required: true },
    emailAutomations: {
      ownerBookingNoticeEnabled: { type: Boolean, required: true, default: true },
      bookingReminderEnabled: { type: Boolean, required: true, default: true },
      reviewRequestEnabled: { type: Boolean, required: true, default: true },
      reminderLeadHours: { type: Number, required: true, min: 1, max: 168, default: 24 },
      reviewRequestDelayHours: { type: Number, required: true, min: 0, max: 720, default: 2 },
      reviewUrl: { type: String, trim: true }
    },
    operationalControls: {
      bookingsPaused: { type: Boolean, required: true, default: false },
      bookingPauseMessage: { type: String, trim: true, maxlength: 240 },
      maintenanceBannerEnabled: { type: Boolean, required: true, default: false },
      maintenanceBannerMessage: { type: String, trim: true, maxlength: 240 }
    }
  },
  { timestamps: true }
);

export const BusinessSettings =
  mongoose.models.BusinessSettings ||
  mongoose.model<BusinessSettingsDocument>("BusinessSettings", businessSettingsSchema);
