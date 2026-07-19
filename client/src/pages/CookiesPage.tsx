import { templateConfig } from "../template";

export function CookiesPage() {
  return (
    <section className="mx-auto max-w-4xl px-5 py-12 lg:px-8">
      <span className="text-sm font-semibold uppercase tracking-[0.16em] text-mint">
        Legal
      </span>
      <h1 className="mt-3 text-4xl font-bold leading-tight text-ink">Cookie notice</h1>
      <div className="mt-8 space-y-6 leading-7 text-slate-600">
        <p>
          {templateConfig.business.name} uses only cookies needed for secure operator
          access by default. Customer booking pages do not require advertising or tracking
          cookies in the base template.
        </p>
        <section>
          <h2 className="text-xl font-bold text-ink">Strictly necessary cookies</h2>
          <p className="mt-2">
            Admin and monitor session cookies keep authenticated operators signed in and
            protect restricted actions. These cookies are required for secure access to the
            owner and monitoring areas.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-bold text-ink">Optional cookies</h2>
          <p className="mt-2">
            If analytics, advertising pixels, heatmaps, chat widgets, or other non-essential
            tools are added later, add a consent mechanism before those tools run.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-bold text-ink">Template note</h2>
          <p className="mt-2">
            Update this notice for each business and for any third-party scripts used in
            production.
          </p>
        </section>
      </div>
    </section>
  );
}
