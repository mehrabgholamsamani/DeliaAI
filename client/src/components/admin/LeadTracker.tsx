import { Activity, CheckCircle2, Clock, Target, XCircle } from "lucide-react";
import type { LeadSummary } from "../../types";

type LeadTrackerProps = {
  summary: LeadSummary | null;
};

export function LeadTracker({ summary }: LeadTrackerProps) {
  const services = summary?.leadsByService ?? [];

  return (
    <>
    <section className="md:hidden">
      <div className="rounded-lg border border-[#e1d8c5] bg-white p-3 shadow-sm">
        <div className="grid grid-cols-3 gap-2">
          <MobileStat label="Open" value={summary?.openLeads ?? 0} />
          <MobileStat label="7 days" value={summary?.newLeadsLast7Days ?? 0} />
          <MobileStat label="Resolved" value={`${summary?.resolutionRate ?? 0}%`} />
        </div>

        <div className="mt-3 border-t border-[#eee7d8] pt-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-[#171614]">Services</h2>
            <span className="truncate text-xs font-semibold text-[#746d61]">
              Newest: {summary?.newestLeadService || "None"}
            </span>
          </div>

          <div className="mt-2 space-y-2">
            {services.length === 0 ? (
              <p className="rounded-md bg-[#f7f3ea] px-3 py-2 text-xs font-semibold text-[#746d61]">
                No service leads yet.
              </p>
            ) : (
              services.map((service) => {
                const resolvedPercent =
                  service.total === 0 ? 0 : Math.round((service.resolved / service.total) * 100);

                return (
                  <div key={service.serviceId} className="rounded-md bg-[#f7f3ea] p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-bold text-[#171614]">{service.serviceName}</p>
                      <strong className="shrink-0 text-xs text-[#5c4720]">{service.total}</strong>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e8dcc2]">
                      <span
                        className="block h-full rounded-full bg-[#d6b46a]"
                        style={{ width: `${resolvedPercent}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] font-semibold text-[#746d61]">
                      {service.open} open - {service.resolved} resolved
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </section>
    <DesktopLeadTracker summary={summary} />
    </>
  );
}

function MobileStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md bg-[#171614] px-2 py-2 text-center">
      <strong className="block text-base leading-none text-[#f1d48a]">{value}</strong>
      <span className="mt-1 block text-[10px] font-bold uppercase text-[#cfc6b4]">{label}</span>
    </div>
  );
}

export function DesktopLeadTracker({ summary }: LeadTrackerProps) {
  const totals = [
    {
      label: "Total leads",
      value: summary?.totalLeads ?? 0,
      icon: Target
    },
    {
      label: "Open leads",
      value: summary?.openLeads ?? 0,
      icon: Clock
    },
    {
      label: "Resolved leads",
      value: summary?.resolvedLeads ?? 0,
      icon: CheckCircle2
    },
    {
      label: "Canceled leads",
      value: summary?.canceledLeads ?? 0,
      icon: XCircle
    },
    {
      label: "Resolution rate",
      value: `${summary?.resolutionRate ?? 0}%`,
      icon: Activity
    }
  ];

  return (
    <section className="lead-tracker hidden md:block">
      <div className="flex flex-col justify-between gap-3">
        <div>
          <span className="admin-eyebrow">Lead tracking</span>
          <h2 className="text-lg font-bold text-ink">Pipeline health</h2>
        </div>
        <div className="admin-inline-stat">
          Last 7 days: <span className="text-ink">{summary?.newLeadsLast7Days ?? 0}</span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        {totals.map((item) => {
          const Icon = item.icon;

          return (
            <div key={item.label} className="metric-panel">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-aqua text-ink">
                <Icon size={20} aria-hidden="true" />
              </div>
              <strong>{item.value}</strong>
              <p>{item.label}</p>
            </div>
          );
        })}
      </div>

      <div className="admin-subpanel mt-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="font-bold text-ink">Service pipeline</h3>
          <p className="text-sm text-slate-500">
            Newest lead: {summary?.newestLeadService || "No leads yet"}
          </p>
        </div>
        <div className="mt-4 space-y-2">
          {(summary?.leadsByService ?? []).map((service) => {
            const resolvedPercent =
              service.total === 0 ? 0 : Math.round((service.resolved / service.total) * 100);

            return (
              <div key={service.serviceId} className="lead-service-row">
                <div className="min-w-0">
                  <p className="truncate font-bold text-ink">{service.serviceName}</p>
                  <p className="text-xs font-semibold text-slate-500">
                    {service.open} open / {service.resolved} resolved / {service.canceled} canceled
                  </p>
                </div>
                <div className="lead-progress" aria-label={`${resolvedPercent}% resolved`}>
                  <span style={{ width: `${resolvedPercent}%` }} />
                </div>
                <strong>{service.total}</strong>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
