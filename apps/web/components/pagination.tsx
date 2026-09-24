import Link from "next/link";

type PaginationProps = {
  basePath: string;
  page: number;
  totalPages: number;
  total: number;
};

export function Pagination({ basePath, page, totalPages, total }: PaginationProps) {
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <div className="flex items-center justify-between text-xs text-zinc-600">
      <span>
        Page {page} of {Math.max(totalPages, 1)} &middot; {total} total
      </span>
      <div className="flex gap-2">
        <PageLink basePath={basePath} page={page - 1} disabled={!hasPrev}>
          Previous
        </PageLink>
        <PageLink basePath={basePath} page={page + 1} disabled={!hasNext}>
          Next
        </PageLink>
      </div>
    </div>
  );
}

function PageLink({
  basePath,
  page,
  disabled,
  children,
}: {
  basePath: string;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="cursor-not-allowed rounded-lg border border-zinc-200 px-3 py-1.5 font-medium text-zinc-400">
        {children}
      </span>
    );
  }

  return (
    <Link
      href={`${basePath}?page=${page}`}
      className="rounded-lg border border-zinc-300 px-3 py-1.5 font-medium text-zinc-700 transition hover:bg-zinc-100"
    >
      {children}
    </Link>
  );
}
