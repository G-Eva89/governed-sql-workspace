# Governed SQL Workspace

A TypeScript monorepo for **governed read-only SQL access** — encrypted connection credentials, session auth, and a shared domain layer that will power both a REST API and an MCP server for IDE agents.

**Current status (Week 1 complete):** Docker infrastructure, Pagila sample database, app DB schema, auth API, and connection management.

---

## Prerequisites

| Tool | Version |
|------|---------|
| [Node.js](https://nodejs.org/) | 22+ (required by pnpm 10) |
| [pnpm](https://pnpm.io/) | 10+ (`corepack enable` recommended) |
| [Docker](https://www.docker.com/) | Docker Desktop with WSL integration (Linux/WSL) |

---

## Quick start

From the repo root:

```bash
pnpm install
pnpm setup
pnpm --filter @governed-sql/api dev
```

In another terminal, verify the API:

```bash
curl http://localhost:3001/health
curl http://localhost:3001/ready

curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}' \
  -c cookies.txt

curl http://localhost:3001/connections -b cookies.txt
```

---

## Step-by-step setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start databases and load Pagila

```bash
pnpm dev:up
```

This starts:

| Container | Port | Purpose |
|-----------|------|---------|
| `gsw-app-db` | `5433` | Platform DB (users, connections, audit) |
| `gsw-target-db` | `5434` | Pagila sample data |

Pagila is downloaded automatically on first run and loaded with a read-only `pagila_ro` role.

### 3. Apply app DB migrations and seed data

```bash
pnpm db:migrate
pnpm db:seed
```

On first run, `.env` is created from `.env.example` if missing.

**Seeded admin user:**

| Field | Value |
|-------|-------|
| Email | `admin@example.com` |
| Password | `admin123` |

**Seeded connection:** `Pagila Demo` → `localhost:5434/pagila` (credentials encrypted in app DB).

### 4. Start the API

```bash
pnpm --filter @governed-sql/api dev
```

API listens on **http://localhost:3001**.

---

## Verify everything works

### Databases (no local `psql` required)

```bash
pnpm db:psql:app -c "\dt"
pnpm db:psql:app -c "SELECT email FROM users;"
pnpm db:psql:app -c "SELECT name, host, port FROM connections;"

pnpm db:psql:target -c "SELECT COUNT(*) FROM film;"
```

### API smoke test

```bash
# Health
curl http://localhost:3001/health
curl http://localhost:3001/ready

# Login → session cookie
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}' \
  -c cookies.txt

# Current user
curl http://localhost:3001/auth/me -b cookies.txt

# List connections
curl http://localhost:3001/connections -b cookies.txt

# Test Pagila connection (replace <id> from list response)
curl -X POST http://localhost:3001/connections/<id>/test -b cookies.txt
```

### Run tests

```bash
pnpm --filter @governed-sql/api test
```

Requires Docker running (tests hit the real app DB and Pagila on `localhost:5434`).

---

## API endpoints (Week 1)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | — | Liveness |
| `GET` | `/ready` | — | App DB connectivity |
| `POST` | `/auth/login` | — | Email/password → session cookie |
| `POST` | `/auth/logout` | Session | Clear session |
| `GET` | `/auth/me` | Session | Current user, org, role |
| `GET` | `/connections` | Session | List org connections |
| `GET` | `/connections/:id` | Session | Connection details |
| `POST` | `/connections` | Admin | Register connection (ping + encrypt) |
| `PATCH` | `/connections/:id` | Admin | Update name / status / password |
| `POST` | `/connections/:id/test` | Session | `SELECT 1` against target |

Errors are structured JSON:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid email or password",
    "requestId": "req_a1b2c3d4e5f6"
  }
}
```

---

## Project structure

```
apps/
  api/           Hono REST API (auth, connections)
  mcp-server/    MCP stub (Week 3)
  web/           Next.js UI stub (Week 4)
packages/
  core/          Domain services (AuthService, ConnectionService)
  db/            Drizzle schema, migrations, seed
  schemas/       Shared Zod types
scripts/         dev-up, Pagila seed, psql helpers
docker-compose.yml
```

---

## Scripts reference

| Command | Description |
|---------|-------------|
| `pnpm setup` | Full first-time setup (Docker + Pagila + migrate + seed) |
| `pnpm dev:up` | Start Docker + load Pagila |
| `pnpm docker:up` / `docker:down` | Start/stop containers only |
| `pnpm db:migrate` | Apply app DB migrations |
| `pnpm db:seed` | Seed admin user + Pagila connection |
| `pnpm db:seed-target` | Re-seed Pagila only |
| `pnpm db:psql:app` | Open psql to app DB via Docker |
| `pnpm db:psql:target` | Open psql to Pagila via Docker |
| `pnpm --filter @governed-sql/api dev` | Run API in watch mode |
| `pnpm test` | Run all package tests |
| `pnpm build` | Build all packages |

---

## Configuration

Copy `.env.example` to `.env` (or let `pnpm db:migrate` create it):

```bash
cp .env.example .env
```

Key variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `postgresql://app:app@localhost:5433/workspace_app` | App DB |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | `admin@example.com` / `admin123` | Seed admin |
| `ENCRYPTION_KEY` | dev placeholder | Encrypt connection passwords at rest |
| `SESSION_SECRET` | dev placeholder | Sign session JWT cookies |
| `PORT` | `3001` | API port |

Change secrets before any non-local deployment.

---

## Troubleshooting

### `DATABASE_URL is required`

Run `pnpm db:migrate` — it creates `.env` from `.env.example` automatically. Or copy manually:

```bash
cp .env.example .env
```

### Docker permission denied (WSL)

```bash
sudo usermod -aG docker "$USER"
newgrp docker   # or open a new terminal
```

Enable **Docker Desktop → Settings → Resources → WSL Integration** for your distro.

### `psql: command not found`

Use the Docker-based helpers instead:

```bash
pnpm db:psql:app -c "\dt"
pnpm db:psql:target -c "SELECT COUNT(*) FROM film;"
```

### `set: pipefail: invalid option name` (WSL)

Shell scripts must use LF line endings. If you see this after editing on Windows:

```bash
sed -i 's/\r$//' scripts/*.sh
```

### Pagila seed fails

Ensure target DB is healthy:

```bash
docker compose ps
pnpm db:seed-target
```

### API tests fail

Docker must be running with both databases up and Pagila loaded:

```bash
pnpm dev:up
pnpm db:migrate
pnpm db:seed
pnpm --filter @governed-sql/api test
```

---

## Architecture (Week 1)

```
Browser / curl
      │
      ▼
  apps/api  ──► packages/core  ──► packages/db
      │              │
      │              └──► target-db :5434 (Pagila, pagila_ro)
      │
      └──► app-db :5433 (users, connections, policies, audit)
```

**Two-database rule:** The app DB stores platform metadata and encrypted secrets. Pagila on `:5434` is the only query target — agents must never run arbitrary SQL against the app DB.

---

## What's next (Week 2)

- `PolicyEngine` — reject writes, DDL, multi-statement SQL
- `QueryService` — governed `SELECT` execution with row caps and timeouts
- `MetadataService` — list/describe Pagila tables
- Audit logging for every query

---

## References

- [Pagila sample database](https://github.com/devrimgunduz/pagila)
- [Model Context Protocol](https://modelcontextprotocol.io/)
