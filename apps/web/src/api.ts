import { healthResponseSchema, type HealthResponse } from '@receptionist/contracts';

export type Service = {
  id: string;
  slug: string;
  name: string;
  description: string;
  priceLabel: string;
  durationMinutes: number;
  isActive: boolean;
};
export type Booking = {
  id: string;
  appointmentAt: string;
  appointmentEndAt: string;
  status: 'OPEN' | 'CANCELED' | 'COMPLETED';
  notes?: string | null;
  customer: { name: string; email: string; phone: string };
  service: Pick<Service, 'id' | 'name' | 'durationMinutes'>;
};
export type CrmCustomer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  createdAt: string;
  updatedAt: string;
  _count: { bookings: number };
};
export type Availability = {
  timezone: string;
  days: { date: string; slots: { startAt: string; available: boolean }[] }[];
};

const apiOrigin = import.meta.env.VITE_API_ORIGIN?.replace(/\/$/, '') || '';
let csrfToken: string | undefined;

export type Account = {
  userId: string;
  email: string;
  workspaceId: string;
  workspaceName: string;
  onboardingCompleted: boolean;
  csrfToken: string;
};

async function request<T>(
  path: string,
  options: RequestInit = {},
  adminToken?: string
): Promise<T> {
  const response = await fetch(`${apiOrigin}/api${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      ...(adminToken ? { 'x-admin-token': adminToken } : {}),
      ...options.headers
    }
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(
      typeof body?.message === 'string' ? body.message : `Request failed (${response.status})`
    );
  }
  return response.json() as Promise<T>;
}

export async function getApiHealth(): Promise<HealthResponse> {
  return healthResponseSchema.parse(await request('/health'));
}
export async function signUp(input: { email: string; password: string; businessName: string }) {
  const result = await request<{ account: Account }>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify(input)
  });
  csrfToken = result.account.csrfToken;
  return result.account;
}
export async function login(input: { email: string; password: string }) {
  const result = await request<{ account: Account }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(input)
  });
  csrfToken = result.account.csrfToken;
  return result.account;
}
export async function getCurrentAccount() {
  const result = await request<{ account: Account }>('/auth/me');
  csrfToken = result.account.csrfToken;
  return result.account;
}
export async function logout() {
  await request<void>('/auth/logout', { method: 'POST' });
  csrfToken = undefined;
}
export function startGoogleLogin() {
  window.location.assign(`${apiOrigin}/api/auth/google`);
}
export const getGoogleLoginStatus = () => request<{ enabled: boolean }>('/auth/google/status');
export type OnboardingBusiness = {
  businessName: string;
  industry: string;
  companyDescription: string;
  contactDetails: string;
  timezone: string;
  greeting: string;
  bookingInstructions: string;
  handoffInstructions: string;
};
export type WorkspaceSettings = OnboardingBusiness & {
  receptionistPersonaId: 'maya' | 'john' | 'sofia' | 'leo' | 'random';
};
export const getWorkspace = () =>
  request<{
    user: { email: string };
    workspace: { id: string; name: string; onboardingCompleted: boolean };
    business: WorkspaceSettings;
  }>('/workspace');
export const saveOnboarding = (input: OnboardingBusiness) =>
  request<{ business: OnboardingBusiness; onboardingCompleted: boolean }>('/workspace/onboarding', {
    method: 'PUT',
    body: JSON.stringify(input)
  });
export const saveWorkspaceSettings = (input: WorkspaceSettings) =>
  request<{ business: WorkspaceSettings; onboardingCompleted: boolean }>('/workspace/settings', {
    method: 'PUT',
    body: JSON.stringify(input)
  });
export const getWorkspaceServices = () => request<Service[]>('/workspace/services');
export const getWorkspaceCrmBookings = () => request<Booking[]>('/workspace/crm/bookings');
export const getWorkspaceCrmCustomers = () => request<CrmCustomer[]>('/workspace/crm/customers');
export const updateWorkspaceCrmBooking = (
  id: string,
  input: { name: string; phone: string; serviceId: string; appointmentAt: string; notes?: string }
) =>
  request<Booking>(`/workspace/crm/bookings/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(input)
  });
