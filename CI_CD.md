# CI/CD

## Verification

`.github/workflows/verify.yml` runs for pull requests and pushes to `main`:

- clean `npm ci` install;
- lint and TypeScript checks;
- API unit tests;
- complete production build;
- production dependency audit;
- Chromium smoke tests;
- Terraform formatting and validation.

Protect `main` and require the **Verify app** check before merging.

## AWS deployment

`.github/workflows/deploy-aws.yml` is manual and protected by GitHub Environments. It uses GitHub OIDC, not permanent AWS keys. The workflow:

1. validates environment configuration;
2. deploys the foundation stack;
3. builds and pushes an immutable API image to ECR;
4. deploys new API and migration task definitions;
5. runs and verifies the one-off migration task;
6. deploys the ECS service revision;
7. builds and uploads the SPA to Amplify;
8. waits for the public API readiness endpoint.

Production should require environment reviewers in GitHub. Keep staging and production AWS roles, secrets, databases, and domains separate.
