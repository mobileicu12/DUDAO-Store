"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import type { PortalSettings } from "@/lib/settings";
import { useIsOwner } from "@/lib/use-me";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  PageHeader,
  Skeleton,
  Switch,
  Textarea,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";

type SettingsResponse = PortalSettings & {
  integrations: {
    whatsappConfigured: boolean;
    whatsappTemplate: string;
    emailConfigured: boolean;
  };
};

export default function SettingsClient() {
  const toast = useToast();
  const isOwner = useIsOwner();

  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // WhatsApp fields are write-only; empty means "keep stored".
  const [waToken, setWaToken] = useState("");
  const [waPhoneId, setWaPhoneId] = useState("");
  const [waTemplate, setWaTemplate] = useState("");
  const [savingWa, setSavingWa] = useState(false);

  type Shift = {
    email: string;
    name: string;
    tapIn: string;
    tapOut: string | null;
    autoOut: boolean;
    minutes: number;
    open: boolean;
  };
  const [shifts, setShifts] = useState<Shift[]>([]);
  useEffect(() => {
    fetch("/api/attendance", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { today?: Shift[] } | null) => d?.today && setShifts(d.today))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: SettingsResponse) => {
        setSettings(d);
        setWaTemplate(d.integrations.whatsappTemplate ?? "");
      })
      .catch(() => toast.error("Could not load your settings."))
      .finally(() => setLoading(false));
  }, [toast]);

  const set = (patch: Partial<PortalSettings>) =>
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Those settings were not saved.");
      setSettings(body);
      toast.success("Settings saved.", "They appear on your next invoice.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const saveWhatsApp = async () => {
    setSavingWa(true);
    try {
      const res = await fetch("/api/settings/whatsapp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsappToken: waToken,
          whatsappPhoneId: waPhoneId,
          whatsappTemplate: waTemplate,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Those credentials were not saved.");
      // Never store the token in state — clear the inputs, keep only status.
      setWaToken("");
      setWaPhoneId("");
      set({ ...(settings as PortalSettings) });
      setSettings((prev) =>
        prev ? { ...prev, integrations: { ...prev.integrations, ...body } } : prev,
      );
      toast.success("WhatsApp credentials saved.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingWa(false);
    }
  };

  const sendDigestNow = async () => {
    try {
      const res = await fetch("/api/cron/daily-digest", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "The digest did not run.");
      toast.success(
        `Digest sent — ${body.customers ?? 0} customer message${body.customers === 1 ? "" : "s"}.`,
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const backup = async () => {
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

  const [driveBusy, setDriveBusy] = useState(false);
  const backupToDrive = async () => {
    setDriveBusy(true);
    try {
      const res = await fetch("/api/cron/backup-drive", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string; file?: string };
      if (!res.ok) throw new Error(body.error ?? "The Drive backup did not run.");
      toast.success(`Backed up to Google Drive: ${body.file ?? "done"}.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDriveBusy(false);
    }
  };

  const [restoreBusy, setRestoreBusy] = useState(false);
  const restore = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    let snapshot: unknown;
    try {
      snapshot = JSON.parse(await file.text());
    } catch {
      toast.error("That file isn't valid JSON — pick a DUDAO backup file.");
      return;
    }
    const typed = window.prompt(
      "Restore will REPLACE all current products, customers, invoices and the ledger with the contents of this backup. This cannot be undone (a pre-restore copy is saved to Drive if configured).\n\nType RESTORE to confirm:",
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

  if (loading || !settings) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Business details, tax, documents and integrations."
        actions={
          <Button variant="primary" loading={saving} onClick={save}>
            Save settings
          </Button>
        }
      />

      <div className="space-y-4">
        {/* Business */}
        <Card>
          <CardHeader
            title="Business details"
            subtitle="Printed on every invoice and statement."
          />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Business name">
              <Input value={settings.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="Tagline">
              <Input value={settings.tagline} onChange={(e) => set({ tagline: e.target.value })} />
            </Field>
            <Field label="Address" hint="Use | or new lines for separate lines." className="sm:col-span-2">
              <Textarea
                rows={2}
                value={settings.address}
                onChange={(e) => set({ address: e.target.value })}
              />
            </Field>
            <Field label="Email">
              <Input value={settings.email} onChange={(e) => set({ email: e.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={settings.phone} onChange={(e) => set({ phone: e.target.value })} />
            </Field>
            <Field label="Website">
              <Input value={settings.website} onChange={(e) => set({ website: e.target.value })} />
            </Field>
            <Field label="VAT / tax number">
              <Input value={settings.taxNumber} onChange={(e) => set({ taxNumber: e.target.value })} />
            </Field>
            <Field label="Bank details" hint="Shown on unpaid invoices as how-to-pay." className="sm:col-span-2">
              <Textarea
                rows={2}
                value={settings.bankDetails}
                onChange={(e) => set({ bankDetails: e.target.value })}
              />
            </Field>
            <Field label="Invoice footer" className="sm:col-span-2">
              <Input value={settings.invoiceFooter} onChange={(e) => set({ invoiceFooter: e.target.value })} />
            </Field>
          </div>
        </Card>

        {/* Trading */}
        <Card>
          <CardHeader title="Trading rules" />
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="Invoice prefix" hint="e.g. DUD → DUD-2026-0001">
              <Input
                value={settings.invoicePrefix}
                onChange={(e) => set({ invoicePrefix: e.target.value.toUpperCase() })}
              />
            </Field>
            <Field label="Tax rate %">
              <Input
                type="number"
                step="0.5"
                value={settings.taxRate}
                onChange={(e) => set({ taxRate: Number(e.target.value) })}
              />
            </Field>
            <Field label="Low-stock threshold">
              <Input
                type="number"
                value={settings.lowStockThreshold}
                onChange={(e) => set({ lowStockThreshold: Number(e.target.value) })}
              />
            </Field>
            <Field label="Currency code">
              <Input value={settings.currency} onChange={(e) => set({ currency: e.target.value.toUpperCase() })} />
            </Field>
            <Field label="Custom favicon URL" className="sm:col-span-2">
              <Input
                value={settings.faviconUrl}
                onChange={(e) => set({ faviconUrl: e.target.value })}
                placeholder="https://…/favicon.png"
              />
            </Field>
          </div>
        </Card>

        {/* Digest */}
        <Card>
          <CardHeader
            title="Daily digest"
            subtitle="End-of-day summaries by email and WhatsApp."
          />
          <div className="mt-3 space-y-3">
            <Switch
              checked={settings.digestEnabled}
              onChange={(v) => set({ digestEnabled: v })}
              label="Run the daily digest"
            />
            <Switch
              checked={settings.digestToCustomers}
              onChange={(v) => set({ digestToCustomers: v })}
              label="Send each customer their own day summary"
            />
            <Switch
              checked={settings.digestToOwner}
              onChange={(v) => set({ digestToOwner: v })}
              label="Send the owner an all-customers summary"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Owner email">
                <Input
                  value={settings.digestOwnerEmail}
                  onChange={(e) => set({ digestOwnerEmail: e.target.value })}
                />
              </Field>
              <Field label="Owner WhatsApp number">
                <Input
                  value={settings.digestOwnerWa}
                  onChange={(e) => set({ digestOwnerWa: e.target.value })}
                  placeholder="+44…"
                />
              </Field>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={sendDigestNow}>Send now</Button>
              <span className="text-xs text-muted">
                Runs the digest immediately for today.
              </span>
            </div>
          </div>
        </Card>

        {/* WhatsApp */}
        <Card>
          <CardHeader
            title="WhatsApp credentials"
            subtitle="Write-only — the token is never shown back once saved."
          />
          {settings.integrations.whatsappConfigured ? (
            <Alert tone="success" title="WhatsApp is connected">
              Leave the fields blank to keep the stored token, or enter new
              values to replace it.
            </Alert>
          ) : (
            <Alert tone="neutral">
              Add your Meta Cloud API token and phone number ID to send invoices
              over WhatsApp.
            </Alert>
          )}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Access token" hint="Stored securely; never returned.">
              <Input
                type="password"
                value={waToken}
                onChange={(e) => setWaToken(e.target.value)}
                placeholder={settings.integrations.whatsappConfigured ? "•••••• saved" : "EAAG…"}
              />
            </Field>
            <Field label="Phone number ID">
              <Input
                value={waPhoneId}
                onChange={(e) => setWaPhoneId(e.target.value)}
                placeholder={settings.integrations.whatsappConfigured ? "•••••• saved" : "1234567890"}
              />
            </Field>
            <Field label="Approved template name" hint="Needed for messages outside the 24h window." className="sm:col-span-2">
              <Input
                value={waTemplate}
                onChange={(e) => setWaTemplate(e.target.value)}
                placeholder="invoice_notification"
              />
            </Field>
          </div>
          <Button className="mt-3" loading={savingWa} onClick={saveWhatsApp}>
            Save WhatsApp credentials
          </Button>
        </Card>

        {/* Staff */}
        <Card>
          <CardHeader title="Staff" />
          <div className="mt-3 space-y-3">
            <Switch
              checked={settings.requireTapIn}
              onChange={(v) => set({ requireTapIn: v })}
              label="Require staff to tap in at the start of a shift"
            />
            {shifts.length > 0 && (
              <div className="rounded-lg border border-line">
                <p className="border-b border-line px-3 py-2 text-xs font-semibold tracking-wide text-muted uppercase">
                  Today&apos;s shifts
                </p>
                <ul className="divide-y divide-line">
                  {shifts.map((s, i) => {
                    const time = (iso: string) =>
                      new Date(iso).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                    const h = Math.floor(s.minutes / 60);
                    const m = s.minutes % 60;
                    return (
                      <li
                        key={`${s.email}-${i}`}
                        className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                      >
                        <span className="min-w-0 truncate text-ink">
                          {s.name || s.email}
                        </span>
                        <span className="tnum shrink-0 text-muted">
                          {time(s.tapIn)}–{s.open ? "now" : time(s.tapOut!)}
                          {" · "}
                          {h ? `${h}h ` : ""}
                          {m}m
                          {s.open && (
                            <span className="ml-1.5 rounded-full bg-success-subtle px-1.5 py-0.5 text-[0.65rem] font-semibold text-success">
                              in
                            </span>
                          )}
                          {s.autoOut && (
                            <span className="ml-1.5 text-[0.65rem] text-faint">auto</span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <Field
              label="Show day-reports button after this hour"
              hint="0–23. The header shows a today's-reports shortcut after this time."
            >
              <Input
                type="number"
                min="0"
                max="23"
                value={settings.reportButtonHour}
                onChange={(e) => set({ reportButtonHour: Number(e.target.value) })}
                className="w-24"
              />
            </Field>
          </div>
        </Card>

        {/* Backup */}
        {isOwner && (
          <Card>
            <CardHeader
              title="Backup"
              subtitle="A full JSON snapshot, including customer ledgers."
            />
            <p className="mt-2 text-sm text-muted">
              Customer ledgers and opening balances live only in this database.
              Keep a copy — a normal database export from your host is not a
              substitute for this if you ever need to read the numbers back.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={backup}>Download full backup</Button>
              <Button variant="secondary" loading={driveBusy} onClick={backupToDrive}>
                Back up to Google Drive now
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted">
              A dated snapshot is also saved to your Google Drive automatically
              every night. The last 7 daily backups are kept, so you always have
              the last few days and a roughly week-old copy.
            </p>

            <div className="mt-4 border-t border-line pt-4">
              <p className="text-sm font-medium text-ink">Restore from a backup</p>
              <p className="mt-1 text-xs text-muted">
                Replaces everything with the contents of a backup file. Use this
                only to recover from a mistake or data loss — the current data is
                copied to Drive first so a wrong restore can be undone.
              </p>
              <label className="mt-3 inline-flex">
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={restore}
                  disabled={restoreBusy}
                />
                <span
                  className="inline-flex h-9 cursor-pointer items-center rounded-md border border-danger/40 bg-danger-subtle px-3.5 text-sm font-semibold text-danger transition-colors hover:bg-danger/10"
                  aria-disabled={restoreBusy}
                >
                  {restoreBusy ? "Restoring…" : "Restore from backup…"}
                </span>
              </label>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
