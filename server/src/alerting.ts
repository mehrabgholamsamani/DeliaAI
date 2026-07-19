import mongoose from "mongoose";
import { config } from "./config.js";
import { sendMonitorAlertEmail } from "./email.js";
import { logger } from "./logger.js";
import { AlertState } from "./models/AlertState.js";
import { BrowserEvent } from "./models/BrowserEvent.js";
import { Booking } from "./models/Booking.js";
import { EmailJob } from "./models/EmailJob.js";
import { SystemEvent } from "./models/SystemEvent.js";
import { getBusinessSettings } from "./services.js";

type AlertSeverity = "critical" | "warning";

type AlertCondition = {
  key: string;
  severity: AlertSeverity;
  title: string;
  summary: string;
  details: string[];
};

let alertScheduler: NodeJS.Timeout | undefined;
let isProcessingAlerts = false;
let lastDatabaseAlertSentAt = 0;

function getAlertRecipient() {
  return config.ALERT_EMAIL_TO || config.BUSINESS_OWNER_EMAIL;
}

function getMonitoringUrl() {
  return new URL("/monitoring", config.APP_BASE_URL).toString();
}

function getLookbackDate(now: Date) {
  return new Date(now.getTime() - config.ALERT_LOOKBACK_MINUTES * 60 * 1000);
}

function shouldSendInMemoryAlert(lastSentAt: number, now = Date.now()) {
  return now - lastSentAt >= config.ALERT_COOLDOWN_MS;
}

async function sendAlertEmail(alert: AlertCondition) {
  await sendMonitorAlertEmail({
    to: getAlertRecipient(),
    subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
    severity: alert.severity,
    title: alert.title,
    summary: alert.summary,
    details: alert.details,
    monitoringUrl: getMonitoringUrl()
  });
}

async function sendResolvedEmail(alert: Pick<AlertCondition, "key" | "title">) {
  await sendMonitorAlertEmail({
    to: getAlertRecipient(),
    subject: `[RESOLVED] ${alert.title}`,
    severity: "resolved",
    title: `${alert.title} resolved`,
    summary: `The alert condition "${alert.key}" is no longer active.`,
    details: ["The monitor check no longer detects this condition."],
    monitoringUrl: getMonitoringUrl()
  });
}

async function collectAlertConditions(now = new Date()): Promise<AlertCondition[]> {
  const lookback = getLookbackDate(now);
  const settings = await getBusinessSettings();
  const [
    failedEmailJobs,
    staleProcessingEmailJobs,
    oldPendingEmailJobs,
    backendErrors,
    frontendErrors,
    poorWebVitals,
    pastOpenBookings
  ] = await Promise.all([
    EmailJob.countDocuments({ status: "failed" }),
    EmailJob.countDocuments({
      status: "processing",
      $or: [
        { lockedUntil: { $exists: false } },
        { lockedUntil: { $lte: now } },
        { updatedAt: { $lte: new Date(now.getTime() - config.EMAIL_JOB_LOCK_MS) } }
      ]
    }),
    EmailJob.countDocuments({
      status: "pending",
      runAt: { $lte: new Date(now.getTime() - 15 * 60 * 1000) }
    }),
    SystemEvent.countDocuments({ severity: "error", createdAt: { $gte: lookback } }),
    BrowserEvent.countDocuments({
      type: { $in: ["javascript_error", "unhandled_rejection"] },
      createdAt: { $gte: lookback }
    }),
    BrowserEvent.countDocuments({
      type: "web_vitals",
      rating: "poor",
      createdAt: { $gte: lookback }
    }),
    Booking.countDocuments({
      appointmentAt: { $lt: now },
      $or: [{ status: "open" }, { status: { $exists: false } }]
    })
  ]);

  const alerts: AlertCondition[] = [];

  if (failedEmailJobs > 0) {
    alerts.push({
      key: "failed-email-jobs",
      severity: "critical",
      title: "Failed email jobs detected",
      summary: `${failedEmailJobs} email job${failedEmailJobs === 1 ? "" : "s"} are failed.`,
      details: [
        "Customer or owner emails may not be sending.",
        "Open monitoring, review the failed job error, then retry after fixing SMTP or payload issues."
      ]
    });
  }

  if (staleProcessingEmailJobs > 0) {
    alerts.push({
      key: "stale-processing-email-jobs",
      severity: "critical",
      title: "Email jobs stuck in processing",
      summary: `${staleProcessingEmailJobs} email job${staleProcessingEmailJobs === 1 ? "" : "s"} appear stuck.`,
      details: [
        "The email worker may have crashed mid-job.",
        "Use monitoring to unlock stale jobs and confirm the worker is running."
      ]
    });
  }

  if (oldPendingEmailJobs > 0) {
    alerts.push({
      key: "old-pending-email-jobs",
      severity: "warning",
      title: "Pending emails are not being processed",
      summary: `${oldPendingEmailJobs} pending email job${oldPendingEmailJobs === 1 ? "" : "s"} are older than 15 minutes.`,
      details: [
        "The email worker may be disabled, blocked, or failing.",
        "Check worker status and SMTP configuration."
      ]
    });
  }

  if (backendErrors > 0) {
    alerts.push({
      key: "backend-errors",
      severity: "critical",
      title: "Backend server errors detected",
      summary: `${backendErrors} backend error${backendErrors === 1 ? "" : "s"} occurred in the last ${config.ALERT_LOOKBACK_MINUTES} minutes.`,
      details: [
        "Open monitoring and inspect Recent Errors and Recent API Requests.",
        "Use the request id in logs if available."
      ]
    });
  }

  if (frontendErrors > 0) {
    alerts.push({
      key: "frontend-errors",
      severity: "warning",
      title: "Frontend browser errors detected",
      summary: `${frontendErrors} browser error${frontendErrors === 1 ? "" : "s"} occurred in the last ${config.ALERT_LOOKBACK_MINUTES} minutes.`,
      details: [
        "Customers may be hitting JavaScript errors.",
        "Open monitoring and inspect Frontend Health."
      ]
    });
  }

  if (poorWebVitals > 0) {
    alerts.push({
      key: "poor-web-vitals",
      severity: "warning",
      title: "Poor frontend performance detected",
      summary: `${poorWebVitals} poor web-vital event${poorWebVitals === 1 ? "" : "s"} occurred in the last ${config.ALERT_LOOKBACK_MINUTES} minutes.`,
      details: [
        "The site may be slow or visually unstable for customers.",
        "Check recent deploys and large assets."
      ]
    });
  }

  if (!settings.operationalControls.bookingsPaused && pastOpenBookings > 0) {
    alerts.push({
      key: "past-open-bookings",
      severity: "warning",
      title: "Past open bookings need attention",
      summary: `${pastOpenBookings} open booking${pastOpenBookings === 1 ? "" : "s"} are in the past.`,
      details: [
        "The business owner may need to resolve, cancel, or follow up.",
        "This alert is informational and can repeat after cooldown while unresolved."
      ]
    });
  }

  return alerts;
}

