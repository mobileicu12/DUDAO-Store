"use client";

import { cx } from "@/components/ui/primitives";

/**
 * Page navigation for client-side paged tables. The list holds all matching
 * rows and shows one page at a time; this drives which page and how many rows.
 */
export function Pagination({
  total,
  page,
  pageSize,
  onPage,
  onPageSize,
  sizes = [10, 20, 50, 100],
  className,
}: {
  total: number;
  page: number;
  pageSize: number;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
  sizes?: number[];
  className?: string;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safe = Math.min(page, pageCount);
  const first = total === 0 ? 0 : (safe - 1) * pageSize + 1;
  const last = Math.min(safe * pageSize, total);

  const btn =
    "rounded-md border border-line-strong px-2.5 py-1.5 text-xs font-medium text-ink-2 transition-colors enabled:hover:bg-subtle disabled:opacity-40";

  return (
    <div
      className={cx(
        "flex flex-wrap items-center justify-between gap-3 border-t border-line p-3 text-sm",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-muted">
        <span>Show</span>
        <select
          value={pageSize}
          onChange={(e) => {
            onPageSize(Number(e.target.value));
            onPage(1);
          }}
          className="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink"
          aria-label="Rows per page"
        >
          {sizes.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <span>
          per page ·{" "}
          {total === 0 ? "nothing to show" : `${first}–${last} of ${total.toLocaleString()}`}
        </span>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center gap-1">
          <button className={btn} disabled={safe === 1} onClick={() => onPage(1)}>
            « First
          </button>
          <button className={btn} disabled={safe === 1} onClick={() => onPage(safe - 1)}>
            ‹ Prev
          </button>
          <span className="px-3 text-xs text-muted">
            Page {safe} of {pageCount}
          </span>
          <button className={btn} disabled={safe === pageCount} onClick={() => onPage(safe + 1)}>
            Next ›
          </button>
          <button className={btn} disabled={safe === pageCount} onClick={() => onPage(pageCount)}>
            Last »
          </button>
        </div>
      )}
    </div>
  );
}
