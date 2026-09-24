import { AuditLogTable } from "@/components/audit-log-table";
import { Pagination } from "@/components/pagination";
import { listAuditEvents } from "@/lib/server-api";

type AuditPageProps = {
  searchParams: Promise<{ page?: string }>;
};

export default async function AuditPage({ searchParams }: AuditPageProps) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const result = await listAuditEvents(page);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Audit log</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Every governed query attempt, from the web app, the API, and MCP agents.
        </p>
      </div>

      {result ? (
        <>
          <AuditLogTable events={result.events} />
          <Pagination
            basePath="/audit"
            page={result.page}
            totalPages={result.totalPages}
            total={result.total}
          />
        </>
      ) : (
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-zinc-500">Unable to load the audit log.</p>
        </div>
      )}
    </div>
  );
}
