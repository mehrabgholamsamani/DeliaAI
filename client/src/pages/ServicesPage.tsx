import { ArrowRight, BadgeCheck, Building2, Home, KeyRound, SprayCan } from "lucide-react";
import { Link } from "react-router-dom";
import { useServices } from "../hooks/useServices";
import { templateConfig } from "../template";

const icons = [Home, SprayCan, KeyRound, Building2];

export function ServicesPage() {
  const { services, error } = useServices();

  return (
    <section className="mx-auto max-w-7xl px-5 py-12 lg:px-8">
      <div className="max-w-3xl">
        <span className="text-sm font-semibold uppercase tracking-[0.16em] text-mint">
          {templateConfig.pages.services.eyebrow}
        </span>
        <h1 className="mt-3 text-4xl font-bold leading-tight text-ink sm:text-5xl">
          {templateConfig.pages.services.heading}
        </h1>
        <p className="mt-4 text-lg leading-8 text-slate-600">
          {templateConfig.pages.services.intro}
        </p>
      </div>

      {error && (
        <div className="mt-6 rounded-lg bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          Showing the saved service menu because live services could not be loaded.
        </div>
      )}

      <div className="mt-10 grid gap-5 md:grid-cols-2">
        {services.map((service, index) => {
          const Icon = icons[index] ?? BadgeCheck;

          return (
            <article key={service.id} className="service-card">
              <div className="flex items-start justify-between gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-aqua text-ink">
                  <Icon size={23} aria-hidden="true" />
                </div>
                <div className="rounded-lg bg-marigold/20 px-3 py-1 text-sm font-bold text-amber-800">
                  {service.price}
                </div>
              </div>
              <h2 className="mt-6 text-2xl font-bold text-ink">{service.name}</h2>
              <p className="mt-3 leading-7 text-slate-600">{service.description}</p>
              <div className="mt-6 flex flex-col justify-between gap-4 border-t border-slate-200 pt-5 sm:flex-row sm:items-center">
                <span className="text-sm font-semibold text-slate-500">{service.duration}</span>
                <Link
                  to={`/booking?service=${service.id}`}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Select service
                  <ArrowRight size={17} aria-hidden="true" />
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
