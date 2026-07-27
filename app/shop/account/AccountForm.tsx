"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AccountForm({
  initial,
}: {
  initial: { name: string; company: string; email: string; phone: string };
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/shop/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setMsg({ tone: "err", text: body.error ?? "Could not save." });
        return;
      }
      setMsg({ tone: "ok", text: "Details saved." });
      router.refresh();
    } catch {
      setMsg({ tone: "err", text: "Could not reach the server." });
    } finally {
      setBusy(false);
    }
  };

  const field =
    "h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)]";
  const label = "block text-xs font-medium text-ink-2 mb-1.5";

  return (
    <form onSubmit={save} className="space-y-4">
      {msg && (
        <div
          className={
            msg.tone === "ok"
              ? "rounded-md bg-success-subtle px-3.5 py-2.5 text-sm text-success"
              : "rounded-md bg-danger-subtle px-3.5 py-2.5 text-sm text-danger"
          }
        >
          {msg.text}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="name">Name</label>
          <input id="name" className={field} value={form.name} onChange={set("name")} />
        </div>
        <div>
          <label className={label} htmlFor="company">Company</label>
          <input id="company" className={field} value={form.company} onChange={set("company")} />
        </div>
        <div>
          <label className={label} htmlFor="email">Email</label>
          <input id="email" type="email" className={field} value={form.email} onChange={set("email")} />
        </div>
        <div>
          <label className={label} htmlFor="phone">Phone</label>
          <input id="phone" className={field} value={form.phone} onChange={set("phone")} />
        </div>
      </div>
      <button
        type="submit"
        disabled={busy}
        className="flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-accentfg transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
