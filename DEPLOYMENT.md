# Production deployment

## Architecture

- Web: Vercel hosts the `apps/web` Vite build.
- API: Render hosts the NestJS Docker service in `apps/api/Dockerfile`.
- Database: managed PostgreSQL.

The browser connects directly to the API origin in production. This is required for Socket.IO voice/chat traffic because Vercel's static deployment and serverless rewrites do not proxy WebSocket upgrades.

## API deployment

Use `render.yaml` or deploy the included Dockerfile. Set:

- `NODE_ENV=production`
- `DATABASE_URL` — PostgreSQL connection string
- `WEB_ORIGIN` — exact public Vercel URL, such as `https://example.vercel.app`
- `ADMIN_API_TOKEN` — random secret of at least 32 characters
- `GEMINI_API_KEY` — optional; without it, the receptionist gives a safe handoff response
- `GEMINI_MODEL` — optional, defaults to `gemini-3.1-flash-lite`

The container runs `prisma migrate deploy` before starting the API. Verify `https://<api-host>/api/ready` after deployment.

## Web deployment

Vercel builds the `apps/web` workspace via `vercel.json`. Set this build-time environment variable:

- `VITE_API_ORIGIN=https://<api-host>`

Do not append `/api`: the web client adds that prefix itself. The API must allow the Vercel URL through `WEB_ORIGIN`; both REST requests and Socket.IO then use the same configured API origin.

## Release checks

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run build:platform
npm run test:smoke
```

Confirm bookings, booking-management links, admin access, receptionist chat, and a Socket.IO voice turn using the deployed Vercel URL.
