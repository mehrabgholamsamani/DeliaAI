# Delia

> A production-minded AI receptionist platform built to make the difficult parts visible: tenant isolation, voice reliability, deterministic booking actions, public website embeds, and an internal CRM that stays in sync with the receptionist.

Delia is not a chatbot pasted onto a booking form. It is a multi-tenant receptionist system for service businesses: an owner teaches Delia their business, services, policies, and availability; customers can speak to it in a live call or use it on a website; confirmed actions land in that business’s private CRM.

## Why this project exists

Most AI receptionist demos stop when a model can answer a friendly question. The hard product work starts after that:

- How does the system remember booking details without repeatedly asking for them?
- How can an LLM suggest an action without being trusted to mutate data directly?
- How do separate businesses stay isolated when they use the same application?
- What happens when speech services, a model call, or an availability check fail?
- How can a public website widget be useful without accidentally exposing a private dashboard API?

Delia is a focused answer to those questions. It keeps the conversational layer natural while putting all state changes behind typed, validated, workspace-scoped workflows.

## Product highlights

- Google or password sign-up, followed by required guided business onboarding.
- Structured business facts, approved knowledge, services, availability, and handoff rules per workspace.
- Four receptionist personas with distinct introductions, voices, and response styles.
- One-click live receptionist calls with ringing, microphone input, spoken replies, typing feedback, and hang-up flow.
- Booking, update, cancellation, and handoff workflows that require deterministic server-side confirmation.
- Google Cloud TTS/STT support with browser speech fallback and application-enforced usage limits.
- Private CRM per business: customers, bookings, internal notes, owner update/cancel controls, and audit events.
- Customer-facing website widget with domain-bound public keys, Shadow DOM isolation, voice/text input, service selection, availability, booking, and callback handoff.
- Google OAuth with authorization code flow, PKCE, nonce/state validation, server-only secret handling, and onboarding enforcement.

## Architecture at a glance

```text
                                         ┌──────────────────────────┐
                                         │  Workspace owner          │
                                         │  Dashboard / CRM          │
                                         └────────────┬─────────────┘
                                                      │ authenticated session + CSRF
                                                      ▼
React + Vite ─────────────── HTTPS ─────────────── NestJS API
  live receptionist / chat / CRM                     │
  Google sign-in / onboarding                         ├── Zod validation + rate limits
                                                      ├── AI workflow + action drafts
Public website ─── Delia widget.js ──────────────────┤
  domain-bound embed key                              ├── Prisma ──> PostgreSQL
  public visitor session                              └── Google Cloud TTS / STT (optional)
                                                      │
                                                      ▼
                                           Workspace-scoped CRM records
                                           customers / bookings / services
```

| Area             | Implementation                                                                 |
| ---------------- | ------------------------------------------------------------------------------ |
| Frontend         | React, Vite, React Router, TypeScript, custom CSS, Lucide                      |
| API              | NestJS, Express, Socket.IO, Zod, TypeScript                                    |
| Persistence      | PostgreSQL + Prisma migrations                                                 |
| AI orchestration | Gemini structured output, LangGraph booking-draft workflow                     |
| Authentication   | Opaque HTTP-only session cookies, hashed tokens, CSRF guard, Google OAuth      |
| Voice            | Browser Web Speech fallback; optional Google Cloud TTS/STT via server-side ADC |
| Public embed     | Vanilla JS Shadow DOM widget, scoped public keys, exact-origin checks          |
| Quality gates    | ESLint, TypeScript, Vitest, Docker Compose, readiness checks                   |

## Engineering decisions that matter

### The model proposes; the workflow decides

Delia never lets the model directly create, update, or cancel a booking. The model returns a typed reply and a recommended plan. The application then collects the necessary details, checks live availability, creates a short-lived action draft, asks for confirmation, and only then executes a CRM mutation in a serializable database transaction.

That boundary prevents the most damaging hallucination: an assistant saying an appointment is booked when no validated booking exists.

### Every meaningful record is workspace-scoped

`Workspace` is the security boundary. Business settings, services, customers, bookings, knowledge, conversations, feedback, usage records, audit logs, widget configuration, and public widget sessions are all scoped to a workspace.

The API does not accept a workspace ID from the browser as authority. It derives the workspace from the authenticated session or from the validated public widget key and session relationship.

### Memory is structured, not just a longer prompt

The receptionist stores compact conversation state: name, email, phone, service intent, booking status, and selected time. This prevents the common failure mode where a visitor gives their contact details and the assistant asks for them again a turn later.

Recent transcript, summary, business context, active services, and approved knowledge still inform the model; structured state is the source of truth for task progress.

### Voice has a cost-aware fallback path

The product works with browser speech as its no-cost baseline. Google Cloud TTS/STT is optional and only called server-side. The application caps spoken reply length, request frequency, transcription duration, and monthly character/second usage per workspace. When cloud voice is unavailable or a cap is reached, the experience falls back to browser speech instead of failing the call.

