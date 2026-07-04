"use client";

import type { ConnectionPublic, QueryResult } from "@governed-sql/schemas";
import { useState, type KeyboardEvent } from "react";
import { ApiClientError, runQuery } from "@/lib/api";
import { QueryErrorBanner } from "@/components/query-error-banner";
import { QueryResultsTable } from "@/components/query-results-table";

const DEFAULT_SQL = "SELECT title FROM film LIMIT 5";

type QueryWorkspaceProps = {
  connections: ConnectionPublic[];
};

type QueryError = {
  code: string;
  message: string;
};

export function QueryWorkspace({ connections }: QueryWorkspaceProps) {
  const [selectedConnectionId, setSelectedConnectionId] = useState(
    connections[0]?.id ?? "",
  );
  const [sql, setSql] = useState(DEFAULT_SQL);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<QueryError | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  async function handleRun() {
    if (!selectedConnectionId) {
      setError({
        code: "BAD_REQUEST",
        message: "Select a connection before running a query.",
      });
      return;
    }

    const trimmedSql = sql.trim();
    if (!trimmedSql) {
      setError({
        code: "BAD_REQUEST",
        message: "Enter a SQL statement to run.",
      });
      return;
    }

    setIsRunning(true);
    setError(null);
    setResult(null);

    try {
      const queryResult = await runQuery(selectedConnectionId, { sql: trimmedSql });
      setResult(queryResult);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError({ code: err.code, message: err.message });
      } else {
        setError({
          code: "CONNECTION_ERROR",
          message: "Unable to run query. Is the API running?",
        });
      }
    } finally {
      setIsRunning(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void handleRun();
    }
  }

  if (connections.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-zinc-900">Query workspace</h1>
        <p className="mt-2 text-sm text-zinc-600">
          No active connections are registered for your organization. Run{" "}
          <span className="font-mono text-zinc-800">pnpm db:seed</span> to add
          the Pagila demo connection.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Query workspace</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Run governed read-only SQL against a registered connection.
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-zinc-200 p-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label
              htmlFor="connection"
              className="text-sm font-medium text-zinc-700"
            >
              Connection
            </label>
            <select
              id="connection"
              value={selectedConnectionId}
              onChange={(event) => setSelectedConnectionId(event.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-emerald-500/0 transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            >
              {connections.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {connection.name} ({connection.database}@{connection.host}:
                  {connection.port})
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => void handleRun()}
            disabled={isRunning}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRunning ? "Running…" : "Run query"}
          </button>
        </div>

        <div className="p-4">
          <label
            htmlFor="sql"
            className="mb-1.5 block text-sm font-medium text-zinc-700"
          >
            SQL
          </label>
          <textarea
            id="sql"
            value={sql}
            onChange={(event) => setSql(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={8}
            spellCheck={false}
            className="w-full resize-y rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 font-mono text-sm text-zinc-900 outline-none ring-emerald-500/0 transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
            placeholder="SELECT ..."
          />
          <p className="mt-2 text-xs text-zinc-500">
            Only read-only statements are allowed. Press Ctrl+Enter to run.
          </p>
        </div>
      </div>

      {error ? <QueryErrorBanner code={error.code} message={error.message} /> : null}

      {result ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">Results</h2>
          <QueryResultsTable result={result} />
        </div>
      ) : null}
    </div>
  );
}
