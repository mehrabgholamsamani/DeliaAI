import {
  Activity,
  AlertCircle,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Lock,
  LogOut,
  Mail,
  RefreshCw,
  RotateCcw,
  Send,
  Server,
  Unlock
} from "lucide-react";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import {
  getMonitorSession,
  getMonitoringDashboard,
  monitorLogin,
  monitorLogout,
  retryMonitorEmailJob,
  sendMonitorTestEmail,
  updateMonitorOperationalControls,
  unlockMonitorEmailJob,
  verifyMonitorLogin
} from "../api";
import type { EmailJob, MonitoringDashboard, OperationalControls } from "../types";

type HealthLevel = "healthy" | "moderate" | "attention" | "bad";

type HealthCheck = {
  key: string;
  label: string;
  level: HealthLevel;
  reason: string;
  action: string;
};

function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function formatDateTime(value?: string) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatJobType(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function formatAuditAction(value: string) {
  return value
    .replaceAll(".", " ")
    .replace(/(^|\s)\w/g, (letter) => letter.toUpperCase());
}

function statusTone(value: "good" | "warn" | "bad") {
  if (value === "good") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (value === "bad") {
    return "bg-rose-50 text-rose-700";
  }

  return "bg-amber-50 text-amber-700";
}

function healthTone(level: HealthLevel) {
  if (level === "healthy") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (level === "moderate") {
    return "border-blue-200 bg-blue-50 text-blue-800";
  }

  if (level === "bad") {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }

  return "border-amber-200 bg-amber-50 text-amber-800";
}

function healthLabel(level: HealthLevel) {
  if (level === "healthy") return "Healthy";
  if (level === "moderate") return "Moderate";
  if (level === "bad") return "Bad";
  return "Needs attention";
}

function getFrontendErrorCount(dashboard: MonitoringDashboard) {
  return (
    (dashboard.frontend.eventsLast24Hours.javascript_error || 0) +
    (dashboard.frontend.eventsLast24Hours.unhandled_rejection || 0)
  );
}

function getHealthChecks(dashboard: MonitoringDashboard): HealthCheck[] {
  const criticalIncidents = dashboard.incidents.filter((incident) => incident.severity === "critical");
  const warningIncidents = dashboard.incidents.filter((incident) => incident.severity === "warning");
  const frontendErrors = getFrontendErrorCount(dashboard);
  const failedSyntheticChecks = dashboard.syntheticChecks.filter((check) => check.status === "fail");
  const failedEmails = dashboard.emails.failed;
  const staleEmails = dashboard.emails.staleProcessing;
  const oldPendingEmails = dashboard.emails.oldPending;
  const backendErrors = dashboard.traffic.httpErrorsTotal;
  const errorRate = dashboard.traffic.errorRate;
  const averageResponse = dashboard.status.averageRequestDurationMs;

  return [
    {
      key: "overall",
      label: "Overall",
      level: criticalIncidents.length > 0 ? "bad" : warningIncidents.length > 0 ? "attention" : "healthy",
      reason:
        criticalIncidents.length > 0
          ? `${criticalIncidents.length} critical incident${criticalIncidents.length === 1 ? "" : "s"} active.`
          : warningIncidents.length > 0
            ? `${warningIncidents.length} warning${warningIncidents.length === 1 ? "" : "s"} need review.`
            : "No active incidents detected.",
      action:
        criticalIncidents.length > 0 || warningIncidents.length > 0
          ? "Start with the incident queue below."
          : "No action needed."
    },
    {
      key: "api",
      label: "API",
      level:
        backendErrors > 0 || errorRate >= 10
          ? "bad"
          : errorRate > 0 || averageResponse >= 1000
            ? "attention"
            : averageResponse >= 500
              ? "moderate"
              : "healthy",
      reason:
        backendErrors > 0
          ? `${backendErrors} server error${backendErrors === 1 ? "" : "s"} since startup.`
          : averageResponse >= 1000
            ? `Average response time is high at ${averageResponse}ms.`
            : averageResponse >= 500
              ? `Average response time is acceptable but elevated at ${averageResponse}ms.`
              : `Average response time is ${averageResponse}ms.`,
      action:
        backendErrors > 0
          ? "Check Recent Errors and Recent API Requests."
          : averageResponse >= 500
            ? "Watch response time and request trends."
            : "No action needed."
    },
    {
      key: "database",
      label: "Database",
      level: dashboard.status.database !== "ready" || !dashboard.database.available ? "bad" : "healthy",
      reason:
        dashboard.status.database !== "ready" || !dashboard.database.available
          ? "Database is not ready or stats are unavailable."
          : `${dashboard.database.collections} collections, ${dashboard.database.objects} records.`,
      action:
        dashboard.status.database !== "ready" || !dashboard.database.available
          ? "Check MongoDB connection, credentials, and provider status."
          : "No action needed."
    },
    {
      key: "email",
      label: "Email",
      level:
        failedEmails > 0 || staleEmails > 0
          ? "bad"
          : oldPendingEmails > 0
            ? "attention"
            : dashboard.emails.queued > 0
              ? "moderate"
              : "healthy",
      reason:
        failedEmails > 0
          ? `${failedEmails} failed email job${failedEmails === 1 ? "" : "s"}.`
          : staleEmails > 0
            ? `${staleEmails} email job${staleEmails === 1 ? "" : "s"} stuck processing.`
            : oldPendingEmails > 0
              ? `${oldPendingEmails} pending email job${oldPendingEmails === 1 ? "" : "s"} are old.`
              : dashboard.emails.queued > 0
                ? `${dashboard.emails.queued} email job${dashboard.emails.queued === 1 ? "" : "s"} queued.`
                : "No email queue problems detected.",
      action:
        failedEmails > 0
          ? "Retry failed jobs after checking the error."
          : staleEmails > 0
            ? "Unlock stale jobs."
            : oldPendingEmails > 0
              ? "Confirm the email worker is running."
              : "No action needed."
    },
    {
      key: "bookings",
      label: "Bookings",
      level:
        dashboard.bookings.pastOpen > 0
          ? "attention"
          : dashboard.bookings.unverifiedOpen > 5
            ? "moderate"
            : "healthy",
      reason:
        dashboard.bookings.pastOpen > 0
          ? `${dashboard.bookings.pastOpen} open booking${dashboard.bookings.pastOpen === 1 ? "" : "s"} are in the past.`
          : dashboard.bookings.unverifiedOpen > 5
            ? `${dashboard.bookings.unverifiedOpen} open booking${dashboard.bookings.unverifiedOpen === 1 ? "" : "s"} are unverified.`
            : `${dashboard.bookings.open} open booking${dashboard.bookings.open === 1 ? "" : "s"} tracked.`,
      action:
        dashboard.bookings.pastOpen > 0
          ? "Ask the owner to resolve, cancel, or follow up."
          : dashboard.bookings.unverifiedOpen > 5
            ? "Watch verification email delivery."
            : "No action needed."
    },
    {
      key: "frontend",
      label: "Frontend",
      level:
        frontendErrors > 0
          ? "attention"
          : dashboard.frontend.poorWebVitals > 0
            ? "moderate"
            : "healthy",
      reason:
        frontendErrors > 0
          ? `${frontendErrors} browser error${frontendErrors === 1 ? "" : "s"} in the last 24h.`
          : dashboard.frontend.poorWebVitals > 0
            ? `${dashboard.frontend.poorWebVitals} poor performance event${dashboard.frontend.poorWebVitals === 1 ? "" : "s"} in the last 24h.`
            : "No frontend error signals detected.",
      action:
        frontendErrors > 0
          ? "Check Frontend Health for affected page paths."
          : dashboard.frontend.poorWebVitals > 0
            ? "Check large assets or recent UI changes."
            : "No action needed."
    },
    {
      key: "synthetic",
      label: "Customer Flows",
      level: failedSyntheticChecks.length > 0 ? "bad" : "healthy",
      reason:
        failedSyntheticChecks.length > 0
          ? `${failedSyntheticChecks.length} synthetic check${failedSyntheticChecks.length === 1 ? "" : "s"} failed.`
          : "Services, availability, and booking readiness checks pass.",
      action:
        failedSyntheticChecks.length > 0
          ? "Open Synthetic Checks and fix the failed customer path."
          : "No action needed."
    },
    {
      key: "alerting",
      label: "Alerting",
      level: dashboard.alerting.enabled ? "healthy" : "attention",
      reason: dashboard.alerting.enabled
        ? `Emails go to ${dashboard.alerting.recipient}.`
        : "Email alerting is turned off.",
      action: dashboard.alerting.enabled ? "No action needed." : "Enable alerting before production."
    },
    {
      key: "operations",
      label: "Operations",
      level:
        dashboard.operationalControls.bookingsPaused ||
        dashboard.operationalControls.maintenanceBannerEnabled
          ? "moderate"
          : "healthy",
      reason:
        dashboard.operationalControls.bookingsPaused
          ? "Customer bookings are intentionally paused."
          : dashboard.operationalControls.maintenanceBannerEnabled
            ? "A public maintenance banner is active."
            : "No emergency controls are active.",
      action:
        dashboard.operationalControls.bookingsPaused ||
        dashboard.operationalControls.maintenanceBannerEnabled
          ? "Remember to return to normal operation when done."
          : "No action needed."
    }
  ];
}

function downloadDiagnostics(dashboard: MonitoringDashboard) {
  const blob = new Blob([JSON.stringify(dashboard, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `monitoring-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

const maintenanceBannerPreset =
  "The website is currently undergoing maintenance. Some features may be temporarily unavailable.";
const bookingPausePreset =
  "Online booking is temporarily paused while we perform maintenance. Please contact us directly.";

function describeOperationalChanges(
  current: OperationalControls,
  next: OperationalControls
) {
  const changes: string[] = [];

  if (current.bookingsPaused !== next.bookingsPaused) {
    changes.push(next.bookingsPaused ? "Pause customer bookings" : "Resume customer bookings");
  }

  if ((current.bookingPauseMessage || "") !== (next.bookingPauseMessage || "")) {
    changes.push("Change the booking pause message");
  }

  if (current.maintenanceBannerEnabled !== next.maintenanceBannerEnabled) {
    changes.push(
      next.maintenanceBannerEnabled
        ? "Show the public maintenance banner"
        : "Hide the public maintenance banner"
    );
  }

  if ((current.maintenanceBannerMessage || "") !== (next.maintenanceBannerMessage || "")) {
    changes.push("Change the public maintenance banner text");
  }

  return changes;
}

function buildIncidentSummary(dashboard: MonitoringDashboard) {
  const incidents =
    dashboard.incidents.length === 0
      ? "No active incidents."
      : dashboard.incidents
          .map((incident) => `- ${incident.severity.toUpperCase()}: ${incident.message}`)
          .join("\n");

  return [
    `Monitoring snapshot: ${new Date(dashboard.status.generatedAt).toLocaleString()}`,
    `Overall API: ${dashboard.status.api}`,
    `Database: ${dashboard.status.database}`,
    `Requests: ${dashboard.traffic.httpRequestsTotal}, errors: ${dashboard.traffic.httpErrorsTotal}, error rate: ${dashboard.traffic.errorRate}%`,
    `Emails: ${dashboard.emails.failed} failed, ${dashboard.emails.queued} queued, ${dashboard.emails.staleProcessing} stale`,
    `Bookings: ${dashboard.bookings.open} open, ${dashboard.bookings.pastOpen} past-open, ${dashboard.bookings.unverifiedOpen} unverified`,
    "",
    incidents
  ].join("\n");
}

export function MonitoringPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [mfaChallengeId, setMfaChallengeId] = useState("");
  const [mfaExpiresAt, setMfaExpiresAt] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [dashboard, setDashboard] = useState<MonitoringDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [retryingJobId, setRetryingJobId] = useState<string>();
  const [unlockingJobId, setUnlockingJobId] = useState<string>();
  const [testEmail, setTestEmail] = useState("");
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [savingControls, setSavingControls] = useState(false);
  const [controlsDraft, setControlsDraft] = useState<OperationalControls | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadDashboard() {
    setLoading(true);
    setError("");

    try {
      const response = await getMonitoringDashboard();
      setDashboard(response);
      setControlsDraft(response.operationalControls);
    } catch (requestError) {
      const nextError =
        requestError instanceof Error ? requestError.message : "Could not load monitoring data.";
      setError(nextError);

      if (nextError.toLowerCase().includes("monitor login")) {
        setAuthenticated(false);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function checkSession() {
      try {
        const response = await getMonitorSession();
        setAuthenticated(response.authenticated);
      } catch (requestError) {
        setError(
          requestError instanceof Error ? requestError.message : "Could not check monitor session."
        );
      } finally {
        setAuthChecking(false);
      }
    }

    void checkSession();
  }, []);

  useEffect(() => {
    if (authenticated) {
      void loadDashboard();
    }
  }, [authenticated]);

  const overallStatus = useMemo(() => {
    if (!dashboard) {
      return { label: "Unknown", tone: "warn" as const };
    }

    if (dashboard.incidents.some((incident) => incident.severity === "critical")) {
      return { label: "Bad", tone: "bad" as const };
    }

    if (dashboard.incidents.length > 0) {
      return { label: "Needs attention", tone: "warn" as const };
    }

    return { label: "Healthy", tone: "good" as const };
  }, [dashboard]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await monitorLogin(password);
      setPassword("");

      if (response.mfaRequired && response.challengeId) {
        setMfaChallengeId(response.challengeId);
        setMfaExpiresAt(response.expiresAt || "");
        setMfaCode("");
        setMessage("Verification code sent to your monitoring alert email.");
        return;
      }

      setAuthenticated(response.authenticated);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Monitor login failed.");
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleVerifyLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMfaBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await verifyMonitorLogin(mfaChallengeId, mfaCode);
      setMfaCode("");
      setMfaChallengeId("");
      setMfaExpiresAt("");
      setAuthenticated(response.authenticated);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Monitor code failed.");
    } finally {
      setMfaBusy(false);
    }
  }

  function resetMonitorLoginChallenge() {
    setMfaChallengeId("");
    setMfaExpiresAt("");
    setMfaCode("");
    setMessage("");
    setError("");
  }

  async function handleLogout() {
    try {
      await monitorLogout();
    } finally {
      setAuthenticated(false);
      setDashboard(null);
    }
  }

  async function handleRetry(jobId: string) {
    const confirmed = window.confirm("Retry this failed email job now?");

    if (!confirmed) {
      return;
    }

    setRetryingJobId(jobId);
    setError("");
    setMessage("");

    try {
      await retryMonitorEmailJob(jobId);
      await loadDashboard();
      setMessage("Email job queued for retry.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not retry email job.");
    } finally {
      setRetryingJobId(undefined);
    }
  }

  async function handleUnlock(jobId: string) {
    const confirmed = window.confirm(
      "Unlock this stale email job and put it back into the queue?"
    );

    if (!confirmed) {
      return;
    }

    setUnlockingJobId(jobId);
    setError("");
    setMessage("");

    try {
      await unlockMonitorEmailJob(jobId);
      await loadDashboard();
      setMessage("Stale email job unlocked.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not unlock email job.");
    } finally {
      setUnlockingJobId(undefined);
    }
  }

  async function handleSendTestEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const recipient = testEmail.trim() || "the configured business owner email";
    const confirmed = window.confirm(`Send a test email to ${recipient}?`);

    if (!confirmed) {
      return;
    }

    setSendingTestEmail(true);
    setError("");
    setMessage("");

    try {
      const response = await sendMonitorTestEmail(testEmail.trim() || undefined);
      setMessage(`Test email sent to ${response.to}.`);
      await loadDashboard();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not send test email.");
    } finally {
      setSendingTestEmail(false);
    }
  }

  async function handleSaveOperationalControls(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!controlsDraft) {
      return;
    }

    const currentControls = dashboard?.operationalControls;
    const changes = currentControls
      ? describeOperationalChanges(currentControls, controlsDraft)
      : ["Save operational controls"];

    if (changes.length === 0) {
      setMessage("No operational control changes to save.");
      return;
    }

    const confirmed = window.confirm(
      [
        "Apply these public operational changes?",
        "",
        ...changes.map((change) => `- ${change}`),
        "",
        controlsDraft.maintenanceBannerEnabled
          ? `Banner text: ${controlsDraft.maintenanceBannerMessage || maintenanceBannerPreset}`
          : "",
        controlsDraft.bookingsPaused
          ? `Booking pause text: ${controlsDraft.bookingPauseMessage || bookingPausePreset}`
          : ""
      ]
        .filter(Boolean)
        .join("\n")
    );

    if (!confirmed) {
      return;
    }

    setSavingControls(true);
    setError("");
    setMessage("");

    try {
      const response = await updateMonitorOperationalControls(controlsDraft);
      setControlsDraft(response.operationalControls);
      await loadDashboard();
      setMessage("Operational controls saved.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not save operational controls."
      );
    } finally {
      setSavingControls(false);
    }
  }

  async function handleCopyIncidentSummary() {
    if (!dashboard) {
      return;
    }

    try {
      await navigator.clipboard.writeText(buildIncidentSummary(dashboard));
      setMessage("Incident summary copied.");
    } catch {
      setError("Could not copy incident summary.");
    }
  }

  if (authChecking) {
    return (
      <div className="admin-shell min-h-screen bg-[#eceff3] px-5 py-16 text-ink">
        <div className="mx-auto max-w-xl rounded-lg bg-white p-6 text-center text-sm font-semibold text-slate-600 shadow-soft">
          Checking monitor session...
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="admin-shell min-h-screen bg-[#eceff3] px-5 py-16 text-ink">
        <section className="mx-auto max-w-xl rounded-lg bg-white p-6 shadow-soft sm:p-8">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-aqua text-ink">
              <Lock size={24} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-sm font-semibold uppercase tracking-[0.16em] text-mint">
                Monitoring
              </span>
              <h1 className="mt-2 text-3xl font-bold text-ink">Operator login</h1>
              {mfaChallengeId ? (
                <form className="mt-6 space-y-4" onSubmit={handleVerifyLogin}>
                  <label className="block">
                    <span className="field-label">Verification code</span>
                    <input
                      autoComplete="one-time-code"
                      className="field-input"
                      inputMode="numeric"
                      maxLength={6}
                      onChange={(event) =>
                        setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                      pattern="[0-9]{6}"
                      required
                      type="text"
                      value={mfaCode}
                    />
                  </label>
                  {mfaExpiresAt && (
                    <p className="text-sm font-semibold text-slate-600">
                      Code expires {formatDateTime(mfaExpiresAt)}.
                    </p>
                  )}
                  <button
                    className="classic-button primary w-full justify-center"
                    disabled={mfaBusy || mfaCode.length !== 6}
                    type="submit"
                  >
                    <Lock size={17} aria-hidden="true" />
                    {mfaBusy ? "Verifying..." : "Verify code"}
                  </button>
                  <button
                    className="classic-button w-full justify-center"
                    disabled={mfaBusy}
                    onClick={resetMonitorLoginChallenge}
                    type="button"
                  >
                    Use password again
                  </button>
                </form>
              ) : (
                <form className="mt-6 space-y-4" onSubmit={handleLogin}>
                  <label className="block">
                    <span className="field-label">Password</span>
                    <input
                      autoComplete="current-password"
                      className="field-input"
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      type="password"
                      value={password}
                    />
                  </label>
                  <button
                    className="classic-button primary w-full justify-center"
                    disabled={loginBusy}
                    type="submit"
                  >
                    <Lock size={17} aria-hidden="true" />
                    {loginBusy ? "Signing in..." : "Sign in"}
                  </button>
                </form>
              )}
              {error && <div className="admin-alert">{error}</div>}
              {message && (
                <div className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                  {message}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="admin-shell min-h-screen bg-[#eceff3] text-ink">
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950 text-white shadow-sm">
        <nav className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-3 lg:px-8">
          <div className="flex items-center gap-3 font-semibold">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-400 text-slate-950">
              <Server size={19} aria-hidden="true" />
            </span>
            <span className="leading-tight">
              Monitoring
              <span className="block text-xs font-medium uppercase text-slate-400">
                Private operator console
              </span>
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="classic-button"
              disabled={loading}
              onClick={() => void loadDashboard()}
              type="button"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} aria-hidden="true" />
              Refresh
            </button>
            {dashboard && (
              <button
                className="classic-button"
                onClick={() => downloadDiagnostics(dashboard)}
                type="button"
              >
                <Download size={16} aria-hidden="true" />
                Diagnostics
              </button>
            )}
            <button className="classic-button" onClick={() => void handleLogout()} type="button">
              <LogOut size={16} aria-hidden="true" />
              Logout
            </button>
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-3 pb-10 pt-5 sm:px-5 lg:px-8">
        <div className="classic-admin-header">
          <div>
            <span>System status</span>
            <h1>Monitoring dashboard</h1>
            <p>
              {dashboard
                ? `Last generated ${formatDateTime(dashboard.status.generatedAt)}`
                : "No dashboard snapshot loaded"}
            </p>
          </div>
          <div className="classic-admin-actions">
            <span className={`rounded px-3 py-2 text-sm font-bold ${statusTone(overallStatus.tone)}`}>
              {overallStatus.label}
            </span>
          </div>
        </div>

        {error && (
          <div className="admin-alert">
            <AlertCircle size={18} aria-hidden="true" />
            {error}
          </div>
        )}
        {message && (
          <div className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
            {message}
          </div>
        )}

        {loading && !dashboard ? (
          <div className="admin-empty-state">Loading monitoring...</div>
        ) : dashboard ? (
          <MonitoringDashboardView
            dashboard={dashboard}
            controlsDraft={controlsDraft}
            onCopyIncidentSummary={() => void handleCopyIncidentSummary()}
            retryingJobId={retryingJobId}
            savingControls={savingControls}
            sendingTestEmail={sendingTestEmail}
            testEmail={testEmail}
            unlockingJobId={unlockingJobId}
            onRetry={(jobId) => void handleRetry(jobId)}
            onSaveOperationalControls={(event) => void handleSaveOperationalControls(event)}
            onSendTestEmail={(event) => void handleSendTestEmail(event)}
            onControlsDraftChange={setControlsDraft}
            onTestEmailChange={setTestEmail}
            onUnlock={(jobId) => void handleUnlock(jobId)}
          />
        ) : (
          <div className="admin-empty-state">Monitoring data is not available.</div>
        )}
      </main>
    </div>
  );
}

function MonitoringDashboardView({
  dashboard,
  controlsDraft,
  onCopyIncidentSummary,
  retryingJobId,
  savingControls,
  sendingTestEmail,
  testEmail,
  unlockingJobId,
  onRetry,
  onControlsDraftChange,
  onSaveOperationalControls,
  onSendTestEmail,
  onTestEmailChange,
  onUnlock
}: {
  dashboard: MonitoringDashboard;
  controlsDraft: OperationalControls | null;
  onCopyIncidentSummary: () => void;
  retryingJobId?: string;
  savingControls: boolean;
  sendingTestEmail: boolean;
  testEmail: string;
  unlockingJobId?: string;
  onRetry: (jobId: string) => void;
  onControlsDraftChange: (value: OperationalControls) => void;
  onSaveOperationalControls: (event: FormEvent<HTMLFormElement>) => void;
  onSendTestEmail: (event: FormEvent<HTMLFormElement>) => void;
  onTestEmailChange: (value: string) => void;
  onUnlock: (jobId: string) => void;
}) {
  const healthChecks = getHealthChecks(dashboard);
  const problemChecks = healthChecks.filter((check) => check.level === "bad" || check.level === "attention");

  return (
    <div className="space-y-6">
      <div className="classic-summary-grid monitoring-summary-grid">
        <SummaryBox
          icon={<Server size={19} aria-hidden="true" />}
          label={`Uptime ${formatUptime(dashboard.status.uptimeSeconds)}`}
          value={dashboard.status.api}
        />
        <SummaryBox
          icon={<Activity size={19} aria-hidden="true" />}
          label={`${dashboard.traffic.errorRate}% error rate`}
          value={dashboard.traffic.httpRequestsTotal}
        />
        <SummaryBox
          icon={<Clock size={19} aria-hidden="true" />}
          label={`${dashboard.bookings.next24Hours} next 24h`}
          value={dashboard.bookings.today}
        />
        <SummaryBox
          icon={<Mail size={19} aria-hidden="true" />}
          label={`${dashboard.emails.queued} queued, ${dashboard.emails.staleProcessing} stale`}
          value={dashboard.emails.failed}
        />
      </div>

      <fieldset className="classic-fieldset compact">
        <legend>Plain English Health</legend>
        {problemChecks.length === 0 ? (
          <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">
            Everything important looks healthy. No action needed right now.
          </div>
        ) : (
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">
            {problemChecks.length} area{problemChecks.length === 1 ? "" : "s"} need your attention.
            Start with anything marked Bad.
          </div>
        )}
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {healthChecks.map((check) => (
            <HealthCard key={check.key} check={check} />
          ))}
        </div>
      </fieldset>

      <fieldset className="classic-fieldset compact">
        <legend>Operator Shortcuts</legend>
        <div className="flex flex-wrap gap-2">
          <button className="classic-button" onClick={onCopyIncidentSummary} type="button">
            <Copy size={16} aria-hidden="true" />
            Copy incident summary
          </button>
          <a className="classic-button" href="/" target="_blank" rel="noreferrer">
            <ExternalLink size={16} aria-hidden="true" />
            Open website
          </a>
          <a className="classic-button" href="/admin" target="_blank" rel="noreferrer">
            <ExternalLink size={16} aria-hidden="true" />
            Open owner admin
          </a>
        </div>
      </fieldset>

      {dashboard.incidents.length > 0 && (
        <fieldset className="classic-fieldset compact">
          <legend>Incident Queue</legend>
          <div className="grid gap-2">
            {dashboard.incidents.map((incident) => (
              <div
                key={`${incident.severity}-${incident.message}`}
                className={`rounded border p-3 text-sm font-semibold ${
                  incident.severity === "critical"
                    ? "border-rose-200 bg-rose-50 text-rose-800"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                }`}
              >
                <strong className="block">{incident.message}</strong>
                <span className="mt-1 block opacity-80">{incident.action}</span>
              </div>
            ))}
          </div>
        </fieldset>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <fieldset className="classic-fieldset compact">
            <legend>System Health</legend>
            <div className="admin-signal-grid grid-cols-1 sm:grid-cols-3">
              <Signal label="Database" value={dashboard.status.database} detail={dashboard.status.databaseName || "Database name unavailable"} />
              <Signal label="Response Time" value={`${dashboard.status.averageRequestDurationMs}ms`} detail="Average API request" />
              <Signal label="Memory" value={`${dashboard.status.memoryRssMb} MB`} detail="Server RSS memory" />
              <Signal label="Environment" value={dashboard.status.environment} detail={dashboard.status.appBaseUrl} />
              <Signal label="Worker" value={dashboard.status.emailJobWorkerEnabled ? "On" : "Off"} detail="Queued email sender" />
              <Signal label="Scheduler" value={dashboard.status.automatedSchedulerEnabled ? "On" : "Off"} detail="Reminders and reviews" />
              <Signal label="Release" value={dashboard.release.version} detail={dashboard.release.commit || "No commit metadata"} />
              <Signal label="Node" value={dashboard.release.nodeVersion} detail={dashboard.release.buildTime || "No build timestamp"} />
              <Signal label="Alerting" value={dashboard.alerting.enabled ? "On" : "Off"} detail={dashboard.alerting.recipient} />
            </div>
          </fieldset>

          <fieldset className="classic-fieldset compact">
            <legend>Email Alerts</legend>
            <div className="admin-signal-grid grid-cols-1 sm:grid-cols-3">
              <Signal label="Recipient" value={dashboard.alerting.recipient} detail="Critical and warning alerts" />
              <Signal label="Check Interval" value={`${Math.round(dashboard.alerting.checkIntervalMs / 1000)}s`} detail={`${dashboard.alerting.lookbackMinutes}m lookback`} />
              <Signal label="Cooldown" value={`${Math.round(dashboard.alerting.cooldownMs / 60000)}m`} detail="Per alert type" />
            </div>
            <div className="admin-list mt-3">
              {dashboard.alerting.recentStates.length === 0 ? (
                <div className="admin-empty-state small">No alert emails have been recorded yet.</div>
              ) : (
                dashboard.alerting.recentStates.map((state) => (
                  <div key={state._id} className="admin-list-item">
                    <div className="min-w-0">
                      <strong className="truncate">{state.key}</strong>
                      <small className="truncate">{state.lastMessage || "No message recorded"}</small>
                    </div>
                    <time>
                      {state.status} - {formatDateTime(state.lastSentAt || state.updatedAt)}
                    </time>
                  </div>
                ))
              )}
            </div>
          </fieldset>

          <fieldset className="classic-fieldset compact">
            <legend>Synthetic Checks</legend>
            <div className="admin-list">
              {dashboard.syntheticChecks.map((check) => (
                <div key={check.name} className="admin-list-item">
                  <div className="min-w-0">
                    <strong className="truncate">{check.name}</strong>
                    <small className="truncate">{check.message}</small>
                  </div>
                  <span className={`rounded px-2 py-1 text-xs font-bold uppercase ${check.status === "pass" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                    {check.status} {check.durationMs}ms
                  </span>
                </div>
              ))}
            </div>
          </fieldset>

          {controlsDraft && (
            <OperationalControlsPanel
              controls={controlsDraft}
              saving={savingControls}
              onChange={onControlsDraftChange}
              onSave={onSaveOperationalControls}
            />
          )}

          <fieldset className="classic-fieldset compact">
            <legend>Email Recovery</legend>
            <div className="admin-signal-grid grid-cols-1 sm:grid-cols-4">
              <Signal label="Sent" value={dashboard.emails.sent} detail={`Last ${formatDateTime(dashboard.emails.lastSentAt)}`} />
              <Signal label="Failed" value={dashboard.emails.failed} detail="Can be retried below" />
              <Signal label="Old Pending" value={dashboard.emails.oldPending} detail={`${dashboard.emails.oldestPendingAgeMinutes}m oldest pending`} />
              <Signal label="Stale Processing" value={dashboard.emails.staleProcessing} detail="Can be unlocked below" />
            </div>
            <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={onSendTestEmail}>
              <input
                className="field-input"
                onChange={(event) => onTestEmailChange(event.target.value)}
                placeholder="test email recipient, optional"
                type="email"
                value={testEmail}
              />
              <button className="classic-button primary shrink-0" disabled={sendingTestEmail} type="submit">
                <Send size={16} aria-hidden="true" />
                {sendingTestEmail ? "Sending..." : "Send test email"}
              </button>
            </form>
          </fieldset>

          <EmailJobsPanel
            jobs={dashboard.emails.staleJobs}
            retryingJobId={retryingJobId}
            title="Stale Processing Jobs"
            unlockingJobId={unlockingJobId}
            onRetry={onRetry}
            onUnlock={onUnlock}
          />

          <EmailJobsPanel
            jobs={dashboard.emails.failedJobs}
            retryingJobId={retryingJobId}
            title="Failed Email Jobs"
            unlockingJobId={unlockingJobId}
            onRetry={onRetry}
            onUnlock={onUnlock}
          />

          <fieldset className="classic-fieldset compact">
            <legend>Recent Errors</legend>
            {dashboard.recentErrors.length === 0 ? (
              <div className="admin-empty-state small">No recent warning or error events.</div>
            ) : (
              <div className="admin-list">
                {dashboard.recentErrors.map((event) => (
                  <div key={event._id} className="admin-list-item">
                    <div className="min-w-0">
                      <strong className="truncate">
                        {event.statusCode || event.severity} {event.code || event.type}
                      </strong>
                      <small className="truncate">
                        {event.method || "REQUEST"} {event.path || "unknown path"} - {event.message}
                      </small>
                      {event.requestId && <small className="truncate">Request {event.requestId}</small>}
                    </div>
                    <time>{formatDateTime(event.createdAt)}</time>
                  </div>
                ))}
              </div>
            )}
          </fieldset>

          <fieldset className="classic-fieldset compact">
            <legend>Recent API Requests</legend>
            <div className="admin-list">
              {dashboard.traffic.recentRequests.slice(0, 12).map((requestLog) => (
                <div key={requestLog._id} className="admin-list-item">
                  <div className="min-w-0">
                    <strong className="truncate">
                      {requestLog.statusCode} {requestLog.method} {requestLog.path}
                    </strong>
                    <small className="truncate">
                      {requestLog.durationMs}ms {requestLog.requestId ? `- ${requestLog.requestId}` : ""}
                    </small>
                  </div>
                  <time>{formatDateTime(requestLog.createdAt)}</time>
                </div>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="space-y-6">
          <fieldset className="classic-fieldset compact">
            <legend>Database</legend>
            <div className="admin-signal-grid">
              <Signal label="Stats" value={dashboard.database.available ? "Available" : "Unavailable"} detail={`${dashboard.database.collections} collections`} />
              <Signal label="Objects" value={dashboard.database.objects} detail={`${dashboard.database.connections ?? "unknown"} connections`} />
              <Signal label="Data / Storage" value={`${dashboard.database.dataSizeMb} / ${dashboard.database.storageSizeMb} MB`} detail={`${dashboard.database.indexSizeMb} MB indexes`} />
            </div>
          </fieldset>

          <fieldset className="classic-fieldset compact">
            <legend>Frontend Health</legend>
            <div className="admin-signal-grid">
              <Signal label="JS Errors" value={(dashboard.frontend.eventsLast24Hours.javascript_error || 0) + (dashboard.frontend.eventsLast24Hours.unhandled_rejection || 0)} detail="Last 24 hours" />
              <Signal label="Poor Vitals" value={dashboard.frontend.poorWebVitals} detail="Last 24 hours" />
              <Signal label="Page Loads" value={dashboard.frontend.eventsLast24Hours.page_load || 0} detail="Telemetry events" />
            </div>
            <div className="admin-list mt-3">
              {dashboard.frontend.recentEvents.slice(0, 6).map((event) => (
                <div key={event._id} className="admin-list-item">
                  <div className="min-w-0">
                    <strong className="truncate">
                      {event.type} {event.metricName ? `- ${event.metricName}` : ""}
                    </strong>
                    <small className="truncate">
                      {event.path} {event.message || event.rating || ""}
                    </small>
                  </div>
                  <time>{formatDateTime(event.createdAt)}</time>
                </div>
              ))}
            </div>
          </fieldset>

          <fieldset className="classic-fieldset compact">
            <legend>24h Trends</legend>
            <TrendList
              rows={dashboard.trends.requests.slice(-8).map((row) => ({
                label: formatDateTime(row.bucket),
                value: `${row.requests} req / ${row.errors} err / ${row.averageDurationMs}ms`
              }))}
              emptyMessage="No request trend data yet."
            />
            <TrendList
              rows={dashboard.trends.bookings.slice(-8).map((row) => ({
                label: formatDateTime(row.bucket),
                value: `${row.created} bookings`
              }))}
              emptyMessage="No booking trend data yet."
            />
            <TrendList
              rows={dashboard.trends.emailFailures.slice(-8).map((row) => ({
                label: formatDateTime(row.bucket),
                value: `${row.failed} email failures`
              }))}
              emptyMessage="No email failure trend data yet."
            />
          </fieldset>

          <fieldset className="classic-fieldset compact">
            <legend>Booking Health</legend>
            <div className="admin-signal-grid">
              <Signal label="Open Bookings" value={dashboard.bookings.open} detail={`${dashboard.bookings.unverifiedOpen} unverified open`} />
              <Signal label="Past Open" value={dashboard.bookings.pastOpen} detail="Needs owner follow-up" />
              <Signal label="Last 7 Days" value={dashboard.bookings.last7Days} detail={`${dashboard.bookings.total} total records`} />
              <Signal label="Resolved / Canceled" value={`${dashboard.bookings.resolved} / ${dashboard.bookings.canceled}`} detail="Handled outcomes" />
            </div>
          </fieldset>

          <fieldset className="classic-fieldset compact">
            <legend>Recent Bookings</legend>
            {dashboard.bookings.recent.length === 0 ? (
              <div className="admin-empty-state small">No bookings yet.</div>
            ) : (
              <div className="admin-list">
                {dashboard.bookings.recent.map((booking) => (
                  <div key={booking._id} className="admin-list-item">
                    <div className="min-w-0">
                      <strong className="truncate">{booking.name || "Unnamed customer"}</strong>
                      <small className="truncate">
                        {booking.serviceName || "Service not available"} - {booking.status} -{" "}
                        {booking.emailVerified ? "verified" : "unverified"}
                      </small>
                    </div>
                    <time>{formatDateTime(booking.createdAt)}</time>
                  </div>
                ))}
              </div>
            )}
          </fieldset>

          <fieldset className="classic-fieldset compact">
            <legend>Recent Operator Changes</legend>
            {dashboard.auditLogs.length === 0 ? (
              <div className="admin-empty-state small">No changes recorded.</div>
            ) : (
              <div className="admin-list">
                {dashboard.auditLogs.map((log) => (
                  <div key={log._id} className="admin-list-item">
                    <div className="min-w-0">
                      <strong className="truncate">{formatAuditAction(log.action)}</strong>
                      <small className="truncate">
                        {log.targetType}
                        {log.targetId ? ` - ${log.targetId}` : ""}
                      </small>
                    </div>
                    <time>{formatDateTime(log.createdAt)}</time>
                  </div>
                ))}
              </div>
            )}
          </fieldset>
        </div>
      </div>
    </div>
  );
}

function SummaryBox({
  icon,
  label,
  value
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="classic-summary-box">
      <span className="classic-summary-icon">{icon}</span>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function HealthCard({ check }: { check: HealthCheck }) {
  return (
    <article className={`rounded border p-3 ${healthTone(check.level)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold">{check.label}</h3>
          <p className="mt-1 text-xs font-semibold leading-relaxed opacity-90">{check.reason}</p>
        </div>
        <span className="shrink-0 rounded bg-white/70 px-2 py-1 text-[11px] font-black uppercase">
          {healthLabel(check.level)}
        </span>
      </div>
      <p className="mt-3 border-t border-current/15 pt-2 text-xs font-bold opacity-90">
        {check.action}
      </p>
    </article>
  );
}

function Signal({
  detail,
  label,
  value
}: {
  detail: string;
  label: string;
  value: number | string;
}) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small className="truncate">{detail}</small>
    </div>
  );
}

function OperationalControlsPanel({
  controls,
  saving,
  onChange,
  onSave
}: {
  controls: OperationalControls;
  saving: boolean;
  onChange: (value: OperationalControls) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
}) {
  function applyPreset(kind: "banner" | "pause" | "normal") {
    const labels = {
      banner: "prepare a public maintenance banner",
      pause: "prepare booking pause mode",
      normal: "prepare normal operation"
    };
    const confirmed = window.confirm(`Use preset to ${labels[kind]}? You still need to save after this.`);

    if (!confirmed) {
      return;
    }

    if (kind === "banner") {
      onChange({
        ...controls,
        maintenanceBannerEnabled: true,
        maintenanceBannerMessage: maintenanceBannerPreset
      });
      return;
    }

    if (kind === "pause") {
      onChange({
        ...controls,
        bookingsPaused: true,
        bookingPauseMessage: bookingPausePreset,
        maintenanceBannerEnabled: true,
        maintenanceBannerMessage: maintenanceBannerPreset
      });
      return;
    }

    onChange({
      ...controls,
      bookingsPaused: false,
      maintenanceBannerEnabled: false
    });
  }

  return (
    <fieldset className="classic-fieldset compact">
      <legend>Emergency Controls</legend>
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <button className="classic-button justify-center" onClick={() => applyPreset("banner")} type="button">
          Maintenance banner
        </button>
        <button className="classic-button justify-center" onClick={() => applyPreset("pause")} type="button">
          Pause bookings
        </button>
        <button className="classic-button justify-center" onClick={() => applyPreset("normal")} type="button">
          Normal operation
        </button>
      </div>
      <form className="space-y-4" onSubmit={onSave}>
        <label className="email-automation-card">
          <span className="min-w-0">
            <strong className="block text-sm font-bold text-[#171614]">Pause customer bookings</strong>
            <span className="mt-1 block text-xs font-semibold leading-relaxed text-[#746d61] md:text-sm">
              Blocks new customer booking requests and customer reschedules.
            </span>
          </span>
          <input
            checked={controls.bookingsPaused}
            className="h-5 w-5 accent-[#d6b46a]"
            onChange={(event) => onChange({ ...controls, bookingsPaused: event.target.checked })}
            type="checkbox"
          />
        </label>
        <label className="block">
          <span className="field-label">Booking pause message</span>
          <textarea
            className="field-input min-h-20 resize-y"
            maxLength={240}
            onChange={(event) =>
              onChange({ ...controls, bookingPauseMessage: event.target.value })
            }
            value={controls.bookingPauseMessage || ""}
          />
        </label>
        <label className="email-automation-card">
          <span className="min-w-0">
            <strong className="block text-sm font-bold text-[#171614]">Maintenance banner</strong>
            <span className="mt-1 block text-xs font-semibold leading-relaxed text-[#746d61] md:text-sm">
              Shows a public banner on customer-facing pages.
            </span>
          </span>
          <input
            checked={controls.maintenanceBannerEnabled}
            className="h-5 w-5 accent-[#d6b46a]"
            onChange={(event) =>
              onChange({ ...controls, maintenanceBannerEnabled: event.target.checked })
            }
            type="checkbox"
          />
        </label>
        <label className="block">
          <span className="field-label">Maintenance banner message</span>
          <textarea
            className="field-input min-h-20 resize-y"
            maxLength={240}
            onChange={(event) =>
              onChange({ ...controls, maintenanceBannerMessage: event.target.value })
            }
            value={controls.maintenanceBannerMessage || ""}
          />
        </label>
        <button className="classic-button primary w-full justify-center" disabled={saving} type="submit">
          {saving ? "Saving..." : "Save emergency controls"}
        </button>
      </form>
    </fieldset>
  );
}

function TrendList({
  emptyMessage,
  rows
}: {
  emptyMessage: string;
  rows: Array<{ label: string; value: string }>;
}) {
  if (rows.length === 0) {
    return <div className="admin-empty-state small">{emptyMessage}</div>;
  }

  return (
    <div className="admin-list mb-3">
      {rows.map((row) => (
        <div key={`${row.label}-${row.value}`} className="admin-list-item">
          <strong>{row.label}</strong>
          <small>{row.value}</small>
        </div>
      ))}
    </div>
  );
}

function EmailJobsPanel({
  jobs,
  retryingJobId,
  title,
  unlockingJobId,
  onRetry,
  onUnlock
}: {
  jobs: EmailJob[];
  retryingJobId?: string;
  title: string;
  unlockingJobId?: string;
  onRetry: (jobId: string) => void;
  onUnlock: (jobId: string) => void;
}) {
  return (
    <fieldset className="classic-fieldset compact">
      <legend>{title}</legend>
      {jobs.length === 0 ? (
        <div className="admin-empty-state small">No jobs in this state.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr>
                <th className="px-3 py-2 font-bold">Type</th>
                <th className="px-3 py-2 font-bold">Recipient</th>
                <th className="px-3 py-2 font-bold">Attempts</th>
                <th className="px-3 py-2 font-bold">Updated</th>
                <th className="px-3 py-2 font-bold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {jobs.map((job) => (
                <tr key={job._id} className="queue-row">
                  <td className="px-3 py-3 font-bold text-ink">
                    {formatJobType(job.type)}
                    {job.lastError && (
                      <div className="mt-1 max-w-xs text-xs font-semibold text-rose-600">
                        {job.lastError}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-slate-600">{job.to || "Not available"}</td>
                  <td className="px-3 py-3 font-semibold text-slate-600">
                    {job.attempts}/{job.maxAttempts}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                    {formatDateTime(job.updatedAt || job.createdAt)}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      {job.status === "failed" && (
                        <button
                          className="classic-button"
                          disabled={retryingJobId === job._id}
                          onClick={() => onRetry(job._id)}
                          type="button"
                        >
                          <RotateCcw size={15} aria-hidden="true" />
                          Retry
                        </button>
                      )}
                      {job.status === "processing" && (
                        <button
                          className="classic-button"
                          disabled={unlockingJobId === job._id}
                          onClick={() => onUnlock(job._id)}
                          type="button"
                        >
                          <Unlock size={15} aria-hidden="true" />
                          Unlock
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </fieldset>
  );
}
