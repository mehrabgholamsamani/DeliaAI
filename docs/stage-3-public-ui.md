# Stage 3 public booking UI

## Delivered

- Responsive public landing page, services catalogue, booking flow, secure manage-booking flow, and admin operations page.
- Booking form loads services and real availability from NestJS, requires an explicit time selection, and redirects to the secure management link after a successful create.
- Management page retrieves a booking only through its token, supports fresh-availability rescheduling, and requires a browser confirmation before cancellation.
- Admin operations page requests the administrator's server-side token at use time; it does not embed or persist it in the frontend bundle.
- Loading, validation, unavailable API, booking conflict, and empty-state messaging are surfaced in the UI.

## Live verification

- The local Docker PostgreSQL instance is running on port 5433.
- Both Prisma migrations applied successfully.
- The isolated NestJS API returned services and available slots from the real database.
- A real test booking was created with the API and cancelled with its one-time management token.

## Local start

Copy `.env.example` to `.env`, configure a random `ADMIN_API_TOKEN` for admin API calls, then run:

```powershell
docker compose up -d postgres
npm run db:migrate
npm run dev
```

If a legacy application is using port 4000, stop it before starting the new platform or configure a different `API_PORT` and matching Vite proxy.
