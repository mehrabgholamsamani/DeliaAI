# Stage 2 CRM and booking domain

## Implemented

- Prisma models and migration for business settings, services, customers, bookings, availability overrides, admin users, and audit logs.
- Seed-on-first-use business settings and starter services.
- Public APIs:
  - `GET /api/business`
  - `GET /api/services`
  - `GET /api/availability?start=YYYY-MM-DD&days=14&serviceId=...`
  - `POST /api/bookings`
  - `POST /api/bookings/manage`
  - `PATCH /api/bookings/manage`
  - `PATCH /api/bookings/manage/cancel`
- Customer booking management uses a 256-bit random token. Only its SHA-256 hash is stored, it expires after 30 days, and it is returned only once after creation.
- Booking creation and rescheduling use serializable database transactions, validate supported business slots, reject busy overrides, and reject overlapping active bookings.
- Every booking/service/availability mutation writes an audit record.
- Admin APIs require `x-admin-token` to match the server-side `ADMIN_API_TOKEN` environment value:
  - `GET /api/admin/bookings`
  - `GET /api/admin/services`
  - `POST /api/admin/services`
  - `POST /api/admin/availability-overrides`

## Verification

- Typecheck, lint, production build, and contract tests pass.
- Prisma client generation passes.
- The local database migration was applied successfully to the isolated Docker PostgreSQL instance on port 5433. Live API checks confirmed services, availability, booking creation, and secure cancellation.

## Next stage dependency

Stage 3 will consume these APIs to build the public booking, booking-management, and admin interfaces.
