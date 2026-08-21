"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  SectionLabel,
  Segmented,
  Select,
  Skeleton,
  StatCard,
} from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { PhoneField } from "@/components/ui/PhoneField";
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

type TodayCust = {
  id: string | null;
  name: string;
  email: string;
  phone: string;
  hasAccount: boolean;
  dayTotal: number;
  dayPaid: number;
  invoiceCount: number;
};

export default function CustomersClient() {
  const toast = useToast();

  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [segment, setSegment] = useState("all");
  const [sortBy, setSortBy] = useState<
    "recent" | "name" | "company" | "invoices" | "billed" | "outstanding"
  >("recent");
  const [addOpen, setAddOpen] = useState(false);
  const [todayCust, setTodayCust] = useState<TodayCust[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkSeg, setBulkSeg] = useState<SegmentKey>("shop");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [sendingToday, setSendingToday] = useState(false);

  // Email + WhatsApp every registered customer billed today their own itemised
  // summary. Walk-ins (no account) are skipped — there's nobody to send to.
  const sendTodayInvoices = async () => {
    const targets = todayCust.filter((c) => c.id && (c.email || c.phone));
    if (targets.length === 0) {
      toast.error("No customers with contact details were billed today.");
      return;
    }
    if (
      !window.confirm(
        `Send ${targets.length} customer${targets.length === 1 ? "" : "s"} their itemised today's summary (email with PDF and/or WhatsApp)?`,
      )
    ) {
      return;
    }
    setSendingToday(true);
    let emails = 0;
    let whats = 0;
    let fails = 0;
    for (const c of targets) {
      if (c.email) {
        try {
          const r = await fetch(`/api/customers/${c.id}/today`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ channel: "email" }),
          });
          r.ok ? emails++ : fails++;
        } catch {
          fails++;
        }
      }
      if (c.phone) {
        try {
          const r = await fetch(`/api/customers/${c.id}/today`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ channel: "whatsapp" }),
          });
          if (r.ok) whats++;
        } catch {
          /* WhatsApp is best-effort */
        }
      }
    }
    setSendingToday(false);
    toast.success(
      `Done — ${emails} email${emails === 1 ? "" : "s"}, ${whats} WhatsApp${whats === 1 ? "" : "s"}${fails ? `, ${fails} failed` : ""} across ${targets.length} customer${targets.length === 1 ? "" : "s"}.`,
    );
  };

  useEffect(() => {
    fetch("/api/reports/today-customers", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { customers: [] }))
      .then((d: { customers: TodayCust[] }) => setTodayCust(d.customers))
      .catch(() => {});
  }, []);

  const { visible, hidden, toggle, reset } = useColumns("customers", COLUMNS, [
    "company",
  ]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchPage = useCallback(
    async (next: string | null) => {
      const params = new URLSearchParams({ limit: "200", segment });
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
    let alive = true;
    setLoading(true);
    setPage(1);
    (async () => {
      const all: CustomerSummary[] = [];
      let cur: string | null = null;
      let tot = 0;
      for (let i = 0; i < 200; i++) {
        const d = await fetchPage(cur);
        if (!alive) return;
        all.push(...d.customers);
        tot = d.total;
        if (!d.nextCursor) break;
        cur = d.nextCursor;
      }
      if (!alive) return;
      setCustomers(all);
      setTotal(tot);
    })()
      .catch((e: Error) => alive && toast.error(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [fetchPage, toast]);

  useEffect(() => reload(), [reload]);

  const allSelected = customers.length > 0 && customers.every((c) => selected.has(c.id));
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected((prev) =>
      prev.size === customers.length ? new Set() : new Set(customers.map((c) => c.id)),
    );
  const clearSel = () => setSelected(new Set());

  const runBulk = async (
    action: "delete" | "addSegments" | "removeSegments",
  ) => {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (
      action === "delete" &&
      !window.confirm(
        `Delete ${ids.length} customer${ids.length === 1 ? "" : "s"}? Anyone with invoice history is kept automatically.`,
      )
    ) {
      return;
    }
    setBulkBusy(true);
    try {
      const res = await fetch("/api/customers/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ids, segments: [bulkSeg] }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Bulk action failed.");
      if (action === "delete") {
        toast.success(
          `Deleted ${d.deleted}${d.skipped ? ` — kept ${d.skipped} with invoice history` : ""}.`,
        );
      } else {
        toast.success(
          `${action === "addSegments" ? "Added" : "Removed"} “${bulkSeg}” on ${d.updated} customer${d.updated === 1 ? "" : "s"}.`,
        );
      }
      clearSel();
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBulkBusy(false);
    }
  };

  const isVisible = (k: ColKey) => visible.some((v) => v.key === k);
  const owedTotal = customers.reduce((s, c) => s + Math.max(c.outstanding, 0), 0);
  const billedTotal = customers.reduce((s, c) => s + c.totalBilled, 0);

  // Client-side sort of whatever's been loaded. Search/segment still filter on
  // the server; this only re-orders the rows in hand.
  const sorted = useMemo(() => {
    const rows = [...customers];
    switch (sortBy) {
      case "name":
        return rows.sort((a, b) => a.name.localeCompare(b.name));
      case "company":
        return rows.sort((a, b) => (a.company || "").localeCompare(b.company || ""));
      case "invoices":
        return rows.sort((a, b) => b.invoiceCount - a.invoiceCount);
      case "billed":
        return rows.sort((a, b) => b.totalBilled - a.totalBilled);
      case "outstanding":
        return rows.sort((a, b) => b.outstanding - a.outstanding);
      default: // recent — most recently added first
        return rows.sort(
          (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
        );
    }
  }, [customers, sortBy]);

  useEffect(() => setPage(1), [sortBy]);
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page, pageSize]);

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
          <>
            {todayCust.some((c) => c.id && (c.email || c.phone)) && (
              <Button
                variant="secondary"
                loading={sendingToday}
                onClick={sendTodayInvoices}
                title="Email each customer their itemised today's bills (PDF) + WhatsApp summary"
              >
                Send today&apos;s invoices
              </Button>
            )}
            <Button variant="primary" onClick={() => setAddOpen(true)}>
              Add customer
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Accounts" value={total.toLocaleString()} loading={loading} />
        <StatCard label="Total billed" value={money(billedTotal)} loading={loading} />
        <StatCard label="Outstanding" value={money(owedTotal)} tone="warning" loading={loading} />
        <StatCard
          label="On account"
          value={customers.filter((c) => c.outstanding > 0).length}
          loading={loading}
        />
      </div>

      {todayCust.length > 0 && (
        <div className="mb-6">
          <SectionLabel>Today&apos;s customers</SectionLabel>
          <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-subtle text-left text-xs font-semibold text-ink-2">
                <tr>
                  <th className="px-4 py-2.5">Customer</th>
                  <th className="px-4 py-2.5 text-right">Bills</th>
                  <th className="px-4 py-2.5 text-right">Billed today</th>
                  <th className="px-4 py-2.5 text-right">Paid today</th>
                  <th className="px-4 py-2.5 text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {todayCust.map((c, i) => {
                  const out = Math.max(0, Math.round((c.dayTotal - c.dayPaid) * 100) / 100);
                  return (
                    <tr key={c.id ?? `walkin-${i}`}>
                      <td className="px-4 py-2.5 font-medium text-ink">
                        {c.id ? (
                          <Link href={`/portal/customers/${c.id}`} className="hover:text-accent">
                            {c.name}
                          </Link>
                        ) : (
                          c.name
                        )}
                      </td>
                      <td className="tnum px-4 py-2.5 text-right text-muted">{c.invoiceCount}</td>
                      <td className="tnum px-4 py-2.5 text-right text-ink">{money(c.dayTotal)}</td>
                      <td className="tnum px-4 py-2.5 text-right text-success">{money(c.dayPaid)}</td>
                      <td className="tnum px-4 py-2.5 text-right">
                        <span className={out > 0 ? "font-medium text-warning" : "text-muted"}>
                          {money(out)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name, company, phone or email"
          className="h-9 w-full sm:w-64"
          aria-label="Search customers"
        />
        <Segmented
          value={segment}
          onChange={setSegment}
          options={[
            { value: "all", label: "All" },
            ...SEGMENTS.map((s) => ({ value: s.key, label: s.label })),
          ]}
        />
        <Select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="h-9 w-auto"
          aria-label="Sort customers"
          title="Sort customers"
        >
          <option value="recent">Recently added</option>
          <option value="outstanding">Most outstanding</option>
          <option value="billed">Highest billed</option>
          <option value="invoices">Most invoices</option>
          <option value="name">Name A–Z</option>
          <option value="company">Company A–Z</option>
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

      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-accent/40 bg-accent-subtle px-3 py-2">
          <span className="text-sm font-medium text-ink">
            {selected.size} selected
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Select
              value={bulkSeg}
              onChange={(e) => setBulkSeg(e.target.value as SegmentKey)}
              className="h-9 w-auto"
              aria-label="Segment to add or remove"
            >
              {SEGMENTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>
            <Button
              variant="secondary"
              size="sm"
              disabled={bulkBusy}
              onClick={() => runBulk("addSegments")}
            >
              Add segment
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={bulkBusy}
              onClick={() => runBulk("removeSegments")}
            >
              Remove
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={bulkBusy}
              onClick={() => runBulk("delete")}
            >
              Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSel}>
              Clear
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] border-collapse text-sm">
            <thead className="border-b border-line bg-subtle">
              <tr>
                <th scope="col" className="w-9 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all customers"
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                </th>
                {visible.map((d) => (
                  <th
                    key={d.key}
                    scope="col"
                    className={cx(
                      "px-3 py-2.5 text-xs font-semibold text-ink-2",
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
                    <td colSpan={visible.length + 1} className="px-3 py-3">
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={visible.length + 1}>
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
                pageRows.map((c) => (
                  <tr
                    key={c.id}
                    className={cx(
                      "border-b border-line transition-colors last:border-0 hover:bg-subtle/60",
                      selected.has(c.id) && "bg-accent-subtle/50",
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggleOne(c.id)}
                        aria-label={`Select ${c.name}`}
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                    </td>
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

        {!loading && sorted.length > 0 && (
          <Pagination
            total={sorted.length}
            page={page}
            pageSize={pageSize}
            onPage={setPage}
            onPageSize={setPageSize}
          />
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
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [postcode, setPostcode] = useState("");
  const [notes, setNotes] = useState("");
  const [opening, setOpening] = useState("");
  const [segments, setSegments] = useState<SegmentKey[]>(["shop"]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setCompany("");
      setPhone("");
      setEmail("");
      setAddress("");
      setCity("");
      setPostcode("");
      setNotes("");
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
          address,
          city,
          postcode,
          notes,
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
            <PhoneField value={phone} onChange={setPhone} />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Address">
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street address"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Town / city">
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <Field label="Postcode">
            <Input value={postcode} onChange={(e) => setPostcode(e.target.value)} />
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
        <Field label="Note">
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything worth remembering about this account"
          />
        </Field>
      </div>
    </Modal>
  );
}
