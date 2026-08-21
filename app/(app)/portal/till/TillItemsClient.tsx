"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { money } from "@/lib/business";
import { tierNum } from "@/lib/pricing";
import type { ProductRecord } from "@/lib/products";
import {
  Button,
  Card,
  cx,
  EmptyState,
  Input,
  PageHeader,
  Skeleton,
} from "@/components/ui/primitives";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";

/**
 * Fast counter lookup — every sellable item with its SKU, barcode, shop and
 * wholesale price and live stock, so staff can check a price or find a code
 * without leaving the till. Mirrors MOBILE ICU's "Till items" screen.
 */
export default function TillItemsClient() {
  const toast = useToast();
  const [rows, setRows] = useState<ProductRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchPage = useCallback(
    async (next: string | null) => {
      const params = new URLSearchParams({ limit: "200", status: "all" });
      if (debounced.trim()) params.set("q", debounced.trim());
      if (next) params.set("cursor", next);
      const res = await fetch(`/api/products?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load the till items.");
      return (await res.json()) as {
        products: ProductRecord[];
        nextCursor: string | null;
        total: number;
      };
    },
    [debounced],
  );

  const reload = useCallback(() => {
    let alive = true;
    setLoading(true);
    setPage(1);
    (async () => {
      const all: ProductRecord[] = [];
      let cur: string | null = null;
      let tot = 0;
      for (let i = 0; i < 200; i++) {
        const d = await fetchPage(cur);
        if (!alive) return;
        all.push(...d.products);
        tot = d.total;
        if (!d.nextCursor) break;
        cur = d.nextCursor;
      }
      if (!alive) return;
      setRows(all);
      setTotal(tot);
    })()
      .catch((e: Error) => alive && toast.error(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [fetchPage, toast]);

  useEffect(() => reload(), [reload]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

  const shopPrice = (p: ProductRecord) => tierNum(p.tiers?.shop) ?? p.price;
  const wholesalePrice = (p: ProductRecord) => tierNum(p.tiers?.wholesale) ?? p.price;

  return (
    <div>
      <PageHeader
        title="Till items"
        subtitle={
          loading
            ? "Loading…"
            : `${total.toLocaleString()} item${total === 1 ? "" : "s"} — check a price or find a code`
        }
        actions={
          <Link href="/portal/billing">
            <Button variant="primary">New bill</Button>
          </Link>
        }
      />

      <div className="mb-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search item, SKU or barcode…"
          className="h-11 w-full sm:max-w-md"
          aria-label="Search till items"
        />
      </div>

      <Card padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] border-collapse text-sm">
            <thead className="border-b border-line bg-subtle text-left text-xs font-semibold text-ink-2">
              <tr>
                <th className="px-3 py-2.5">Item</th>
                <th className="px-3 py-2.5">SKU</th>
                <th className="px-3 py-2.5">Barcode</th>
                <th className="px-3 py-2.5 text-right">Shop</th>
                <th className="px-3 py-2.5 text-right">Wholesale</th>
                <th className="px-3 py-2.5 text-right">Stock</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td colSpan={6} className="px-3 py-3">
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      title="No items"
                      message={
                        debounced
                          ? "Nothing matched that search."
                          : "Add products in Inventory and they appear here."
                      }
                    />
                  </td>
                </tr>
              ) : (
                pageRows.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-line transition-colors last:border-0 hover:bg-subtle/60"
                  >
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/portal/products/${p.id}/edit`}
                        className="font-medium text-ink hover:text-accent"
                      >
                        {p.title}
                      </Link>
                      {p.brand && (
                        <span className="block text-xs text-muted">{p.brand}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-muted">{p.sku || "—"}</td>
                    <td className="px-3 py-2.5 text-muted">{p.barcode || "—"}</td>
                    <td className="tnum px-3 py-2.5 text-right text-ink">
                      {money(shopPrice(p))}
                    </td>
                    <td className="tnum px-3 py-2.5 text-right text-ink-2">
                      {money(wholesalePrice(p))}
                    </td>
                    <td className="tnum px-3 py-2.5 text-right">
                      <span
                        className={cx(
                          "font-medium",
                          p.stock <= 0
                            ? "text-danger"
                            : p.stock <= 5
                              ? "text-warning"
                              : "text-muted",
                        )}
                      >
                        {p.stock}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && rows.length > 0 && (
          <Pagination
            total={rows.length}
            page={page}
            pageSize={pageSize}
            onPage={setPage}
            onPageSize={setPageSize}
          />
        )}
      </Card>
    </div>
  );
}
