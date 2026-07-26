"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Checkbox, cx } from "@/components/ui/primitives";

/**
 * Reusable column visibility + sorting for the list screens.
 *
 * Visibility persists to localStorage per table key. Staff set these up once to
 * match how they work and expect them to survive a reload — losing the layout
 * on every visit is the fastest way to make a dense table feel broken.
 */

export type ColumnDef<K extends string> = {
  key: K;
  label: string;
  /** Locked columns cannot be hidden — the row would lose its identity. */
  locked?: boolean;
  /** Right-align numeric columns. */
  numeric?: boolean;
  sortable?: boolean;
};

export function useColumns<K extends string>(
  storageKey: string,
  defs: ColumnDef<K>[],
  hiddenByDefault: K[] = [],
) {
  const [hidden, setHidden] = useState<Set<K>>(() => new Set(hiddenByDefault));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`cols:${storageKey}`);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        setHidden(new Set(parsed as K[]));
      }
    } catch {
      // A corrupted preference must not stop the table rendering.
    }
    setReady(true);
  }, [storageKey]);

  const persist = useCallback(
    (next: Set<K>) => {
      setHidden(next);
      try {
        localStorage.setItem(
          `cols:${storageKey}`,
          JSON.stringify(Array.from(next)),
        );
      } catch {
        // Private browsing — visibility still works for this session.
      }
    },
    [storageKey],
  );

  const toggle = useCallback(
    (key: K) => {
      const def = defs.find((d) => d.key === key);
      if (def?.locked) return;
      const next = new Set(hidden);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      persist(next);
    },
    [defs, hidden, persist],
  );

  const reset = useCallback(
    () => persist(new Set(hiddenByDefault)),
    [persist, hiddenByDefault],
  );

  const visible = useMemo(
    () => defs.filter((d) => d.locked || !hidden.has(d.key)),
    [defs, hidden],
  );

  const isVisible = useCallback(
    (key: K) => visible.some((v) => v.key === key),
    [visible],
  );

  return { visible, hidden, toggle, reset, isVisible, ready };
}

export type SortState<K extends string> = {
  key: K;
  dir: "asc" | "desc";
};

export function useSort<K extends string>(initial: SortState<K>) {
  const [sort, setSort] = useState<SortState<K>>(initial);

  const toggle = useCallback((key: K) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  }, []);

  return { sort, setSort, toggle };
}

/** The ⋯ Columns menu. */
export function ColumnChooser<K extends string>({
  defs,
  hidden,
  onToggle,
  onReset,
}: {
  defs: ColumnDef<K>[];
  hidden: Set<K>;
  onToggle: (key: K) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cx(
          "inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-xs font-medium text-ink-2 transition-colors hover:bg-subtle",
          open && "bg-subtle",
        )}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M5 12h.01M12 12h.01M19 12h.01" />
        </svg>
        Columns
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
          <div className="max-h-80 overflow-y-auto p-2">
            {defs.map((def) => (
              <div
                key={def.key}
                className={cx(
                  "rounded-lg px-2 py-1.5",
                  def.locked ? "opacity-50" : "hover:bg-subtle",
                )}
              >
                <Checkbox
                  checked={def.locked || !hidden.has(def.key)}
                  disabled={def.locked}
                  onChange={() => onToggle(def.key)}
                  label={
                    <span className="flex items-center gap-1.5">
                      {def.label}
                      {def.locked && (
                        <span className="text-[0.65rem] text-faint">fixed</span>
                      )}
                    </span>
                  }
                />
              </div>
            ))}
          </div>
          <div className="border-t border-line p-1.5">
            <button
              type="button"
              onClick={() => {
                onReset();
                setOpen(false);
              }}
              className="w-full rounded-lg px-2.5 py-2 text-left text-xs font-medium text-muted transition-colors hover:bg-subtle hover:text-ink"
            >
              Reset to default
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Sortable table header cell. */
export function SortHeader<K extends string>({
  def,
  sort,
  onSort,
}: {
  def: ColumnDef<K>;
  sort: SortState<K>;
  onSort: (key: K) => void;
}) {
  const active = sort.key === def.key;

  if (!def.sortable) {
    return (
      <th
        scope="col"
        className={cx(
          "px-3 py-2.5 text-xs font-semibold text-muted",
          def.numeric ? "text-right" : "text-left",
        )}
      >
        {def.label}
      </th>
    );
  }

  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={cx(
        "px-3 py-2.5 text-xs font-semibold",
        def.numeric ? "text-right" : "text-left",
      )}
    >
      <button
        type="button"
        onClick={() => onSort(def.key)}
        className={cx(
          "inline-flex items-center gap-1 transition-colors hover:text-ink",
          active ? "text-ink" : "text-muted",
          def.numeric && "flex-row-reverse",
        )}
      >
        {def.label}
        <svg
          viewBox="0 0 24 24"
          className={cx("h-3.5 w-3.5", active ? "opacity-100" : "opacity-30")}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          {active && sort.dir === "desc" ? (
            <path d="m6 9 6 6 6-6" />
          ) : (
            <path d="m6 15 6-6 6 6" />
          )}
        </svg>
      </button>
    </th>
  );
}