async function sendDatabaseUnavailableAlert() {
  if (!config.ALERTING_ENABLED || !shouldSendInMemoryAlert(lastDatabaseAlertSentAt)) {
    return;
  }

  lastDatabaseAlertSentAt = Date.now();
  await sendAlertEmail({
    key: "database-unavailable",
    severity: "critical",
    title: "Database connection unavailable",
    summary: "The API process cannot use MongoDB.",
    details: [
      "The app may be unable to read bookings, send queued emails, or render monitoring data.",
      "Check MongoDB availability, credentials, network access, and connection limits."
    ]
  });
}

export async function processMonitorAlerts(now = new Date()) {
  if (!config.ALERTING_ENABLED) {
    return [];
  }

  if (mongoose.connection.readyState !== 1) {
    await sendDatabaseUnavailableAlert();
    return [];
  }

  const activeAlerts = await collectAlertConditions(now);
  const activeKeys = new Set(activeAlerts.map((alert) => alert.key));
  const sentAlerts: string[] = [];

  for (const alert of activeAlerts) {
    const state = await AlertState.findOneAndUpdate(
      { key: alert.key },
      {
        $setOnInsert: { key: alert.key },
        $set: {
          status: "active",
          lastMessage: alert.summary
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const lastSentAt = state.lastSentAt?.getTime() || 0;

    if (now.getTime() - lastSentAt < config.ALERT_COOLDOWN_MS) {
      continue;
    }

    await sendAlertEmail(alert);
    state.lastSentAt = now;
    state.lastMessage = alert.summary;
    await state.save();
    sentAlerts.push(alert.key);
  }

  const statesToResolve = await AlertState.find({
    status: "active",
    key: { $nin: [...activeKeys] }
  });

  for (const state of statesToResolve) {
    state.status = "resolved";
    state.lastResolvedAt = now;
    await state.save();

    if (state.lastSentAt) {
      await sendResolvedEmail({ key: state.key, title: state.key.replaceAll("-", " ") });
    }
  }

  return sentAlerts;
}

export async function sendStartupFailureAlert(error: unknown) {
  if (!config.ALERTING_ENABLED) {
    return;
  }

  await sendAlertEmail({
    key: "startup-failure",
    severity: "critical",
    title: "API server failed to start",
    summary: "The API server failed during startup.",
    details: [
      error instanceof Error ? error.message : "Unknown startup error",
      "Check deployment logs, environment variables, database connectivity, and build output."
    ]
  });
}

export function startMonitorAlertScheduler() {
  if (!config.ALERTING_ENABLED || alertScheduler) {
    return () => undefined;
  }

  async function runSafely() {
    if (isProcessingAlerts) {
      return;
    }

    isProcessingAlerts = true;

    try {
      await processMonitorAlerts();
    } catch (error) {
      logger.error("Failed to process monitor alerts", { error });
    } finally {
      isProcessingAlerts = false;
    }
  }

  alertScheduler = setInterval(() => {
    void runSafely();
  }, config.ALERT_CHECK_INTERVAL_MS);

  void runSafely();

  return () => {
    if (alertScheduler) {
      clearInterval(alertScheduler);
      alertScheduler = undefined;
    }
  };
}
