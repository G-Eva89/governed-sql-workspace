"use client";

import { useState, type FormEvent } from "react";
import type { ConnectionPublic } from "@governed-sql/schemas";
import {
  ApiClientError,
  createConnection,
  testConnection,
  updateConnection,
} from "@/lib/api";
import { formatDateTime } from "@/lib/format-cell";
import { QueryErrorBanner } from "@/components/query-error-banner";

type ConnectionsManagerProps = {
  connections: ConnectionPublic[];
  isAdmin: boolean;
};

const SSL_MODES = ["disable", "require", "prefer", "verify-full"] as const;

const EMPTY_FORM = {
  name: "",
  host: "",
  port: "5432",
  database: "",
  username: "",
  password: "",
  sslMode: "disable" as (typeof SSL_MODES)[number],
};

export function ConnectionsManager({ connections, isAdmin }: ConnectionsManagerProps) {
  const [items, setItems] = useState(connections);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<{ code: string; message: string } | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rowMessages, setRowMessages] = useState<
    Record<string, { ok: boolean; text: string }>
  >({});
  const [pendingRowId, setPendingRowId] = useState<string | null>(null);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      const created = await createConnection({
        name: form.name.trim(),
        host: form.host.trim(),
        port: Number.parseInt(form.port, 10),
        database: form.database.trim(),
        username: form.username.trim(),
        password: form.password,
        sslMode: form.sslMode,
      });
      setItems((current) => [created, ...current]);
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setFormError({ code: err.code, message: err.message });
      } else {
        setFormError({ code: "CONNECTION_ERROR", message: "Unable to reach the API." });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleTest(connectionId: string) {
    setPendingRowId(connectionId);

    try {
      const result = await testConnection(connectionId);
      setRowMessages((current) => ({
        ...current,
        [connectionId]: { ok: true, text: result.message },
      }));
    } catch (err) {
      const message =
        err instanceof ApiClientError ? err.message : "Unable to reach the API.";
      setRowMessages((current) => ({ ...current, [connectionId]: { ok: false, text: message } }));
    } finally {
      setPendingRowId(null);
    }
  }

  async function handleToggleStatus(connection: ConnectionPublic) {
    const nextStatus = connection.status === "active" ? "disabled" : "active";
    setPendingRowId(connection.id);

    try {
      const updated = await updateConnection(connection.id, { status: nextStatus });
      setItems((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (err) {
      const message =
        err instanceof ApiClientError ? err.message : "Unable to reach the API.";
      setRowMessages((current) => ({
        ...current,
        [connection.id]: { ok: false, text: message },
      }));
    } finally {
      setPendingRowId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Connections</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Target databases that queries can run against.
          </p>
        </div>
        {isAdmin ? (
          <button
            type="button"
            onClick={() => setShowForm((value) => !value)}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800"
          >
            {showForm ? "Cancel" : "New connection"}
          </button>
        ) : null}
      </div>

      {showForm ? (
        <form
          onSubmit={handleCreate}
          className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="name">
              <input
                id="name"
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                className={inputClassName}
              />
            </Field>
            <Field label="Host" htmlFor="host">
              <input
                id="host"
                required
                value={form.host}
                onChange={(event) => setForm({ ...form, host: event.target.value })}
                className={inputClassName}
              />
            </Field>
            <Field label="Port" htmlFor="port">
              <input
                id="port"
                type="number"
                required
                min={1}
                max={65535}
                value={form.port}
                onChange={(event) => setForm({ ...form, port: event.target.value })}
                className={inputClassName}
              />
            </Field>
            <Field label="Database" htmlFor="database">
              <input
                id="database"
                required
                value={form.database}
                onChange={(event) => setForm({ ...form, database: event.target.value })}
                className={inputClassName}
              />
            </Field>
            <Field label="Username" htmlFor="username">
              <input
                id="username"
                required
                value={form.username}
                onChange={(event) => setForm({ ...form, username: event.target.value })}
                className={inputClassName}
              />
            </Field>
            <Field label="Password" htmlFor="password">
              <input
                id="password"
                type="password"
                required
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                className={inputClassName}
              />
            </Field>
            <Field label="SSL mode" htmlFor="sslMode">
              <select
                id="sslMode"
                value={form.sslMode}
                onChange={(event) =>
                  setForm({
                    ...form,
                    sslMode: event.target.value as (typeof SSL_MODES)[number],
                  })
                }
                className={inputClassName}
              >
                {SSL_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {formError ? (
            <QueryErrorBanner code={formError.code} message={formError.message} />
          ) : null}

          <div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Creating…" : "Create connection"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-zinc-200 text-left text-sm">
          <thead className="bg-zinc-50">
            <tr>
              {["Name", "Target", "SSL", "Status", "Created", ""].map((label) => (
                <th
                  key={label}
                  className="whitespace-nowrap px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-600"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-zinc-500">
                  No connections registered yet.
                </td>
              </tr>
            ) : (
              items.map((connection) => (
                <tr key={connection.id} className="align-top hover:bg-zinc-50/80">
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-zinc-900">
                    {connection.name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-zinc-600">
                    {connection.username}@{connection.host}:{connection.port}/
                    {connection.database}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-zinc-600">
                    {connection.sslMode}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        connection.status === "active"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-zinc-200 text-zinc-700"
                      }`}
                    >
                      {connection.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-zinc-500">
                    {formatDateTime(connection.createdAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <div className="flex flex-col items-end gap-1.5">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={pendingRowId === connection.id}
                          onClick={() => void handleTest(connection.id)}
                          className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Test
                        </button>
                        {isAdmin ? (
                          <button
                            type="button"
                            disabled={pendingRowId === connection.id}
                            onClick={() => void handleToggleStatus(connection)}
                            className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {connection.status === "active" ? "Disable" : "Enable"}
                          </button>
                        ) : null}
                      </div>
                      {rowMessages[connection.id] ? (
                        <span
                          className={`text-xs ${
                            rowMessages[connection.id]?.ok
                              ? "text-emerald-700"
                              : "text-red-700"
                          }`}
                        >
                          {rowMessages[connection.id]?.text}
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const inputClassName =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-emerald-500/0 transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20";

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-zinc-700">
        {label}
      </label>
      {children}
    </div>
  );
}
