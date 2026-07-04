# MCP Demo Script (Cursor)

Use this script to validate the full agent flow after `pnpm setup` and MCP configuration.

**Prerequisites**

- Docker running with Pagila loaded (`pnpm dev:up`, `pnpm db:migrate`, `pnpm db:seed`)
- MCP server built: `pnpm --filter @governed-sql/mcp-server build`
- Cursor MCP config pointing at `apps/mcp-server/dist/index.js` with `DATABASE_URL` and `API_KEY`
- API key scoped to the Pagila connection (printed on first seed or via `POST /api-keys`)

Restart Cursor after changing MCP settings so the server reconnects.

---

## Prompt 1 — Discover tables

> What tables are available in the governed Pagila database? Use the MCP tools to list them.

**Expected agent behavior**

- Calls `list_tables` (schema `public`)
- Mentions tables such as `film`, `rental`, `customer`, `inventory`

**Verify in audit log** (optional, via API):

```bash
curl http://localhost:3001/audit?limit=5 -b cookies.txt
```

Look for `action: list_tables`, `source: mcp`, `status: success`.

---

## Prompt 2 — Describe a table

> Describe the columns of the `film` table so I know how to query it.

**Expected agent behavior**

- Calls `describe_table` with `table: film`
- Lists columns including `film_id`, `title`, `release_year`, `rating`

---

## Prompt 3 — Run a governed query

> Run a read-only query to show the top 5 films by title from the film table.

**Expected agent behavior**

- Calls `run_query` with SQL similar to:
  `SELECT film_id, title FROM film ORDER BY title LIMIT 5`
- Returns 5 rows with column names

**Policy checks to try manually**

Ask the agent: *"Delete all films where rating is NC-17"*

- Should fail with `POLICY_VIOLATION` (structured error, not a stack trace)
- Audit log should show `status: policy_violation`, `source: mcp`

---

## Prompt 4 (optional) — Query history

> Show my recent query history for this connection.

**Expected agent behavior**

- Calls `get_query_history`
- Returns prior `run_query` audit entries for this API key

---

## Success checklist

- [ ] All three core prompts work without pasting DB credentials into chat
- [ ] `list_tables` finds `film` and `rental`
- [ ] `describe_table` returns `film` columns
- [ ] `run_query` returns governed SELECT results
- [ ] Destructive SQL is rejected with `POLICY_VIOLATION`
- [ ] Audit log distinguishes `source: mcp` from web/API queries

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| MCP server fails to start | Check `API_KEY` is set and starts with `gsw_` |
| `Invalid API key` | Create a new key via `POST /api-keys` or re-seed |
| Empty table list | Ensure Pagila is loaded: `pnpm db:seed-target` |
| Connection errors | Confirm Docker containers healthy: `docker compose ps` |

Run automated proof tests:

```bash
pnpm --filter @governed-sql/mcp-server test:integration
pnpm --filter @governed-sql/api test:integration
```
