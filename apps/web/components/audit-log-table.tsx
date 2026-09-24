import type { AuditEventPublic } from "@governed-sql/schemas";
import { formatDateTime, formatDurationMs } from "@/lib/format-cell";
import { AuditSourceBadge, AuditStatusBadge } from "@/components/audit-status-badge";

type AuditLogTableProps = {
  events: AuditEventPublic[];
};

export function AuditLogTable({ events }: AuditLogTableProps) {
  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm text-zinc-500">No audit events yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-zinc-200 text-left text-sm">
        <thead className="bg-zinc-50">
          <tr>
            <th className="whitespace-nowrap px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">
              Time
            </th>
            <th className="whitespace-nowrap px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">
              Principal
            </th>
            <th className="whitespace-nowrap px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">
              Source
            </th>
            <th className="whitespace-nowrap px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">
              Action
            </th>
            <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">
              SQL
            </th>
            <th className="whitespace-nowrap px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">
              Status
            </th>
            <th className="whitespace-nowrap px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">
              Rows
            </th>
            <th className="whitespace-nowrap px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">
              Duration
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {events.map((event) => (
            <tr key={event.id} className="hover:bg-zinc-50/80">
              <td className="whitespace-nowrap px-4 py-2 text-xs text-zinc-600">
                {formatDateTime(event.createdAt)}
              </td>
              <td className="whitespace-nowrap px-4 py-2 text-xs text-zinc-800">
                <span className="capitalize">{event.principalType.replace("_", " ")}</span>
              </td>
              <td className="whitespace-nowrap px-4 py-2">
                <AuditSourceBadge source={event.source} />
                {event.mcpTool ? (
                  <span className="ml-1.5 font-mono text-xs text-zinc-500">
                    {event.mcpTool}
                  </span>
                ) : null}
              </td>
              <td className="whitespace-nowrap px-4 py-2 text-xs text-zinc-800">
                {event.action}
              </td>
              <td className="max-w-xs truncate px-4 py-2 font-mono text-xs text-zinc-700">
                {event.sqlPreview ?? "—"}
              </td>
              <td className="whitespace-nowrap px-4 py-2">
                <AuditStatusBadge status={event.status} />
                {event.errorCode ? (
                  <span className="ml-1.5 font-mono text-xs text-red-700">
                    {event.errorCode}
                  </span>
                ) : null}
              </td>
              <td className="whitespace-nowrap px-4 py-2 text-xs text-zinc-700">
                {event.rowCount ?? "—"}
              </td>
              <td className="whitespace-nowrap px-4 py-2 text-xs text-zinc-700">
                {formatDurationMs(event.durationMs)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
