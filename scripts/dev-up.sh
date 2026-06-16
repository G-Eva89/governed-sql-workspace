#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=docker-preflight.sh
source "$ROOT_DIR/scripts/docker-preflight.sh"
ensure_docker_access

echo "Starting Docker services (app-db :5433, target-db :5434)..."
docker compose -f "$ROOT_DIR/docker-compose.yml" up -d

echo "Waiting for app-db..."
for _ in $(seq 1 60); do
  if docker exec gsw-app-db pg_isready -U app -d workspace_app >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

bash "$ROOT_DIR/scripts/seed-target-pagila.sh"

echo ""
echo "Dev environment is up:"
echo "  App DB:    postgresql://app:app@localhost:5433/workspace_app"
echo "  Target DB: postgresql://pagila_ro:pagila_ro@localhost:5434/pagila"
echo ""
echo "Next: apply app DB schema and seed admin user:"
echo "  pnpm setup          # or: pnpm db:migrate && pnpm db:seed"
echo "  pnpm --filter @governed-sql/api dev"
echo ""
echo "See README.md for full getting-started guide."
echo ""
echo "Connect with psql (no local client required):"
echo "  pnpm db:psql:app"
echo "  pnpm db:psql:target"
echo "  pnpm db:psql:target -c \"SELECT COUNT(*) FROM film;\""
