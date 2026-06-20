import { sendFrontendTelemetry } from "../api";

let telemetryStarted = false;

function currentPath() {
  return `${window.location.pathname}${window.location.search}`;
}

function report(input: Parameters<typeof sendFrontendTelemetry>[0]) {
  void sendFrontendTelemetry({
    ...input,
    path: input.path || currentPath()
  }).catch(() => undefined);
}

function getRating(name: string, value: number): "good" | "needs-improvement" | "poor" {
  if (name === "CLS") {
    if (value <= 0.1) return "good";
    if (value <= 0.25) return "needs-improvement";
    return "poor";
  }

  if (name === "LCP") {
    if (value <= 2500) return "good";
    if (value <= 4000) return "needs-improvement";
    return "poor";
  }

  if (name === "INP" || name === "FID") {
    if (value <= 200) return "good";
    if (value <= 500) return "needs-improvement";
    return "poor";
  }

  if (value <= 1000) return "good";
  if (value <= 2500) return "needs-improvement";
  return "poor";
}

function observeWebVitals() {
  if (!("PerformanceObserver" in window)) {
    return;
  }

  const observe = (type: string, metricName: string, getValue: (entries: PerformanceEntry[]) => number) => {
    try {
      const observer = new PerformanceObserver((list) => {
        const value = getValue(list.getEntries());

        if (Number.isFinite(value)) {
          report({
            type: "web_vitals",
            path: currentPath(),
            metricName,
            metricValue: value,
            rating: getRating(metricName, value)
          });
        }
      });

      observer.observe({ type, buffered: true });
    } catch {
      // Some browsers do not support every observer type.
    }
  };

  observe("largest-contentful-paint", "LCP", (entries) => entries.at(-1)?.startTime || 0);
  observe("layout-shift", "CLS", (entries) =>
    entries.reduce((total, entry) => {
      const layoutShift = entry as PerformanceEntry & {
        hadRecentInput?: boolean;
        value?: number;
      };

      return layoutShift.hadRecentInput ? total : total + (layoutShift.value || 0);
    }, 0)
  );
  observe("first-input", "FID", (entries) => {
    const entry = entries[0] as PerformanceEntry & { processingStart?: number };

    return entry ? (entry.processingStart || entry.startTime) - entry.startTime : 0;
  });
}

export function startFrontendTelemetry() {
  if (telemetryStarted || typeof window === "undefined") {
    return;
  }

  telemetryStarted = true;

  window.addEventListener("error", (event) => {
    report({
      type: "javascript_error",
      path: currentPath(),
      message: event.message,
      source: event.filename,
      stack: event.error instanceof Error ? event.error.stack : undefined
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason || "Unhandled rejection");

    report({
      type: "unhandled_rejection",
      path: currentPath(),
      message,
      stack: reason instanceof Error ? reason.stack : undefined
    });
  });

  window.addEventListener("load", () => {
    window.setTimeout(() => {
      const navigation = performance.getEntriesByType("navigation")[0] as
        | PerformanceNavigationTiming
        | undefined;

      report({
        type: "page_load",
        path: currentPath(),
        metricName: "load",
        metricValue: navigation ? Math.round(navigation.loadEventEnd) : undefined
      });
    }, 0);
  });

  observeWebVitals();
}
