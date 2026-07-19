import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Lock,
  Mail,
  Phone,
  RefreshCw,
  Eye,
  X
} from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { getAvailability, setAvailabilitySlot } from "../../api";
import type { AvailabilityDay, AvailabilitySlot } from "../../types";

const CALENDAR_WEEK_DAYS = 7;
const MAX_PAST_WEEKS = 1;

function toDateInputValue(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getWeekStart(date: Date) {
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return addDays(startOfLocalDay(date), mondayOffset);
}

function getMinimumWeekStart() {
  return addDays(getWeekStart(new Date()), -MAX_PAST_WEEKS * CALENDAR_WEEK_DAYS);
}

function clampWeekStart(date: Date) {
  const weekStart = getWeekStart(date);
  const minimumWeekStart = getMinimumWeekStart();

  return weekStart.getTime() < minimumWeekStart.getTime() ? minimumWeekStart : weekStart;
}

function formatRangeLabel(start: Date, days: number) {
  const end = addDays(start, days - 1);
  const formatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function formatDateTime(value?: string) {
  if (!value) {
    return "Not scheduled";
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function getBusinessDateKey(value: Date | string, timezone?: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function isToday(day: AvailabilityDay) {
  return getBusinessDateKey(day.date, day.timezone) === getBusinessDateKey(new Date(), day.timezone);
}

function isPastBusinessDay(day: AvailabilityDay) {
  return getBusinessDateKey(day.date, day.timezone) < getBusinessDateKey(new Date(), day.timezone);
}

function formatMobileDateLabel(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(date);
}

function formatMobileDayName(value: Date | string, timezone?: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    weekday: "short"
  }).format(new Date(value));
}

function formatMobileDayNumber(value: Date | string, timezone?: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    day: "numeric"
  }).format(new Date(value));
}

function buildMobileWeekDays(weekStart: Date, availabilityDays: AvailabilityDay[]) {
  const timezone =
    availabilityDays[0]?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const daysByKey = new Map(
    availabilityDays.map((day) => [getBusinessDateKey(day.date, day.timezone), day])
  );

  return Array.from({ length: CALENDAR_WEEK_DAYS }, (_, index) => addDays(weekStart, index))
    .filter((date) => {
      const day = date.getDay();
      return day !== 0 && day !== 6;
    })
    .map((date) => {
      const key = toDateInputValue(date);

      return (
        daysByKey.get(key) || {
          date: date.toISOString(),
          dateLabel: formatMobileDateLabel(date),
          timezone,
          slots: []
        }
      );
    });
}

function getSlotTone(slot: AvailabilitySlot) {
  if (slot.status === "booked") {
    return "border-emerald-500 bg-emerald-100 text-emerald-950 shadow-[inset_4px_0_0_#059669] hover:border-emerald-700 hover:bg-emerald-200";
  }

  if (slot.status === "busy") {
    return "border-amber-500 bg-amber-100 text-amber-950 shadow-[inset_4px_0_0_#d97706] hover:border-amber-700 hover:bg-amber-200";
  }

  if (slot.status === "past") {
    return "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300";
  }

  return "border-slate-200 bg-white text-slate-500 hover:border-emerald-400 hover:bg-emerald-50 hover:text-ink";
}

function getSlotLabel(slot: AvailabilitySlot) {
  if (slot.status === "booked") return "Booked";
  if (slot.status === "busy") return "Busy";
  if (slot.status === "past") return "Passed";
  return "Open";
}

function isBookingStart(slot: AvailabilitySlot) {
  if (!slot.booking?.appointmentAt) {
    return false;
  }

  return new Date(slot.booking.appointmentAt).getTime() === new Date(slot.slotStartAt).getTime();
}

function getSlotContext(slot: AvailabilitySlot) {
  if (!slot.booking) {
    return slot.status === "busy" ? "Owner unavailable" : undefined;
  }

  const serviceName = slot.booking.serviceName || "Booking";
  const duration = slot.booking.serviceDurationHours
    ? `${slot.booking.serviceDurationHours}h service`
    : undefined;

  if (isBookingStart(slot)) {
    return duration ? `${serviceName} - ${duration}` : serviceName;
  }

  return duration ? `Occupied by ${serviceName} - ${duration}` : `Occupied by ${serviceName}`;
}

function countSlots(days: AvailabilityDay[]) {
  return days.reduce(
    (counts, day) => {
      for (const slot of day.slots) {
        counts[slot.status] += 1;
      }

      return counts;
    },
    { open: 0, booked: 0, busy: 0, past: 0 }
  );
}

function countDaySlots(day: AvailabilityDay) {
  return day.slots.reduce(
    (counts, slot) => {
      counts[slot.status] += 1;
      return counts;
    },
    { open: 0, booked: 0, busy: 0, past: 0 }
  );
}

export function AvailabilityCalendar() {
  const [availabilityDays, setAvailabilityDays] = useState<AvailabilityDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() => clampWeekStart(new Date()));
  const [pendingSlots, setPendingSlots] = useState<Set<string>>(() => new Set());
  const [selectedMobileDayDate, setSelectedMobileDayDate] = useState<string>();
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot>();
  const [showPastMobileSlots, setShowPastMobileSlots] = useState(false);
  const [message, setMessage] = useState("");

  const counts = useMemo(() => countSlots(availabilityDays), [availabilityDays]);
  const timeRows = useMemo(
    () =>
      Array.from(
        new Set(
          availabilityDays.flatMap((day) =>
            day.slots.map((slot) => slot.timeLabel)
          )
        )
      ).sort((left, right) => {
        const leftSlot = availabilityDays.flatMap((day) => day.slots).find((slot) => slot.timeLabel === left);
        const rightSlot = availabilityDays.flatMap((day) => day.slots).find((slot) => slot.timeLabel === right);

        return (
          new Date(leftSlot?.slotStartAt || 0).getUTCHours() * 60 +
          new Date(leftSlot?.slotStartAt || 0).getUTCMinutes() -
          (new Date(rightSlot?.slotStartAt || 0).getUTCHours() * 60 +
            new Date(rightSlot?.slotStartAt || 0).getUTCMinutes())
        );
      }),
    [availabilityDays]
  );
  const mobileWeekDays = useMemo(
    () => buildMobileWeekDays(weekStart, availabilityDays),
    [availabilityDays, weekStart]
  );
  const selectedMobileDay =
    mobileWeekDays.find((day) => day.date === selectedMobileDayDate) || mobileWeekDays[0];
  const minimumWeekStart = getMinimumWeekStart();
  const canMoveToPreviousWeek = weekStart.getTime() > minimumWeekStart.getTime();

  async function loadAvailability(start = weekStart) {
    setLoading(true);
    setMessage("");

    try {
      const response = await getAvailability(CALENDAR_WEEK_DAYS, undefined, {
        start: toDateInputValue(start)
      });
      setAvailabilityDays(response.days);
      setSelectedMobileDayDate((current) =>
        current
          ? current
          : response.days[0]?.date
      );
      setShowPastMobileSlots(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load availability.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAvailability(weekStart);
  }, [weekStart]);

  async function handleToggle(slot: AvailabilitySlot) {
    if (slot.status === "past" || slot.status === "booked") {
      return;
    }

    const nextStatus = slot.status === "busy" ? "open" : "busy";
    const confirmed = window.confirm(
      nextStatus === "busy"
        ? `Mark ${slot.timeLabel} as busy?`
        : `Reopen ${slot.timeLabel}?`
    );

    if (!confirmed) {
      return;
    }

    setPendingSlots((current) => new Set(current).add(slot.slotStartAt));
    setMessage("");

    try {
      await setAvailabilitySlot(slot.slotStartAt, nextStatus);
      await loadAvailability();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update this slot.");
    } finally {
      setPendingSlots((current) => {
        const next = new Set(current);
        next.delete(slot.slotStartAt);
        return next;
      });
    }
  }

  async function handleBulkDay(day: AvailabilityDay, status: "open" | "busy") {
    const eligibleSlots = day.slots.filter((slot) =>
      status === "busy" ? slot.status === "open" : slot.status === "busy"
    );

    if (eligibleSlots.length === 0) {
      setMessage(status === "busy" ? "No open slots to block." : "No busy slots to reopen.");
      return;
    }

    const confirmed = window.confirm(
      status === "busy"
        ? `Block ${eligibleSlots.length} open slots on ${day.dateLabel}?`
        : `Reopen ${eligibleSlots.length} busy slots on ${day.dateLabel}?`
    );

    if (!confirmed) {
      return;
    }

    setPendingSlots((current) => {
      const next = new Set(current);
      eligibleSlots.forEach((slot) => next.add(slot.slotStartAt));
      return next;
    });
    setMessage("");

    try {
      for (const slot of eligibleSlots) {
        await setAvailabilitySlot(slot.slotStartAt, status);
      }

      await loadAvailability();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update day availability.");
    } finally {
      setPendingSlots((current) => {
        const next = new Set(current);
        eligibleSlots.forEach((slot) => next.delete(slot.slotStartAt));
        return next;
      });
    }
  }

  function findSlot(day: AvailabilityDay, timeLabel: string) {
    return day.slots.find((slot) => slot.timeLabel === timeLabel);
  }

  const moveRange = useCallback((days: number) => {
    setWeekStart((current) => clampWeekStart(addDays(current, days)));
  }, []);

  const goToCurrentWeek = useCallback(() => {
    setWeekStart(clampWeekStart(new Date()));
  }, []);

  useEffect(() => {
    function handleCalendarShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isEditableTarget =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      if (isEditableTarget || !event.altKey) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveRange(-CALENDAR_WEEK_DAYS);
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        moveRange(CALENDAR_WEEK_DAYS);
      }

      if (event.key === "Home") {
        event.preventDefault();
        goToCurrentWeek();
      }
    }

    window.addEventListener("keydown", handleCalendarShortcut);

    return () => window.removeEventListener("keydown", handleCalendarShortcut);
  }, [goToCurrentWeek, moveRange]);

  return (
    <section className="admin-availability">
      <div className="hidden flex-col gap-4 lg:flex xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-aqua text-ink">
            <CalendarDays size={21} aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-bold text-ink">Booking calendar</h2>
            <p className="text-sm text-slate-500">
              {formatRangeLabel(weekStart, CALENDAR_WEEK_DAYS)}. Toggle open slots busy, or inspect booked slots.
            </p>
          </div>
        </div>

        <div className="hidden flex-wrap items-center gap-2 lg:flex">
          <button
            className="classic-button"
            disabled={!canMoveToPreviousWeek}
            onClick={() => moveRange(-CALENDAR_WEEK_DAYS)}
            type="button"
          >
            <ChevronLeft size={16} aria-hidden="true" />
            Previous
          </button>
          <button
            className="classic-button"
            onClick={goToCurrentWeek}
            type="button"
          >
            Current week
          </button>
          <button className="classic-button" onClick={() => moveRange(CALENDAR_WEEK_DAYS)} type="button">
            Next
            <ChevronRight size={16} aria-hidden="true" />
          </button>
          <input
            className="field-input w-auto min-w-40"
            min={toDateInputValue(minimumWeekStart)}
            onChange={(event) => setWeekStart(clampWeekStart(new Date(`${event.target.value}T00:00:00`)))}
            type="date"
            value={toDateInputValue(weekStart)}
          />
          <button
            className="classic-button"
            disabled={loading}
            onClick={() => void loadAvailability()}
            type="button"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>

      <div className="classic-summary-grid mt-5 hidden lg:grid">
        <CalendarCount label="Open" tone="bg-emerald-50 text-emerald-700" value={counts.open} />
        <CalendarCount label="Booked" tone="bg-emerald-50 text-emerald-700" value={counts.booked} />
        <CalendarCount label="Busy" tone="bg-amber-50 text-amber-700" value={counts.busy} />
        <CalendarCount label="Past" tone="bg-slate-100 text-slate-500" value={counts.past} />
      </div>

      <div className="mt-4 hidden flex-wrap gap-2 text-xs font-bold text-slate-600 lg:flex">
        <LegendItem label="Open" className="border-emerald-200 bg-white" />
        <LegendItem label="Booked" className="border-emerald-300 bg-emerald-100" />
        <LegendItem label="Busy" className="border-amber-300 bg-amber-50" />
        <LegendItem label="Past" className="border-slate-200 bg-slate-100" />
      </div>

      <div className="mt-2 lg:mt-5">
        {loading ? (
          <div className="rounded-lg bg-slate-50 p-4 text-sm font-semibold text-slate-500">
            Loading calendar...
          </div>
        ) : availabilityDays.length === 0 ? (
          <>
            <div className="lg:hidden">
              <MobileDayCalendar
                days={mobileWeekDays}
                pendingSlots={pendingSlots}
                selectedDay={selectedMobileDay}
                showPastSlots={showPastMobileSlots}
                canMoveToPreviousWeek={canMoveToPreviousWeek}
                onCurrentWeek={goToCurrentWeek}
                onMoveWeek={moveRange}
                onSelectBooked={setSelectedSlot}
                onSelectDay={(dayDate) => {
                  setSelectedMobileDayDate(dayDate);
                  setShowPastMobileSlots(false);
                }}
                onShowPastSlotsChange={setShowPastMobileSlots}
                onToggle={handleToggle}
              />
            </div>
            <div className="hidden rounded-lg bg-slate-50 p-4 text-sm font-semibold text-slate-500 lg:block">
              No operating days are available in this range.
            </div>
          </>
        ) : (
          <>
          <div className="lg:hidden">
            <MobileDayCalendar
              days={mobileWeekDays}
              pendingSlots={pendingSlots}
              selectedDay={selectedMobileDay}
              showPastSlots={showPastMobileSlots}
              canMoveToPreviousWeek={canMoveToPreviousWeek}
              onCurrentWeek={goToCurrentWeek}
              onMoveWeek={moveRange}
              onSelectBooked={setSelectedSlot}
              onSelectDay={(dayDate) => {
                setSelectedMobileDayDate(dayDate);
                setShowPastMobileSlots(false);
              }}
              onShowPastSlotsChange={setShowPastMobileSlots}
              onToggle={handleToggle}
            />
          </div>

          <div className="hidden max-h-[72vh] overflow-auto rounded-lg border border-slate-200 bg-white lg:block">
            <div
              className="grid min-w-[900px]"
              style={{ gridTemplateColumns: `104px repeat(${availabilityDays.length}, minmax(132px, 1fr))` }}
            >
              <div className="sticky left-0 top-0 z-20 border-b border-r border-slate-200 bg-slate-50 p-3 text-xs font-bold uppercase text-slate-500">
                Time
              </div>
              {availabilityDays.map((day) => {
                const today = isToday(day);

                return (
                  <div
                    key={day.date}
                    className={`sticky top-0 z-10 border-b border-r p-3 text-sm font-bold ${
                      today
                        ? "border-blue-300 bg-blue-50 text-blue-950 shadow-[inset_0_3px_0_#2563eb]"
                        : "border-slate-200 bg-slate-50 text-ink"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>{day.dateLabel}</span>
                      {today && (
                        <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                          Today
                        </span>
                      )}
                    </div>
                    <DayBulkControls day={day} onBulkDay={handleBulkDay} />
                  </div>
                );
              })}

              {timeRows.map((timeLabel) => (
                <Fragment key={timeLabel}>
                  <div
                    className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white p-3 text-xs font-bold text-slate-500"
                  >
                    {timeLabel.split(" - ")[0]}
                  </div>
                  {availabilityDays.map((day) => {
                    const slot = findSlot(day, timeLabel);
                    const today = isToday(day);

                    if (!slot) {
                      return (
                        <div
                          key={`${day.date}-${timeLabel}-empty`}
                          className={`min-h-20 border-b border-r border-slate-200 ${
                            today ? "bg-blue-50/40" : "bg-slate-50/40"
                          }`}
                        />
                      );
                    }

                    const isPending = pendingSlots.has(slot.slotStartAt);

                    return (
                      <button
                        key={slot.slotStartAt}
                        className={`min-h-20 border-b border-r p-3 text-left transition ${getSlotTone(
                          slot
                        )} ${today ? "ring-1 ring-inset ring-blue-100" : ""} disabled:opacity-70`}
                        disabled={isPending || slot.status === "past"}
                        onClick={() => {
                          if (slot.status === "booked") {
                            setSelectedSlot(slot);
                            return;
                          }

                          void handleToggle(slot);
                        }}
                        type="button"
                      >
                        <span className="flex items-center justify-between gap-2 text-xs font-bold uppercase">
                          {getSlotLabel(slot)}
                          {slot.status === "booked" && <Lock size={13} aria-hidden="true" />}
                        </span>
                        <strong className="mt-2 block text-sm">
                          {slot.booking?.name || slot.timeLabel}
                        </strong>
                        {getSlotContext(slot) && (
                          <span className="mt-1 block truncate text-xs font-semibold opacity-75">
                            {getSlotContext(slot)}
                          </span>
                        )}
                        {isPending && (
                          <span className="mt-2 block text-xs font-bold opacity-75">Updating...</span>
                        )}
                      </button>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
          </>
        )}

        {message && (
          <div className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {message}
          </div>
        )}
      </div>

      {selectedSlot && (
        <BookingDrawer slot={selectedSlot} onClose={() => setSelectedSlot(undefined)} />
      )}
    </section>
  );
}

function CalendarCount({ label, tone, value }: { label: string; tone: string; value: number }) {
  return (
    <div className="classic-summary-box">
      <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${tone}`}>{label}</span>
      <strong>{value}</strong>
      <span>{label} slots</span>
    </div>
  );
}

function MobileDayCalendar({
  days,
  pendingSlots,
  selectedDay,
  showPastSlots,
  canMoveToPreviousWeek,
  onCurrentWeek,
  onMoveWeek,
  onSelectBooked,
  onSelectDay,
  onShowPastSlotsChange,
  onToggle
}: {
  days: AvailabilityDay[];
  pendingSlots: Set<string>;
  selectedDay?: AvailabilityDay;
  showPastSlots: boolean;
  canMoveToPreviousWeek: boolean;
  onCurrentWeek: () => void;
  onMoveWeek: (days: number) => void;
  onSelectBooked: (slot: AvailabilitySlot) => void;
  onSelectDay: (dayDate: string) => void;
  onShowPastSlotsChange: (value: boolean) => void;
  onToggle: (slot: AvailabilitySlot) => void;
}) {
  if (!selectedDay) {
    return null;
  }

  const pastSlots = selectedDay.slots.filter((slot) => slot.status === "past");
  const selectedDayIsPast = isPastBusinessDay(selectedDay);
  const visibleSlots = showPastSlots
    ? selectedDay.slots
    : selectedDayIsPast
      ? selectedDay.slots
      : selectedDay.slots.filter((slot) => slot.status !== "past");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[40px_minmax(0,1fr)_40px] items-center gap-2">
        <button
          className="grid h-10 w-10 place-items-center rounded-xl border border-[#e1d8c5] bg-white text-[#5c4720] shadow-sm disabled:opacity-40"
          disabled={!canMoveToPreviousWeek}
          onClick={() => onMoveWeek(-CALENDAR_WEEK_DAYS)}
          type="button"
          aria-label="Previous week"
        >
          <ChevronLeft size={17} aria-hidden="true" />
        </button>
        <button
          className="h-10 rounded-xl border border-[#3a3020] bg-[#171614] px-3 text-xs font-bold uppercase text-[#f1d48a] shadow-sm"
          onClick={onCurrentWeek}
          type="button"
        >
          This week
        </button>
        <button
          className="grid h-10 w-10 place-items-center rounded-xl border border-[#e1d8c5] bg-white text-[#5c4720] shadow-sm"
          onClick={() => onMoveWeek(CALENDAR_WEEK_DAYS)}
          type="button"
          aria-label="Next week"
        >
          <ChevronRight size={17} aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-5 gap-1.5">
        {days.map((day) => {
          const dayCounts = countDaySlots(day);
          const selected = selectedDay.date === day.date;
          const today = isToday(day);

          return (
            <button
              key={day.date}
              className={`min-h-[82px] rounded-xl border px-1.5 py-2 text-center shadow-sm transition ${
                selected
                  ? "border-[#171614] bg-[#171614] text-white"
                  : today
                    ? "border-[#d6b46a] bg-white text-[#5c4720]"
                    : "border-[#e1d8c5] bg-white text-[#746d61]"
              }`}
              onClick={() => onSelectDay(day.date)}
              type="button"
            >
              <span className="block text-[11px] font-bold uppercase">
                {formatMobileDayName(day.date, day.timezone)}
              </span>
              <span
                className={`mx-auto mt-1 grid h-7 w-7 place-items-center rounded-full text-sm font-bold ${
                  selected
                    ? "bg-[#d6b46a] text-[#171614]"
                    : today
                      ? "bg-[#d6b46a] text-[#171614]"
                      : "bg-[#f4f0e6] text-[#171614]"
                }`}
              >
                {formatMobileDayNumber(day.date, day.timezone)}
              </span>
              <span
                className={`mx-auto mt-1.5 inline-flex min-w-8 justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  selected
                    ? "bg-white/10 text-[#f1d48a]"
                    : dayCounts.open > 0
                      ? "bg-[#fbf2d9] text-[#5c4720]"
                      : "bg-[#f4f0e6] text-[#a8a197]"
                }`}
              >
                {dayCounts.open} open
              </span>
            </button>
          );
        })}
      </div>

      {pastSlots.length > 0 && !selectedDayIsPast && (
        <div className="flex justify-end px-0.5">
          <button
            className="rounded-full border border-[#e1d8c5] bg-white px-3 py-1 text-xs font-bold text-[#746d61]"
            onClick={() => onShowPastSlotsChange(!showPastSlots)}
            type="button"
          >
            {showPastSlots ? "Hide past" : "Show past"}
          </button>
        </div>
      )}

      <MobileDayTimeline
        pendingSlots={pendingSlots}
        slots={visibleSlots}
        onSelectBooked={onSelectBooked}
        onToggle={onToggle}
      />
    </div>
  );
}

function MobileDayTimeline({
  pendingSlots,
  slots,
  onSelectBooked,
  onToggle
}: {
  pendingSlots: Set<string>;
  slots: AvailabilitySlot[];
  onSelectBooked: (slot: AvailabilitySlot) => void;
  onToggle: (slot: AvailabilitySlot) => void;
}) {
  return (
    <section className="rounded-xl border border-[#e1d8c5] bg-white p-2.5 shadow-sm">
      {slots.length === 0 ? (
        <p className="px-2 py-8 text-center text-sm font-semibold text-[#746d61]">
          No slots on this day.
        </p>
      ) : (
        <div className="space-y-2">
          {slots.map((slot) => (
            <MobileTimelineSlot
              key={slot.slotStartAt}
              isPending={pendingSlots.has(slot.slotStartAt)}
              slot={slot}
              onSelectBooked={onSelectBooked}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function getMobileSlotClasses(slot: AvailabilitySlot) {
  if (slot.status === "booked") {
    return "border-emerald-600 bg-emerald-600 text-white shadow-[inset_4px_0_0_#047857]";
  }

  if (slot.status === "busy") {
    return "border-[#d6b46a] bg-[#fbf2d9] text-[#5c4720] shadow-[inset_4px_0_0_#d6b46a]";
  }

  if (slot.status === "past") {
    return "border-[#e8dcc2] bg-[#f7f3ea] text-[#a8a197]";
  }

  return "border-[#e1d8c5] bg-white text-[#171614] shadow-[inset_4px_0_0_#d6b46a]";
}

function MobileTimelineSlot({
  isPending,
  slot,
  onSelectBooked,
  onToggle
}: {
  isPending: boolean;
  slot: AvailabilitySlot;
  onSelectBooked: (slot: AvailabilitySlot) => void;
  onToggle: (slot: AvailabilitySlot) => void;
}) {
  const isBooked = slot.status === "booked";
  const isBusy = slot.status === "busy";
  const isPast = slot.status === "past";
  const actionLabel = isBooked ? "Details" : isBusy ? "Reopen" : isPast ? "Passed" : "Block";
  const actionIcon = isBooked ? Eye : isBusy ? RefreshCw : isPast ? Lock : X;
  const ActionIcon = actionIcon;
  const [startLabel, endLabel] = slot.timeLabel.split(" - ");

  return (
    <div className="grid grid-cols-[54px_minmax(0,1fr)] gap-2.5">
      <div className="pt-3 text-right">
        <span className="block text-xs font-bold text-[#5c4720]">{startLabel}</span>
        {endLabel && <span className="block text-[10px] font-semibold text-[#a8a197]">{endLabel}</span>}
      </div>
      <button
        className={`min-h-[74px] rounded-xl border p-3 text-left shadow-sm transition ${getMobileSlotClasses(
          slot
        )} disabled:opacity-70`}
        disabled={isPending || isPast}
        onClick={() => {
          if (isBooked) {
            onSelectBooked(slot);
            return;
          }

          onToggle(slot);
        }}
        type="button"
      >
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-xs font-bold uppercase opacity-80">{getSlotLabel(slot)}</span>
            <span className="mt-1 block truncate text-sm font-bold">
              {slot.booking?.name || getSlotContext(slot) || (isBusy ? "Owner unavailable" : "Available")}
            </span>
            {slot.booking?.serviceName && (
              <span className="mt-0.5 block truncate text-xs font-semibold opacity-80">
                {slot.booking.serviceName}
              </span>
            )}
            {isPending && (
              <span className="mt-1 block text-xs font-bold opacity-75">Updating...</span>
            )}
          </span>
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-bold ${
            isBooked ? "bg-white/20 text-white" : "bg-[#171614]/5 text-inherit"
          }`}>
            <ActionIcon size={13} aria-hidden="true" />
            {actionLabel}
          </span>
        </span>
      </button>
    </div>
  );
}

function DayBulkControls({
  day,
  onBulkDay
}: {
  day: AvailabilityDay;
  onBulkDay: (day: AvailabilityDay, status: "open" | "busy") => void;
}) {
  const openCount = day.slots.filter((slot) => slot.status === "open").length;
  const busyCount = day.slots.filter((slot) => slot.status === "busy").length;

  return (
    <div className="mt-2 flex flex-wrap gap-1">
      <button
        className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800 transition hover:border-amber-400 disabled:opacity-45"
        disabled={openCount === 0}
        onClick={() => onBulkDay(day, "busy")}
        type="button"
      >
        Block day
      </button>
      <button
        className="rounded-md border border-emerald-200 bg-white px-2 py-1 text-xs font-bold text-emerald-700 transition hover:border-emerald-400 disabled:opacity-45"
        disabled={busyCount === 0}
        onClick={() => onBulkDay(day, "open")}
        type="button"
      >
        Reopen
      </button>
    </div>
  );
}

function DayPanel({
  day,
  pendingSlots,
  onBulkDay,
  onSelectBooked,
  onToggle
}: {
  day: AvailabilityDay;
  pendingSlots: Set<string>;
  onBulkDay: (day: AvailabilityDay, status: "open" | "busy") => void;
  onSelectBooked: (slot: AvailabilitySlot) => void;
  onToggle: (slot: AvailabilitySlot) => void;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 p-3">
        <div className="text-sm font-bold text-ink">{day.dateLabel}</div>
        <DayBulkControls day={day} onBulkDay={onBulkDay} />
      </div>
      <div className="grid gap-2 p-3">
        {day.slots.map((slot) => {
          const isPending = pendingSlots.has(slot.slotStartAt);

          return (
            <button
              key={slot.slotStartAt}
              className={`rounded-lg border p-3 text-left transition ${getSlotTone(
                slot
              )} disabled:opacity-70`}
              disabled={isPending || slot.status === "past"}
              onClick={() => {
                if (slot.status === "booked") {
                  onSelectBooked(slot);
                  return;
                }

                onToggle(slot);
              }}
              type="button"
            >
              <span className="flex items-center justify-between gap-2 text-xs font-bold uppercase">
                {getSlotLabel(slot)}
                {slot.status === "booked" && <Lock size={13} aria-hidden="true" />}
              </span>
              <strong className="mt-2 block text-sm">{slot.booking?.name || slot.timeLabel}</strong>
              {getSlotContext(slot) && (
                <span className="mt-1 block text-xs font-semibold opacity-75">
                  {getSlotContext(slot)}
                </span>
              )}
              {isPending && <span className="mt-2 block text-xs font-bold opacity-75">Updating...</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function LegendItem({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-3 w-3 rounded border ${className}`} />
      {label}
    </span>
  );
}

function BookingDrawer({ onClose, slot }: { onClose: () => void; slot: AvailabilitySlot }) {
  const booking = slot.booking;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/40 p-4" role="presentation" onClick={onClose}>
      <aside
        className="ml-auto flex h-full w-full max-w-md flex-col rounded-lg bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <span className="text-xs font-bold uppercase text-blue-700">Booked slot</span>
            <h3 className="mt-1 text-xl font-bold text-ink">{booking?.name || "Booking details"}</h3>
            <p className="mt-1 text-sm font-semibold text-slate-500">{formatDateTime(slot.slotStartAt)}</p>
          </div>
          <button
            className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-600 transition hover:bg-slate-200"
            onClick={onClose}
            type="button"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          <DetailBlock label="Service" value={booking?.serviceName || "Not available"} />
          <DetailBlock label="Time" value={`${formatDateTime(slot.slotStartAt)} - ${formatDateTime(slot.slotEndAt)}`} />
          <DetailBlock
            label="Email verification"
            value={booking?.emailVerified ? "Verified" : "Not verified"}
          />
          <DetailBlock label="Notes" value={booking?.notes || "No notes"} />

          <div className="grid gap-3">
            {booking?.email && (
              <a className="classic-button justify-center" href={`mailto:${booking.email}`}>
                <Mail size={16} aria-hidden="true" />
                {booking.email}
              </a>
            )}
            {booking?.phone && (
              <a className="classic-button justify-center" href={`tel:${booking.phone}`}>
                <Phone size={16} aria-hidden="true" />
                {booking.phone}
              </a>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <span className="text-xs font-bold uppercase text-slate-500">{label}</span>
      <p className="mt-1 text-sm font-bold text-ink">{value}</p>
    </div>
  );
}