export const cancelWorkspaceCrmBooking = (id: string) =>
  request<Booking>(`/workspace/crm/bookings/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({})
  });
export const saveWorkspaceService = (input: Omit<Service, 'id'>) =>
  request<Service>('/workspace/services', { method: 'POST', body: JSON.stringify(input) });
export type WidgetSettings = {
  id: string;
  publicKey: string;
  allowedOrigins: string[];
  greeting: string;
  brandColor: string;
  isEnabled: boolean;
};
export type WidgetTranscript = {
  id: string;
  origin: string;
  createdAt: string;
  messages: { role: 'VISITOR' | 'ASSISTANT'; content: string; createdAt: string }[];
};
export const getWorkspaceWidget = () => request<WidgetSettings>('/workspace/widget');
export const saveWorkspaceWidget = (input: Omit<WidgetSettings, 'id' | 'publicKey'> & { regenerateKey?: boolean }) =>
  request<WidgetSettings>('/workspace/widget', { method: 'PUT', body: JSON.stringify(input) });
export const getWorkspaceWidgetSessions = () => request<WidgetTranscript[]>('/workspace/widget/sessions');
export type PublicWidgetConfig = {
  businessName: string;
  greeting: string;
  brandColor: string;
  services: Pick<Service, 'id' | 'name' | 'description' | 'durationMinutes' | 'priceLabel'>[];
};
export const getPublicWidgetConfig = (key: string) => request<PublicWidgetConfig>(`/public/widget/config?key=${encodeURIComponent(key)}`);
export const startPublicWidget = (key: string) => request<{ sessionId: string; reply: ReceptionistReply }>('/public/widget/sessions', { method: 'POST', body: JSON.stringify({ key }) });
export const chatPublicWidget = (key: string, sessionId: string, message: string) => request<{ sessionId: string; reply: ReceptionistReply }>('/public/widget/chat', { method: 'POST', body: JSON.stringify({ key, sessionId, message }) });
export const getWorkspaceAvailability = (serviceId: string, start: string) =>
  request<Availability>(`/workspace/availability?serviceId=${encodeURIComponent(serviceId)}&start=${start}&days=7`);
export const startWorkspaceReceptionistCall = () =>
  request<{ sessionId: string; reply: ReceptionistReply }>('/workspace/calls', { method: 'POST', body: JSON.stringify({}) });
export const getWorkspaceKnowledge = () => request<KnowledgeArticle[]>('/workspace/knowledge');
export const saveWorkspaceKnowledge = (article: KnowledgeArticle) =>
  request<KnowledgeArticle>('/workspace/knowledge', {
    method: 'POST',
    body: JSON.stringify(article)
  });
export const deleteWorkspaceKnowledge = (slug: string) =>
  request<KnowledgeArticle>(`/workspace/knowledge/${encodeURIComponent(slug)}`, {
    method: 'DELETE'
  });
export const chatWithWorkspaceReceptionist = (message: string, sessionId?: string) =>
  request<{ sessionId: string; reply: ReceptionistReply }>('/workspace/chat', {
    method: 'POST',
    body: JSON.stringify({ message, sessionId })
  });
export const getBusiness = () =>
  request<{
    businessName: string;
    timezone: string;
    bookingPaused: boolean;
    bookingPauseMessage?: string;
  }>('/business');
export const getServices = () => request<Service[]>('/services');
export const getAvailability = (serviceId: string, start: string) =>
  request<Availability>(
    `/availability?serviceId=${encodeURIComponent(serviceId)}&start=${start}&days=7`
  );
export const createBooking = (input: {
  name: string;
  email: string;
  phone: string;
  serviceId: string;
  appointmentAt: string;
  notes?: string;
}) =>
  request<{ booking: Booking; manageToken: string }>('/bookings', {
    method: 'POST',
    body: JSON.stringify(input)
  });
export const getManagedBooking = (token: string) =>
  request<Booking>('/bookings/manage', { method: 'POST', body: JSON.stringify({ token }) });
export const updateManagedBooking = (input: {
  token: string;
  name: string;
  phone: string;
  serviceId: string;
  appointmentAt: string;
  notes?: string;
}) => request<Booking>('/bookings/manage', { method: 'PATCH', body: JSON.stringify(input) });
export const cancelManagedBooking = (token: string) =>
  request<Booking>('/bookings/manage/cancel', { method: 'PATCH', body: JSON.stringify({ token }) });
export const getAdminBookings = (token: string) => request<Booking[]>('/admin/bookings', {}, token);
export const getAdminServices = (token: string) => request<Service[]>('/admin/services', {}, token);
export const saveAdminService = (token: string, service: Omit<Service, 'id'>) =>
  request<Service>('/admin/services', { method: 'POST', body: JSON.stringify(service) }, token);
export type ReceptionistSettings = {
  businessName: string;
  companyDescription: string;
  greeting: string;
  assistantTone: string;
  bookingInstructions: string;
  handoffInstructions: string;
  contactDetails: string;
};
export type KnowledgeArticle = {
  slug: string;
  title: string;
  content: string;
  category: 'COMPANY' | 'SERVICE' | 'POLICY' | 'FAQ' | 'PROMOTION' | 'INTERNAL';
  sourceLabel?: string | null;
  isActive: boolean;
};
export const getReceptionistSettings = (token: string) =>
  request<ReceptionistSettings>('/admin/receptionist-settings', {}, token);
export const saveReceptionistSettings = (token: string, settings: ReceptionistSettings) =>
  request<ReceptionistSettings>(
    '/admin/receptionist-settings',
    { method: 'POST', body: JSON.stringify(settings) },
    token
  );
export const getKnowledge = (token: string) =>
  request<KnowledgeArticle[]>('/admin/knowledge', {}, token);
export const saveKnowledge = (token: string, article: KnowledgeArticle) =>
  request<KnowledgeArticle>(
    '/admin/knowledge',
    { method: 'POST', body: JSON.stringify(article) },
    token
  );
export const deleteKnowledge = (token: string, slug: string) =>
  request<KnowledgeArticle>(
    `/admin/knowledge/${encodeURIComponent(slug)}`,
    { method: 'DELETE' },
    token
  );
export const getKnowledgeInsights = (token: string) =>
  request<{
    activeArticles: number;
    draftArticles: number;
    openQuestions: { id: string; question: string; createdAt: string }[];
    openHandoffs: {
      id: string;
      name: string;
      email: string;
      phone: string;
      message: string;
      createdAt: string;
    }[];
  }>('/admin/knowledge/insights', {}, token);
export const createHandoffRequest = (input: {
  sessionId?: string;
  name: string;
  email: string;
  phone: string;
  message: string;
}) =>
  request<{ id: string }>('/receptionist/handoffs', {
    method: 'POST',
    body: JSON.stringify(input)
  });
export type ReceptionistReply = {
  spokenText: string;
  displayText: string;
  intent: string;
  suggestedActions: string[];
  requiresConfirmation: boolean;
  endCall: boolean;
  plan?: {
    action:
      | 'ANSWER'
      | 'COLLECT_BOOKING_DETAILS'
      | 'OFFER_AVAILABILITY'
      | 'PAUSE_BOOKING'
      | 'RESUME_BOOKING'
      | 'CORRECT_CONTACT'
      | 'REQUEST_CALLBACK'
      | 'HANDOFF'
      | 'CLARIFY'
      | 'RECOVER';
    confidence: 'high' | 'medium' | 'low';
    workflowStatus: 'idle' | 'active' | 'paused';
  };
  citedKnowledgeIds: string[];
  receptionist?: { id: string; name: string };
  bookingDetails?: {
    name?: string;
    email?: string;
    phone?: string;
    serviceQuery?: string;
    wantsEarliest?: boolean;
    readyToReview?: boolean;
  };
};
export const chatWithReceptionist = (message: string, sessionId?: string) =>
  request<{ sessionId: string; reply: ReceptionistReply }>('/receptionist/chat', {
    method: 'POST',
    body: JSON.stringify({ message, sessionId })
  });
export const startReceptionistCall = () =>
  request<{ sessionId: string; reply: ReceptionistReply }>('/receptionist/calls', {
    method: 'POST',
    body: JSON.stringify({})
  });
export async function getReceptionistSpeech(
  sessionId: string,
  signal?: AbortSignal
): Promise<Blob> {
  const response = await fetch(`${apiOrigin}/api/receptionist/speech`, {
    method: 'POST',
    signal,
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId })
  });
  if (!response.ok) throw new Error(`Speech request failed (${response.status})`);
  return response.blob();
}
export async function transcribeReceptionistAudio(
  audio: Blob,
  durationSeconds: number,
  signal?: AbortSignal,
  sessionId?: string
) {
  const response = await fetch(`${apiOrigin}/api/receptionist/transcribe`, {
    method: 'POST',
    signal,
    credentials: 'include',
    headers: {
      'content-type': audio.type || 'audio/webm',
      'x-audio-duration-seconds': String(durationSeconds),
      ...(sessionId ? { 'x-receptionist-session': sessionId } : {})
    },
    body: audio
  });
  if (!response.ok) throw new Error(`Transcription request failed (${response.status})`);
  return response.json() as Promise<{ transcript: string; source: 'chirp_3' }>;
}
export type BookingDraft = {
  draftId: string;
  confirmationText: string;
  expiresAt: string;
  requiresConfirmation: boolean;
};
export const prepareReceptionistBooking = (
  sessionId: string,
  payload: {
    name: string;
    email: string;
    phone: string;
    serviceId: string;
    appointmentAt: string;
    notes?: string;
  }
) =>
  request<BookingDraft>('/receptionist/actions/prepare', {
    method: 'POST',
    body: JSON.stringify({ sessionId, action: 'CREATE_BOOKING', payload })
  });
export const prepareWorkspaceReceptionistBooking = (
  sessionId: string,
  payload: { name: string; email: string; phone: string; serviceId: string; appointmentAt: string; notes?: string }
) => request<BookingDraft>('/workspace/actions/prepare', { method: 'POST', body: JSON.stringify({ sessionId, action: 'CREATE_BOOKING', payload }) });
export const confirmWorkspaceReceptionistBooking = (sessionId: string, draftId: string) =>
  request<{ booking: Booking; manageToken: string }>('/workspace/actions/confirm', { method: 'POST', body: JSON.stringify({ sessionId, draftId, confirmed: true }) });
export const confirmReceptionistBooking = (sessionId: string, draftId: string) =>
  request<{ booking: Booking; manageToken: string }>('/receptionist/actions/confirm', {
    method: 'POST',
    body: JSON.stringify({ sessionId, draftId, confirmed: true })
  });
export const prepareReceptionistUpdate = (
  sessionId: string,
  payload: {
    token: string;
    name: string;
    phone: string;
    serviceId: string;
    appointmentAt: string;
    notes?: string;
  }
) =>
  request<BookingDraft>('/receptionist/actions/prepare', {
    method: 'POST',
    body: JSON.stringify({ sessionId, action: 'UPDATE_BOOKING', payload })
  });
export const prepareReceptionistCancel = (sessionId: string, token: string) =>
  request<BookingDraft>('/receptionist/actions/prepare', {
    method: 'POST',
    body: JSON.stringify({ sessionId, action: 'CANCEL_BOOKING', payload: { token } })
  });
export const confirmReceptionistAction = (sessionId: string, draftId: string) =>
  request<{ booking: Booking }>('/receptionist/actions/confirm', {
    method: 'POST',
    body: JSON.stringify({ sessionId, draftId, confirmed: true })
  });
