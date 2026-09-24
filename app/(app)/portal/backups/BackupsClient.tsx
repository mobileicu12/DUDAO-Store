"use client";

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { useIsOwner } from "@/lib/use-me";
import { Alert, Button, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

type SavedBackup = {
  id: string;
  createdAt: string;
  kind: string;
  label: string;
  sizeBytes: number;
};
type LatestBackup = {
  counts: Record<string, number>;
  createdAt: string;
  sizeBytes: number;
} | null;
type Retention = {
  keepInDatabase: number;
  keepOffsite: number;
  offsite: { configured: boolean };
};

// Order + friendly labels for the "last backup contained" panel. Keys map 1:1
// to buildBackupSnapshot().counts; any extra key falls back to its raw name.
const COUNT_LABELS: [key: string, label: string][] = [
  ["products", "products"],
  ["variants", "variants"],
  ["collections", "collections"],
  ["customers", "customers"],
  ["invoices", "invoices"],
  ["payments", "payments"],
  ["users", "team members"],
  ["expenses", "expenses"],
  ["buying", "buying entries"],
  ["cashUps", "cash-ups"],
  ["attendance", "attendance records"],
  ["auditLogs", "activity log entries"],
];

export default function BackupsClient() {
  const isOwner = useIsOwner();
  const toast = useToast();

  const [driveBusy, setDriveBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [backups, setBackups] = useState<SavedBackup[]>([]);
  const [retention, setRetention] = useState<Retention | null>(null);
  const [latest, setLatest] = useState<LatestBackup>(null);
  const [restoringId, setRestoringId] = useState("");

  const loadBackups = useCallback(() => {
    fetch("/api/backups", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setBackups(d.backups ?? []);
        setRetention(d);
        setLatest(d.latest ?? null);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (isOwner) loadBackups();
  }, [isOwner, loadBackups]);

  const fmtBytes = (n: number) =>
    n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
  const fmtWhen = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const download = async () => {
    try {
      const res = await fetch("/api/backup");
      if (!res.ok) throw new Error("The backup could not be built.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dudao-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup downloaded.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const backupNow = async () => {
    setDriveBusy(true);
    try {
      const res = await fetch("/api/cron/backup-drive", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        r2?: { key: string } | null;
        r2Error?: string | null;
        drive?: { file: string } | null;
        driveError?: string | null;
      };
      if (!res.ok) throw new Error(body.error ?? "The backup did not run.");
      const offsiteOk = body.r2 || body.drive;
      const offsiteErr = body.r2Error || body.driveError;
      if (offsiteOk) {
        toast.success("Backup saved.", "Stored in the database and off-site storage.");
      } else if (offsiteErr) {
        toast.success("Backup saved to the database.", `Off-site copy failed: ${offsiteErr}`);
      } else {
        toast.success(
          "Backup saved.",
          "Stored in the database. (Off-site storage isn't set up yet.)",
        );
      }
      loadBackups();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDriveBusy(false);
    }
  };

  const restoreFromFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    let snapshot: unknown;
    try {
      snapshot = JSON.parse(await file.text());
    } catch {
      toast.error("That file isn't valid JSON — pick a DUDAO backup file.");
      return;
    }
    const typed = window.prompt(
      "Restore will REPLACE all current products, customers, invoices and the ledger with the contents of this backup. This cannot be undone (a pre-restore copy is saved off-site if configured).\n\nType RESTORE to confirm:",
    );
    if (typed !== "RESTORE") {
      if (typed !== null) toast.error("Restore cancelled — you didn't type RESTORE.");
      return;
    }
    setRestoreBusy(true);
    try {
      const res = await fetch("/api/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        restored?: { products: number; customers: number; invoices: number };
      };
      if (!res.ok) throw new Error(body.error ?? "The restore failed.");
      const r = body.restored;
      toast.success(
        "Backup restored.",
        r ? `${r.products} products, ${r.customers} customers, ${r.invoices} invoices.` : undefined,
      );
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRestoreBusy(false);
    }
  };

  const restoreSaved = async (b: SavedBackup) => {
    const typed = window.prompt(
      `Restore the backup from ${fmtWhen(b.createdAt)}? This REPLACES all current data with that snapshot. A pre-restore copy is saved off-site first if configured.\n\nType RESTORE to confirm:`,
    );
    if (typed !== "RESTORE") {
      if (typed !== null) toast.error("Restore cancelled — you didn't type RESTORE.");
      return;
    }
    setRestoringId(b.id);
    try {
      const res = await fetch(`/api/backups/${b.id}/restore`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        restored?: { products: number; customers: number; invoices: number };
      };
      if (!res.ok) throw new Error(body.error ?? "The restore failed.");
      const r = body.restored;
      toast.success(
        "Backup restored.",
        r ? `${r.products} products, ${r.customers} customers, ${r.invoices} invoices.` : undefined,
      );
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRestoringId("");
    }
  };

  if (!isOwner) {
    return (
      <div>
        <PageHeader title="Backup" subtitle="Owner only." />
        <Alert tone="warning" title="Owner only">
          Backups are available to the business owner only.
        </Alert>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Backup" subtitle="A full snapshot of everything, and restore." />

      <div className="space-y-3">
        <Card>
          <CardHeader title="Back up now" subtitle="A full JSON snapshot, including customer ledgers." />
          <p className="mt-2 text-sm text-muted">
            Customer ledgers and opening balances live only in this database. Keep
            a copy — a normal database export from your host is not a substitute
            for this if you ever need to read the numbers back.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={download}>Download full backup</Button>
            <Button variant="secondary" loading={driveBusy} onClick={backupNow}>
              Back up now (database + off-site)
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted">
            A dated snapshot is saved automatically every night — always into this
            database, and off-site to Cloudflare R2 storage once it&apos;s set up (a
            static access key that never expires).{" "}
            {retention
              ? `Kept: the last ${retention.keepInDatabase} here (about 2 weeks) and the last ${retention.keepOffsite} off-site (about a month); older ones are removed automatically. Off-site is ${retention.offsite.configured ? "connected" : "not set up yet"}.`
              : "Older copies are removed automatically."}
          </p>
        </Card>

        {latest && Object.keys(latest.counts).length > 0 && (
          <Card>
            <CardHeader
              title="Last backup contained"
              subtitle={`Captured ${fmtWhen(latest.createdAt)} · ${fmtBytes(latest.sizeBytes)}`}
            />
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              {[
                ...COUNT_LABELS.filter(([k]) => k in latest.counts),
                ...Object.keys(latest.counts)
                  .filter((k) => !COUNT_LABELS.some(([lk]) => lk === k))
                  .map((k) => [k, k] as [string, string]),
              ].map(([k, label]) => (
                <li key={k} className="flex items-baseline gap-1.5">
                  <span className="tnum text-base font-semibold text-ink">{latest.counts[k]}</span>
                  <span className="text-xs text-muted">{label}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">
              Cross-check these against your live totals — if they match, the
              snapshot has everything.
            </p>
          </Card>
        )}

        <Card>
          <div className="flex items-center justify-between">
            <CardHeader title="Saved backups" subtitle="Download or restore any stored snapshot." />
            <button
              type="button"
              onClick={loadBackups}
              className="text-xs font-medium text-muted transition-colors hover:text-ink"
            >
              ↻ Refresh
            </button>
          </div>
          {backups.length === 0 ? (
            <p className="mt-2 text-xs text-muted">
              No saved backups yet. They appear here after the nightly run or when
              you press &ldquo;Back up now&rdquo;.
            </p>
          ) : (
            <div className="mt-2 overflow-hidden rounded-lg border border-line">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-subtle text-xs uppercase text-muted">
                  <tr>
                    <th className="px-3 py-2">When</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Size</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {backups.map((b) => (
                    <tr key={b.id}>
                      <td className="whitespace-nowrap px-3 py-2 font-medium text-ink">
                        {fmtWhen(b.createdAt)}
                      </td>
                      <td className="px-3 py-2 text-muted">
                        {b.kind === "auto" ? "Nightly" : "Manual"}
                      </td>
                      <td className="tnum whitespace-nowrap px-3 py-2 text-muted">
                        {fmtBytes(b.sizeBytes)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <a
                          href={`/api/backups/${b.id}`}
                          className="mr-3 text-xs font-semibold text-accent hover:underline"
                        >
                          Download
                        </a>
                        <button
                          type="button"
                          onClick={() => restoreSaved(b)}
                          disabled={!!restoringId}
                          className="text-xs font-semibold text-danger hover:underline disabled:opacity-50"
                        >
                          {restoringId === b.id ? "Restoring…" : "Restore"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Restore from a file" subtitle="Replaces everything with a backup file." />
          <p className="mt-1 text-xs text-muted">
            Use this only to recover from a mistake or data loss — the current data
            is copied off-site first so a wrong restore can be undone.
          </p>
          <label className="mt-3 inline-flex">
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={restoreFromFile}
              disabled={restoreBusy}
            />
            <span
              className="inline-flex h-9 cursor-pointer items-center rounded-md border border-danger/40 bg-danger-subtle px-3.5 text-sm font-semibold text-danger transition-colors hover:bg-danger/10"
              aria-disabled={restoreBusy}
            >
              {restoreBusy ? "Restoring…" : "Restore from backup file…"}
            </span>
          </label>
        </Card>
      </div>
    </div>
  );
}
