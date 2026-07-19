type CounterName =
  | "httpRequestsTotal"
  | "httpErrorsTotal"
  | "emailJobsEnqueuedTotal"
  | "emailJobsSentTotal"
  | "emailJobsFailedTotal";

const counters: Record<CounterName, number> = {
  httpRequestsTotal: 0,
  httpErrorsTotal: 0,
  emailJobsEnqueuedTotal: 0,
  emailJobsSentTotal: 0,
  emailJobsFailedTotal: 0
};

let totalRequestDurationMs = 0;

export function incrementMetric(name: CounterName, amount = 1) {
  counters[name] += amount;
}

export function observeRequestDuration(durationMs: number) {
  totalRequestDurationMs += durationMs;
}

export function getMetricsSnapshot() {
  return {
    ...counters,
    averageRequestDurationMs:
      counters.httpRequestsTotal === 0
        ? 0
        : Math.round(totalRequestDurationMs / counters.httpRequestsTotal),
    uptimeSeconds: Math.round(process.uptime()),
    memory: process.memoryUsage()
  };
}
