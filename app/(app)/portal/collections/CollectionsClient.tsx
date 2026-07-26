"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { CollectionSummary } from "@/lib/collections";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Skeleton,
} from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

export default function CollectionsClient() {
  const toast = useToast();
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/collections", { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load your collections.");
      const d = (await res.json()) as { collections: CollectionSummary[] };
      setCollections(d.collections);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "That was not created.");
      toast.success(`${title} created.`);
      setAddOpen(false);
      setTitle("");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const organise = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "organize" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "That did not work.");
      toast.success(
        `${body.assigned} product${body.assigned === 1 ? "" : "s"} sorted into ${body.created} new collection${body.created === 1 ? "" : "s"}.`,
      );
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Collections"
        subtitle={
          loading ? "Loading…" : `${collections.length} collection${collections.length === 1 ? "" : "s"}`
        }
        actions={
          <>
            <Button onClick={organise} disabled={busy}>
              Auto-organise
            </Button>
            <Button variant="primary" onClick={() => setAddOpen(true)}>
              New collection
            </Button>
          </>
        }
      />

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      ) : collections.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState
            title="No collections yet"
            message="Group your products into categories. Auto-organise will do a first pass using each product's type."
            action={
              <div className="flex gap-2">
                <Button variant="primary" onClick={() => setAddOpen(true)}>
                  New collection
                </Button>
                <Button onClick={organise} disabled={busy}>
                  Auto-organise
                </Button>
              </div>
            }
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {collections.map((c) => (
            <Link
              key={c.id}
              href={`/portal/collections/${c.id}`}
              className="group overflow-hidden rounded-xl border border-line bg-surface shadow-sm transition-all hover:border-accent hover:shadow-md"
            >
              <div className="flex h-28 items-center justify-center bg-subtle">
                {c.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.imageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-3xl font-semibold text-faint">
                    {c.title.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="p-3">
                <p className="truncate text-sm font-medium text-ink group-hover:text-accent">
                  {c.title}
                </p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="text-xs text-muted">
                    {c.productCount} product{c.productCount === 1 ? "" : "s"}
                  </span>
                  {c.smartRule && <Badge tone="info">Rule</Badge>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="New collection"
        size="sm"
        dismissable={!busy}
        footer={
          <>
            <Button onClick={() => setAddOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!title.trim()}
              onClick={create}
            >
              Create
            </Button>
          </>
        }
      >
        <Field label="Name" required>
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Screens"
          />
        </Field>
      </Modal>
    </div>
  );
}
