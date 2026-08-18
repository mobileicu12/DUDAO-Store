"use client";

import { useCallback, useEffect, useState } from "react";
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
import { useToast } from "@/components/ui/Toast";

/**
 * Fast counter lookup — every sellable item with its SKU, barcode, shop and
 * wholesale price and live stock, so staff can check a price or find a code
 * without leaving the till. Mirrors MOBILE ICU's "Till items" screen.
 */
export default function TillItemsClient() {
  const toast = useToast();
  const [rows, setRows] = useState<ProductRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchPage = useCallback(
    async (next: string | null) => {
      const params = new URLSearchParams({ limit: "50", status: "all" });
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
    setLoading(true);
    fetchPage(null)
      .then((d) => {
        setRows(d.products);
        setCursor(d.nextCursor);
        setTotal(d.total);
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [fetchPage, toast]);

  useEffect(() => {
    reload();
  }, [reload]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const d = await fetchPage(cursor);
      setRows((prev) => [...prev, ...d.products]);
      setCursor(d.nextCursor);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

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
                rows.map((p) => (
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

        {cursor && (
          <div className="border-t border-line p-3 text-center">
            <Button variant="secondary" loading={loadingMore} onClick={loadMore}>
              Load more
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
