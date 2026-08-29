#!/usr/bin/env sh
set -eu

cd /opt/delia/deploy/low-cost
mkdir -p /opt/delia/backups
umask 077

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
docker compose --env-file .env.production exec -T postgres \
  pg_dump -U receptionist -d ai_receptionist --format=custom \
  > "/opt/delia/backups/delia-${timestamp}.dump"

find /opt/delia/backups -type f -name 'delia-*.dump' -mtime +7 -delete
