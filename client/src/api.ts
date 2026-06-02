import type {
  AvailabilityDay,
  Booking,
  BookingInput,
  EmailAutomationDashboard,
  EmailAutomationSettings,
  EmailJob,
  LeadSummary,
  ManageBookingInput,
  MonitoringDashboard,
  OperationalControls,
  Pagination,
  Service
} from "./types";

type ApiRequestOptions = RequestInit & {
  csrf?: boolean | "admin" | "monitor";
};

let adminCsrfToken: string | null = null;
let monitorCsrfToken: string | null = null;

async function getCsrfToken(kind: "admin" | "monitor") {
  if (kind === "admin" && adminCsrfToken) {
    return adminCsrfToken;
  }

  if (kind === "monitor" && monitorCsrfToken) {
    return monitorCsrfToken;
  }

  const response = await fetch(`/api/${kind}/csrf`, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Could not load ${kind} security token`);
  }

  const body = (await response.json()) as { csrfToken: string };

  if (kind === "admin") {
    adminCsrfToken = body.csrfToken;
  } else {
    monitorCsrfToken = body.csrfToken;
  }

  return body.csrfToken;
}

async function request<T>(path: string, options?: ApiRequestOptions): Promise<T> {
  const { csrf, headers, ...requestOptions } = options || {};
  const csrfKind = csrf === true ? "admin" : csrf || undefined;
  const csrfHeaders = csrfKind ? { "x-csrf-token": await getCsrfToken(csrfKind) } : {};
  let response: Response;

  try {
    response = await fetch(path, {
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...csrfHeaders,
        ...headers
      },
      ...requestOptions
    });
  } catch {
    throw new Error("API server is not reachable. Start the API server and check the database connection.");
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      adminCsrfToken = null;
      monitorCsrfToken = null;
    }

    const body = (await response.clone().json().catch(() => null)) as { message?: string } | null;

    throw new Error(
      body?.message ||
        (response.status >= 500
          ? `API server error (${response.status}). Check the API server logs.`
          : `Request failed (${response.status}).`)
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function createBooking(input: BookingInput) {
  return request<{ booking: Booking; message: string }>("/api/bookings", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function verifyBooking(token: string) {
  return request<{ booking: Booking }>("/api/bookings/verify", {
    method: "POST",
    body: JSON.stringify({ token })
  });
}

export function getManagedBooking(token: string) {
  return request<{ booking: Booking }>("/api/bookings/manage", {
    method: "POST",
    body: JSON.stringify({ token })
  });
}

export function updateManagedBooking(token: string, input: ManageBookingInput) {
  return request<{ booking: Booking }>("/api/bookings/manage", {
    method: "PATCH",
    body: JSON.stringify({ token, ...input })
  });
}

export function cancelManagedBooking(token: string) {
  return request<{ booking: Booking }>("/api/bookings/manage/cancel", {
    method: "PATCH",
    body: JSON.stringify({ token })
  });
}

export async function getBookings() {
  const limit = 100;
  const firstPage = await request<{ bookings: Booking[]; pagination: Pagination }>(
    `/api/bookings?status=all&page=1&limit=${limit}`
  );
  const bookings = [...firstPage.bookings];

  for (let page = 2; page <= firstPage.pagination.totalPages; page += 1) {
    const response = await request<{ bookings: Booking[]; pagination: Pagination }>(
      `/api/bookings?status=all&page=${page}&limit=${limit}`
    );
    bookings.push(...response.bookings);
  }

  return {
    bookings,
    pagination: {
      ...firstPage.pagination,
      page: firstPage.pagination.totalPages,
      limit,
      total: bookings.length
    }
  };
}

export function getServices() {
  return request<{ services: Service[] }>("/api/services");
}

export function getOperationalStatus() {
  return request<{ operationalControls: OperationalControls }>("/api/operational-status");
}

export function sendFrontendTelemetry(input: {
  type: "javascript_error" | "unhandled_rejection" | "web_vitals" | "page_load";
  path: string;
  message?: string;
  source?: string;
  stack?: string;
  metricName?: string;
  metricValue?: number;
  rating?: "good" | "needs-improvement" | "poor";
}) {
  return request<void>("/api/telemetry/frontend", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function getAvailability(
  days = 21,
  serviceId?: string,
  options?: { start?: string }
) {
  const params = new URLSearchParams({ days: String(days) });

  if (serviceId) {
    params.set("serviceId", serviceId);
  }

  if (options?.start) {
    params.set("start", options.start);
  }

  return request<{ days: AvailabilityDay[] }>(`/api/availability?${params.toString()}`);
}

export function getAdminSession() {
  return request<{ authenticated: boolean }>("/api/admin/me");
}

export function getMonitorSession() {
  return request<{ authenticated: boolean }>("/api/monitor/me");
}

export function adminLogin(password: string) {
  adminCsrfToken = null;

  return request<{ authenticated: boolean }>("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ password })
  });
}

export function monitorLogin(password: string) {
  monitorCsrfToken = null;

  return request<{
    authenticated: boolean;
    mfaRequired?: boolean;
    challengeId?: string;
    expiresAt?: string;
    emailDelivery?: "sent";
  }>("/api/monitor/login", {
    method: "POST",
    body: JSON.stringify({ password })
  });
}

export function verifyMonitorLogin(challengeId: string, code: string) {
  monitorCsrfToken = null;

  return request<{ authenticated: boolean }>("/api/monitor/login/verify", {
    method: "POST",
    body: JSON.stringify({ challengeId, code })
  });
}

export function adminLogout() {
  const logoutRequest = request<void>("/api/admin/logout", {
    method: "POST",
    csrf: true
  });

  adminCsrfToken = null;

  return logoutRequest;
}

export function monitorLogout() {
  const logoutRequest = request<void>("/api/monitor/logout", {
    method: "POST",
    csrf: "monitor"
  });

  monitorCsrfToken = null;

  return logoutRequest;
}

export function clearAdminCsrfToken() {
  adminCsrfToken = null;
}

export function clearMonitorCsrfToken() {
  monitorCsrfToken = null;
}

export function setAvailabilitySlot(slotStartAt: string, status: "open" | "busy") {
  return request<{ days: AvailabilityDay[] }>("/api/availability", {
    method: "PATCH",
    csrf: true,
    body: JSON.stringify({ slotStartAt, status })
  });
}

export function getLeadSummary() {
  return request<{ summary: LeadSummary }>("/api/leads/summary");
}

export function getEmailAutomations() {
  return request<EmailAutomationDashboard>("/api/admin/email-automations");
}

export function getMonitoringDashboard() {
  return request<MonitoringDashboard>("/api/monitor/dashboard");
}

export function sendMonitorTestEmail(to?: string) {
  return request<{ sent: boolean; to: string; generatedAt: string }>("/api/monitor/test-email", {
    method: "POST",
    csrf: "monitor",
    body: JSON.stringify({ to: to || undefined })
  });
}

export function updateMonitorOperationalControls(input: Partial<OperationalControls>) {
  return request<{ operationalControls: OperationalControls }>("/api/monitor/operational-controls", {
    method: "PATCH",
    csrf: "monitor",
    body: JSON.stringify(input)
  });
}

export function updateEmailAutomations(input: Partial<Omit<EmailAutomationSettings, "customerVerificationEnabled">>) {
  return request<{ settings: EmailAutomationSettings }>("/api/admin/email-automations", {
    method: "PATCH",
    csrf: true,
    body: JSON.stringify(input)
  });
}

export function retryEmailJob(jobId: string) {
  return request<{ job: EmailJob }>(`/api/admin/email-jobs/${jobId}/retry`, {
    method: "POST",
    csrf: true
  });
}

export function retryMonitorEmailJob(jobId: string) {
  return request<{ job: EmailJob }>(`/api/monitor/email-jobs/${jobId}/retry`, {
    method: "POST",
    csrf: "monitor"
  });
}

export function unlockMonitorEmailJob(jobId: string) {
  return request<{ job: EmailJob }>(`/api/monitor/email-jobs/${jobId}/unlock`, {
    method: "POST",
    csrf: "monitor"
  });
}

export function resolveBooking(bookingId: string) {
  return request<{ booking: Booking }>(`/api/bookings/${bookingId}/resolve`, {
    method: "PATCH",
    csrf: true
  });
}

export function reopenBooking(bookingId: string) {
  return request<{ booking: Booking }>(`/api/bookings/${bookingId}/reopen`, {
    method: "PATCH",
    csrf: true
  });
}

export function deleteBooking(bookingId: string) {
  return request<void>(`/api/bookings/${bookingId}`, {
    method: "DELETE",
    csrf: true
  });
}
