# Production readiness and deployment

## Required secrets

Set `DATABASE_URL`, `GEMINI_API_KEY`, `ADMIN_API_TOKEN`, and `WEB_ORIGIN` in the hosting provider. Do not place any of them in the frontend or commit them. Use `.env.production.example` as the inventory.

## Deployment sequence

1. Provision PostgreSQL and run `npx prisma migrate deploy --schema apps/api/prisma/schema.prisma`.
2. Build with `npm run build:platform`.
3. Deploy the static `apps/web/dist` output and the NestJS API separately, or deploy the API using `apps/api/Dockerfile`.
4. Configure the frontend `/api` and `/socket.io` proxy to the API origin.
5. Verify `GET /api/health`, `GET /api/ready`, booking, receptionist chat, and voice chat.

## Privacy and retention

Raw microphone audio is never uploaded or stored. Browser speech recognition and browser speech synthesis are used locally by the browser. Conversation text, compact summaries, action drafts, audit records, and Gemini usage metrics are persisted only to operate the service. Before production, set a retention period and implement scheduled deletion for conversation/audit data in accordance with the business's privacy notice and applicable law.

## Operational controls

- HTTP requests are protected by Helmet, CORS, request validation, and a global 60 requests/minute throttle.
- Booking mutations require secure management tokens or the server-side administrator token.
- Gemini failures degrade to a human-handoff response.
- `/api/health` checks process liveness; `/api/ready` confirms database connectivity.
