"use client";

import { useState } from "react";
import { refreshMe, useMe } from "@/lib/use-me";
import { Button } from "@/components/ui/primitives";

/**
 * Shown where finance figures are hidden from a member. Lets them ask the owner
 * for a temporary look; once granted, the figures appear on the next refresh.
 * Renders nothing for owners or anyone who can already see finance.
 */
export default function FinanceRequestButton() {
  const { me, canSeeFinance, financePending, loading } = useMe();
  const [busy, setBusy] = useState(false);

  if (loading || !me || me.role === "owner" || canSeeFinance) return null;

  async function request() {
    setBusy(true);
    try {
      await fetch("/api/finance-access", { method: "POST" });
      refreshMe();
    } finally {
      setBusy(false);
    }
  }

  if (financePending) {
    return (
      <p className="text-xs text-muted">
        Finance access requested — waiting for the owner to approve.
      </p>
    );
  }

  return (
    <Button variant="secondary" size="sm" loading={busy} onClick={request}>
      Request to see finance
    </Button>
  );
}
