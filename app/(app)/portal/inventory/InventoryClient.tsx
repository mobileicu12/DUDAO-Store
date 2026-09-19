"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { money } from "@/lib/business";
import { PRICE_TIERS, type TierKey } from "@/lib/pricing";
import type { ProductRecord } from "@/lib/products";
import {
  printBarcodeLabels,
  LABEL_PRESETS,
  type LabelPresetKey,
} from "@/lib/barcode-labels";
import {
  ColumnChooser,
  SortHeader,
  useColumns,
  useSort,
  type ColumnDef,
} from "@/components/ColumnChooser";
import {
  Badge,
  Button,
  Checkbox,
  cx,
  EmptyState,
  Input,
  PageHeader,
  Segmented,
  Skeleton,
} from "@/components/ui/primitives";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
import { MergeModal, DuplicatesModal } from "./MergeTools";

type ColKey =
  | "product"
  | "sku"
  | "price"
  | "wholesale"
  | "shop"
  | "ebay"
  | "amazon"
  | "status"
  | "stock";

const COLUMNS: ColumnDef<ColKey>[] = [
  { key: "product", label: "Product", locked: true, sortable: true },
  { key: "sku", label: "SKU" },
  { key: "price", label: "Price", numeric: true, sortable: true },
  { key: "wholesale", label: "Wholesale", numeric: true },
  { key: "shop", label: "In shop", numeric: true },
  { key: "ebay", label: "eBay", numeric: true },
  { key: "amazon", label: "Amazon", numeric: true },
  { key: "status", label: "Status" },
  { key: "stock", label: "Available", locked: true, numeric: true, sortable: true },
];

/** Tier columns are hidden by default — most days staff only need one price. */
const HIDDEN_BY_DEFAULT: ColKey[] = ["wholesale", "shop", "ebay", "amazon"];

const TIER_COL: Record<string, TierKey> = {
  wholesale: "wholesale",
  shop: "shop",
  ebay: "ebay",
  amazon: "amazon",
};

