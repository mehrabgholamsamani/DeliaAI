import { CalendarClock, Lock, XCircle } from "lucide-react";
import type { AvailabilityDay, AvailabilitySlot } from "../types";

type TimeSlotPickerProps = {
  days: AvailabilityDay[];
  value?: string;
  disabled?: boolean;
  mode?: "customer" | "admin";
  onSelect?: (slotStartAt: string) => void;
  onToggleBusy?: (slot: AvailabilitySlot) => void;
};

function isSameSlot(left?: string, right?: string) {
  return Boolean(left && right && new Date(left).getTime() === new Date(right).getTime());
}

function getSlotClasses(slot: AvailabilitySlot, selected: boolean, mode: "customer" | "admin") {
  if (selected) {
    return "border-ink bg-ink text-white shadow-soft";
  }

  if (slot.status === "booked") {
    return "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400";
  }

  if (slot.status === "past") {
    return "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400";
  }

  if (slot.status === "busy") {
    return mode === "admin"
      ? "border-amber-300 bg-amber-50 text-amber-800 hover:border-amber-500"
      : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400";
  }

  return "border-slate-200 bg-white text-ink hover:border-mint hover:bg-mint/10";
}

export function TimeSlotPicker({
  days,
  value,
  disabled,
  mode = "customer",
  onSelect,
  onToggleBusy
}: TimeSlotPickerProps) {
  if (days.length === 0) {
    return (
      <div className="rounded-lg bg-slate-50 p-4 text-sm font-semibold text-slate-500">
        No weekday slots are available in this range.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {days.map((day) => (
        <section key={day.date} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="mb-3 flex items-center gap-2 font-bold text-ink">
            <CalendarClock size={17} aria-hidden="true" />
            {day.dateLabel}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {day.slots.map((slot) => {
              const selected = isSameSlot(value, slot.slotStartAt);
              const isCustomerDisabled = mode === "customer" && !slot.isAvailable;
              const isAdminDisabled =
                mode === "admin" && (slot.status === "booked" || slot.status === "past");
              const isDisabled = disabled || isCustomerDisabled || isAdminDisabled;

              return (
                <button
                  key={slot.slotStartAt}
                  className={`min-h-14 rounded-lg border px-3 py-2 text-left text-sm font-bold transition ${getSlotClasses(
                    slot,
                    selected,
                    mode
                  )} disabled:opacity-70`}
                  disabled={isDisabled}
                  onClick={() => {
                    if (mode === "admin") {
                      onToggleBusy?.(slot);
                      return;
                    }

                    onSelect?.(slot.slotStartAt);
                  }}
                  type="button"
                >
                  <span className="block">{slot.timeLabel}</span>
                  <span className="mt-1 flex items-center gap-1 text-xs font-semibold opacity-75">
                    {slot.status === "booked" && <Lock size={12} aria-hidden="true" />}
                    {slot.status === "busy" && <XCircle size={12} aria-hidden="true" />}
                    {slot.status === "open"
                      ? selected
                        ? "Selected"
                        : "Available"
                      : slot.status === "booked"
                        ? "Booked"
                        : slot.status === "past"
                          ? "Passed"
                          : "Busy"}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
