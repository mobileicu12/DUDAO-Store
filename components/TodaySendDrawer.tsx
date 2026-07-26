"use client";

import { useCallback, useEffect, useState } from "react";
import { money } from "@/lib/business";
import { Drawer } from "@/components/ui/Modal";
import { Badge, Button, cx, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

type TodayCustomer = {
  id: string | null;
  name: string;
  email: string;
  phone: string;
  hasAccount: boolean;
  dayTotal: number;
  dayPaid: number;
  invoiceCount: number;
};

/** Per-customer, per-day sent state so staff can work the list without double-sending. */
const sentKey = () => `today-sent:${new Date().toISOString().slice(0, 10)}`;

function loadSent(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(sentKey()) ?? "{}");
  } catch {
    return {};
  }
}

function markSent(id: string, channel: string) {
  const all = loadSent();
  const list = new Set(all[id] ?? []);
  list.add(channel);
  all[id] = Array.from(list);
  localStorage.setItem(sentKey(), JSON.stringify(all));
}

export default function TodaySendDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const [customers, setCustomers] = useState<TodayCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [sent, setSent] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reports/today-customers", { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load today's customers.");
      const d = (await res.json()) as { customers: TodayCustomer[] };
      setCustomers(d.customers);
      setSent(loadSent());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const send = async (c: TodayCustomer, channel: "email" | "whatsapp") => {
    if (!c.id) return;
    setBusy(`${c.id}:${channel}`);
    try {
      // One route sends the day summary over the chosen channel, attaching the
      // itemised PDF for email and a signed statement link for WhatsApp.
      const res = await fetch(`/api/customers/${c.id}/today`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? "That message did not send.");
      }
      markSent(c.id, channel);
      setSent(loadSent());
      toast.success(`Sent to ${c.name} by ${channel}.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async (c: TodayCustomer) => {
    if (!c.id) return;
    // The public statement link is minted server-side; here we open it, which
    // is the reliable cross-device way to grab it.
    window.open(`/api/public/statement/${c.id}`, "_blank");
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Today's send"
      subtitle="Send each account their day summary, one at a time."
      width="md"
    >
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : customers.filter((c) => c.hasAccount).length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">
          No account customers billed today yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {customers
            .filter((c) => c.hasAccount)
            .map((c) => {
              const done = sent[c.id ?? ""] ?? [];
              return (
                <li
                  key={c.id}
                  className="rounded-xl border border-line bg-surface-2 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-ink">{c.name}</p>
                      <p className="text-xs text-muted">
                        {c.invoiceCount} invoice{c.invoiceCount === 1 ? "" : "s"} ·{" "}
                        {money(c.dayTotal)} · {money(c.dayPaid)} paid
                      </p>
                    </div>
                    {done.length > 0 && (
                      <Badge tone="success" dot>
                        Sent
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      loading={busy === `${c.id}:email`}
                      disabled={!c.email}
                      onClick={() => send(c, "email")}
                      className={cx(done.includes("email") && "opacity-60")}
                    >
                      {done.includes("email") ? "Email ✓" : "Email"}
                    </Button>
                    <Button
                      size="sm"
                      loading={busy === `${c.id}:whatsapp`}
                      disabled={!c.phone}
                      onClick={() => send(c, "whatsapp")}
                      className={cx(done.includes("whatsapp") && "opacity-60")}
                    >
                      {done.includes("whatsapp") ? "WhatsApp ✓" : "WhatsApp"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => copyLink(c)}>
                      Open statement
                    </Button>
                  </div>
                </li>
              );
            })}
        </ul>
      )}
    </Drawer>
  );
}
