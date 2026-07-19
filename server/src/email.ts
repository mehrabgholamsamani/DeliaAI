import nodemailer from "nodemailer";
import { config } from "./config.js";

type VerificationEmailInput = {
  to: string;
  name: string;
  serviceName: string;
  manageUrl: string;
};

type OwnerBookingNoticeInput = {
  to: string;
  businessName: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  serviceName: string;
  appointmentLabel: string;
  notes?: string;
  adminUrl: string;
};

type BookingReminderEmailInput = {
  to: string;
  name: string;
  businessName: string;
  serviceName: string;
  appointmentLabel: string;
};

type ReviewRequestEmailInput = {
  to: string;
  name: string;
  businessName: string;
  serviceName: string;
  reviewUrl: string;
};

type MonitorTestEmailInput = {
  to: string;
  generatedAt: string;
  appBaseUrl: string;
};

type MonitorAlertEmailInput = {
  to: string;
  subject: string;
  severity: "critical" | "warning" | "resolved";
  title: string;
  summary: string;
  details: string[];
  monitoringUrl: string;
};

type MonitorLoginCodeEmailInput = {
  to: string;
  code: string;
  expiresAt: string;
  ip?: string;
  userAgent?: string;
  monitoringUrl: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const transporter = nodemailer.createTransport({
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  secure: config.SMTP_SECURE,
  auth:
    config.SMTP_USER && config.SMTP_PASS
      ? {
          user: config.SMTP_USER,
          pass: config.SMTP_PASS
        }
      : undefined
});

export async function sendBookingVerificationEmail({
  to,
  name,
  serviceName,
  manageUrl
}: VerificationEmailInput) {
  const from = config.MAIL_FROM;
  const safeName = escapeHtml(name);
  const safeServiceName = escapeHtml(serviceName);
  const safeManageUrl = escapeHtml(manageUrl);

  await transporter.sendMail({
    from,
    to,
    subject: "Manage your booking request",
    text: [
      `Hi ${name},`,
      "",
      `Your ${serviceName} booking request has been sent.`,
      "",
      "Use this secure link to verify your email, edit your details, change your requested time, or cancel your booking:",
      "",
      manageUrl,
      "",
      "This link expires in 7 days."
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; color: #172126; line-height: 1.6;">
        <h1 style="font-size: 22px;">Manage your booking request</h1>
        <p>Hi ${safeName},</p>
        <p>Your <strong>${safeServiceName}</strong> booking request has been sent.</p>
        <p>Use this secure link to verify your email, edit your details, change your requested time, or cancel your booking.</p>
        <p>
          <a href="${safeManageUrl}" style="display: inline-block; background: #172126; color: #ffffff; padding: 12px 18px; border-radius: 8px; text-decoration: none; font-weight: 700;">
            Verify and manage booking
          </a>
        </p>
        <p>This link expires in 7 days.</p>
      </div>
    `
  });
}

export async function sendOwnerBookingNoticeEmail({
  to,
  businessName,
  customerName,
  customerEmail,
  customerPhone,
  serviceName,
  appointmentLabel,
  notes,
  adminUrl
}: OwnerBookingNoticeInput) {
  const from = config.MAIL_FROM;
  const safeBusinessName = escapeHtml(businessName);
  const safeCustomerName = escapeHtml(customerName);
  const safeCustomerEmail = escapeHtml(customerEmail);
  const safeCustomerPhone = escapeHtml(customerPhone);
  const safeServiceName = escapeHtml(serviceName);
  const safeAppointmentLabel = escapeHtml(appointmentLabel);
  const safeNotes = escapeHtml(notes || "No notes");
  const safeAdminUrl = escapeHtml(adminUrl);

  await transporter.sendMail({
    from,
    to,
    replyTo: customerEmail,
    subject: `New booking request from ${customerName}`,
    text: [
      `New booking request for ${businessName}`,
      "",
      `Customer: ${customerName}`,
      `Email: ${customerEmail}`,
      `Phone: ${customerPhone}`,
      `Service: ${serviceName}`,
      `Time: ${appointmentLabel}`,
      `Notes: ${notes || "No notes"}`,
      "",
      `View admin dashboard: ${adminUrl}`
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; color: #172126; line-height: 1.6;">
        <h1 style="font-size: 22px;">New booking request</h1>
        <p><strong>${safeBusinessName}</strong> received a new booking.</p>
        <table style="border-collapse: collapse; width: 100%; max-width: 560px;">
          <tr><td style="padding: 6px 0; color: #64748b;">Customer</td><td style="padding: 6px 0;"><strong>${safeCustomerName}</strong></td></tr>
          <tr><td style="padding: 6px 0; color: #64748b;">Email</td><td style="padding: 6px 0;">${safeCustomerEmail}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748b;">Phone</td><td style="padding: 6px 0;">${safeCustomerPhone}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748b;">Service</td><td style="padding: 6px 0;">${safeServiceName}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748b;">Time</td><td style="padding: 6px 0;">${safeAppointmentLabel}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748b;">Notes</td><td style="padding: 6px 0;">${safeNotes}</td></tr>
        </table>
        <p>
          <a href="${safeAdminUrl}" style="display: inline-block; background: #172126; color: #ffffff; padding: 12px 18px; border-radius: 8px; text-decoration: none; font-weight: 700;">
            Open admin dashboard
          </a>
        </p>
      </div>
    `
  });
}

export async function sendBookingReminderEmail({
  to,
  name,
  businessName,
  serviceName,
  appointmentLabel
}: BookingReminderEmailInput) {
  const from = config.MAIL_FROM;
  const safeName = escapeHtml(name);
  const safeBusinessName = escapeHtml(businessName);
  const safeServiceName = escapeHtml(serviceName);
  const safeAppointmentLabel = escapeHtml(appointmentLabel);

  await transporter.sendMail({
    from,
    to,
    subject: `Reminder: your ${serviceName} appointment is coming up`,
    text: [
      `Hi ${name},`,
      "",
      `This is a reminder that your ${serviceName} appointment with ${businessName} is scheduled for ${appointmentLabel}.`,
      "",
      "If anything has changed, please contact us before the appointment.",
      "",
      `Thank you,`,
      businessName
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; color: #172126; line-height: 1.6;">
        <h1 style="font-size: 22px;">Appointment reminder</h1>
        <p>Hi ${safeName},</p>
        <p>Your <strong>${safeServiceName}</strong> appointment with <strong>${safeBusinessName}</strong> is coming up.</p>
        <table style="border-collapse: collapse; width: 100%; max-width: 520px;">
          <tr><td style="padding: 6px 0; color: #64748b;">Time</td><td style="padding: 6px 0;"><strong>${safeAppointmentLabel}</strong></td></tr>
          <tr><td style="padding: 6px 0; color: #64748b;">Service</td><td style="padding: 6px 0;">${safeServiceName}</td></tr>
        </table>
        <p>If anything has changed, please contact us before the appointment.</p>
      </div>
    `
  });
}

export async function sendReviewRequestEmail({
  to,
  name,
  businessName,
  serviceName,
  reviewUrl
}: ReviewRequestEmailInput) {
  const from = config.MAIL_FROM;
  const safeName = escapeHtml(name);
  const safeBusinessName = escapeHtml(businessName);
  const safeServiceName = escapeHtml(serviceName);
  const safeReviewUrl = escapeHtml(reviewUrl);

  await transporter.sendMail({
    from,
    to,
    subject: `How was your ${serviceName}?`,
    text: [
      `Hi ${name},`,
      "",
      `Thank you for choosing ${businessName} for your ${serviceName}.`,
      "",
      "We would appreciate a quick review of your experience:",
      "",
      reviewUrl,
      "",
      `Thank you,`,
      businessName
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; color: #172126; line-height: 1.6;">
        <h1 style="font-size: 22px;">How did we do?</h1>
        <p>Hi ${safeName},</p>
        <p>Thank you for choosing <strong>${safeBusinessName}</strong> for your <strong>${safeServiceName}</strong>.</p>
        <p>We would appreciate a quick review of your experience.</p>
        <p>
          <a href="${safeReviewUrl}" style="display: inline-block; background: #172126; color: #ffffff; padding: 12px 18px; border-radius: 8px; text-decoration: none; font-weight: 700;">
            Leave a review
          </a>
        </p>
      </div>
    `
  });
}

export async function sendMonitorTestEmail({
  to,
  generatedAt,
  appBaseUrl
}: MonitorTestEmailInput) {
  const from = config.MAIL_FROM;
  const safeGeneratedAt = escapeHtml(generatedAt);
  const safeAppBaseUrl = escapeHtml(appBaseUrl);

  await transporter.sendMail({
    from,
    to,
    subject: "Monitoring test email",
    text: [
      "Monitoring test email",
      "",
      `Generated at: ${generatedAt}`,
      `App URL: ${appBaseUrl}`,
      "",
      "If you received this, the SMTP path is working."
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; color: #172126; line-height: 1.6;">
        <h1 style="font-size: 22px;">Monitoring test email</h1>
        <p>If you received this, the SMTP path is working.</p>
        <table style="border-collapse: collapse; width: 100%; max-width: 520px;">
          <tr><td style="padding: 6px 0; color: #64748b;">Generated at</td><td style="padding: 6px 0;"><strong>${safeGeneratedAt}</strong></td></tr>
          <tr><td style="padding: 6px 0; color: #64748b;">App URL</td><td style="padding: 6px 0;">${safeAppBaseUrl}</td></tr>
        </table>
      </div>
    `
  });
}

export async function sendMonitorAlertEmail({
  to,
  subject,
  severity,
  title,
  summary,
  details,
  monitoringUrl
}: MonitorAlertEmailInput) {
  const from = config.MAIL_FROM;
  const safeTitle = escapeHtml(title);
  const safeSummary = escapeHtml(summary);
  const safeSeverity = escapeHtml(severity.toUpperCase());
  const safeMonitoringUrl = escapeHtml(monitoringUrl);
  const safeDetails = details.map(escapeHtml);

  await transporter.sendMail({
    from,
    to,
    subject,
    text: [
      `${severity.toUpperCase()}: ${title}`,
      "",
      summary,
      "",
      ...details.map((detail) => `- ${detail}`),
      "",
      `Open monitoring: ${monitoringUrl}`
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; color: #172126; line-height: 1.6;">
        <p style="display: inline-block; margin: 0 0 12px; padding: 4px 8px; border-radius: 4px; background: ${
          severity === "critical" ? "#fee2e2" : severity === "warning" ? "#fef3c7" : "#dcfce7"
        }; color: ${severity === "critical" ? "#991b1b" : severity === "warning" ? "#92400e" : "#166534"}; font-weight: 700;">
          ${safeSeverity}
        </p>
        <h1 style="font-size: 22px; margin: 0 0 12px;">${safeTitle}</h1>
        <p>${safeSummary}</p>
        <ul>
          ${safeDetails.map((detail) => `<li>${detail}</li>`).join("")}
        </ul>
        <p>
          <a href="${safeMonitoringUrl}" style="display: inline-block; background: #172126; color: #ffffff; padding: 12px 18px; border-radius: 8px; text-decoration: none; font-weight: 700;">
            Open monitoring
          </a>
        </p>
      </div>
    `
  });
}

export async function sendMonitorLoginCodeEmail({
  to,
  code,
  expiresAt,
  ip,
  userAgent,
  monitoringUrl
}: MonitorLoginCodeEmailInput) {
  const from = config.MAIL_FROM;
  const safeCode = escapeHtml(code);
  const safeExpiresAt = escapeHtml(expiresAt);
  const safeIp = escapeHtml(ip || "Unknown");
  const safeUserAgent = escapeHtml(userAgent || "Unknown");
  const safeMonitoringUrl = escapeHtml(monitoringUrl);

  await transporter.sendMail({
    from,
    to,
    subject: "Monitoring login code",
    text: [
      "Monitoring login code",
      "",
      `Code: ${code}`,
      `Expires at: ${expiresAt}`,
      "",
      `IP: ${ip || "Unknown"}`,
      `Browser: ${userAgent || "Unknown"}`,
      "",
      `Open monitoring: ${monitoringUrl}`,
      "",
      "If you did not try to log in, change the monitor password and session secret."
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; color: #172126; line-height: 1.6;">
        <h1 style="font-size: 22px;">Monitoring login code</h1>
        <p>Use this code to finish signing in to the private monitoring console.</p>
        <p style="font-size: 28px; font-weight: 800; letter-spacing: 4px; margin: 16px 0;">${safeCode}</p>
        <table style="border-collapse: collapse; width: 100%; max-width: 640px;">
          <tr><td style="padding: 6px 0; color: #64748b;">Expires at</td><td style="padding: 6px 0;"><strong>${safeExpiresAt}</strong></td></tr>
          <tr><td style="padding: 6px 0; color: #64748b;">IP</td><td style="padding: 6px 0;">${safeIp}</td></tr>
          <tr><td style="padding: 6px 0; color: #64748b;">Browser</td><td style="padding: 6px 0;">${safeUserAgent}</td></tr>
        </table>
        <p>
          <a href="${safeMonitoringUrl}" style="display: inline-block; background: #172126; color: #ffffff; padding: 12px 18px; border-radius: 8px; text-decoration: none; font-weight: 700;">
            Open monitoring
          </a>
        </p>
        <p>If you did not try to log in, change the monitor password and session secret.</p>
      </div>
    `
  });
}
