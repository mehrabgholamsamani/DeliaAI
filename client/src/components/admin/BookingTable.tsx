import {
  AlertCircle,
  CheckCircle2,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Clock,
  Mail,
  Phone,
  RotateCcw,
  Trash2
} from "lucide-react";
import { useState } from "react";
import type { Booking } from "../../types";
import { formatBusinessDateTime } from "../../lib/time";

type BookingTableProps = {
  bookings: Booking[];
  emptyMessage: string;
  mode: "active" | "resolved" | "canceled";
  onResolve?: (bookingId: string) => void;
  onReopen?: (bookingId: string) => void;
  onDelete: (bookingId: string, customerName: string) => void;
  busyBookingId?: string;
  hasActiveFilters?: boolean;
  onResetFilters?: () => void;
};

function formatDate(value: string) {
  return formatBusinessDateTime(value);
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

function isNewLead(value: string) {
  return Date.now() - new Date(value).getTime() <= 24 * 60 * 60 * 1000;
}

function isPastAppointment(value: string | undefined) {
  return Boolean(value && new Date(value).getTime() < Date.now());
}

function getLeadBadges(booking: Booking) {
  const badges: Array<{ label: string; className: string }> = [];
  const today = new Date();

  if (booking.status === "resolved") {
    badges.push({ label: "Resolved", className: "bg-emerald-50 text-emerald-700" });
  } else if (booking.status === "canceled") {
    badges.push({ label: "Canceled", className: "bg-rose-50 text-rose-700" });
  } else {
    badges.push({ label: "Open", className: "bg-blue-50 text-blue-700" });
  }

  if (booking.status === "open" && isNewLead(booking.createdAt)) {
    badges.push({ label: "New", className: "bg-indigo-50 text-indigo-700" });
  }

  if (booking.status === "open" && isSameLocalDay(booking.appointmentAt, today)) {
    badges.push({ label: "Today", className: "bg-sky-50 text-sky-700" });
  }

  if (!booking.emailVerified) {
    badges.push({ label: "Unverified", className: "bg-amber-50 text-amber-700" });
  }

  if (booking.status === "open" && isPastAppointment(booking.appointmentAt)) {
    badges.push({ label: "Past due", className: "bg-red-50 text-red-700" });
  }

  return badges;
}

function previewNotes(notes?: string) {
  if (!notes) {
    return "No notes";
  }

  return notes.length > 110 ? `${notes.slice(0, 110)}...` : notes;
}

function compactAppointmentLabel(value?: string) {
  if (!value) {
    return "Not scheduled";
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function BookingTable({
  bookings,
  emptyMessage,
  mode,
  onResolve,
  onReopen,
  onDelete,
  busyBookingId,
  hasActiveFilters,
  onResetFilters
}: BookingTableProps) {
  const [expandedMobileLeadId, setExpandedMobileLeadId] = useState<string>();

  if (bookings.length === 0) {
    return (
      <div className="p-8 text-center text-sm font-semibold text-slate-500">
        <AlertCircle className="mx-auto mb-3 text-slate-400" size={24} aria-hidden="true" />
        <p>{hasActiveFilters ? "No leads match the current view." : emptyMessage}</p>
        {hasActiveFilters && onResetFilters && (
          <button className="classic-button mt-4" onClick={onResetFilters} type="button">
            Reset filters
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-2 md:hidden">
        {bookings.map((booking) => (
          <MobileLeadCard
            key={booking._id}
            booking={booking}
            busy={busyBookingId === booking._id}
            expanded={expandedMobileLeadId === booking._id}
            mode={mode}
            onDelete={onDelete}
            onExpandedChange={() =>
              setExpandedMobileLeadId((current) =>
                current === booking._id ? undefined : booking._id
              )
            }
            onReopen={onReopen}
            onResolve={onResolve}
          />
        ))}
      </div>

    <div className="hidden overflow-x-auto md:block">
      <table className="min-w-[1040px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
          <tr>
            <th className="px-4 py-3 font-bold">Lead</th>
            <th className="px-4 py-3 font-bold">Appointment</th>
            <th className="px-4 py-3 font-bold">Contact</th>
            <th className="px-4 py-3 font-bold">
              {mode === "resolved" ? "Resolved" : mode === "canceled" ? "Canceled" : "Submitted"}
            </th>
            <th className="px-4 py-3 font-bold">Notes</th>
            <th className="px-4 py-3 font-bold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {bookings.map((booking) => {
            const isBusy = busyBookingId === booking._id;
            const badges = getLeadBadges(booking);

            return (
              <tr key={booking._id} className="queue-row">
                <td className="px-4 py-4 align-top">
                  <div className="font-bold text-ink">{booking.name}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {badges.map((badge) => (
                      <span
                        key={badge.label}
                        className={`inline-flex rounded px-2 py-0.5 text-[11px] font-bold uppercase ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 text-xs font-semibold text-slate-500">
                    Lead ID {booking._id.slice(-8)}
                  </div>
                </td>
                <td className="px-4 py-4 align-top">
                  <span className="inline-flex rounded bg-aqua px-3 py-1 text-xs font-bold text-ink">
                    {booking.serviceName}
                  </span>
                  {booking.appointmentAt && (
                    <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-600">
                      <CalendarClock size={14} aria-hidden="true" />
                      {formatDate(booking.appointmentAt)}
                    </div>
                  )}
                  {!booking.appointmentAt && (
                    <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-500">
                      <CalendarClock size={14} aria-hidden="true" />
                      Not scheduled
                    </div>
                  )}
                </td>
                <td className="px-4 py-4 align-top">
                  <div className="flex items-center gap-2 text-slate-700">
                    <Mail size={15} aria-hidden="true" />
                    {booking.email}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-slate-700">
                    <Phone size={15} aria-hidden="true" />
                    {booking.phone}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a className="classic-button" href={`mailto:${booking.email}`}>
                      <Mail size={14} aria-hidden="true" />
                      Email
                    </a>
                    <a className="classic-button" href={`tel:${booking.phone}`}>
                      <Phone size={14} aria-hidden="true" />
                      Call
                    </a>
                  </div>
                  <div className="mt-3">
                    <span
                      className={`inline-flex items-center rounded px-2.5 py-1 text-xs font-bold ${
                        booking.emailVerified
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                      title={
                        booking.emailVerifiedAt
                          ? `Verified ${formatDate(booking.emailVerifiedAt)}`
                          : "Customer has not verified their email yet"
                      }
                    >
                      {booking.emailVerified ? "Email verified" : "Email not verified"}
                    </span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-4 align-top font-semibold text-slate-600">
                  <div className="flex items-center gap-2">
                    <Clock size={14} aria-hidden="true" />
                    {formatDate(
                      mode === "resolved" && booking.resolvedAt
                        ? booking.resolvedAt
                        : mode === "canceled" && booking.canceledAt
                          ? booking.canceledAt
                          : booking.createdAt
                    )}
                  </div>
                  {mode !== "active" && (
                    <div className="mt-2 text-xs font-semibold text-slate-400">
                      Submitted {formatDate(booking.createdAt)}
                    </div>
                  )}
                </td>
                <td className="max-w-xs px-4 py-4 align-top text-slate-600" title={booking.notes || undefined}>
                  {previewNotes(booking.notes)}
                </td>
                <td className="px-4 py-4 align-top">
                  <div className="flex flex-wrap gap-2">
                    {mode === "active" && onResolve && (
                      <button
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
                        onClick={() => onResolve(booking._id)}
                        disabled={isBusy}
                        type="button"
                      >
                        <CheckCircle2 size={15} aria-hidden="true" />
                        Resolve
                      </button>
                    )}
                    {(mode === "resolved" || mode === "canceled") && onReopen && (
                      <button
                        className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-200 disabled:opacity-60"
                        onClick={() => onReopen(booking._id)}
                        disabled={isBusy}
                        type="button"
                      >
                        <RotateCcw size={15} aria-hidden="true" />
                        Reopen
                      </button>
                    )}
                    <button
                      className="inline-flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                      onClick={() => onDelete(booking._id, booking.name)}
                      disabled={isBusy}
                      type="button"
                    >
                      <Trash2 size={15} aria-hidden="true" />
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}

function MobileLeadCard({
  booking,
  busy,
  expanded,
  mode,
  onDelete,
  onExpandedChange,
  onReopen,
  onResolve
}: {
  booking: Booking;
  busy: boolean;
  expanded: boolean;
  mode: "active" | "resolved" | "canceled";
  onDelete: (bookingId: string, customerName: string) => void;
  onExpandedChange: () => void;
  onReopen?: (bookingId: string) => void;
  onResolve?: (bookingId: string) => void;
}) {
  const badges = getLeadBadges(booking)
    .filter((badge) => badge.label !== "Open")
    .slice(0, expanded ? 3 : 2);

  return (
    <article className="rounded-lg border border-[#e1d8c5] bg-white shadow-sm">
      <button
        className="flex w-full items-start justify-between gap-2.5 p-2.5 text-left"
        onClick={onExpandedChange}
        type="button"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-sm font-bold text-[#171614]">{booking.name}</h3>
            <span className="shrink-0 text-[#a3833d]">
              {expanded ? (
                <ChevronUp size={16} aria-hidden="true" />
              ) : (
                <ChevronDown size={16} aria-hidden="true" />
              )}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs font-semibold text-[#746d61]">{booking.serviceName}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-xs font-bold text-[#8a7652]">
              <CalendarClock size={13} aria-hidden="true" />
              {compactAppointmentLabel(booking.appointmentAt)}
            </span>
            {badges.map((badge) => (
              <span
                key={badge.label}
                className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${badge.className}`}
              >
                {badge.label}
              </span>
            ))}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[#eee7d8] px-2.5 pb-2.5 pt-2.5">
          <div className="flex flex-wrap gap-1.5">
            <span
              className={`rounded px-2 py-1 text-[11px] font-bold ${
                booking.emailVerified ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
              }`}
            >
              {booking.emailVerified ? "Email verified" : "Email not verified"}
            </span>
            <span className="rounded bg-[#f4f0e6] px-2 py-1 text-[11px] font-bold text-[#746d61]">
              Submitted {compactAppointmentLabel(booking.createdAt)}
            </span>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <a className="classic-button justify-center" href={`tel:${booking.phone}`}>
              <Phone size={15} aria-hidden="true" />
              Call
            </a>
            <a className="classic-button justify-center" href={`mailto:${booking.email}`}>
              <Mail size={15} aria-hidden="true" />
              Email
            </a>
          </div>

          <div className="mt-2 flex gap-2">
            {mode === "active" && onResolve && (
              <button
                className="classic-button primary flex-1 justify-center"
                disabled={busy}
                onClick={() => onResolve(booking._id)}
                type="button"
              >
                <CheckCircle2 size={15} aria-hidden="true" />
                Resolve
              </button>
            )}
            {(mode === "resolved" || mode === "canceled") && onReopen && (
              <button
                className="classic-button primary flex-1 justify-center"
                disabled={busy}
                onClick={() => onReopen(booking._id)}
                type="button"
              >
                <RotateCcw size={15} aria-hidden="true" />
                Reopen
              </button>
            )}
            <button
              className="classic-button justify-center text-rose-700"
              disabled={busy}
              onClick={() => onDelete(booking._id, booking.name)}
              type="button"
              aria-label={`Delete ${booking.name}'s lead`}
            >
              <Trash2 size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
