# Stage 4 Gemini knowledge assistant

## Delivered

- Official `@google/genai` server-side integration using `gemini-3.1-flash-lite` by default.
- Approved knowledge articles stored in PostgreSQL and seeded with booking, handoff, and privacy guidance.
- `POST /api/receptionist/chat` accepts a message and optional opaque session ID, then returns a Zod-validated structured reply.
- Replies contain spoken/display text, intent, suggested actions, confirmation status, and citations restricted to the retrieved approved article slugs.
- Conversation sessions, last-turn summaries, messages, Gemini token usage, and audit records are stored server-side.
- A 40-message per-session limit and graceful no-key/model-error fallback prevent unbounded or broken conversations.
- Admin-only knowledge API: `GET /api/admin/knowledge` and `POST /api/admin/knowledge`.
- Public `/receptionist` text chat UI with session continuity and visible approved-source citations.

## Safety boundary

Gemini receives only the current message, compact conversation context, business metadata, and selected approved articles. It cannot query the web, access the database, or make booking mutations. Booking actions are deferred to the Stage 5 LangGraph workflow with explicit confirmation.

## Verification

- Stage 4 Prisma migration applied to local PostgreSQL.
- Typecheck, lint, unit/contract tests, and production build pass.
- A real server-side Gemini request returned a structured, cited answer to “How can I book an appointment?”.
