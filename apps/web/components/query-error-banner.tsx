type QueryErrorBannerProps = {
  code: string;
  message: string;
};

export function QueryErrorBanner({ code, message }: QueryErrorBannerProps) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-4 py-3"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
        {code}
      </p>
      <p className="mt-1 text-sm text-red-900">{message}</p>
    </div>
  );
}
