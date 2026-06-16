#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PAGILA_DIR="$ROOT_DIR/third_party/pagila"
SCHEMA_FILE="$PAGILA_DIR/pagila-schema.sql"
DATA_FILE="$PAGILA_DIR/pagila-data.sql"
RO_SQL="$ROOT_DIR/scripts/create-pagila-ro.sql"

PAGILA_REPO="https://raw.githubusercontent.com/devrimgunduz/pagila/master"
TARGET_CONTAINER="${TARGET_DB_CONTAINER:-gsw-target-db}"
TARGET_HOST="${TARGET_DB_HOST:-localhost}"
TARGET_PORT="${TARGET_DB_PORT:-5434}"
TARGET_SUPERUSER="${TARGET_DB_SUPERUSER:-postgres}"
TARGET_SUPERPASS="${TARGET_DB_SUPERPASS:-postgres}"

# shellcheck source=docker-preflight.sh
source "$ROOT_DIR/scripts/docker-preflight.sh"
ensure_docker_access

mkdir -p "$PAGILA_DIR"

download_if_missing() {
  local url="$1"
  local dest="$2"
  if [[ ! -f "$dest" ]]; then
    echo "Downloading $(basename "$dest")..."
    curl -fsSL "$url" -o "$dest"
  fi
}

download_if_missing "$PAGILA_REPO/pagila-schema.sql" "$SCHEMA_FILE"
download_if_missing "$PAGILA_REPO/pagila-data.sql" "$DATA_FILE"

wait_for_postgres() {
  echo "Waiting for target-db on ${TARGET_HOST}:${TARGET_PORT}..."
  for _ in $(seq 1 60); do
    if docker exec "$TARGET_CONTAINER" pg_isready -U "$TARGET_SUPERUSER" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "target-db did not become ready in time" >&2
  exit 1
}

psql_exec() {
  docker exec -i "$TARGET_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$TARGET_SUPERUSER" "$@"
}

is_pagila_seeded() {
  psql_exec -d pagila -tAc "SELECT to_regclass('public.film') IS NOT NULL;" 2>/dev/null | tr -d '[:space:]' | grep -q '^t$'
}

wait_for_postgres

if ! psql_exec -tAc "SELECT 1 FROM pg_database WHERE datname = 'pagila';" | grep -q 1; then
  echo "Creating pagila database..."
  psql_exec -c "CREATE DATABASE pagila;"
fi

if is_pagila_seeded; then
  echo "Pagila already loaded; skipping schema/data import."
else
  echo "Loading Pagila schema..."
  psql_exec -d pagila < "$SCHEMA_FILE"
  echo "Loading Pagila data (this may take a minute)..."
  psql_exec -d pagila < "$DATA_FILE"
fi

echo "Creating pagila_ro read-only role..."
psql_exec -d pagila < "$RO_SQL"

echo "Verifying Pagila..."
film_count="$(psql_exec -d pagila -tAc "SELECT COUNT(*) FROM film;")"
echo "Pagila ready: ${film_count} films in public.film"

echo "Read-only smoke test (pagila_ro)..."
docker exec -i "$TARGET_CONTAINER" psql -v ON_ERROR_STOP=1 -U pagila_ro -d pagila -c "SELECT COUNT(*) AS film_count FROM film;" >/dev/null
echo "pagila_ro can SELECT from Pagila."

echo "Done. Connect with:"
echo "  psql postgresql://pagila_ro:pagila_ro@localhost:${TARGET_PORT}/pagila"
