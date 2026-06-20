import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  ExternalLink,
  Inbox,
  Lock,
  LogOut,
  Mail,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Settings,
  Trash2,
  XCircle
} from "lucide-react";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Link, Navigate, NavLink, useLocation } from "react-router-dom";
import {
  adminLogin,
  adminLogout,
  deleteBooking,
  getAdminSession,
  getBookings,
  getEmailAutomations,
  getLeadSummary,
  reopenBooking,
  resolveBooking,
  retryEmailJob,
  updateEmailAutomations
} from "../api";
import { ActiveBookings } from "../components/admin/ActiveBookings";
import { AvailabilityCalendar } from "../components/admin/AvailabilityCalendar";
import { LeadTracker } from "../components/admin/LeadTracker";
import { ResolvedBookings } from "../components/admin/ResolvedBookings";
import { formatBusinessDateTime } from "../lib/time";
import { templateConfig } from "../template";
import type {
  Booking,
  EmailAutomationDashboard,
  EmailAutomationSettings,
  EmailJob,
  LeadSummary
} from "../types";

type AdminSection = "bookings" | "leads" | "emails";
type QueueView = "active" | "resolved" | "canceled";
type QuickFilter = "all" | "new" | "today" | "upcoming" | "unverified" | "needs-follow-up";

const LEADS_PAGE_SIZE = 10;

function getAdminSection(pathname: string): AdminSection | null {
  if (pathname === "/admin" || pathname === "/admin/") {
    return "bookings";
  }

  if (pathname === "/admin/leads") {
    return "leads";
  }

  if (pathname === "/admin/emails") {
    return "emails";
  }

  return null;
}

function isSameLocalDay(value: string | undefined, reference: Date) {
  if (!value) {
    return false;
  }

  const date = new Date(value);

  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  );
}

function isWithinDays(value: string | undefined, days: number) {
  if (!value) {
    return false;
  }

  const time = new Date(value).getTime();
  const now = Date.now();

  return time >= now && time <= now + days * 24 * 60 * 60 * 1000;
}

function isNewLead(value: string | undefined) {
  if (!value) {
    return false;
  }

  return Date.now() - new Date(value).getTime() <= 24 * 60 * 60 * 1000;
}

function isPastAppointment(value: string | undefined) {
  return Boolean(value && new Date(value).getTime() < Date.now());
}

function needsFollowUp(booking: Booking) {
  return (
    booking.status === "open" &&
    (!booking.emailVerified || isPastAppointment(booking.appointmentAt))
  );
}

function formatShortDateTime(value?: string) {
  return value ? formatBusinessDateTime(value) : "Not scheduled";
}