### Public widgets have a different security model than the dashboard

The website widget does not reuse dashboard endpoints or authentication. It uses a public key tied to an enabled receptionist configuration and checks the exact requesting website origin. It receives a separate public visitor session bound to the workspace’s conversation session. Dashboard mutation routes remain session- and CSRF-protected.

### CRM writes are validated business operations

Delia’s internal CRM is not a model memory store. It contains durable customer and booking records. All changes validate service ownership, future business hours, active status, slot overlap, availability overrides, and workspace ownership. Owners can also make controlled updates and cancellations in the CRM UI.

## Problems solved along the way

| Problem                                    | What went wrong                                                                              | Resolution                                                                                                            |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Stale frontend in local Docker development | OneDrive-mounted source and Vite container restarts could leave the browser on an old bundle | Recreate the web container and verify the served source before handoff                                                |
| Booking loops                              | Conversational replies could keep collecting already-provided details                        | Persist compact booking state and use explicit booking stages: collecting, time choice, confirming, paused, completed |
| Generic “consultation” language            | New businesses did not have their actual services configured                                 | Add a guided services manager, quick templates, active/inactive controls, and workspace-specific service lookup       |
| Duplicate/unsafe booking execution         | A retry or double confirmation could create multiple records                                 | Use action drafts, status transitions, serializable transactions, and idempotent executed-draft results               |
| Voice service cost exposure                | Cloud speech can be abused or unexpectedly expensive                                         | Limit replies, throttle endpoints, account usage per workspace, cap monthly consumption, and retain browser fallback  |
| Service account key policy blocks          | Secure-by-default Google organizations can prohibit JSON key creation                        | Support Application Default Credentials locally and workload identity/service attachment in production                |
| Google OAuth onboarding bypass             | Social sign-in can create an account without business context                                | New OAuth users receive a normal Delia session but always route to incomplete onboarding                              |
| Public widget attack surface               | A public key alone should not let any site use a receptionist                                | Require enabled state, exact allowed origin, rate limits, public-session binding, and domain-aware CORS               |
| AI booking vs CRM ambiguity                | A successful conversation did not make it obvious where the booking went                     | Save confirmed private-call bookings to the workspace CRM and show a direct “View in CRM” confirmation                |

## Tradeoffs and what I would do next

| Decision                                                | Why                                                                            | Tradeoff / next step                                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Gemini structured output instead of direct tool calling | Keeps conversational flexibility while preserving deterministic server control | Move to provider-agnostic adapters and contract tests before supporting more models                   |
| Browser speech fallback                                 | Makes the prototype usable with no Cloud speech bill                           | Add streaming audio and telephone-grade transport for lower latency at scale                          |
| Opaque database-backed sessions                         | Straightforward revocation, CSRF association, and server-side control          | Add device/session management and rotation telemetry                                                  |
| One workspace owner initially                           | Simplifies tenant boundaries while building the core workflow                  | Add organization members, RBAC, and invitation flows                                                  |
| Native internal CRM first                               | Guarantees a reliable source of truth for Delia actions                        | Add provider adapters, encrypted OAuth tokens, outbox sync, and reconciliation for HubSpot/Salesforce |
| Exact-origin widget allowlist                           | Keeps the public embed predictable and constrained                             | Add signed installation verification and self-service domain verification for larger customers        |
| Local Docker development stack                          | Reproducible API + database + web development                                  | Deploy API, database, widget asset host, and observability as separate production services            |

## Repository layout

```text
apps/
  api/                    NestJS API, Prisma schema/migrations, AI, auth, CRM, widget modules
  web/                    React/Vite product UI and standalone widget.js asset
packages/
  contracts/              Shared API contracts and health schema
  prompts/                Versioned receptionist prompts
docs/                     Engineering and deployment documentation
docker-compose.yml        Local PostgreSQL, API, and Vite web stack
```

The older `client/` and `server/` directories are retired legacy sources and are not used by the active platform build.

## Run it locally

### Prerequisites

- Node.js 20+
- npm (the repository currently uses npm workspaces; pnpm commands also work for validation)
- Docker Desktop / Docker Compose
- A local Google Cloud CLI login only if testing optional Cloud TTS/STT

### 1. Configure local environment

```powershell
Copy-Item .env.example .env
```

Set a strong local `ADMIN_API_TOKEN`. Keep `GEMINI_API_KEY`, Google OAuth credentials, Google Cloud project values, and all secrets in `.env`; it is ignored by Git.

### 2. Start the full local stack

```powershell
docker compose up -d --build
```

Open:

```text
http://localhost:5174
```

Health endpoints:

```text
http://localhost:4000/api/health
http://localhost:4000/api/ready
```

### Development mode without the API container

```powershell
docker compose up -d postgres
npm ci
npm run db:generate
npm run db:migrate
npm run dev
```

The direct Vite development server runs on `http://localhost:5173` by default.

## Google OAuth setup

