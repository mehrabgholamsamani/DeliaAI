import { templateConfig } from "../template";

export function PrivacyPage() {
  return (
    <section className="mx-auto max-w-4xl px-5 py-12 lg:px-8">
      <span className="text-sm font-semibold uppercase tracking-[0.16em] text-mint">
        Legal
      </span>
      <h1 className="mt-3 text-4xl font-bold leading-tight text-ink">Privacy notice</h1>
      <div className="mt-8 space-y-6 leading-7 text-slate-600">
        <p>
          {templateConfig.business.name} uses booking information to respond to service
          requests, schedule appointments, manage customer communication, and operate the
          owner dashboard.
        </p>
        <section>
          <h2 className="text-xl font-bold text-ink">Information collected</h2>
          <p className="mt-2">
            Booking forms may collect name, email address, phone number, selected service,
            preferred appointment time, and optional notes.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-bold text-ink">How it is used</h2>
          <p className="mt-2">
            This information is used to create and manage bookings, send confirmation and
            reminder emails, notify the business owner, and support customer follow-up.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-bold text-ink">Operational telemetry</h2>
          <p className="mt-2">
            The website may collect limited technical events such as page-load signals,
            browser errors, and performance measurements to keep the booking flow reliable.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-bold text-ink">Template note</h2>
          <p className="mt-2">
            Replace this notice with policy text reviewed for the business, location, and
            any third-party services enabled in production.
          </p>
        </section>
      </div>
    </section>
  );
}
