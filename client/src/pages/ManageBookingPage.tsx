import {
  AlertCircle,
  CalendarCheck,
  CheckCircle2,
  Loader2,
  Phone,
  Trash2,
  User
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  cancelManagedBooking,
  getAvailability,
  getManagedBooking,
  updateManagedBooking
} from "../api";
import { TimeSlotPicker } from "../components/TimeSlotPicker";
import { useServices } from "../hooks/useServices";
import { formatBusinessFullDateTime } from "../lib/time";
import type { AvailabilityDay, Booking, ManageBookingInput } from "../types";

type PageStatus = "loading" | "ready" | "saving" | "canceling" | "error";

function createForm(booking: Booking): ManageBookingInput {
  return {
    name: booking.name,
    phone: booking.phone,
    serviceId: booking.serviceId,
    appointmentAt: booking.appointmentAt || "",
    notes: booking.notes || ""
  };
}

export function ManageBookingPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const { services, error: servicesError } = useServices();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [form, setForm] = useState<ManageBookingInput>({
    name: "",
    phone: "",
    serviceId: "",
    appointmentAt: "",
    notes: ""
  });
  const [status, setStatus] = useState<PageStatus>("loading");
  const [message, setMessage] = useState("Loading your booking...");
  const [availabilityDays, setAvailabilityDays] = useState<AvailabilityDay[]>([]);

  async function loadAvailability(serviceId: string) {
    const availabilityResponse = await getAvailability(21, serviceId);
    setAvailabilityDays(availabilityResponse.days);
  }

  useEffect(() => {
    let isActive = true;

    async function loadBooking() {
      if (!token) {
        setStatus("error");
        setMessage("This booking link is missing a token.");
        return;
      }

      try {
        const response = await getManagedBooking(token);
        const availabilityResponse = await getAvailability(21, response.booking.serviceId);

        if (!isActive) {
          return;
        }

        setBooking(response.booking);
        setForm(createForm(response.booking));
        setAvailabilityDays(availabilityResponse.days);
        setStatus("ready");
        setMessage("Your email is verified. You can manage this booking below.");
      } catch (error) {
        if (!isActive) {
          return;
        }

        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Could not load this booking.");
      }
    }

    void loadBooking();

    return () => {
      isActive = false;
    };
  }, [token]);

  function updateField(field: keyof ManageBookingInput, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "serviceId" ? { appointmentAt: "" } : {})
    }));

    if (field === "serviceId") {
      void loadAvailability(value);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");

    try {
      const response = await updateManagedBooking(token, form);
      setBooking(response.booking);
      setForm(createForm(response.booking));
      await loadAvailability(response.booking.serviceId);
      setStatus("ready");
      setMessage("Booking updated.");
    } catch (error) {
      setStatus("ready");
      setMessage(error instanceof Error ? error.message : "Could not update this booking.");
    }
  }

  async function handleCancel() {
    const confirmed = window.confirm("Cancel this booking request?");

    if (!confirmed) {
      return;
    }

    setStatus("canceling");
    setMessage("");

    try {
      const response = await cancelManagedBooking(token);
      setBooking(response.booking);
      await loadAvailability(response.booking.serviceId);
      setStatus("ready");
      setMessage("Booking canceled.");
    } catch (error) {
      setStatus("ready");
      setMessage(error instanceof Error ? error.message : "Could not cancel this booking.");
    }
  }

  const isBusy = status === "loading" || status === "saving" || status === "canceling";
  const isEditable = booking?.status === "open";
  const serviceOptions = useMemo(() => {
    if (!booking || services.some((service) => service.id === booking.serviceId)) {
      return services;
    }

    return [
      {
        id: booking.serviceId,
        name: booking.serviceName,
        duration: `${booking.serviceDurationHours || 1} hours`,
        durationHours: booking.serviceDurationHours || 1,
        price: "Current booking",
        description: booking.serviceName
      },
      ...services
    ];
  }, [booking, services]);

  if (status === "loading") {
    return (
      <section className="mx-auto max-w-3xl px-5 py-16 lg:px-8">
        <div className="rounded-lg bg-white p-6 text-center shadow-soft sm:p-8">
          <Loader2 className="mx-auto animate-spin text-mint" size={28} aria-hidden="true" />
          <p className="mt-4 text-sm font-semibold text-slate-600">{message}</p>
        </div>
      </section>
    );
  }

  if (status === "error" || !booking) {
    return (
      <section className="mx-auto max-w-3xl px-5 py-16 lg:px-8">
        <div className="rounded-lg bg-white p-6 shadow-soft sm:p-8">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-700">
              <AlertCircle size={24} aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-ink">Booking link unavailable.</h1>
              <p className="mt-3 leading-7 text-slate-600">{message}</p>
              <Link
                className="mt-6 inline-flex items-center justify-center rounded-lg bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                to="/booking"
              >
                New booking
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto grid max-w-7xl gap-8 px-5 py-12 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8">
      <div>
        <span className="text-sm font-semibold uppercase tracking-[0.16em] text-mint">
          Manage booking
        </span>
        <h1 className="mt-3 text-4xl font-bold leading-tight text-ink sm:text-5xl">
          Edit your booking request.
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600">
          Your email is verified. You can update the request while it is still active.
        </p>

        <form onSubmit={handleSubmit} className="mt-9 space-y-5 rounded-lg bg-white p-5 shadow-soft sm:p-7">
          <label className="block">
            <span className="field-label">
              <User size={17} aria-hidden="true" />
              Name
            </span>
            <input
              className="field-input"
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              disabled={!isEditable || isBusy}
              required
              minLength={2}
            />
          </label>

          <label className="block">
            <span className="field-label">
              <Phone size={17} aria-hidden="true" />
              Phone
            </span>
            <input
              className="field-input"
              type="tel"
              value={form.phone}
              onChange={(event) => updateField("phone", event.target.value)}
              disabled={!isEditable || isBusy}
              required
            />
          </label>

          <label className="block">
            <span className="field-label">
              <CalendarCheck size={17} aria-hidden="true" />
              Service
            </span>
            <select
              className="field-input"
              value={form.serviceId}
              onChange={(event) => updateField("serviceId", event.target.value)}
              disabled={!isEditable || isBusy}
              required
            >
              {serviceOptions.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
            {servicesError && (
              <span className="mt-2 block text-xs font-semibold text-amber-700">
                Showing the saved service menu because live services could not be loaded.
              </span>
            )}
          </label>

          <div>
            <div className="field-label">
              <CalendarCheck size={17} aria-hidden="true" />
              Preferred time
            </div>
            <TimeSlotPicker
              days={availabilityDays}
              value={form.appointmentAt}
              disabled={!isEditable || isBusy}
              onSelect={(slotStartAt) => updateField("appointmentAt", slotStartAt)}
            />
            <input
              value={form.appointmentAt}
              onChange={() => undefined}
              required
              className="sr-only"
              tabIndex={-1}
            />
          </div>

          <label className="block">
            <span className="field-label">Notes</span>
            <textarea
              className="field-input min-h-28 resize-y"
              value={form.notes || ""}
              onChange={(event) => updateField("notes", event.target.value)}
              disabled={!isEditable || isBusy}
              maxLength={500}
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!isEditable || isBusy}
              type="submit"
            >
              <CheckCircle2 size={18} aria-hidden="true" />
              {status === "saving" ? "Saving..." : "Save changes"}
            </button>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!isEditable || isBusy}
              onClick={() => void handleCancel()}
              type="button"
            >
              <Trash2 size={18} aria-hidden="true" />
              {status === "canceling" ? "Canceling..." : "Cancel booking"}
            </button>
          </div>

          {message && (
            <div
              className={`rounded-lg px-4 py-3 text-sm font-semibold ${
                message.includes("Could not") || message.includes("Only active")
                  ? "bg-rose-50 text-rose-700"
                  : "bg-emerald-50 text-emerald-700"
              }`}
              role="status"
            >
              {message}
            </div>
          )}
        </form>
      </div>

      <aside className="booking-summary">
        <p className="text-sm font-semibold text-slate-500">Current status</p>
        <h2 className="mt-2 text-2xl font-bold capitalize text-ink">{booking.status}</h2>
        <div className="mt-5 space-y-3 text-sm font-semibold text-slate-600">
          <p>{booking.serviceName}</p>
          <p>{booking.email}</p>
          <p>{booking.emailVerified ? "Email verified" : "Email not verified"}</p>
          {booking.appointmentAt && (
            <p>{formatBusinessFullDateTime(booking.appointmentAt)}</p>
          )}
        </div>
      </aside>
    </section>
  );
}