1. Create an **External** OAuth consent screen in Google Cloud.
2. Create a **Web application** OAuth client.
3. Add this local redirect URI:

```text
http://localhost:4000/api/auth/google/callback
```

4. Put the client ID and client secret in `.env`:

```env
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:4000/api/auth/google/callback
```

Do not commit the secret. Delia keeps Google sign-in disabled until both values are present. A new Google user still completes business onboarding before reaching the dashboard.

## Google Cloud voice setup (optional)

Browser speech is the default free fallback. To enable Google Cloud voice, set the relevant values in `.env` and authenticate the API with Application Default Credentials:

```powershell
gcloud auth application-default login
```

For production, attach a narrowly scoped service account to the workload rather than distributing JSON key files. The API never exposes Cloud credentials or browser API keys to visitors.

## Website widget setup

1. Sign in and open **Dashboard → Website widget**.
2. Add exact allowed origins, for example `https://www.example.com`.
3. Choose greeting and accent color, then enable the widget.
4. Copy the generated script before your website’s closing `</body>` tag.

```html
<script src="https://app.example.com/widget.js" data-business="your-public-key"></script>
```

The dashboard generates the real local or deployed asset URL for you. The public key is not a dashboard credential: it is only accepted from approved origins and creates isolated visitor sessions.

## Environment variables

| Variable                             | Purpose                                                                    |
| ------------------------------------ | -------------------------------------------------------------------------- |
| `DATABASE_URL`                       | PostgreSQL connection string                                               |
| `API_PORT`                           | Nest API listener port                                                     |
| `WEB_ORIGIN`                         | Dashboard browser origin for CORS and OAuth redirect                       |
| `GEMINI_API_KEY`                     | Server-side Gemini key; optional fallback behavior exists when unavailable |
| `GEMINI_MODEL`                       | Gemini model used for receptionist generation                              |
| `ADMIN_API_TOKEN`                    | Development/admin API protection token                                     |
| `GOOGLE_OAUTH_CLIENT_ID`             | Google OAuth public client identifier                                      |
| `GOOGLE_OAUTH_CLIENT_SECRET`         | Server-only Google OAuth secret                                            |
| `GOOGLE_OAUTH_REDIRECT_URI`          | Registered OAuth callback URI                                              |
| `GOOGLE_TTS_ENABLED`                 | Enables server-side Google Cloud TTS                                       |
| `GOOGLE_TTS_MONTHLY_CHARACTER_LIMIT` | Application-enforced per-workspace TTS usage ceiling                       |
| `GOOGLE_STT_ENABLED`                 | Enables server-side Google Cloud STT                                       |
| `GOOGLE_STT_MONTHLY_SECONDS_LIMIT`   | Application-enforced per-workspace STT usage ceiling                       |
| `VITE_API_ORIGIN`                    | Public API origin for a separately deployed web frontend                   |

## Verification

```powershell
pnpm.cmd typecheck
pnpm.cmd lint
pnpm.cmd test
pnpm.cmd build
```

The active API suite currently covers baseline health, environment validation, and core workflow behavior. The development handoff also includes live checks for API health, protected workspace routes, public-widget origin enforcement, and confirmed booking visibility in the correct workspace CRM.

## Security posture

- Every API body/query is parsed with Zod before it reaches application logic.
- Authenticated mutations require an opaque HTTP-only session cookie plus CSRF token.
- Session tokens are random; only their SHA-256 hashes are stored in PostgreSQL.
- Business data is workspace-scoped at service and query boundaries.
- Booking writes validate service ownership, working hours, future time, overrides, and conflict overlap.
- Receptionist actions are drafted and explicitly confirmed before execution.
- Google OAuth uses state, nonce, PKCE, server-side code exchange, and verified identity claims.
- Google Cloud credentials remain server-side; service-account JSON files are excluded from Git.
- Speech endpoints are rate-limited and budgeted; browser fallback avoids a hard dependency on paid voice.
- Public widget access requires enabled configuration, a valid public key, exact allowed origin, and an associated public visitor session.
- CRM and widget transcripts remain private to the owning workspace dashboard.

## Production readiness checklist

- [ ] Set HTTPS-only production origins and secure cookie behavior.
- [ ] Use managed PostgreSQL with backups, monitoring, and tested restores.
- [ ] Run Prisma migrations as a deployment step.
- [ ] Use workload identity/service attachment for Google Cloud, not downloaded key files.
- [ ] Encrypt third-party CRM OAuth refresh tokens before introducing integrations.
- [ ] Add a durable queue/outbox before syncing CRM actions to external providers.
- [ ] Add Playwright coverage for onboarding, Google OAuth callback, widget embed, booking confirmation, and CRM update/cancel flows.
- [ ] Add rate-limit telemetry, alerting, cost dashboards, structured logs, and error monitoring.
- [ ] Add consent/retention controls before collecting production call recordings or sensitive customer data.

---

Built as a systems-focused product project: polished enough to demo, deliberate enough to discuss in an engineering interview.
