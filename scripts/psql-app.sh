#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=docker-preflight.sh
source "$ROOT_DIR/scripts/docker-preflight.sh"
ensure_docker_access

CONTAINER="${APP_DB_CONTAINER:-gsw-app-db}"
DB_USER="${APP_DB_USER:-app}"
DB_NAME="${APP_DB_NAME:-workspace_app}"

if [[ $# -eq 0 ]]; then
  exec docker exec -it "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME"
fi

exec docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" "$@"
