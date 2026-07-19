import { CalendarCheck, CheckCircle2, Mail, Phone, User } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { createBooking, getAvailability, getOperationalStatus } from "../api";
import { TimeSlotPicker } from "../components/TimeSlotPicker";
import { useServices } from "../hooks/useServices";
import { templateConfig } from "../template";
import type { AvailabilityDay, BookingInput, OperationalControls } from "../types";

const emptyForm: BookingInput = {
  name: "",
  email: "",
  phone: "",
  serviceId: "",
  appointmentAt: "",
  notes: ""
};

export function BookingPage() {
  const [searchParams] = useSearchParams();
  const selectedFromUrl = searchParams.get("service");
  const { services, error: servicesError, findService } = useServices();
  const [form, setForm] = useState<BookingInput>(emptyForm);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [availabilityDays, setAvailabilityDays] = useState<AvailabilityDay[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [operationalControls, setOperationalControls] = useState<OperationalControls | null>(null);

  const selectedService = useMemo(() => findService(form.serviceId), [findService, form.serviceId]);

  async function loadAvailability(serviceId = form.serviceId) {
    setAvailabilityLoading(true);

    try {
      const response = await getAvailability(21, serviceId);
      setAvailabilityDays(response.days);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not load available times.");
    } finally {
      setAvailabilityLoading(false);
    }
  }

  useEffect(() => {
    void loadAvailability();
  }, [form.serviceId]);

  useEffect(() => {
    async function loadOperationalStatus() {
      try {
        const response = await getOperationalStatus();
        setOperationalControls(response.operationalControls);
      } catch {
        setOperationalControls(null);
      }
    }

    void loadOperationalStatus();
  }, []);

  useEffect(() => {
    const selectedServiceFromUrl = findService(selectedFromUrl);

    if (selectedServiceFromUrl && !form.serviceId) {
      setForm((current) => ({ ...current, serviceId: selectedServiceFromUrl.id }));
    }
  }, [findService, form.serviceId, selectedFromUrl]);

  function updateField(field: keyof BookingInput, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "serviceId" ? { appointmentAt: "" } : {})
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (operationalControls?.bookingsPaused) {
      setStatus("error");
      setMessage(
        operationalControls.bookingPauseMessage ||
          "Online booking is temporarily paused. Please contact us directly."
      );
      return;
    }

    setStatus("submitting");
    setMessage("");

    try {
      const response = await createBooking(form);
      setStatus("success");
      setMessage(response.message);
      setForm({ ...emptyForm, serviceId: form.serviceId });
      void loadAvailability(form.serviceId);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not create booking.");
    }
  }

  return (
    <section className="mx-auto grid max-w-7xl gap-8 px-5 py-12 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-8">
      <div>
        <span className="text-sm font-semibold uppercase tracking-[0.16em] text-mint">
          {templateConfig.pages.booking.eyebrow}
        </span>
        <h1 className="mt-3 text-4xl font-bold leading-tight text-ink sm:text-5xl">
          {templateConfig.pages.booking.heading}
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600">
          {templateConfig.pages.booking.intro}
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
              required
              minLength={2}
              placeholder="Jordan Lee"
            />
          </label>

          <div className="grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="field-label">
                <Mail size={17} aria-hidden="true" />
                Email
              </span>
              <input
                className="field-input"
                type="email"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                required
                placeholder="jordan@example.com"
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
                required
                placeholder="+1 555 0148"
              />
            </label>
          </div>

          <label className="block">
            <span className="field-label">
              <CalendarCheck size={17} aria-hidden="true" />
              Service
            </span>
            <select
              className="field-input"
              value={form.serviceId}
              onChange={(event) => updateField("serviceId", event.target.value)}
              required
            >
              <option value="">Choose a service</option>
              {services.map((service) => (
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
              Available time
            </div>
            {availabilityLoading ? (
              <div className="rounded-lg bg-slate-50 p-4 text-sm font-semibold text-slate-500">
                Loading available times...
              </div>
            ) : (
              <TimeSlotPicker
                days={availabilityDays}
                value={form.appointmentAt}
                disabled={status === "submitting"}
                onSelect={(slotStartAt) => updateField("appointmentAt", slotStartAt)}
              />
            )}
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
              value={form.notes}
              onChange={(event) => updateField("notes", event.target.value)}
              maxLength={500}
              placeholder="Preferred date, property size, access notes..."
            />
          </label>

          <button
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            disabled={status === "submitting" || operationalControls?.bookingsPaused}
            type="submit"
          >
            <CalendarCheck size={18} aria-hidden="true" />
            {operationalControls?.bookingsPaused
              ? "Booking paused"
              : status === "submitting"
                ? "Sending booking..."
                : "Send booking request"}
          </button>

          {operationalControls?.bookingsPaused && (
            <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              {operationalControls.bookingPauseMessage ||
                "Online booking is temporarily paused. Please contact us directly."}
            </div>
          )}

          {message && (
            <div
              className={`rounded-lg px-4 py-3 text-sm font-semibold ${
                status === "success"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-rose-50 text-rose-700"
              }`}
              role="status"
            >
              {message}
            </div>
          )}
        </form>
      </div>

      <aside className="booking-summary">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-aqua text-ink">
            <CheckCircle2 size={22} aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500">Selected service</p>
            <h2 className="text-xl font-bold text-ink">
              {selectedService?.name || "None selected"}
            </h2>
          </div>
        </div>

        {selectedService ? (
          <div className="mt-6 space-y-4">
            <p className="leading-7 text-slate-600">{selectedService.description}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Duration
                </p>
                <p className="mt-2 font-bold text-ink">{selectedService.duration}</p>
              </div>
              <div className="rounded-lg bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Price
                </p>
                <p className="mt-2 font-bold text-ink">{selectedService.price}</p>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-6 leading-7 text-slate-600">
            Pick a service from the dropdown or start from the services page.
          </p>
        )}
      </aside>
    </section>
  );
}
