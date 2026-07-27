"use client";

import { BUSINESS, businessMark } from "@/lib/business";
import { cx } from "@/components/ui/primitives";

/**
 * Wordmark used in the sidebar and on the login screen. Falls back to initials
 * in an accent tile so the app is branded before any logo is uploaded.
 */
export function Logo({
  name = BUSINESS.name,
  tagline,
  size = "md",
  className,
}: {
  name?: string;
  tagline?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const box = {
    sm: "h-8 w-8 text-xs rounded-md",
    md: "h-9 w-9 text-sm rounded-md",
    lg: "h-12 w-12 text-base rounded-lg",
  }[size];

  const title = {
    sm: "text-sm",
    md: "text-[0.95rem]",
    lg: "text-lg",
  }[size];

  return (
    <div className={cx("flex items-center gap-2.5", className)}>
      <span
        className={cx(
          "flex shrink-0 items-center justify-center bg-accent font-bold tracking-tight text-accentfg shadow-sm",
          box,
        )}
        aria-hidden
      >
        {businessMark(name)}
      </span>
      <span className="min-w-0">
        <span
          className={cx(
            "block truncate font-semibold tracking-tight text-ink",
            title,
          )}
        >
          {name}
        </span>
        {tagline && (
          <span className="block truncate text-xs text-muted">{tagline}</span>
        )}
      </span>
    </div>
  );
}

export function NavIcon({ path, className }: { path: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx("h-5 w-5 shrink-0", className)}
      aria-hidden
    >
      <path d={path} />
    </svg>
  );
}