function formatJobType(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function statusClasses(status: EmailJob["status"]) {
  if (status === "sent") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (status === "failed") {
    return "bg-rose-50 text-rose-700";
  }

  if (status === "processing") {
    return "bg-blue-50 text-blue-700";
  }

  return "bg-amber-50 text-amber-700";
}

function getSectionTitle(section: AdminSection) {
  if (section === "bookings") {
    return "Calendar";
  }

  if (section === "leads") {
    return "Leads";
  }

  return "Emails";
}

function formatMobileHeaderDate() {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(new Date());
}

export function AdminPage() {
  const location = useLocation();
  const section = getAdminSection(location.pathname);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [leadSummary, setLeadSummary] = useState<LeadSummary | null>(null);
  const [emailDashboard, setEmailDashboard] = useState<EmailAutomationDashboard | null>(null);
  const [emailDraft, setEmailDraft] = useState<EmailAutomationSettings | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingEmails, setSavingEmails] = useState(false);
  const [retryingJobId, setRetryingJobId] = useState<string>();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<QueueView>("active");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [showLeadCategories, setShowLeadCategories] = useState(false);
  const [showLeadTracking, setShowLeadTracking] = useState(false);
  const [busyBookingId, setBusyBookingId] = useState<string>();

  async function loadBookingData() {
    const [bookingsResponse, summaryResponse] = await Promise.all([
      getBookings(),
      getLeadSummary()
    ]);

    setBookings(bookingsResponse.bookings);
    setLeadSummary(summaryResponse.summary);
  }

  async function loadEmailData() {
    const response = await getEmailAutomations();

    setEmailDashboard(response);
    setEmailDraft(response.settings);
  }

  async function loadSectionData(targetSection = section) {
    if (!targetSection || !authenticated) {
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      if (targetSection === "emails") {
        await loadEmailData();
      } else if (targetSection === "leads") {
        await loadBookingData();
      } else {
        await Promise.resolve();
      }
    } catch (requestError) {
      const nextError =
        requestError instanceof Error ? requestError.message : "Could not load admin data.";
      setError(nextError);

      if (nextError.toLowerCase().includes("admin login")) {
        setAuthenticated(false);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function checkSession() {
      try {
        const response = await getAdminSession();
        setAuthenticated(response.authenticated);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Could not check admin session.");
      } finally {
        setAuthChecking(false);
      }
    }

    void checkSession();
  }, []);

  useEffect(() => {
    if (authenticated && section) {
      void loadSectionData(section);
    }
  }, [authenticated, section]);

  const filteredBookings = useMemo(() => {
    const value = query.trim().toLowerCase();
    const today = new Date();

    return bookings.filter((booking) => {
      const matchesStatus =
        view === "active" ? booking.status === "open" : booking.status === view;

      if (!matchesStatus) {
        return false;
      }

      if (quickFilter === "today" && !isSameLocalDay(booking.appointmentAt, today)) {
        return false;
      }

      if (quickFilter === "new" && !isNewLead(booking.createdAt)) {
        return false;
      }

      if (quickFilter === "upcoming" && !isWithinDays(booking.appointmentAt, 7)) {
        return false;
      }

      if (quickFilter === "unverified" && booking.emailVerified) {
        return false;
      }

      if (quickFilter === "needs-follow-up" && !needsFollowUp(booking)) {
        return false;
      }

      if (!value) {
        return true;
      }

      return [booking.name, booking.email, booking.phone, booking.serviceName, booking.notes || ""]
        .join(" ")
        .toLowerCase()
        .includes(value);
    });
  }, [bookings, query, quickFilter, view]);

  const activeCount = bookings.filter((booking) => booking.status === "open").length;
  const resolvedCount = bookings.filter((booking) => booking.status === "resolved").length;
  const canceledCount = bookings.filter((booking) => booking.status === "canceled").length;
  const today = new Date();
  const todaysBookings = bookings.filter(
    (booking) => booking.status === "open" && isSameLocalDay(booking.appointmentAt, today)
  );
  const newOpenBookings = bookings.filter(
    (booking) => booking.status === "open" && isNewLead(booking.createdAt)
  );
  const upcomingOpenBookings = bookings.filter(
    (booking) => booking.status === "open" && isWithinDays(booking.appointmentAt, 7)
  );
  const unverifiedOpenBookings = bookings.filter(
    (booking) => booking.status === "open" && !booking.emailVerified
  );
  const followUpBookings = bookings.filter(needsFollowUp);
  const emailStatusCounts = emailDashboard?.summary.byStatus;
  const mobileTopbarStats =
    section === "leads"
      ? [
          { label: "Open", value: activeCount },
          { label: "Today", value: todaysBookings.length },
          { label: "Follow-up", value: followUpBookings.length }
        ]
      : section === "emails"
        ? [
            { label: "Sent", value: emailStatusCounts?.sent ?? 0 },
            {
              label: "Queued",
              value: (emailStatusCounts?.pending ?? 0) + (emailStatusCounts?.processing ?? 0)
            }
          ]
      : undefined;

  async function runBookingAction(bookingId: string, action: () => Promise<unknown>) {
    setBusyBookingId(bookingId);
    setError("");
    setMessage("");

    try {
      await action();
      await loadBookingData();
      setMessage("Booking updated.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Booking action failed.");
    } finally {
      setBusyBookingId(undefined);
    }
  }

  function handleResolve(bookingId: string) {
    void runBookingAction(bookingId, () => resolveBooking(bookingId));
  }

  function handleReopen(bookingId: string) {
    void runBookingAction(bookingId, () => reopenBooking(bookingId));
  }

  function handleDelete(bookingId: string, customerName: string) {
    const confirmed = window.confirm(
      `Are you sure you want to delete ${customerName}'s booking? This cannot be undone.`
    );

    if (confirmed) {
      void runBookingAction(bookingId, () => deleteBooking(bookingId));
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginBusy(true);
    setError("");

    try {
      await adminLogin(password);
      setPassword("");
      setAuthenticated(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Admin login failed.");
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleLogout() {
    setError("");

    try {
      await adminLogout();
    } finally {
      setAuthenticated(false);
      setBookings([]);
      setLeadSummary(null);
      setEmailDashboard(null);
      setEmailDraft(null);
      setLoading(false);
    }
  }

  async function handleSaveEmailSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!emailDraft) {
      return;
    }

    setSavingEmails(true);
    setError("");
    setMessage("");

    try {
      await updateEmailAutomations({
        ownerBookingNoticeEnabled: emailDraft.ownerBookingNoticeEnabled,
        bookingReminderEnabled: emailDraft.bookingReminderEnabled,
        reviewRequestEnabled: emailDraft.reviewRequestEnabled,
        reminderLeadHours: emailDraft.reminderLeadHours,
        reviewRequestDelayHours: emailDraft.reviewRequestDelayHours,
        reviewUrl: emailDraft.reviewUrl || undefined
      });
      await loadEmailData();
      setMessage("Email automation settings saved.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save email settings.");
    } finally {
      setSavingEmails(false);
    }
  }

  async function handleRetryEmailJob(jobId: string) {
    setRetryingJobId(jobId);
    setError("");
    setMessage("");

    try {
      await retryEmailJob(jobId);
      await loadEmailData();
      setMessage("Email job queued for retry.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not retry email job.");
    } finally {
      setRetryingJobId(undefined);
    }
  }

  if (!section) {
    return <Navigate to="/admin" replace />;
  }

  if (authChecking) {
    return (
      <div className="min-h-screen bg-cloud text-ink">
        <AdminNavbar loading={false} section={section} />
        <section className="admin-shell mx-auto max-w-3xl px-5 py-16 lg:px-8">
          <div className="rounded-lg bg-white p-8 text-center text-sm font-semibold text-slate-500 shadow-soft">
            Checking admin session...
          </div>
        </section>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-cloud text-ink">
        <AdminNavbar loading={false} section={section} />
        <section className="admin-shell mx-auto max-w-xl px-5 py-16 lg:px-8">
          <div className="rounded-lg bg-white p-6 shadow-soft sm:p-8">
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-aqua text-ink">
                <Lock size={24} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-sm font-semibold uppercase tracking-[0.16em] text-mint">
                  Admin access
                </span>
                <h1 className="mt-2 text-3xl font-bold text-ink">Owner login</h1>
                <form onSubmit={handleLogin} className="mt-6 space-y-4">
                  <label className="block">
                    <span className="field-label">Password</span>
                    <input
                      className="field-input"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      autoComplete="current-password"
                    />
                  </label>
                  <button
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={loginBusy}
                    type="submit"
                  >
                    <Lock size={18} aria-hidden="true" />
                    {loginBusy ? "Signing in..." : "Sign in"}
                  </button>
                </form>
                {error && (
                  <div className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                    {error}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f3ef] text-ink md:bg-[#eceff3]">
      <AdminNavbar
        loading={loading}
        section={section}
        onLogout={() => void handleLogout()}
        onRefresh={section === "bookings" ? undefined : () => void loadSectionData(section)}
      />
      <MobileAdminTopbar
        loading={loading}
        section={section}
        stats={mobileTopbarStats}
        onLogout={() => void handleLogout()}
        onRefresh={section === "bookings" ? undefined : () => void loadSectionData(section)}
      />
      <section className="admin-shell mx-auto max-w-7xl bg-[#f4f3ef] px-2.5 pb-28 pt-3 md:bg-[#eceff3] md:px-5 md:pb-6 md:pt-6 lg:px-8">
        <div className="classic-admin-header hidden md:flex">
          <div>
            <span>Business owner panel</span>
            <h1>
              {section === "bookings"
                ? "Booking calendar"
                : section === "leads"
                  ? "Lead tracking"
                  : "Email automations"}
            </h1>
            <p>{new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(today)}</p>
          </div>
        </div>

      {error && (
        <div className="admin-alert">
          <AlertCircle size={18} aria-hidden="true" />
          {error}
        </div>
      )}

      {message && (
        <div className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {message}
        </div>
      )}

      {section === "bookings" && <CalendarView />}

      {section === "leads" && (
        <LeadsView
          activeCount={activeCount}
          canceledCount={canceledCount}
          filteredBookings={filteredBookings}
          loading={loading}
          query={query}
          quickFilter={quickFilter}
          showCategories={showLeadCategories}
          showTracking={showLeadTracking}
          resolvedCount={resolvedCount}
          summary={leadSummary}
          newCount={newOpenBookings.length}
          upcomingCount={upcomingOpenBookings.length}
          followUpCount={followUpBookings.length}
          todayCount={todaysBookings.length}
          unverifiedCount={unverifiedOpenBookings.length}
          view={view}
          busyBookingId={busyBookingId}
          onDelete={handleDelete}
          onQueryChange={setQuery}
          onQuickFilterChange={setQuickFilter}
          onShowCategoriesChange={setShowLeadCategories}
          onShowTrackingChange={setShowLeadTracking}
          onReopen={handleReopen}
          onResolve={handleResolve}
          onResetFilters={() => {
            setQuery("");
            setQuickFilter("all");
            setView("active");
          }}
          onViewChange={setView}
        />
      )}

      {section === "emails" && (
        <EmailsView
          dashboard={emailDashboard}
          draft={emailDraft}
          loading={loading}
          retryingJobId={retryingJobId}
          saving={savingEmails}
          onDraftChange={setEmailDraft}
          onRetry={handleRetryEmailJob}
          onSave={handleSaveEmailSettings}
        />
      )}

      </section>
      <MobileAdminBottomNav section={section} />
    </div>
  );
}

function AdminNavbar({
  loading,
  section,
  onLogout,
  onRefresh
}: {
  loading: boolean;
  section: AdminSection;
  onLogout?: () => void;
  onRefresh?: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 hidden border-b border-slate-800 bg-slate-950 text-white shadow-sm md:block">
      <nav className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link to="/admin" className="flex items-center gap-3 font-semibold">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-400 text-slate-950">
              <Lock size={19} aria-hidden="true" />
            </span>
            <span className="leading-tight">
              Admin
              <span className="block text-xs font-medium uppercase text-slate-400">
                {templateConfig.business.shortName} operations
              </span>
            </span>
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-900 lg:hidden"
          >
            <ExternalLink size={16} aria-hidden="true" />
            View website
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[
            { to: "/admin/leads", label: "Leads", icon: BarChart3 },
            { to: "/admin", label: "Calendar", icon: CalendarDays },
            { to: "/admin/emails", label: "Emails", icon: Mail }
          ].map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/admin"}
                className={({ isActive }) =>
                  `inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    isActive
                      ? "bg-white text-slate-950"
                      : "text-slate-300 hover:bg-slate-900 hover:text-white"
                  }`
                }
              >
                <Icon size={16} aria-hidden="true" />
                {item.label}
              </NavLink>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/"
            className="hidden items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-900 lg:inline-flex"
          >
            <ExternalLink size={16} aria-hidden="true" />
            View website
          </Link>
          {onRefresh && (
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-3 py-2 text-sm font-bold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-60"
              disabled={loading}
              onClick={onRefresh}
              type="button"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} aria-hidden="true" />
              Refresh
            </button>
          )}
          {onLogout && (
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-900"
              onClick={onLogout}
              type="button"
            >
              <LogOut size={16} aria-hidden="true" />
              Log out
            </button>
          )}
        </div>
      </nav>
    </header>
  );
}

function MobileAdminTopbar({
  loading,
  section,
  stats,
  onLogout,
  onRefresh
}: {
  loading: boolean;
  section: AdminSection;
  stats?: Array<{ label: string; value: number }>;
  onLogout?: () => void;
  onRefresh?: () => void;
}) {
  const SectionIcon =
    section === "leads"
      ? Inbox
      : section === "emails"
        ? Mail
        : CalendarDays;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#3a3020] bg-gradient-to-b from-[#211f1b] to-[#141311] px-3 py-2.5 text-white shadow-[0_10px_26px_rgba(17,16,14,0.24)] md:hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#d6b46a]/30 bg-[#d6b46a] text-[#171614] shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]">
            <SectionIcon size={19} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold leading-tight text-white">
              {getSectionTitle(section)}
            </h1>
            <p className="mt-0.5 truncate text-xs font-semibold text-[#d6b46a]">
              {formatMobileHeaderDate()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Link
            to="/"
            className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/10 text-[#f1d48a] transition hover:bg-white/15"
            aria-label="View website"
          >
            <ExternalLink size={18} aria-hidden="true" />
          </Link>
          {onRefresh && (
            <button
              className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/10 text-[#f1d48a] transition hover:bg-white/15 disabled:opacity-60"
              disabled={loading}
              onClick={onRefresh}
              type="button"
              aria-label="Refresh"
            >
              <RefreshCw size={18} className={loading ? "animate-spin" : ""} aria-hidden="true" />
            </button>
          )}
          {onLogout && (
            <button
              className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/10 text-[#f1d48a] transition hover:bg-white/15"
              onClick={onLogout}
              type="button"
              aria-label="Log out"
            >
              <LogOut size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      {stats && stats.length > 0 && (
        <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
          {stats.map((item, index) => (
            <div
              key={item.label}
              className={`rounded-lg border px-2 py-1.5 ${
                index === 0
                  ? "border-[#d6b46a]/50 bg-[#d6b46a] text-[#171614]"
                  : "border-white/10 bg-white/5 text-[#cfc6b4]"
              }`}
            >
              <strong className="block text-sm leading-none">{item.value}</strong>
              <span className={`mt-0.5 block truncate text-[10px] font-bold uppercase ${
                index === 0 ? "text-[#5c4720]" : "text-[#a99f8e]"
              }`}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </header>
  );
}

function MobileAdminBottomNav({ section }: { section: AdminSection }) {
  const items = [
    { to: "/admin/leads", label: "Leads", icon: Inbox, active: section === "leads" },
    { to: "/admin", label: "Calendar", icon: CalendarDays, active: section === "bookings" },
    { to: "/admin/emails", label: "Emails", icon: Mail, active: section === "emails" }
  ];

  return (
    <nav className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-50 rounded-2xl border border-[#2b2822] bg-[#171614] p-2 shadow-[0_16px_38px_rgba(17,16,14,0.34)] md:hidden">
        <div className="grid grid-cols-3 gap-1.5">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/admin"}
              className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-bold transition ${
                item.active
                  ? "bg-[#d6b46a] text-[#171614]"
                  : "bg-white/5 text-[#cfc6b4] hover:bg-white/10 hover:text-[#f1d48a]"
              }`}
            >
              <Icon size={19} aria-hidden="true" />
              {item.label}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

type BookingsViewProps = {
  activeCount: number;
  canceledCount: number;
  filteredBookings: Booking[];
  loading: boolean;
  query: string;
  quickFilter: QuickFilter;
  showCategories: boolean;
  showTracking: boolean;
  newCount: number;
  upcomingCount: number;
  followUpCount: number;
  resolvedCount: number;
  todayCount: number;
  unverifiedCount: number;
  view: QueueView;
  busyBookingId?: string;
  onDelete: (bookingId: string, customerName: string) => void;
  onQueryChange: (value: string) => void;
  onQuickFilterChange: (value: QuickFilter) => void;
  onShowCategoriesChange: (value: boolean) => void;
  onShowTrackingChange: (value: boolean) => void;
  onReopen: (bookingId: string) => void;
  onResolve: (bookingId: string) => void;
  onResetFilters: () => void;
  onViewChange: (value: QueueView) => void;
};

function CalendarView() {
  return (
    <fieldset className="classic-fieldset border-0 bg-transparent p-0 shadow-none md:border md:bg-white md:p-4">
      <legend className="hidden md:block">Booking Calendar</legend>
      <AvailabilityCalendar />
    </fieldset>
  );
}

function BookingsView({
  activeCount,
  canceledCount,
  filteredBookings,
  loading,
  newCount,
  query,
  quickFilter,
  showCategories,
  showTracking,
  upcomingCount,
  followUpCount,
  resolvedCount,
  todayCount,
  unverifiedCount,
  view,
  busyBookingId,
  onDelete,
  onQueryChange,
  onQuickFilterChange,
  onShowCategoriesChange,
  onShowTrackingChange,
  onReopen,
  onResolve,
  onResetFilters,
  onViewChange
}: BookingsViewProps) {
  const [page, setPage] = useState(1);
  const hasActiveFilters = view !== "active" || quickFilter !== "all" || query.trim().length > 0;
  const activeQuickFilters: Array<[QuickFilter, string, number]> = [
    ["all", "All", activeCount],
    ["new", "New", newCount],
    ["today", "Today", todayCount],
    ["upcoming", "Upcoming", upcomingCount],
    ["unverified", "Unverified", unverifiedCount],
    ["needs-follow-up", "Needs follow-up", followUpCount]
  ];
  const activeFilterLabel =
    activeQuickFilters.find(([value]) => value === quickFilter)?.[1] || "All";
  const activeQuickFilterValues = activeQuickFilters.filter(([value]) => value !== "all");
  const totalPages = Math.max(1, Math.ceil(filteredBookings.length / LEADS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * LEADS_PAGE_SIZE;
  const visibleBookings = filteredBookings.slice(pageStart, pageStart + LEADS_PAGE_SIZE);
  const shownStart = filteredBookings.length === 0 ? 0 : pageStart + 1;
  const shownEnd = Math.min(pageStart + LEADS_PAGE_SIZE, filteredBookings.length);

  useEffect(() => {
    setPage(1);
  }, [query, quickFilter, view]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  return (
    <>
      <fieldset className="classic-fieldset border-0 bg-transparent p-0 shadow-none md:border md:bg-white md:p-4">
        <legend className="hidden md:block">Lead Queue</legend>
        <div className="classic-section-toolbar border-b-0 pb-0 md:border-b md:pb-3">
          <div>
            <h2 className="hidden md:block">Customer lead queue</h2>
            <p className="text-xs font-semibold text-slate-500 md:text-sm">
              {shownStart}-{shownEnd} of {filteredBookings.length} shown from {activeCount + resolvedCount + canceledCount} total leads
              {quickFilter !== "all" && view === "active" ? ` - ${activeFilterLabel}` : ""}
            </p>
          </div>
          <div className="hidden md:block">
            <label className="classic-search">
              <Search size={18} aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Search name, phone, email, service"
              />
            </label>
          </div>
        </div>

        <div className="mt-2 md:hidden">
          <label className="flex h-9 items-center gap-2 rounded-lg border border-[#d8caa6] bg-white px-3 text-[#a3833d] shadow-sm">
            <Search size={15} aria-hidden="true" />
            <input
              className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold text-[#171614] outline-none placeholder:text-[#a8a197]"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search leads"
            />
          </label>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-[#24211c] p-1 shadow-sm md:hidden">
          {([
            ["active", "Active", activeCount],
            ["resolved", "Resolved", resolvedCount],
            ["canceled", "Canceled", canceledCount]
          ] as Array<[QueueView, string, number]>).map(([value, label, count]) => (
            <button
              key={value}
              className={`min-h-9 rounded-md px-2 text-xs font-bold transition ${
                view === value
                  ? "bg-[#d6b46a] text-[#171614] shadow-sm"
                  : "text-[#cfc6b4]"
              }`}
              onClick={() => onViewChange(value)}
              type="button"
            >
              {label} <span className={view === value ? "text-[#5c4720]" : "text-[#8f8677]"}>{count}</span>
            </button>
          ))}
        </div>

        {view === "active" && (
          <div className="-mx-2.5 mt-2 overflow-x-auto px-2.5 pb-1 md:hidden">
            <div className="flex gap-1.5">
              {activeQuickFilterValues.map(([value, label, count]) => (
                <button
                  key={value}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                    quickFilter === value
                      ? "border-[#171614] bg-[#171614] text-[#f1d48a]"
                      : value === "needs-follow-up" && count > 0
                        ? "border-[#d6b46a] bg-[#fbf2d9] text-[#5c4720]"
                        : "border-[#e1d8c5] bg-white text-[#5d574d]"
                  }`}
                  onClick={() => onQuickFilterChange(quickFilter === value ? "all" : value)}
                  type="button"
                >
                  {label} <span className={quickFilter === value ? "text-[#d6b46a]/75" : "text-[#a8a197]"}>{count}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 hidden border-b border-slate-200 pb-3 md:block">
          <button
            className="classic-button w-full justify-center md:w-auto"
            onClick={() => onShowCategoriesChange(!showCategories)}
            type="button"
          >
            {showCategories ? (
              <ChevronUp size={16} aria-hidden="true" />
            ) : (
              <ChevronDown size={16} aria-hidden="true" />
            )}
            {showCategories ? "Hide lead categories" : "Show lead categories"}
          </button>

          {showCategories && (
            <div className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
              {activeQuickFilters.map(([value, label, count]) => (
                <button
                  key={value}
                  className={`rounded border px-3 py-2 text-left text-sm font-bold transition ${
                    quickFilter === value && view === "active"
                      ? "border-slate-700 bg-slate-800 text-white"
                      : value === "needs-follow-up" && count > 0
                        ? "border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                  onClick={() => {
                    onViewChange("active");
                    onQuickFilterChange(value);
                  }}
                  type="button"
                >
                  <span className="block text-lg leading-none">{count}</span>
                  <span className="mt-1 block text-xs uppercase">{label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="classic-filter-row mt-2 hidden border-b-0 pb-0 md:flex md:mt-3 md:border-b md:pb-3">
          <div className="classic-tabs grid w-full grid-cols-3 md:flex md:w-auto">
            <button
              className={`queue-tab ${view === "active" ? "active" : ""}`}
              onClick={() => onViewChange("active")}
              type="button"
            >
              Active
              <span>{activeCount}</span>
            </button>
            <button
              className={`queue-tab ${view === "resolved" ? "active" : ""}`}
              onClick={() => onViewChange("resolved")}
              type="button"
            >
              Resolved
              <span>{resolvedCount}</span>
            </button>
            <button
              className={`queue-tab ${view === "canceled" ? "active" : ""}`}
              onClick={() => onViewChange("canceled")}
              type="button"
            >
              Canceled
              <span>{canceledCount}</span>
            </button>
          </div>
          <div className="classic-filter-buttons" aria-label="Quick filters">
            {hasActiveFilters && (
              <button className="classic-filter-button" onClick={onResetFilters} type="button">
                Reset view
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="admin-empty-state">Loading booking queue...</div>
        ) : view === "active" ? (
          <ActiveBookings
            bookings={visibleBookings}
            busyBookingId={busyBookingId}
            hasActiveFilters={hasActiveFilters}
            onResolve={onResolve}
            onDelete={onDelete}
            onResetFilters={onResetFilters}
          />
        ) : view === "resolved" ? (
          <ResolvedBookings
            bookings={visibleBookings}
            busyBookingId={busyBookingId}
            hasActiveFilters={hasActiveFilters}
            mode="resolved"
            onReopen={onReopen}
            onDelete={onDelete}
            onResetFilters={onResetFilters}
          />
        ) : (
          <ResolvedBookings
            bookings={visibleBookings}
            busyBookingId={busyBookingId}
            hasActiveFilters={hasActiveFilters}
            mode="canceled"
            onReopen={onReopen}
            onDelete={onDelete}
            onResetFilters={onResetFilters}
          />
        )}

        {!loading && filteredBookings.length > LEADS_PAGE_SIZE && (
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
            <p className="text-xs font-bold text-slate-500">
              Page {currentPage} of {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                className="classic-button"
                disabled={currentPage === 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                type="button"
              >
                <ChevronLeft size={15} aria-hidden="true" />
                Prev
              </button>
              <button
                className="classic-button"
                disabled={currentPage === totalPages}
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                type="button"
              >
                Next
                <ChevronRight size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </fieldset>

      <div className="classic-summary-grid hidden md:grid">
        <button className="classic-summary-box interactive" onClick={() => onViewChange("active")} type="button">
          <span className="classic-summary-icon">
            <Clock size={19} aria-hidden="true" />
          </span>
          <strong>{activeCount}</strong>
          <span>Open leads</span>
        </button>
        <button className="classic-summary-box interactive" onClick={() => onViewChange("resolved")} type="button">
          <span className="classic-summary-icon">
            <CheckCircle2 size={19} aria-hidden="true" />
          </span>
          <strong>{resolvedCount}</strong>
          <span>Resolved</span>
        </button>
        <button className="classic-summary-box interactive" onClick={() => onViewChange("canceled")} type="button">
          <span className="classic-summary-icon">
            <XCircle size={19} aria-hidden="true" />
          </span>
          <strong>{canceledCount}</strong>
          <span>Canceled</span>
        </button>
        <button
          className="classic-summary-box interactive"
          onClick={() => {
            onViewChange("active");
            onQuickFilterChange("needs-follow-up");
          }}
          type="button"
        >
          <span className="classic-summary-icon">
            <Inbox size={19} aria-hidden="true" />
          </span>
          <strong>{followUpCount}</strong>
          <span>Needs follow-up</span>
        </button>
      </div>
    </>
  );
}

function LeadsView({
  summary,
  ...bookingProps
}: BookingsViewProps & { summary: LeadSummary | null }) {
  return (
    <div className="space-y-6">
      <BookingsView {...bookingProps} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <fieldset className="classic-fieldset border-0 bg-transparent p-0 shadow-none md:border md:bg-white md:p-4">
          <legend className="hidden md:block">Lead Tracking</legend>
          <LeadTracker summary={summary} />
        </fieldset>
        <fieldset className="classic-fieldset compact hidden md:block">
          <legend>Pipeline Focus</legend>
          <div className="admin-signal-grid">
            <div>
              <span>Total leads</span>
              <strong>{summary?.totalLeads ?? 0}</strong>
              <small>All captured booking requests</small>
            </div>
            <div>
              <span>Open leads</span>
              <strong>{summary?.openLeads ?? 0}</strong>
              <small>Need owner follow-up</small>
            </div>
            <div>
              <span>Last 7 days</span>
              <strong>{summary?.newLeadsLast7Days ?? 0}</strong>
              <small>Recent demand signal</small>
            </div>
          </div>
          <Link className="classic-button primary mt-4 w-full justify-center" to="/admin">
            <Inbox size={17} aria-hidden="true" />
            Open calendar
          </Link>
        </fieldset>
      </div>
    </div>
  );
}

function formatAuditAction(value: string) {
  return value
    .replaceAll(".", " ")
    .replace(/(^|\s)\w/g, (letter) => letter.toUpperCase());
}

type EmailsViewProps = {
  dashboard: EmailAutomationDashboard | null;
  draft: EmailAutomationSettings | null;
  loading: boolean;
  retryingJobId?: string;
  saving: boolean;
  onDraftChange: (value: EmailAutomationSettings) => void;
  onRetry: (jobId: string) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
};

function EmailsView({
  dashboard,
  draft,
  loading,
  retryingJobId,
  saving,
  onDraftChange,
  onRetry,
  onSave
}: EmailsViewProps) {
  if (loading && !dashboard) {
    return <div className="admin-empty-state">Loading email automations...</div>;
  }

  if (!dashboard || !draft) {
    return <div className="admin-empty-state">Email automation data is not available.</div>;
  }

  const statusCounts = dashboard.summary.byStatus;
  const visibleRecentJobs = dashboard.recentJobs.filter((job) => job.status !== "failed");
  const enabledAutomationCount = [
    draft.customerVerificationEnabled,
    draft.ownerBookingNoticeEnabled,
    draft.bookingReminderEnabled,
    draft.reviewRequestEnabled
  ].filter(Boolean).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-2 md:hidden">
        <EmailMobileStat icon={<Send size={16} aria-hidden="true" />} label="Sent" value={statusCounts.sent ?? 0} />
        <EmailMobileStat
          icon={<Clock size={16} aria-hidden="true" />}
          label="Queued"
          value={(statusCounts.pending ?? 0) + (statusCounts.processing ?? 0)}
        />
        <EmailMobileStat
          icon={<Settings size={16} aria-hidden="true" />}
          label="On"
          value={`${enabledAutomationCount}/4`}
        />
      </div>

      <div className="classic-summary-grid hidden grid-cols-2 md:grid md:grid-cols-3">
        <div className="classic-summary-box border-[#e1d8c5] bg-white">
          <span className="classic-summary-icon">
            <Send size={19} aria-hidden="true" />
          </span>
          <strong>{statusCounts.sent ?? 0}</strong>
          <span>Sent</span>
        </div>
        <div className="classic-summary-box border-[#e1d8c5] bg-white">
          <span className="classic-summary-icon">
            <Clock size={19} aria-hidden="true" />
          </span>
          <strong>{(statusCounts.pending ?? 0) + (statusCounts.processing ?? 0)}</strong>
          <span>Queued</span>
        </div>
        <div className="classic-summary-box border-[#e1d8c5] bg-white">
          <span className="classic-summary-icon">
            <Settings size={19} aria-hidden="true" />
          </span>
          <strong>{dashboard.runtime.maxAttempts}</strong>
          <span>Max attempts</span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
        <fieldset className="classic-fieldset border-0 bg-transparent p-0 shadow-none md:border md:bg-white md:p-4">
          <legend className="hidden md:block">Automation Settings</legend>
          <form className="space-y-3 md:space-y-5" onSubmit={onSave}>
            <div className="md:hidden">
              <h2 className="text-sm font-bold text-[#171614]">Automations</h2>
              <p className="mt-1 text-xs font-semibold text-[#746d61]">
                Customer, owner, reminder, and review emails.
              </p>
            </div>
            <ReadonlyAutomation
              enabled={draft.customerVerificationEnabled}
              title="Customer manage link"
              description="Always sends the customer a secure verification and booking-management link."
            />
            <AutomationToggle
              checked={draft.ownerBookingNoticeEnabled}
              description="Send the business owner an email every time a new booking request arrives."
              title="Owner booking notice"
              onChange={(checked) => onDraftChange({ ...draft, ownerBookingNoticeEnabled: checked })}
            />
            <AutomationToggle
              checked={draft.bookingReminderEnabled}
              description="Send verified customers a reminder before their appointment."
              title="Booking reminders"
              onChange={(checked) => onDraftChange({ ...draft, bookingReminderEnabled: checked })}
            />
            <label className="block">
              <span className="field-label">Reminder lead time, hours</span>
              <input
                className="field-input email-field-input"
                min={1}
                max={168}
                type="number"
                value={draft.reminderLeadHours}
                onChange={(event) =>
                  onDraftChange({ ...draft, reminderLeadHours: Number(event.target.value) })
                }
              />
            </label>
            <AutomationToggle
              checked={draft.reviewRequestEnabled}
              description="Send review requests after a booking has been marked resolved."
              title="Review requests"
              onChange={(checked) => onDraftChange({ ...draft, reviewRequestEnabled: checked })}
            />
            <label className="block">
              <span className="field-label">Review request delay, hours</span>
              <input
                className="field-input email-field-input"
                min={0}
                max={720}
                type="number"
                value={draft.reviewRequestDelayHours}
                onChange={(event) =>
                  onDraftChange({ ...draft, reviewRequestDelayHours: Number(event.target.value) })
                }
              />
            </label>
            <label className="block">
              <span className="field-label">Review URL</span>
              <input
                className="field-input email-field-input"
                placeholder="https://g.page/your-review-link"
                type="url"
                value={draft.reviewUrl || ""}
                onChange={(event) => onDraftChange({ ...draft, reviewUrl: event.target.value })}
              />
            </label>
            <button className="classic-button primary w-full justify-center" disabled={saving} type="submit">
              <Settings size={17} aria-hidden="true" />
              {saving ? "Saving..." : "Save email settings"}
            </button>
          </form>
        </fieldset>

        <div className="flex flex-col gap-6">
          <EmailJobsTable
            jobs={dashboard.failedJobs}
            retryingJobId={retryingJobId}
            title="Failed email jobs"
            emptyMessage="No failed email jobs."
            onRetry={onRetry}
          />

          <div className="order-1 lg:order-2">
            <EmailJobsTable
              jobs={visibleRecentJobs}
              retryingJobId={retryingJobId}
              title="Recent email activity"
              emptyMessage="No email jobs yet."
              onRetry={onRetry}
            />
          </div>

          <fieldset className="classic-fieldset compact email-panel order-2 lg:order-1">
            <legend>System Status</legend>
            <div className="admin-signal-grid grid-cols-1 sm:grid-cols-3">
              <div>
                <span>Scheduler</span>
                <strong>{dashboard.runtime.automatedSchedulerEnabled ? "On" : "Off"}</strong>
                <small>Reminder and review scans</small>
              </div>
              <div>
                <span>Worker</span>
                <strong>{dashboard.runtime.emailJobWorkerEnabled ? "On" : "Off"}</strong>
                <small>Queued email sender</small>
              </div>
              <div>
                <span>Sender</span>
                <strong className="truncate">{dashboard.runtime.mailFrom}</strong>
                <small className="truncate">{dashboard.runtime.smtpHost}</small>
              </div>
            </div>
          </fieldset>
        </div>
      </div>
    </div>
  );
}

function EmailMobileStat({
  icon,
  label,
  value
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="email-mobile-stat">
      <span className="email-mobile-stat-icon">{icon}</span>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function AutomationToggle({
  checked,
  description,
  title,
  onChange
}: {
  checked: boolean;
  description: string;
  title: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="email-automation-card">
      <span className="min-w-0">
        <strong className="block text-sm font-bold text-[#171614]">{title}</strong>
        <span className="mt-1 block text-xs font-semibold leading-relaxed text-[#746d61] md:text-sm">
          {description}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-2">
        <span
          className={`email-toggle-state ${checked ? "active" : "inactive"}`}
        >
          {checked ? "On" : "Off"}
        </span>
        <input
          checked={checked}
          className="h-5 w-5 accent-[#d6b46a]"
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
        />
      </span>
    </label>
  );
}

function ReadonlyAutomation({
  description,
  enabled,
  title
}: {
  description: string;
  enabled: boolean;
  title: string;
}) {
  return (
    <div className="email-automation-card readonly">
      <div className="flex items-start justify-between gap-3 md:gap-4">
        <span className="min-w-0">
          <strong className="block text-sm font-bold text-[#171614]">{title}</strong>
          <span className="mt-1 block text-xs font-semibold leading-relaxed text-[#746d61] md:text-sm">
            {description}
          </span>
        </span>
        <span className="email-toggle-state active">
          {enabled ? "On" : "Off"}
        </span>
      </div>
    </div>
  );
}

function EmailJobsTable({
  emptyMessage,
  jobs,
  retryingJobId,
  title,
  onRetry
}: {
  emptyMessage: string;
  jobs: EmailJob[];
  retryingJobId?: string;
  title: string;
  onRetry: (jobId: string) => void;
}) {
  return (
    <fieldset className="classic-fieldset compact email-panel">
      <legend>{title}</legend>
      {jobs.length === 0 ? (
        <div className="admin-empty-state small">{emptyMessage}</div>
      ) : (
        <>
        <div className="grid gap-2 md:hidden">
          {jobs.map((job) => (
            <article key={job._id} className="email-job-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-bold text-[#171614]">{formatJobType(job.type)}</h3>
                  <p className="mt-1 truncate text-xs font-semibold text-[#746d61]">
                    {job.to || "Recipient not available"}
                  </p>
                </div>
                <span className={`shrink-0 rounded px-2 py-1 text-[11px] font-bold uppercase ${statusClasses(job.status)}`}>
                  {job.status}
                </span>
              </div>

              {job.lastError && (
                <p className="mt-2 line-clamp-2 text-xs font-semibold text-rose-600">
                  {job.lastError}
                </p>
              )}

              <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#eee7d8] pt-3">
                <div className="text-xs font-semibold text-[#746d61]">
                  <span className="block">Attempts {job.attempts}/{job.maxAttempts}</span>
                  <span className="block">{formatShortDateTime(job.updatedAt || job.createdAt)}</span>
                </div>
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
              </div>
            </article>
          ))}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr>
                <th className="px-4 py-3 font-bold">Type</th>
                <th className="px-4 py-3 font-bold">Recipient</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 font-bold">Attempts</th>
                <th className="px-4 py-3 font-bold">Updated</th>
                <th className="px-4 py-3 font-bold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {jobs.map((job) => (
                <tr key={job._id} className="queue-row">
                  <td className="px-4 py-4 font-bold text-ink">{formatJobType(job.type)}</td>
                  <td className="px-4 py-4 text-slate-600">{job.to || "Not available"}</td>
                  <td className="px-4 py-4">
                    <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${statusClasses(job.status)}`}>
                      {job.status}
                    </span>
                    {job.lastError && (
                      <div className="mt-2 max-w-xs text-xs font-semibold text-rose-600">
                        {job.lastError}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4 font-semibold text-slate-600">
                    {job.attempts}/{job.maxAttempts}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-slate-600">
                    {formatShortDateTime(job.updatedAt || job.createdAt)}
                  </td>
                  <td className="px-4 py-4">
                    {job.status === "failed" ? (
                      <button
                        className="classic-button"
                        disabled={retryingJobId === job._id}
                        onClick={() => onRetry(job._id)}
                        type="button"
                      >
                        <RotateCcw size={15} aria-hidden="true" />
                        Retry
                      </button>
                    ) : (
                      <span className="text-xs font-bold text-slate-400">No action</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </fieldset>
  );
}
