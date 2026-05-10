import { config } from "./config.js";
import {
  BusinessSettings,
  type BusinessSettingsDocument,
  type EmailAutomationSettings,
  type OperationalControls
} from "./models/BusinessSettings.js";

export type Service = {
  id: string;
  name: string;
  duration: string;
  durationHours: number;
  price: string;
  description: string;
};

export const defaultServices: Service[] = [
  {
    id: "standard-home",
    name: "Standard Service Visit",
    duration: "2-3 hours",
    durationHours: 3,
    price: "From $120",
    description: "A focused service visit for routine customer requests and recurring appointments."
  },
  {
    id: "deep-clean",
    name: "Extended Service Visit",
    duration: "4-6 hours",
    durationHours: 6,
    price: "From $240",
    description: "A longer appointment for detailed work, larger jobs, or more involved requests."
  },
  {
    id: "move-out",
    name: "Project Service",
    duration: "5-7 hours",
    durationHours: 7,
    price: "From $320",
    description: "A project-sized service for one-off work that needs more time and preparation."
  },
  {
    id: "office-care",
    name: "Business Service",
    duration: "Custom",
    durationHours: 2,
    price: "Quote",
    description: "A configurable business service for commercial or recurring account requests."
  }
];

export type BusinessSettingsValue = Pick<
  BusinessSettingsDocument,
  | "businessName"
  | "ownerEmail"
  | "notificationEmailFromName"
  | "timezone"
  | "operatingWeekdays"
  | "slotStartHours"
  | "slotDurationHours"
  | "services"
  | "emailAutomations"
  | "operationalControls"
>;

export type EmailAutomationSettingsValue = EmailAutomationSettings;
export type OperationalControlsValue = OperationalControls;

export const defaultBusinessSettings: BusinessSettingsValue = {
  businessName: "Service Booking Business",
  ownerEmail: config.BUSINESS_OWNER_EMAIL,
  notificationEmailFromName: "Booking Notifications",
  timezone: config.BUSINESS_TIMEZONE,
  operatingWeekdays: [1, 2, 3, 4, 5],
  slotStartHours: [8, 10, 12, 14],
  slotDurationHours: 2,
  services: defaultServices,
  emailAutomations: {
    ownerBookingNoticeEnabled: true,
    bookingReminderEnabled: true,
    reviewRequestEnabled: true,
    reminderLeadHours: config.BOOKING_REMINDER_LEAD_HOURS,
    reviewRequestDelayHours: config.REVIEW_REQUEST_DELAY_HOURS,
    reviewUrl: config.REVIEW_URL
  },
  operationalControls: {
    bookingsPaused: false,
    bookingPauseMessage: "Online booking is temporarily paused. Please contact us directly.",
    maintenanceBannerEnabled: false,
    maintenanceBannerMessage: "We are doing maintenance. Some features may be temporarily unavailable."
  }
};

function assertSettings(settings: BusinessSettingsDocument | null): BusinessSettingsDocument {
  if (!settings) {
    throw new Error("Business settings could not be loaded");
  }

  return settings;
}

function normalizeSettings(settings: BusinessSettingsDocument): BusinessSettingsValue {
  const defaultDurationByServiceId = new Map(
    defaultServices.map((service) => [service.id, service.durationHours])
  );
  const services =
    settings.services?.length > 0
      ? settings.services.map((service) => ({
          ...service,
          durationHours:
            service.durationHours ||
            defaultDurationByServiceId.get(service.id) ||
            defaultBusinessSettings.slotDurationHours
        }))
      : defaultBusinessSettings.services;
  const emailAutomations = {
    ...defaultBusinessSettings.emailAutomations,
    ...(settings.emailAutomations || {})
  };
  const operationalControls = {
    ...defaultBusinessSettings.operationalControls,
    ...(settings.operationalControls || {})
  };

  return {
    businessName: settings.businessName || defaultBusinessSettings.businessName,
    ownerEmail: settings.ownerEmail || defaultBusinessSettings.ownerEmail,
    notificationEmailFromName:
      settings.notificationEmailFromName || defaultBusinessSettings.notificationEmailFromName,
    timezone: settings.timezone || defaultBusinessSettings.timezone,
    operatingWeekdays:
      settings.operatingWeekdays?.length > 0
        ? settings.operatingWeekdays
        : defaultBusinessSettings.operatingWeekdays,
    slotStartHours:
      settings.slotStartHours?.length > 0
        ? settings.slotStartHours
        : defaultBusinessSettings.slotStartHours,
    slotDurationHours: settings.slotDurationHours || defaultBusinessSettings.slotDurationHours,
    services,
    emailAutomations,
    operationalControls
  };
}

function getMissingSettingUpdates(settings: BusinessSettingsDocument) {
  const updates: Partial<BusinessSettingsValue> = {};

  if (!settings.businessName) updates.businessName = defaultBusinessSettings.businessName;
  if (!settings.ownerEmail) updates.ownerEmail = defaultBusinessSettings.ownerEmail;
  if (!settings.notificationEmailFromName) {
    updates.notificationEmailFromName = defaultBusinessSettings.notificationEmailFromName;
  }
  if (!settings.timezone) updates.timezone = defaultBusinessSettings.timezone;
  if (!settings.operatingWeekdays?.length) {
    updates.operatingWeekdays = defaultBusinessSettings.operatingWeekdays;
  }
  if (!settings.slotStartHours?.length) {
    updates.slotStartHours = defaultBusinessSettings.slotStartHours;
  }
  if (!settings.slotDurationHours) {
    updates.slotDurationHours = defaultBusinessSettings.slotDurationHours;
  }
  if (!settings.services?.length) updates.services = defaultBusinessSettings.services;
  if (!settings.emailAutomations) {
    updates.emailAutomations = defaultBusinessSettings.emailAutomations;
  }
  if (!settings.operationalControls) {
    updates.operationalControls = defaultBusinessSettings.operationalControls;
  }

  return updates;
}

export async function getBusinessSettings() {
  const settings = assertSettings(
    await BusinessSettings.findOneAndUpdate(
      { key: "default" },
      { $setOnInsert: { key: "default", ...defaultBusinessSettings } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean<BusinessSettingsDocument>()
  );
  const missingUpdates = getMissingSettingUpdates(settings);

  if (Object.keys(missingUpdates).length > 0) {
    const backfilledSettings = assertSettings(
      await BusinessSettings.findOneAndUpdate(
        { key: "default" },
        { $set: missingUpdates },
        { new: true }
      ).lean<BusinessSettingsDocument>()
    );

    return normalizeSettings(backfilledSettings);
  }

  return normalizeSettings(settings);
}

export async function updateBusinessSettings(input: Partial<BusinessSettingsValue>) {
  const existing = await getBusinessSettings();
  const nextSettings = {
    ...existing,
    ...input
  };

  const settings = assertSettings(
    await BusinessSettings.findOneAndUpdate(
      { key: "default" },
      { $set: nextSettings },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean<BusinessSettingsDocument>()
  );

  return normalizeSettings(settings);
}

export function getServiceById(
  serviceId: string,
  settings: Pick<BusinessSettingsValue, "services">
): Service | undefined {
  return settings.services.find((service) => service.id === serviceId);
}
