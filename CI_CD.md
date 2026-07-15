# CI/CD

This project uses one GitHub Actions workflow: `.github/workflows/ci-cd.yml`.

## What It Does

On pull requests and pushes to `main`, it:

1. Installs dependencies with `npm ci`.
2. Builds the React client and Express server with `npm run build`.
3. Installs the Chromium browser used by the frontend smoke tests.
4. Audits production dependencies with `npm audit --omit=dev`.
5. Runs frontend smoke tests against the Vite client with mocked API responses.
6. Runs the API test suite against a temporary MongoDB service container.

On pushes to `main`, it deploys only after verification passes.

## Required Secrets

Add these repository secrets only when you are ready for automatic deploys:

- `RENDER_DEPLOY_HOOK_URL`: Render deploy hook for the backend service.
- `VERCEL_DEPLOY_HOOK_URL`: Vercel deploy hook for the frontend project.

If you want CI to be the release gate, prefer deploy hooks over automatic deploy-on-push. If you use Vercel's Git integration, make sure production deploys require the GitHub check to pass, or omit `VERCEL_DEPLOY_HOOK_URL` and accept that Vercel handles its own deployment timing.

## Render Settings

Use `render.yaml` as the backend Blueprint, or configure the service manually:

- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Health check path: `/api/ready`
- Environment: production variables from `.env.production.example`

## Vercel Settings

Use `vercel.json` for the frontend. It builds the Vite client and uses `api/[...path].js` to proxy `/api/*` to Render.

Set this Vercel environment variable:

- `RENDER_BACKEND_URL`: the Render backend origin, for example `https://your-render-service.onrender.com`

Do not make the browser call the Render API directly unless the app's cookie and CORS settings are intentionally changed and retested.

## Release Rule

Only `main` deploys. Pull requests verify but do not deploy.

Protect the `main` branch in GitHub and require the `Verify app` check before merge. That keeps production deploys behind the same gate as pull requests.

## Rollback

Use Render and Vercel's previous deploy rollback controls. Database rollback should use MongoDB Atlas backups, not CI.
