"use client";

import { useEffect, useMemo, useState } from "react";
import { money } from "@/lib/business";
import type { DuplicateGroup, DuplicateMember } from "@/lib/products";
import {
  Badge,
  Button,
  Checkbox,
  cx,
  EmptyState,
  Skeleton,
} from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

/** The minimum a row needs to take part in a merge. */
export type MergeCandidate = {
  id: string;
  title: string;
  sku: string;
  barcode?: string;
  stock: number;
  price: number;
  status: string;
  imageUrl?: string | null;
  lineCount?: number;
  createdAt?: string;
};

const shortDate = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "";

/* -------------------------------------------------------------------------- */
/* Merge modal — pick the survivor, the rest fold in                          */
/* -------------------------------------------------------------------------- */

export function MergeModal({
  open,
  products,
  onClose,
  onMerged,
}: {
  open: boolean;
  products: MergeCandidate[];
  onClose: () => void;
  onMerged: () => void;
}) {
  const toast = useToast();
  const [survivorId, setSurvivorId] = useState("");
  const [detailsFromId, setDetailsFromId] = useState("");
  const [addStock, setAddStock] = useState(false);
  const [busy, setBusy] = useState(false);
  // Start from what the caller passed for an instant render, then replace with
  // authoritative figures (current stock, live invoice-line counts) from the
  // server — the bulk-select path can't know invoice counts on its own.
  const [rows, setRows] = useState<MergeCandidate[]>(products);
  const [loadingInfo, setLoadingInfo] = useState(false);

  useEffect(() => {
    if (!open || products.length === 0) return;
    setRows(products);
    setAddStock(false);
    let alive = true;
    setLoadingInfo(true);
    const ids = products.map((p) => p.id).join(",");
    fetch(`/api/products/merge?ids=${encodeURIComponent(ids)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { candidates: [] }))
      .then((d: { candidates?: MergeCandidate[] }) => {
        if (!alive || !d.candidates?.length) return;
        setRows(d.candidates);
      })
      .catch(() => {})
      .finally(() => alive && setLoadingInfo(false));
    return () => {
      alive = false;
    };
  }, [open, products]);

  // Default the survivor to the row with the most invoice history, then the most
  // stock — the record most worth keeping — once authoritative figures land.
  useEffect(() => {
    if (rows.length === 0) return;
    const best = [...rows].sort(
      (a, b) => (b.lineCount ?? 0) - (a.lineCount ?? 0) || b.stock - a.stock,
    )[0];
    setSurvivorId((cur) => (rows.some((p) => p.id === cur) ? cur : best.id));
  }, [rows]);

  // The details source follows the survivor unless the user picks another. When
  // the survivor changes, snap the details source back to it.
  useEffect(() => {
    if (survivorId) setDetailsFromId(survivorId);
  }, [survivorId]);

  // Age hints — which record is the most/least recently added.
  const { newestId, oldestId } = useMemo(() => {
    const dated = rows.filter((r) => r.createdAt);
    if (dated.length < 2) return { newestId: "", oldestId: "" };
    const sorted = [...dated].sort((a, b) => +new Date(a.createdAt!) - +new Date(b.createdAt!));
    return { oldestId: sorted[0].id, newestId: sorted[sorted.length - 1].id };
  }, [rows]);

  const losers = rows.filter((p) => p.id !== survivorId);
  const survivor = rows.find((p) => p.id === survivorId);
  const detailsSource = rows.find((p) => p.id === detailsFromId) ?? survivor;
  const lostStock = losers.reduce((s, p) => s + p.stock, 0);
  const movedLines = losers.reduce((s, p) => s + (p.lineCount ?? 0), 0);

  const merge = async () => {
    if (!survivor || losers.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/products/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          survivorId,
          mergedIds: losers.map((p) => p.id),
          addStock,
          detailsFrom: detailsFromId,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "The merge did not go through.");
      toast.success(
        `Merged ${losers.length} product${losers.length === 1 ? "" : "s"} into “${survivor.title}”.`,
      );
      onMerged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Merge ${rows.length} products`}
      size="md"
      dismissable={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={busy}
            disabled={!survivor || losers.length === 0 || loadingInfo}
            onClick={merge}
          >
            Merge into “{survivor?.title ?? "…"}”
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted">
        Choose the product to <strong className="text-ink">keep</strong>. The
        others are deleted and folded in — their invoice history, collections and
        tags move onto the one you keep, so past bills are untouched.
      </p>

      <div className="space-y-2">
        {rows.map((p) => {
          const keep = p.id === survivorId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSurvivorId(p.id)}
              className={cx(
                "flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors",
                keep
                  ? "border-accent bg-accent-subtle"
                  : "border-line hover:bg-subtle",
              )}
            >
              <span
                aria-hidden
                className={cx(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                  keep ? "border-accent" : "border-line-strong",
                )}
              >
                {keep && <span className="h-2 w-2 rounded-full bg-accent" />}
              </span>
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.imageUrl}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-md border border-line object-cover"
                />
              ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-subtle text-[0.6rem] font-semibold text-faint">
                  {p.title.slice(0, 2).toUpperCase()}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium text-ink">{p.title}</span>
                  {p.id === newestId && <Badge tone="info">Newest</Badge>}
                  {p.id === oldestId && <Badge tone="neutral">Oldest</Badge>}
                </span>
                <span className="block text-xs text-muted">
                  {p.sku || "no SKU"} · {money(p.price)} · {p.stock} in stock
                  {p.lineCount ? ` · ${p.lineCount} on invoices` : ""}
                  {p.createdAt ? ` · added ${shortDate(p.createdAt)}` : ""}
                </span>
              </span>
              {keep ? (
                <Badge tone="accent">Keep</Badge>
              ) : (
                <span className="shrink-0 text-xs text-muted">Remove</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Whose details win — defaults to the kept product, but you can take, say,
          the newest record's price while still keeping the older one's history. */}
      {rows.length > 1 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-line p-2.5 text-sm">
          <span className="text-muted">Use details (name, price, SKU…) from:</span>
          <select
            value={detailsFromId}
            onChange={(e) => setDetailsFromId(e.target.value)}
            className="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink"
          >
            {rows.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id === survivorId ? "The kept product" : "Removed"}
                {p.id === newestId ? " · newest" : p.id === oldestId ? " · oldest" : ""}
                {` · ${money(p.price)}`}
              </option>
            ))}
          </select>
          {detailsSource && survivor && detailsSource.id !== survivor.id && (
            <span className="text-xs text-warning">
              Kept product’s details will be replaced with {detailsSource.title}’s
              {detailsSource.price !== survivor.price ? ` (price → ${money(detailsSource.price)})` : ""}.
            </span>
          )}
        </div>
      )}

      {losers.length > 0 && (
        <div className="mt-4 space-y-2 rounded-lg border border-line bg-subtle p-3 text-xs text-muted">
          <p>
            {loadingInfo
              ? "Checking invoice history…"
              : movedLines > 0
                ? `${movedLines} invoice line${movedLines === 1 ? "" : "s"} will move to the kept product.`
                : "No invoice history to move."}
          </p>
          {lostStock > 0 && (
            <Checkbox
              checked={addStock}
              onChange={setAddStock}
              label={`Add the removed products' stock (${lostStock}) to the survivor${
                survivor ? ` — new total ${survivor.stock + lostStock}` : ""
              }`}
            />
          )}
          <p className="text-danger">This cannot be undone.</p>
        </div>
      )}
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Duplicates modal — scan, then merge each group                             */
/* -------------------------------------------------------------------------- */

export function DuplicatesModal({
  open,
  onClose,
  onMerged,
}: {
  open: boolean;
  onClose: () => void;
  onMerged: () => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [mergeGroup, setMergeGroup] = useState<DuplicateMember[] | null>(null);
  const [strategy, setStrategy] = useState<"newest" | "oldest">("newest");
  const [batchBusy, setBatchBusy] = useState(false);

  const load = useMemo(
    () => async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/products/duplicates", { cache: "no-store" });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Could not scan for duplicates.");
        setGroups(body.groups ?? []);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const totalDupes = groups.reduce((s, g) => s + (g.members.length - 1), 0);

  const mergeAll = async () => {
    const ok = window.confirm(
      `Merge all ${groups.length} groups, keeping the ${strategy} product in each and removing the other ${totalDupes}? ` +
        `The kept product's details win (so "newest" keeps the latest details). Invoice history is preserved. This cannot be undone.`,
    );
    if (!ok) return;
    setBatchBusy(true);
    try {
      const res = await fetch("/api/products/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "The batch merge did not go through.");
      toast.success(
        `Merged ${body.groupsMerged} group${body.groupsMerged === 1 ? "" : "s"}, removed ${body.productsRemoved} duplicate${body.productsRemoved === 1 ? "" : "s"}.`,
      );
      onMerged();
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBatchBusy(false);
    }
  };

  return (
    <>
      <Modal
        open={open && mergeGroup === null}
        onClose={onClose}
        title="Possible duplicates"
        size="lg"
        footer={
          <Button onClick={onClose}>Done</Button>
        }
      >
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <EmptyState
            title="No duplicates found"
            message="No two products share a SKU or an identical name. Nothing to merge."
          />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              {groups.length} group{groups.length === 1 ? "" : "s"} of products look
              alike. Merge each below, or resolve them all at once.
            </p>

            {/* Batch: resolve every group in one go, no clicking through each. */}
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent/40 bg-accent-subtle px-3 py-2 text-sm">
              <span className="font-medium text-ink">Merge all — keep the</span>
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value as "newest" | "oldest")}
                className="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink"
              >
                <option value="newest">newest (latest details)</option>
                <option value="oldest">oldest</option>
              </select>
              <span className="text-muted">of each</span>
              <Button
                size="sm"
                variant="primary"
                loading={batchBusy}
                onClick={mergeAll}
                className="ml-auto"
              >
                Merge all {groups.length} groups
              </Button>
            </div>

            {groups.map((g, i) => (
              <div key={i} className="rounded-lg border border-line bg-surface p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge tone={g.reason === "sku" ? "warning" : "neutral"}>
                      {g.reason === "sku" ? "Same SKU" : "Same name"}
                    </Badge>
                    <span className="text-xs text-muted">
                      {g.reason === "sku" ? g.key.toUpperCase() : g.key} ·{" "}
                      {g.members.length} products
                    </span>
                  </div>
                  <Button size="sm" variant="primary" onClick={() => setMergeGroup(g.members)}>
                    Merge these…
                  </Button>
                </div>
                <ul className="divide-y divide-line text-sm">
                  {(() => {
                    const byAge = [...g.members]
                      .filter((m) => m.createdAt)
                      .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
                    const oldest = byAge[0]?.id;
                    const newest = byAge[byAge.length - 1]?.id;
                    return g.members.map((m) => (
                      <li key={m.id} className="flex items-center gap-2 py-1.5">
                        <span className="flex min-w-0 flex-1 items-center gap-1.5">
                          <span className="truncate text-ink">{m.title}</span>
                          {byAge.length > 1 && m.id === newest && <Badge tone="info">Newest</Badge>}
                          {byAge.length > 1 && m.id === oldest && <Badge tone="neutral">Oldest</Badge>}
                        </span>
                        <span className="shrink-0 text-xs text-muted">
                          {m.sku || "no SKU"} · {money(m.price)} · {m.stock} in stock
                          {m.lineCount ? ` · ${m.lineCount} on invoices` : ""}
                        </span>
                      </li>
                    ));
                  })()}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <MergeModal
        open={mergeGroup !== null}
        products={mergeGroup ?? []}
        onClose={() => setMergeGroup(null)}
        onMerged={() => {
          setMergeGroup(null);
          onMerged();
          void load();
        }}
      />
    </>
  );
}
