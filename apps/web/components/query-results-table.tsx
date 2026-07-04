import type { QueryResult } from "@governed-sql/schemas";
import { formatCellValue } from "@/lib/format-cell";

type QueryResultsTableProps = {
  result: QueryResult;
};

export function QueryResultsTable({ result }: QueryResultsTableProps) {
  if (result.columns.length === 0) {
    return (
      <p className="text-sm text-zinc-500">Query returned no columns.</p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">
        <span>
          {result.rowCount} row{result.rowCount === 1 ? "" : "s"}
        </span>
        {result.truncated ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            Truncated
          </span>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200">
        <table className="min-w-full divide-y divide-zinc-200 text-left text-sm">
          <thead className="bg-zinc-50">
            <tr>
              {result.columns.map((column) => (
                <th
                  key={column}
                  className="whitespace-nowrap px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wide text-zinc-600"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 bg-white">
            {result.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={result.columns.length}
                  className="px-4 py-6 text-center text-sm text-zinc-500"
                >
                  No rows returned.
                </td>
              </tr>
            ) : (
              result.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="hover:bg-zinc-50/80">
                  {result.columns.map((column) => (
                    <td
                      key={`${rowIndex}-${column}`}
                      className="whitespace-nowrap px-4 py-2 font-mono text-xs text-zinc-800"
                    >
                      {formatCellValue(row[column])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
