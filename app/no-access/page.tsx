import Link from "next/link";
import type { Metadata } from "next";
import { PERMISSIONS, type PermKey } from "@/lib/permissions";

export const metadata: Metadata = { title: "No access" };

export default async function NoAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ feature?: string }>;
}) {
  const { feature } = await searchParams;
  const def = PERMISSIONS.find((p) => p.key === (feature as PermKey));

  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-7 text-center shadow-lg">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-warning-subtle text-warning">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-6 w-6"
            aria-hidden
          >
            <path d="M6.5 10.5V7.75a5.5 5.5 0 0 1 11 0v2.75M5.5 10.5h13a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" />
          </svg>
        </div>

        <h1 className="mt-4 text-lg font-semibold text-ink">
          You do not have access to {def ? def.label.toLowerCase() : "this area"}
        </h1>

        <p className="mt-2 text-sm text-muted">
          {def
            ? def.description
            : "This part of the portal is switched off for your account."}
        </p>

        <p className="mt-4 rounded-lg bg-subtle px-4 py-3 text-sm text-ink-2">
          Ask the business owner to turn on{" "}
          <span className="font-medium text-ink">
            {def?.label ?? "this feature"}
          </span>{" "}
          for your account under <span className="font-medium text-ink">Team</span>.
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            href="/portal"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-accentfg shadow-sm transition-colors hover:bg-accent-hover"
          >
            Back to dashboard
          </Link>
          <Link
            href="/login"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-line bg-subtle px-4 text-sm font-medium text-ink transition-colors hover:bg-surface"
          >
            Sign in as someone else
          </Link>
        </div>
      </div>
    </div>
  );
}
