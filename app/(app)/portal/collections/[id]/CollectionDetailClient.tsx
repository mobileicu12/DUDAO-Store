"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { money } from "@/lib/business";
import type { CollectionDetail } from "@/lib/collections";
import type { ProductRecord } from "@/lib/products";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  Field,
  Input,
  PageHeader,
  Skeleton,
  Textarea,
} from "@/components/ui/primitives";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

export default function CollectionDetailClient({ id }: { id: string }) {
  const toast = useToast();
  const router = useRouter();

  const [collection, setCollection] = useState<CollectionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/collections/${id}`, { cache: "no-store" });
    if (!res.ok) {
      const b = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(b.error ?? "Could not open that collection.");
    }
    const data = (await res.json()) as CollectionDetail;
    setCollection(data);
    setTitle(data.title);
    setDescription(data.descriptionHtml);
    setImageUrl(data.imageUrl);
    setSelected(new Set());
  }, [id]);

  useEffect(() => {
    let alive = true;
    load()
      .catch((e: Error) => alive && toast.error(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [load, toast]);

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/collections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, descriptionHtml: description, imageUrl }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? "That was not saved.");
      }
      await load();
      toast.success("Collection saved.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const mutateProducts = async (
    action: "add-products" | "remove-products",
    productIds: string[],
  ) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/collections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, productIds }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "That did not work.");
      await load();
      toast.success(
        action === "add-products"
          ? `${body.added} product${body.added === 1 ? "" : "s"} added.`
          : `${body.removed} product${body.removed === 1 ? "" : "s"} removed.`,
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      setPickerOpen(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/collections/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("That collection was not deleted.");
      toast.success("Collection deleted.", "The products themselves are untouched.");
      router.push("/portal/collections");
    } catch (e) {
      toast.error((e as Error).message);
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!collection) {
    return (
      <Alert tone="danger" title="Collection not found">
        <Link href="/portal/collections" className="underline">
          Back to collections
        </Link>
      </Alert>
    );
  }

  const allSelected =
    collection.products.length > 0 &&
    selected.size === collection.products.length;

  return (
    <div>
      <PageHeader
        title={collection.title}
        subtitle={`${collection.productCount} product${collection.productCount === 1 ? "" : "s"}`}
        actions={
          <>
            <Button onClick={() => setPickerOpen(true)}>Add products</Button>
            <Button variant="primary" loading={busy} onClick={save}>
              Save
            </Button>
          </>
        }
      />

      {collection.smartRule && (
        <div className="mb-4">
          <Alert tone="info" title="Created by auto-organise">
            This collection was built from the rule{" "}
            <code className="font-mono">{collection.smartRule}</code>. You can
            still add and remove products by hand — the rule is a record of how
            it started, not something that keeps re-running.
          </Alert>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card padded={false}>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={allSelected}
                indeterminate={selected.size > 0 && !allSelected}
                onChange={() =>
                  setSelected(
                    allSelected
                      ? new Set()
                      : new Set(collection.products.map((p) => p.id)),
                  )
                }
                label={<span className="sr-only">Select all</span>}
              />
              <h2 className="text-sm font-semibold text-ink">Products</h2>
            </div>
            {selected.size > 0 && (
              <Button
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={() =>
                  mutateProducts("remove-products", Array.from(selected))
                }
              >
                Remove {selected.size}
              </Button>
            )}
          </div>

          {collection.products.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted">
              Nothing in this collection yet.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {collection.products.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Checkbox
                    checked={selected.has(p.id)}
                    onChange={() => {
                      const next = new Set(selected);
                      if (next.has(p.id)) next.delete(p.id);
                      else next.add(p.id);
                      setSelected(next);
                    }}
                    label={<span className="sr-only">Select {p.title}</span>}
                  />
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-subtle">
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[0.6rem] text-faint">—</span>
                    )}
                  </span>
                  <Link
                    href={`/portal/products/${p.id}/edit`}
                    className="min-w-0 flex-1 truncate text-sm font-medium text-ink hover:text-accent"
                  >
                    {p.title}
                  </Link>
                  <span className="text-xs text-muted">{p.sku || "—"}</span>
                  <span className="tnum w-20 text-right text-sm">
                    {money(p.price)}
                  </span>
                  <Badge tone={p.stock > 0 ? "neutral" : "danger"}>
                    {p.stock}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Details" />
            <div className="mt-3 space-y-3">
              <Field label="Name" required>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>
              <Field label="Description">
                <Textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </Field>
              <Field label="Image URL">
                <Input
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://…"
                />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Danger zone" />
            <Button
              variant="danger"
              full
              className="mt-3"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              Delete collection
            </Button>
          </Card>
        </div>
      </div>

      <ProductPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        existing={new Set(collection.products.map((p) => p.id))}
        busy={busy}
        onAdd={(ids) => mutateProducts("add-products", ids)}
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        busy={busy}
        title="Delete this collection?"
        confirmLabel="Delete"
        message="The products stay in your inventory — only the grouping is removed."
      />
    </div>
  );
}

function ProductPicker({
  open,
  onClose,
  existing,
  busy,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  existing: Set<string>;
  busy: boolean;
  onAdd: (ids: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ProductRecord[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) setPicked(new Set());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      if (!q.trim()) return setResults([]);
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}&limit=40`, {
        cache: "no-store",
      });
      if (res.ok) {
        const d = (await res.json()) as { products: ProductRecord[] };
        setResults(d.products);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q, open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add products"
      size="md"
      dismissable={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={picked.size === 0}
            onClick={() => onAdd(Array.from(picked))}
          >
            Add {picked.size || ""}
          </Button>
        </>
      }
    >
      <Input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name or SKU"
      />
      <ul className="mt-3 max-h-80 divide-y divide-line overflow-y-auto">
        {results.map((p) => {
          const already = existing.has(p.id);
          return (
            <li key={p.id} className="flex items-center gap-3 py-2">
              <Checkbox
                checked={picked.has(p.id)}
                disabled={already}
                onChange={() => {
                  const next = new Set(picked);
                  if (next.has(p.id)) next.delete(p.id);
                  else next.add(p.id);
                  setPicked(next);
                }}
                label={
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="truncate">{p.title}</span>
                    {already && (
                      <span className="shrink-0 text-xs text-faint">
                        already in
                      </span>
                    )}
                  </span>
                }
              />
            </li>
          );
        })}
        {q && results.length === 0 && (
          <li className="py-6 text-center text-sm text-muted">
            No products matched.
          </li>
        )}
      </ul>
    </Modal>
  );
}