export default function InventoryClient() {
  const toast = useToast();

  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [threshold, setThreshold] = useState(5);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out">("all");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [bulkPrompt, setBulkPrompt] = useState<"price" | "stock" | null>(null);
  const [bulkValue, setBulkValue] = useState("");
  const [labelOpen, setLabelOpen] = useState(false);
  const [labelPreset, setLabelPreset] = useState<LabelPresetKey>("sheet-65");
  const [labelCopies, setLabelCopies] = useState(1);
  const [labelShowPrice, setLabelShowPrice] = useState(true);
  const [labelShowSku, setLabelShowSku] = useState(false);

  const { visible, hidden, toggle, reset } = useColumns(
    "inventory",
    COLUMNS,
    HIDDEN_BY_DEFAULT,
  );
  const { sort, toggle: toggleSort } = useSort<ColKey>({
    key: "product",
    dir: "asc",
  });

  // Debounce the search box — a keystroke per request would hammer the API on
  // a slow shop connection.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const sortParam = useMemo(() => {
    if (sort.key === "price") return "price";
    if (sort.key === "stock") return "stock";
    return "title";
  }, [sort.key]);

  const fetchPage = useCallback(
    async (nextCursor: string | null) => {
      const params = new URLSearchParams({
        limit: "200",
        sort: sortParam,
        dir: sort.dir,
        stock: stockFilter,
      });
      if (debounced.trim()) params.set("q", debounced.trim());
      if (nextCursor) params.set("cursor", nextCursor);

      const res = await fetch(`/api/products?${params}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Could not load your products.");
      }
      return (await res.json()) as {
        products: ProductRecord[];
        nextCursor: string | null;
        total: number;
        threshold: number;
      };
    },
    [debounced, sortParam, sort.dir, stockFilter],
  );

  // Load every matching row (following the cursor to the end) so the pager can
  // page across the whole catalog.
  const loadAll = useCallback(async () => {
    const all: ProductRecord[] = [];
    let cur: string | null = null;
    let thr = 5;
    let tot = 0;
    for (let i = 0; i < 200; i++) {
      const data = await fetchPage(cur);
      all.push(...data.products);
      thr = data.threshold;
      tot = data.total;
      if (!data.nextCursor) break;
      cur = data.nextCursor;
    }
    setProducts(all);
    setTotal(tot);
    setThreshold(thr);
    setSelected(new Set());
  }, [fetchPage]);

  // Reload from the top whenever the query changes.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setPage(1);
    loadAll()
      .catch((err: Error) => alive && toast.error(err.message))
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, [loadAll, toast]);

  /* ---------------------------------------------------------------------- */
  /* Inline editing                                                          */
  /* ---------------------------------------------------------------------- */

  /**
   * Optimistic: the cell shows the new value immediately, then reverts
   * visibly if the server rejects it. A till operator correcting stock needs
   * the grid to keep up with them, but must never be left believing a failed
   * edit stuck.
   */
  const saveField = async (
    id: string,
    field: "price" | "stock",
    raw: string,
  ) => {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      toast.error("Enter a number of zero or more.");
      return;
    }

    const before = products.find((p) => p.id === id);
    if (!before) return;
    if (before[field] === value) return;

    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)),
    );

    try {
      const res = await fetch(`/api/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "That change was not saved.");
      }
    } catch (err) {
      setProducts((prev) => prev.map((p) => (p.id === id ? before : p)));
      toast.error((err as Error).message, "The value has been put back.");
    }
  };

  /* ---------------------------------------------------------------------- */
  /* Bulk actions                                                            */
  /* ---------------------------------------------------------------------- */

  const runBulk = async (action: string, value?: unknown) => {
    setBulkBusy(true);
    try {
      const res = await fetch("/api/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids: Array.from(selected), value }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        changed?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? "That change was not applied.");

      toast.success(
        `${body.changed ?? 0} product${body.changed === 1 ? "" : "s"} updated.`,
      );

      // Re-read rather than patching locally: a bulk delete or archive changes
      // which rows belong on screen at all.
      await loadAll();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBulkBusy(false);
      setConfirmDelete(false);
      setBulkPrompt(null);
      setBulkValue("");
    }
  };

  // Print Code128 labels for the selected products, using each product's
  // barcode (or its SKU as a fallback). Runs entirely client-side.
  const printLabels = () => {
    const items = products
      .filter((p) => selected.has(p.id))
      .map((p) => ({
        code: (p.barcode || p.sku || "").trim(),
        title: p.title,
        price: p.price ? p.price.toFixed(2) : undefined,
        sku: p.sku,
      }))
      .filter((i) => i.code);
    if (!items.length) {
      toast.error("Selected products have no barcode or SKU. Use “Assign barcodes” first.");
      return;
    }
    printBarcodeLabels(items, {
      preset: labelPreset,
      copies: labelCopies,
      showPrice: labelShowPrice,
      showSku: labelShowSku,
      currency: "GBP",
    });
    setLabelOpen(false);
  };

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return products.slice(start, start + pageSize);
  }, [products, page, pageSize]);

  const allSelected = products.length > 0 && selected.size === products.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(products.map((p) => p.id)));
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const isVisible = (key: ColKey) => visible.some((v) => v.key === key);

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle={
          loading
            ? "Loading…"
            : `${total.toLocaleString()} product${total === 1 ? "" : "s"}`
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => setDupOpen(true)}>
              Find duplicates
            </Button>
            <Link href="/portal/import-export">
              <Button variant="secondary">Import / export</Button>
            </Link>
            <Link href="/portal/products/new">
              <Button variant="primary">Add product</Button>
            </Link>
          </>
        }
      />

      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 sm:max-w-xs">
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-faint"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, SKU or barcode"
            className="h-9 pl-9"
            aria-label="Search products"
          />
        </div>

        <Segmented
          value={stockFilter}
          onChange={setStockFilter}
          options={[
            { value: "all", label: "All stock" },
            { value: "low", label: `Low (≤${threshold})` },
            { value: "out", label: "Out" },
          ]}
        />

        <div className="ml-auto">
          <ColumnChooser
            defs={COLUMNS}
            hidden={hidden}
            onToggle={toggle}
            onReset={reset}
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] border-collapse text-sm">
            <thead className="border-b border-line bg-subtle">
              <tr>
                <th scope="col" className="w-10 px-3 py-2.5">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onChange={toggleAll}
                    label={<span className="sr-only">Select all</span>}
                  />
                </th>
                {visible.map((def) => (
                  <SortHeader
                    key={def.key}
                    def={def}
                    sort={sort}
                    onSort={toggleSort}
                  />
                ))}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="px-3 py-3" colSpan={visible.length + 1}>
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={visible.length + 1}>
                    <EmptyState
                      title={
                        debounced
                          ? "Nothing matched that search"
                          : "No products yet"
                      }
                      message={
                        debounced
                          ? "Try part of the name, the SKU, or scan the barcode."
                          : "Add your first product, or bring your catalog in from a spreadsheet."
                      }
                      action={
                        !debounced ? (
                          <div className="flex gap-2">
                            <Link href="/portal/products/new">
                              <Button variant="primary">Add product</Button>
                            </Link>
                            <Link href="/portal/import-export">
                              <Button variant="secondary">Import a sheet</Button>
                            </Link>
                          </div>
                        ) : undefined
                      }
                    />
                  </td>
                </tr>
              ) : (
                pageRows.map((p) => {
                  const isSelected = selected.has(p.id);
                  return (
                    <tr
                      key={p.id}
                      className={cx(
                        "border-b border-line transition-colors last:border-0",
                        isSelected ? "bg-accent-subtle/40" : "hover:bg-subtle/60",
                      )}
                    >
                      <td className="px-3 py-2.5">
                        <Checkbox
                          checked={isSelected}
                          onChange={() => toggleOne(p.id)}
                          label={
                            <span className="sr-only">Select {p.title}</span>
                          }
                        />
                      </td>

                      {isVisible("product") && (
                        <td className="px-3 py-2.5">
                          <Link
                            href={`/portal/products/${p.id}/edit`}
                            className="flex items-center gap-2.5 group"
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-subtle">
                              {p.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={p.imageUrl}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <span className="text-[0.6rem] text-faint">
                                  No img
                                </span>
                              )}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-ink group-hover:text-accent">
                                {p.title}
                              </span>
                              {(p.brand || p.model) && (
                                <span className="block truncate text-xs text-muted">
                                  {[p.brand, p.model].filter(Boolean).join(" · ")}
                                </span>
                              )}
                            </span>
                          </Link>
                        </td>
                      )}

                      {isVisible("sku") && (
                        <td className="px-3 py-2.5">
                          <span className="font-mono text-xs text-muted">
                            {p.sku || "—"}
                          </span>
                        </td>
                      )}

                      {isVisible("price") && (
                        <td className="px-3 py-2.5 text-right">
                          <InlineNumber
                            value={p.price}
                            prefix="£"
                            onSave={(v) => saveField(p.id, "price", v)}
                          />
                        </td>
                      )}

                      {(["wholesale", "shop", "ebay", "amazon"] as const).map(
                        (key) =>
                          isVisible(key) ? (
                            <td
                              key={key}
                              className="tnum px-3 py-2.5 text-right text-muted"
                            >
                              {p.tiers[TIER_COL[key]] != null ? (
                                money(p.tiers[TIER_COL[key]] as number)
                              ) : (
                                <span
                                  className="text-faint"
                                  title="No tier price set — sells at the base price"
                                >
                                  {money(p.price)}
                                </span>
                              )}
                            </td>
                          ) : null,
                      )}

                      {isVisible("status") && (
                        <td className="px-3 py-2.5">
                          <Badge
                            tone={p.status === "ACTIVE" ? "success" : "neutral"}
                            dot
                          >
                            {p.status === "ACTIVE" ? "Active" : "Draft"}
                          </Badge>
                        </td>
                      )}

                      {isVisible("stock") && (
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {p.stock <= 0 ? (
                              <Badge tone="danger">Out</Badge>
                            ) : p.stock <= threshold ? (
                              <Badge tone="warning">Low</Badge>
                            ) : null}
                            <InlineNumber
                              value={p.stock}
                              integer
                              onSave={(v) => saveField(p.id, "stock", v)}
                            />
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!loading && products.length > 0 && (
          <Pagination
            total={products.length}
            page={page}
            pageSize={pageSize}
            onPage={setPage}
            onPageSize={setPageSize}
          />
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="no-print fixed inset-x-0 bottom-0 z-40 px-3 pb-24 md:pb-14">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface/95 p-2.5 shadow-pop backdrop-blur-md">
            <span className="px-2 text-sm font-medium text-ink">
              {selected.size} selected
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button size="sm" disabled={bulkBusy} onClick={() => runBulk("activate")}>
                Activate
              </Button>
              <Button size="sm" disabled={bulkBusy} onClick={() => runBulk("draft")}>
                Draft
              </Button>
              <Button
                size="sm"
                disabled={bulkBusy}
                onClick={() => setBulkPrompt("price")}
              >
                Set price
              </Button>
              <Button
                size="sm"
                disabled={bulkBusy}
                onClick={() => setBulkPrompt("stock")}
              >
                Set stock
              </Button>
              <Button
                size="sm"
                disabled={bulkBusy}
                onClick={() => runBulk("barcodes")}
              >
                Assign barcodes
              </Button>
              <Button
                size="sm"
                disabled={bulkBusy}
                onClick={() => setLabelOpen(true)}
              >
                Print labels
              </Button>
              {selected.size >= 2 && (
                <Button
                  size="sm"
                  disabled={bulkBusy}
                  onClick={() => setMergeOpen(true)}
                >
                  Merge…
                </Button>
              )}
              <Button
                size="sm"
                variant="danger"
                disabled={bulkBusy}
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </Button>
            </div>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="ml-auto px-2 text-xs font-medium text-muted hover:text-ink"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => runBulk("delete")}
        busy={bulkBusy}
        title={`Delete ${selected.size} product${selected.size === 1 ? "" : "s"}?`}
        confirmLabel="Delete"
        message="Products that appear on a past invoice will be archived instead of deleted, so those invoices keep working. This cannot be undone."
      />

      <Modal
        open={bulkPrompt !== null}
        onClose={() => setBulkPrompt(null)}
        title={
          bulkPrompt === "price"
            ? `Set price on ${selected.size} product${selected.size === 1 ? "" : "s"}`
            : `Set stock on ${selected.size} product${selected.size === 1 ? "" : "s"}`
        }
        size="sm"
        footer={
          <>
            <Button onClick={() => setBulkPrompt(null)}>Cancel</Button>
            <Button
              variant="primary"
              loading={bulkBusy}
              onClick={() =>
                runBulk(bulkPrompt === "price" ? "price" : "stock", Number(bulkValue))
              }
            >
              Apply to all
            </Button>
          </>
        }
      >
        <Input
          autoFocus
          type="number"
          step={bulkPrompt === "price" ? "0.01" : "1"}
          min="0"
          value={bulkValue}
          onChange={(e) => setBulkValue(e.target.value)}
          placeholder={bulkPrompt === "price" ? "0.00" : "0"}
        />
        <p className="mt-2 text-xs text-muted">
          This overwrites the existing value on every selected product.
        </p>
      </Modal>

      <Modal
        open={labelOpen}
        onClose={() => setLabelOpen(false)}
        title="Print barcode labels"
        size="sm"
        footer={
          <>
            <Button onClick={() => setLabelOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={printLabels}>
              Print
            </Button>
          </>
        }
      >
        <p className="mb-3 text-xs text-muted">
          {selected.size} product{selected.size === 1 ? "" : "s"} selected. Uses each
          product&apos;s barcode (or SKU).
        </p>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Label size</span>
          <select
            value={labelPreset}
            onChange={(e) => setLabelPreset(e.target.value as LabelPresetKey)}
            className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink"
          >
            {LABEL_PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-muted">Copies per product</span>
          <Input
            type="number"
            min="1"
            value={labelCopies}
            onChange={(e) => setLabelCopies(Math.max(1, Number(e.target.value)))}
          />
        </label>
        <div className="mt-3 flex gap-4 text-sm text-ink">
          <Checkbox
            checked={labelShowPrice}
            onChange={(v) => setLabelShowPrice(v)}
            label="Show price"
          />
          <Checkbox
            checked={labelShowSku}
            onChange={(v) => setLabelShowSku(v)}
            label="Show SKU"
          />
        </div>
      </Modal>

      <MergeModal
        open={mergeOpen}
        products={products
          .filter((p) => selected.has(p.id))
          .map((p) => ({
            id: p.id,
            title: p.title,
            sku: p.sku,
            barcode: p.barcode,
            stock: p.stock,
            price: p.price,
            status: p.status,
            imageUrl: p.imageUrl,
          }))}
        onClose={() => setMergeOpen(false)}
        onMerged={() => {
          setMergeOpen(false);
          setSelected(new Set());
          void loadAll();
        }}
      />

      <DuplicatesModal
        open={dupOpen}
        onClose={() => setDupOpen(false)}
        onMerged={() => void loadAll()}
      />
    </div>
  );
}

/**
 * A cell that looks like text until clicked, then becomes an input.
 * Commits on blur or Enter, abandons on Escape.
 */
function InlineNumber({
  value,
  onSave,
  prefix,
  integer = false,
}: {
  value: number;
  onSave: (raw: string) => void;
  prefix?: string;
  integer?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="tnum rounded px-1.5 py-0.5 font-medium text-ink transition-colors hover:bg-subtle"
        title="Click to edit"
      >
        {prefix
          ? money(value)
          : value.toLocaleString()}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      type="number"
      step={integer ? "1" : "0.01"}
      min="0"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        onSave(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          setEditing(false);
          onSave(draft);
        } else if (e.key === "Escape") {
          setDraft(String(value));
          setEditing(false);
        }
      }}
      className="tnum w-20 rounded border border-accent bg-surface px-1.5 py-0.5 text-right text-sm focus:outline-none"
    />
  );
}
