"use client";

import { useRouter } from "next/navigation";
import type { AuthMeResponse } from "@governed-sql/schemas";
import { logout } from "@/lib/api";

type AppShellProps = {
  session: AuthMeResponse;
  children: React.ReactNode;
};

export function AppShell({ session, children }: AppShellProps) {
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-full flex-col bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold tracking-tight text-zinc-900">
              Governed SQL
            </span>
            <span className="hidden text-xs text-zinc-400 sm:inline">|</span>
            <span className="hidden text-xs text-zinc-500 sm:inline">
              {session.org.name}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right text-xs text-zinc-600">
              <p className="font-medium text-zinc-900">{session.user.email}</p>
              <p className="capitalize text-zinc-500">{session.role}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
