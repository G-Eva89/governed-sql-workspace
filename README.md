# Governed SQL Workspace

![CI](https://github.com/G-Eva89/governed-sql-workspace/actions/workflows/ci.yml/badge.svg)

A TypeScript monorepo for **governed read-only SQL access** — encrypted connection credentials, session auth, and a shared domain layer that powers both a REST API and an MCP server for IDE agents.

**Current status (Week 4):** Web UI (login + query workspace), Docker infrastructure, Pagila, governed query gateway, MCP stdio server, audit logging, and GitHub Actions CI.

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
  mcp-server/    MCP stdio server for IDE agents (Cursor, Claude Desktop)
  web/           Next.js UI (login, query workspace)
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
| `pnpm --filter @governed-sql/mcp-server build` | Build MCP server |
| `pnpm --filter @governed-sql/mcp-server dev` | Run MCP server on stdio (watch mode) |
| `pnpm --filter @governed-sql/web dev` | Run Next.js web UI |
| `pnpm test` | Run unit tests (all packages) |
| `pnpm test:integration` | Integration tests only (Docker + Pagila required) |
| `pnpm test:all` | Unit + integration tests (Docker + Pagila required) |
| `pnpm test:ci` | Full local CI: Docker up, migrate, seed Pagila, `test:all` |
| `pnpm lint` | ESLint across the monorepo |
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

## Architecture

```
Browser / curl ──► apps/api ──┐
                              ├──► packages/core ──► target-db :5434 (Pagila)
Cursor / Claude ──► apps/mcp-server ──┘              │
                              │                        │
                              └──► app-db :5433 (users, connections, audit, api_keys)
```

**Two-database rule:** The app DB stores platform metadata and encrypted secrets. Pagila on `:5434` is the only query target — agents must never run arbitrary SQL against the app DB.

---

## MCP server (Cursor / Claude Desktop)

The MCP server uses **stdio transport** and imports `packages/core` directly — the same gateway as the HTTP API. It authenticates with a platform **API key** (not target DB credentials).

### Build

```bash
pnpm --filter @governed-sql/mcp-server build
```

### Get an API key

On first seed, `pnpm db:seed` prints an **MCP Demo** key. Or create one as admin via `POST /api-keys` (see API docs above). Save the `secret` — it is shown only once.

### Cursor MCP config

Add to `.cursor/mcp.json` or Cursor Settings → MCP:

```json
{
  "mcpServers": {
    "governed-sql": {
      "command": "node",
      "args": ["apps/mcp-server/dist/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://app:app@localhost:5433/workspace_app",
        "API_KEY": "gsw_..."
      }
    }
  }
}
```

Use an absolute path to `index.js` if Cursor's working directory differs from the repo root.

| Env variable | Purpose |
|--------------|---------|
| `API_KEY` | Required. Platform API key from seed or `/api-keys` |
| `DATABASE_URL` | App DB connection (defaults to local dev URL) |
| `DEFAULT_CONNECTION_ID` | Optional default when key scope is `*` |

### Tools

| Tool | Description |
|------|-------------|
| `list_tables` | Discover tables/views in a connection |
| `describe_table` | Column metadata for a table |
| `run_query` | Execute governed read-only SQL |
| `get_query_history` | Recent audit events for this API key |

Audit entries from MCP use `source: mcp` and `principalType: api_key`.

### Local dev

```bash
export DATABASE_URL=postgresql://app:app@localhost:5433/workspace_app
export API_KEY=gsw_...
pnpm --filter @governed-sql/mcp-server dev
```

Logs go to **stderr**; stdout is reserved for MCP JSON-RPC.

See [docs/MCP_DEMO.md](./docs/MCP_DEMO.md) for a manual Cursor demo script (discover → describe → query).

---

## Error handling

HTTP and MCP return the same structured error codes. Responses are JSON — never raw stack traces.

| Code | HTTP | Meaning |
|------|------|---------|
| `POLICY_VIOLATION` | 400 | SQL failed policy (writes, DDL, multi-statement, schema allowlist) |
| `UNAUTHORIZED` | 401 | Missing or invalid session/API key |
| `FORBIDDEN` | 403 | Principal cannot access connection (scope or role) |
| `NOT_FOUND` | 404 | Connection or table not found |
| `BAD_REQUEST` | 400 | Invalid input |
| `TIMEOUT` | 504 | Query exceeded `statement_timeout` |
| `CONNECTION_ERROR` | 502 | Target DB unreachable or auth failed |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

**HTTP example**

```json
{
  "error": {
    "code": "POLICY_VIOLATION",
    "message": "DELETE statements are not allowed",
    "requestId": "req_abc123"
  }
}
```

**MCP tool error** (same shape, no `requestId`):

```json
{
  "error": {
    "code": "POLICY_VIOLATION",
    "message": "DELETE statements are not allowed"
  }
}
```

---

## Threat model (MVP)

### Who can do what

| Action | Admin (session) | Member (session) | API key (MCP/HTTP) |
|--------|-----------------|------------------|---------------------|
| Register connections | ✓ | ✗ | ✗ |
| Run governed query | ✓ | ✓ | ✓ (scoped connections) |
| List/describe metadata | ✓ | ✓ | ✓ (scoped connections) |
| View org audit log | ✓ | ✓ | ✗ (use `get_query_history` for own key) |
| Create/revoke API keys | ✓ | ✗ | ✗ |

### Policy layers (defense in depth)

1. **SQL policy engine** — rejects writes, DDL, multi-statement SQL; enforces schema allowlist and blocklisted tables
2. **Postgres read-only role** — target DB user (`pagila_ro`) cannot write even if policy is bypassed
3. **Row cap** — results truncated at connection policy `maxRows` (default 500)
4. **Statement timeout** — queries killed after `maxDurationMs` (default 15s)
5. **API key scoping** — keys limited to specific connection IDs or org-wide `*`
6. **Credential isolation** — target DB passwords encrypted in app DB; MCP env holds platform API key only

### Threat mitigations

| Threat | Mitigation |
|--------|------------|
| Agent runs destructive SQL | PolicyEngine + read-only DB role |
| Agent exfiltrates unlimited rows | Row cap + timeout |
| Stolen API key | Scoped key, audit trail, revoke via `DELETE /api-keys/:id` |
| SQL injection via table names | Parameterized metadata queries; validated table identifiers |
| MCP bypasses gateway | Single code path through `packages/core` (`QueryService`, `MetadataService`) |
| Credentials in logs | Encrypted at rest; secrets never returned from API |

### Known limitations (MVP)

- Compromised `ENCRYPTION_KEY` exposes all stored connection passwords
- Advanced SQL parser bypasses mitigated by DB role, not eliminated
- No rate limiting per API key yet
- Org-wide (`*`) keys require explicit `connectionId` on each tool call

---

## Testing

### Local commands

```bash
# Unit tests only (no Docker required for policy/SQL parser tests)
pnpm test

# Integration tests (requires Docker + Pagila)
pnpm test:integration

# Unit + integration
pnpm test:all

# Full CI-style run (recommended before pushing)
pnpm test:ci
```

`pnpm test:ci` starts Docker Compose, waits for both Postgres containers, applies migrations, seeds the app DB and Pagila, then runs `pnpm test:all`.

### Continuous integration

GitHub Actions runs on every push to `main`/`master` and on pull requests:

| Job | Command | Purpose |
|-----|---------|---------|
| **Lint** | `pnpm lint` | ESLint across packages |
| **Test** | `pnpm test:ci` | Docker Compose + unit + integration tests |

Workflow file: [`.github/workflows/ci.yml`](./.github/workflows/ci.yml)

**Single code path proof** — `apps/mcp-server/src/shared-path.integration.test.ts` runs the same SQL via HTTP (session + Bearer) and MCP handlers, asserting identical query results and equivalent audit rows (differing only by `source`, `principalType`, `mcpTool`).

---

## References

- [Pagila sample database](https://github.com/devrimgunduz/pagila)
- [Model Context Protocol](https://modelcontextprotocol.io/)
