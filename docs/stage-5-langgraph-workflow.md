# Stage 5 LangGraph receptionist workflow

## Delivered

- `@langchain/langgraph` state graph for receptionist action-draft orchestration.
- Durable PostgreSQL `ReceptionistActionDraft` records with session ownership, 10-minute expiry, pending/executed states, and audit logging.
- Strict allow-listed action schemas for create booking, update booking, and cancel booking.
- `POST /api/receptionist/actions/prepare` creates a graph-backed draft and returns a human-readable confirmation statement. It performs no CRM mutation.
- `POST /api/receptionist/actions/confirm` requires the same conversation session, draft ID, and `confirmed: true`, then invokes the relevant validated NestJS CRM operation exactly once.
- Customer booking authorization remains enforced for update/cancel through the pre-existing secure management token.

## Safety model

The LLM cannot execute database operations. It may identify a task and guide the visitor, but NestJS validates the exact typed payload, LangGraph persists a pending action, and only a separate explicit confirmation can execute it. Invalid, cross-session, expired, or already-executed drafts are rejected.

## Live verification

- Stage 5 migration applied to local PostgreSQL.
- A conversation session was created, then a LangGraph create-booking draft was prepared and confirmed.
- The booking was created only after confirmation and was then cancelled during test cleanup.
- Typecheck, lint, tests, and production build pass.
