#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="/opt/delia"
COMPOSE_DIR="$ROOT_DIR/deploy/low-cost"
ENV_FILE="$COMPOSE_DIR/.env.production"

cd "$ROOT_DIR"
test -f "$ENV_FILE"
test -f "$COMPOSE_DIR/google-credentials.json"

cd "$COMPOSE_DIR"
docker compose --env-file "$ENV_FILE" config --quiet
docker compose --env-file "$ENV_FILE" up -d postgres
docker compose --env-file "$ENV_FILE" build api web
docker compose --env-file "$ENV_FILE" run --rm api \
  npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
docker compose --env-file "$ENV_FILE" up -d --no-deps api web

for attempt in $(seq 1 30); do
  if curl --fail --silent --show-error http://127.0.0.1/api/ready >/dev/null; then
    docker image prune --force --filter 'until=168h' >/dev/null
    echo "Delia release is healthy at $(git -C "$ROOT_DIR" rev-parse HEAD)."
    exit 0
  fi
  sleep 5
done

docker compose --env-file "$ENV_FILE" ps
docker compose --env-file "$ENV_FILE" logs --tail=100 api web
echo 'Delia did not become ready within 150 seconds.' >&2
exit 1
