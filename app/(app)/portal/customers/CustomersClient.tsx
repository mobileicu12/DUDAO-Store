"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { money } from "@/lib/business";
import { SEGMENTS, type SegmentKey } from "@/lib/segments";
import type { CustomerSummary } from "@/lib/customers";
import {
  ColumnChooser,
  useColumns,
  type ColumnDef,
} from "@/components/ColumnChooser";
import {
  Button,
  Card,
  cx,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Skeleton,
} from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

type ColKey =
  | "name"
  | "company"
  | "segments"
  | "contact"
  | "invoices"
  | "billed"
  | "outstanding";

const COLUMNS: ColumnDef<ColKey>[] = [
  { key: "name", label: "Customer", locked: true },
  { key: "company", label: "Company" },
  { key: "segments", label: "Source" },
  { key: "contact", label: "Contact" },
  { key: "invoices", label: "Invoices", numeric: true },
  { key: "billed", label: "Total billed", numeric: true },
  { key: "outstanding", label: "Outstanding", numeric: true, locked: true },
];

export default function CustomersClient() {
  const toast = useToast();

  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [segment, setSegment] = useState("all");
  const [addOpen, setAddOpen] = useState(false);

  const { visible, hidden, toggle, reset } = useColumns("customers", COLUMNS, [
    "company",
  ]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchPage = useCallback(
    async (next: string | null) => {
      const params = new URLSearchParams({ limit: "50", segment });
      if (debounced.trim()) params.set("q", debounced.trim());
      if (next) params.set("cursor", next);

      const res = await fetch(`/api/customers?${params}`, { cache: "no-store" });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? "Could not load your customers.");
      }
      return (await res.json()) as {
        customers: CustomerSummary[];
        nextCursor: string | null;
        total: number;
      };
    },
    [debounced, segment],
  );

  const reload = useCallback(() => {
    setLoading(true);
    fetchPage(null)
      .then((d) => {
        setCustomers(d.customers);
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
      setCustomers((prev) => [...prev, ...d.customers]);
      setCursor(d.nextCursor);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  const isVisible = (k: ColKey) => visible.some((v) => v.key === k);
  const owedTotal = customers.reduce((s, c) => s + Math.max(c.outstanding, 0), 0);

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle={
          loading
            ? "Loading…"
            : `${total.toLocaleString()} account${total === 1 ? "" : "s"}${owedTotal > 0 ? ` · ${money(owedTotal)} owed` : ""}`
        }
        actions={
          <Button variant="primary" onClick={() => setAddOpen(true)}>
            Add customer
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name, company, phone or email"
          className="h-9 w-full sm:w-64"
          aria-label="Search customers"
        />
        <Select
          value={segment}
          onChange={(e) => setSegment(e.target.value)}
          className="h-9 w-auto"
          aria-label="Source"
        >
          <option value="all">All sources</option>
          {SEGMENTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </Select>
        <div className="ml-auto">
          <ColumnChooser
            defs={COLUMNS}
            hidden={hidden}
            onToggle={toggle}
            onReset={reset}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] border-collapse text-sm">
            <thead className="border-b border-line bg-surface-2">
              <tr>
                {visible.map((d) => (
                  <th
                    key={d.key}
                    scope="col"
                    className={cx(
                      "px-3 py-2.5 text-xs font-semibold text-muted",
                      d.numeric ? "text-right" : "text-left",
                    )}
                  >
                    {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td colSpan={visible.length} className="px-3 py-3">
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={visible.length}>
                    <EmptyState
                      title={debounced ? "No accounts matched" : "No customers yet"}
                      message={
                        debounced
                          ? "Try part of the name, the company or a phone number."
                          : "Add your first trade account. You can set an opening balance to carry over existing debt."
                      }
                      action={
                        !debounced ? (
                          <Button variant="primary" onClick={() => setAddOpen(true)}>
                            Add customer
                          </Button>
                        ) : undefined
                      }
                    />
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-line transition-colors last:border-0 hover:bg-subtle/60"
                  >
                    {isVisible("name") && (
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/portal/customers/${c.id}`}
                          className="font-medium text-ink hover:text-accent"
                        >
                          {c.name}
                        </Link>
                      </td>
                    )}
                    {isVisible("company") && (
                      <td className="px-3 py-2.5 text-muted">{c.company || "—"}</td>
                    )}
                    {isVisible("segments") && (
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {c.segments.map((s) => {
                            const def = SEGMENTS.find((x) => x.key === s);
                            return def ? (
                              <span
                                key={s}
                                className={cx(
                                  "rounded-md px-1.5 py-0.5 text-[0.65rem] font-medium",
                                  def.badge,
                                )}
                              >
                                {def.short}
                              </span>
                            ) : null;
                          })}
                        </div>
                      </td>
                    )}
                    {isVisible("contact") && (
                      <td className="px-3 py-2.5 text-muted">
                        {c.phone || c.email || "—"}
                      </td>
                    )}
                    {isVisible("invoices") && (
                      <td className="tnum px-3 py-2.5 text-right text-muted">
                        {c.invoiceCount}
                      </td>
                    )}
                    {isVisible("billed") && (
                      <td className="tnum px-3 py-2.5 text-right text-muted">
                        {money(c.totalBilled)}
                      </td>
                    )}
                    {isVisible("outstanding") && (
                      <td className="tnum px-3 py-2.5 text-right">
                        <span
                          className={cx(
                            "font-medium",
                            c.outstanding > 0
                              ? "text-warning"
                              : c.outstanding < 0
                                ? "text-success"
                                : "text-muted",
                          )}
                        >
                          {c.outstanding < 0
                            ? `${money(Math.abs(c.outstanding))} credit`
                            : money(c.outstanding)}
                        </span>
                      </td>
                    )}
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
      </div>

      <AddCustomerModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => {
          setAddOpen(false);
          reload();
        }}
      />
    </div>
  );
}

function AddCustomerModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [opening, setOpening] = useState("");
  const [segments, setSegments] = useState<SegmentKey[]>(["shop"]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setCompany("");
      setPhone("");
      setEmail("");
      setOpening("");
      setSegments(["shop"]);
    }
  }, [open]);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          company,
          phone,
          email,
          segments,
          openingBalance: Number(opening) || 0,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "That customer was not saved.");
      toast.success(`${name} added.`);
      onCreated();
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
      title="Add a customer"
      size="sm"
      dismissable={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!name.trim()}
            onClick={submit}
          >
            Add customer
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Name" required>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Who the account is under"
          />
        </Field>
        <Field label="Company">
          <Input value={company} onChange={(e) => setCompany(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone">
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="07…"
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
        </div>
        <Field
          label="Opening balance"
          hint="What they already owe you from before this system. Leave blank if nothing."
        >
          <Input
            type="number"
            step="0.01"
            value={opening}
            onChange={(e) => setOpening(e.target.value)}
            placeholder="0.00"
          />
        </Field>
        <Field label="Source">
          <div className="flex flex-wrap gap-1.5">
            {SEGMENTS.map((s) => {
              const on = segments.includes(s.key);
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() =>
                    setSegments((prev) =>
                      on ? prev.filter((x) => x !== s.key) : [...prev, s.key],
                    )
                  }
                  className={cx(
                    "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                    on
                      ? "border-accent bg-accent-subtle text-accent"
                      : "border-line text-muted hover:bg-subtle",
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </Field>
      </div>
    </Modal>
  );
}
