"use client";

import { useCallback, useEffect, useState } from "react";
import { useIsOwner } from "@/lib/use-me";
import { Badge, Button, Card, SectionLabel } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

type Req = { email: string; name: string; at: string };
type Grant = { email: string; expiresAt: string };

const mins = (iso: string) =>
  Math.max(0, Math.round((+new Date(iso) - Date.now()) / 60000));

/**
 * Owner-only panel: approve or dismiss staff requests to see finance figures,
 * and revoke a live window early. Grants last 15 minutes, then auto-hide.
 */
export default function FinanceAccessPanel() {
  const isOwner = useIsOwner();
  const toast = useToast();
  const [requests, setRequests] = useState<Req[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/finance-access", { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      setRequests(d.requests ?? []);
      setGrants(d.grants ?? []);
    } catch {
      /* quiet */
    }
  }, []);

  useEffect(() => {
    if (!isOwner) return;
    void load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [isOwner, load]);

  if (!isOwner) return null;

  async function approve(email: string) {
    setBusy(email);
    try {
      const r = await fetch("/api/finance-access", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!r.ok) throw new Error();
      toast.success(`${email} can see finance for 15 minutes.`);
      await load();
    } catch {
      toast.error("Could not approve.");
    } finally {
      setBusy("");
    }
  }

  async function revoke(email: string) {
    setBusy(email);
    try {
      await fetch(`/api/finance-access?email=${encodeURIComponent(email)}`, {
        method: "DELETE",
      });
      await load();
    } finally {
      setBusy("");
    }
  }

  if (requests.length === 0 && grants.length === 0) return null;

  return (
    <Card>
      <div className="p-4 sm:p-5">
        <SectionLabel>Finance access</SectionLabel>
        <p className="mt-1 text-xs text-muted">
          Grant a member a 15-minute look at sales, earnings and totals.
        </p>

        {requests.length > 0 && (
          <ul className="mt-3 space-y-2">
            {requests.map((r) => (
              <li
                key={r.email}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2"
              >
                <span className="text-sm text-ink">
                  <strong>{r.name || r.email}</strong> is requesting access
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={busy === r.email}
                    onClick={() => approve(r.email)}
                  >
                    Approve 15 min
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy === r.email}
                    onClick={() => revoke(r.email)}
                  >
                    Dismiss
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {grants.length > 0 && (
          <ul className="mt-3 space-y-2">
            {grants.map((g) => (
              <li
                key={g.email}
                className="flex flex-wrap items-center justify-between gap-2 py-1"
              >
                <span className="flex items-center gap-2 text-sm text-ink-2">
                  {g.email}
                  <Badge tone="success">{mins(g.expiresAt)} min left</Badge>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy === g.email}
                  onClick={() => revoke(g.email)}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
