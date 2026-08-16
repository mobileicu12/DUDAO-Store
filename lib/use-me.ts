"use client";

import { useEffect, useState } from "react";
import type { Me } from "./permissions";

export type MeState = {
  me: Me | null;
  canSeeFinance: boolean;
  /** ISO expiry of a temporary finance-reveal window, if any. */
  financeExpiresAt: string | null;
  /** True while a finance-access request is awaiting owner approval. */
  financePending: boolean;
  viaMaster: boolean;
  dbConfigured: boolean;
  loading: boolean;
};

/**
 * One in-flight request and one cached answer for the whole tab. Every page
 * shell, nav and finance-gated widget calls useMe(), so without this the app
 * would fire /api/me a dozen times per navigation.
 */
let cache: Omit<MeState, "loading"> | null = null;
let inflight: Promise<Omit<MeState, "loading">> | null = null;
const listeners = new Set<(s: Omit<MeState, "loading">) => void>();

const EMPTY: Omit<MeState, "loading"> = {
  me: null,
  canSeeFinance: false,
  financeExpiresAt: null,
  financePending: false,
  viaMaster: false,
  dbConfigured: true,
};

async function load(): Promise<Omit<MeState, "loading">> {
  if (cache) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      if (!res.ok) return EMPTY;
      const json = (await res.json()) as {
        user: Me | null;
        canSeeFinance?: boolean;
        financeExpiresAt?: string | null;
        financePending?: boolean;
        viaMaster?: boolean;
        dbConfigured?: boolean;
      };
      const next = {
        me: json.user,
        canSeeFinance: Boolean(json.canSeeFinance),
        financeExpiresAt: json.financeExpiresAt ?? null,
        financePending: Boolean(json.financePending),
        viaMaster: Boolean(json.viaMaster),
        dbConfigured: json.dbConfigured !== false,
      };
      cache = next;
      listeners.forEach((fn) => fn(next));
      return next;
    } catch {
      return EMPTY;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Force a refetch — call after the team screen changes your own permissions. */
export function refreshMe(): void {
  cache = null;
  void load();
}

export function useMe(): MeState {
  const [state, setState] = useState<Omit<MeState, "loading">>(
    () => cache ?? EMPTY,
  );
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    let alive = true;
    listeners.add(setState);

    void load().then((next) => {
      if (!alive) return;
      setState(next);
      setLoading(false);
    });

    return () => {
      alive = false;
      listeners.delete(setState);
    };
  }, []);

  return { ...state, loading };
}

export function useIsOwner(): boolean {
  return useMe().me?.role === "owner";
}

/**
 * Gate for all-time money. Counter staff see today's takings and what a
 * customer owes; turnover and lifetime totals need the `reports` permission.
 * Defaults to false while loading so a figure never flashes on screen before
 * the check resolves.
 */
export function useCanSeeFinance(): boolean {
  return useMe().canSeeFinance;
}
