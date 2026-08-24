"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [newGroup, setNewGroup] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkGroup, setBulkGroup] = useState("");
  const existingGroups = useMemo(
    () => [...new Set(collections.map((c) => c.group).filter(Boolean))].sort(),
    [collections],
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const applyGroup = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-group", ids, group: bulkGroup }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "That did not work.");
      toast.success(
        bulkGroup.trim()
          ? `Grouped ${d.updated} collection${d.updated === 1 ? "" : "s"} under “${bulkGroup.trim()}”.`
          : `Cleared the group on ${d.updated} collection${d.updated === 1 ? "" : "s"}.`,
      );
      setSelected(new Set());
      setBulkGroup("");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const autoGroup = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "auto-group" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "That did not work.");
      toast.success(
        d.groups
          ? `Made ${d.groups} group${d.groups === 1 ? "" : "s"} from ${d.grouped} collections.`
          : "No new groups found — names didn't share a common base.",
      );
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Group the collections under their group heading; ungrouped ones fall into a
  // final "Ungrouped" section. Search narrows by title or group first.
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const shown = q
      ? collections.filter(
          (c) => c.title.toLowerCase().includes(q) || c.group.toLowerCase().includes(q),
        )
      : collections;
    const byGroup = new Map<string, CollectionSummary[]>();
    for (const c of shown) {
      const key = c.group.trim();
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key)!.push(c);
    }
    const named = [...byGroup.entries()]
      .filter(([g]) => g !== "")
      .sort((a, b) => a[0].localeCompare(b[0]));
    const ungrouped = byGroup.get("") ?? [];
    return { named, ungrouped };
  }, [collections, search]);

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
        body: JSON.stringify({ title, group: newGroup }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "That was not created.");
      toast.success(`${title} created.`);
      setAddOpen(false);
      setTitle("");
      setNewGroup("");
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
            <Button onClick={autoGroup} disabled={busy}>
              Auto-group
            </Button>
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
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search collections or groups…"
              className="h-9 w-full sm:w-72"
            />
            <span className="text-xs text-muted">
              Tick collections to group them together, or use Auto-group.
            </span>
          </div>

          {selected.size > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-accent/40 bg-accent-subtle px-3 py-2">
              <span className="text-sm font-medium text-ink">{selected.size} selected</span>
              <Input
                list="bulk-groups"
                value={bulkGroup}
                onChange={(e) => setBulkGroup(e.target.value)}
                placeholder="Group name (blank to clear)"
                className="h-8 w-52"
              />
              <datalist id="bulk-groups">
                {existingGroups.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
              <Button size="sm" variant="primary" loading={busy} onClick={applyGroup}>
                Set group
              </Button>
              <Button size="sm" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </div>
          )}

          {groups.named.map(([g, list]) => (
            <section key={g} className="mb-6">
              <div className="mb-2 flex items-baseline gap-2">
                <h2 className="text-sm font-semibold text-ink">{g}</h2>
                <span className="text-xs text-muted">
                  {list.length} collection{list.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {list.map((c) => (
                  <CollectionCard
                    key={c.id}
                    c={c}
                    selected={selected.has(c.id)}
                    onToggle={() => toggle(c.id)}
                  />
                ))}
              </div>
            </section>
          ))}

          {groups.ungrouped.length > 0 && (
            <section className="mb-6">
              {groups.named.length > 0 && (
                <h2 className="mb-2 text-sm font-semibold text-ink">Ungrouped</h2>
              )}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {groups.ungrouped.map((c) => (
                  <CollectionCard
                    key={c.id}
                    c={c}
                    selected={selected.has(c.id)}
                    onToggle={() => toggle(c.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {groups.named.length === 0 && groups.ungrouped.length === 0 && (
            <p className="py-10 text-center text-sm text-muted">
              No collections match “{search}”.
            </p>
          )}
        </>
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
        <div className="space-y-3">
          <Field label="Name" required>
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Screens"
            />
          </Field>
          <Field label="Group" hint="Optional — groups related collections together on this page.">
            <Input
              list="new-collection-groups"
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
              placeholder="e.g. Camera Lens"
            />
            <datalist id="new-collection-groups">
              {existingGroups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function CollectionCard({
  c,
  selected,
  onToggle,
}: {
  c: CollectionSummary;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <Link
      href={`/portal/collections/${c.id}`}
      className={`group relative overflow-hidden rounded-xl border bg-surface shadow-sm transition-all hover:shadow-md ${
        selected ? "border-accent ring-2 ring-accent/40" : "border-line hover:border-accent"
      }`}
    >
      <label
        className={`absolute left-2 top-2 z-10 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border bg-surface/90 shadow-sm transition-opacity ${
          selected ? "border-accent opacity-100" : "border-line opacity-0 group-hover:opacity-100"
        }`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggle();
        }}
        title="Select to group"
      >
        <input
          type="checkbox"
          checked={selected}
          readOnly
          tabIndex={-1}
          className="h-4 w-4 accent-[var(--color-accent)]"
        />
      </label>
      <div className="flex h-28 items-center justify-center bg-subtle">
        {c.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.imageUrl} alt="" className="h-full w-full object-cover" />
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
  );
}
