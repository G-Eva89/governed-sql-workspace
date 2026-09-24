import type { AuditEventPublic } from "@governed-sql/schemas";

const STATUS_STYLES: Record<AuditEventPublic["status"], string> = {
  success: "bg-emerald-100 text-emerald-800",
  error: "bg-red-100 text-red-800",
  policy_violation: "bg-amber-100 text-amber-800",
};

const SOURCE_STYLES: Record<AuditEventPublic["source"], string> = {
  web: "bg-zinc-100 text-zinc-700",
  mcp: "bg-indigo-100 text-indigo-800",
  api: "bg-sky-100 text-sky-800",
};

export function AuditStatusBadge({ status }: { status: AuditEventPublic["status"] }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

export function AuditSourceBadge({ source }: { source: AuditEventPublic["source"] }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium uppercase ${SOURCE_STYLES[source]}`}
    >
      {source}
    </span>
  );
}
