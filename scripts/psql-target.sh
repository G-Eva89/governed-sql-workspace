#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=docker-preflight.sh
source "$ROOT_DIR/scripts/docker-preflight.sh"
ensure_docker_access

CONTAINER="${TARGET_DB_CONTAINER:-gsw-target-db}"
DB_USER="${TARGET_DB_USER:-pagila_ro}"
DB_NAME="${TARGET_DB_NAME:-pagila}"

if [[ $# -eq 0 ]]; then
  exec docker exec -it "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME"
fi

exec docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" "$@"
