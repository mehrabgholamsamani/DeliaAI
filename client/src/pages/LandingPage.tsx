import { ArrowRight, CalendarCheck, ClipboardList, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import heroImage from "../assets/service-hero.jpg";
import { useServices } from "../hooks/useServices";
import { templateConfig } from "../template";

export function LandingPage() {
  const { services } = useServices();
  const stats = [
    { value: String(services.length), label: "Core service queues" },
    ...templateConfig.pages.home.stats
  ];

  return (
    <>
      <section
        className="hero-shell min-h-[calc(100svh-76px)]"
        style={{ backgroundImage: `linear-gradient(90deg, rgba(246,251,251,0.98) 0%, rgba(246,251,251,0.86) 42%, rgba(246,251,251,0.12) 72%), url(${heroImage})` }}
      >
        <div className="mx-auto flex min-h-[calc(100svh-76px)] max-w-7xl items-center px-5 py-14 lg:px-8">
          <div className="max-w-2xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-lg border border-mint/30 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-700">
              <ShieldCheck size={17} className="text-mint" aria-hidden="true" />
              {templateConfig.pages.home.eyebrow}
            </div>
            <h1 className="text-4xl font-bold leading-[1.06] text-ink sm:text-5xl lg:text-6xl">
              {templateConfig.pages.home.headline}
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-650">
              {templateConfig.pages.home.subheadline}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/booking"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-5 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-slate-800"
              >
                <CalendarCheck size={18} aria-hidden="true" />
                {templateConfig.pages.home.primaryCta}
              </Link>
              <Link
                to="/services"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white/85 px-5 py-3 text-sm font-semibold text-ink transition hover:border-mint hover:bg-white"
              >
                {templateConfig.pages.home.secondaryCta}
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-4 px-5 py-7 sm:grid-cols-3 lg:px-8">
          {stats.map((stat) => (
            <div key={stat.label} className="flex items-center gap-4">
              <span className="text-3xl font-bold text-ink">{stat.value}</span>
              <span className="text-sm font-medium text-slate-600">{stat.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 lg:px-8">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <span className="text-sm font-semibold uppercase tracking-[0.16em] text-mint">
              {templateConfig.pages.home.workflowEyebrow}
            </span>
            <h2 className="mt-3 text-3xl font-bold text-ink">
              {templateConfig.pages.home.workflowHeading}
            </h2>
          </div>
          <Link
            to="/admin"
            className="inline-flex items-center gap-2 text-sm font-semibold text-ink hover:text-mint"
          >
            <ClipboardList size={18} aria-hidden="true" />
            Open admin panel
          </Link>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          {services.map((service) => (
            <Link
              key={service.id}
              to={`/booking?service=${service.id}`}
              className="service-tile group"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-bold text-ink">{service.name}</h3>
                <ArrowRight
                  size={19}
                  className="mt-1 text-slate-400 transition group-hover:translate-x-1 group-hover:text-mint"
                  aria-hidden="true"
                />
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">{service.description}</p>
              <div className="mt-5 flex items-center justify-between text-sm font-semibold">
                <span>{service.duration}</span>
                <span className="text-mint">{service.price}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
