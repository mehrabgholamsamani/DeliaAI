# Stage 7 production readiness

## Delivered

- Global HTTP rate limiting (60 requests per minute), Helmet, CORS, DTO validation, and server-side secret boundaries.
- Liveness endpoint at `/api/health` and database readiness endpoint at `/api/ready`.
- Production environment inventory in `.env.production.example`.
- API Dockerfile and deployment/runbook in [production.md](production.md).
- Privacy and data-retention guidance: no raw audio storage, stored conversation metadata identified, and production retention policy requirement documented.

## Release verification

`npm run typecheck`, `npm run build:platform`, `npm test`, and `npm run lint` all pass.

## External production steps

The remaining user-owned steps are provisioning a deployment provider/PostgreSQL database, placing real secrets in that provider, setting a domain if desired, applying migrations, and performing device/browser voice acceptance testing.
