"use client";

import { useState } from "react";
import Link from "next/link";

export default function RegisterPage() {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    company: "",
    email: "",
    phone: "",
    note: "",
    website: "", // honeypot — hidden, must stay empty
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/shop/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Something went wrong. Please try again.");
        return;
      }
      setDone(true);
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  const field =
    "h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)]";
  const label = "block text-xs font-medium text-ink-2 mb-1.5";

  if (done) {
    return (
      <div className="mx-auto max-w-md text-center">
        <div className="rounded-lg border border-accent/30 bg-accent-subtle p-8">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent text-xl text-accentfg">
            ✓
          </div>
          <h1 className="mt-4 text-xl font-semibold text-ink">Application received</h1>
          <p className="mt-2 text-sm text-ink-2">
            Thanks for applying for a trade account. We&apos;ll review your details and be in
            touch with your access code. You&apos;ll be able to sign in and see wholesale
            prices once approved.
          </p>
          <Link
            href="/shop"
            className="mt-6 inline-flex h-10 items-center rounded-md bg-accent px-4 text-sm font-semibold text-accentfg hover:bg-accent-hover"
          >
            Back to the shop
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Open a trade account</h1>
      <p className="mt-1.5 text-sm text-muted">
        Apply for wholesale pricing. Approval is manual — we&apos;ll send your access code
        once your account is set up.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4 rounded-lg border border-line bg-surface p-5">
        {error && (
          <div className="rounded-md bg-danger-subtle px-3.5 py-3 text-sm text-danger">
            {error}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="firstName">First name</label>
            <input id="firstName" className={field} value={form.firstName} onChange={set("firstName")} />
          </div>
          <div>
            <label className={label} htmlFor="lastName">Last name</label>
            <input id="lastName" className={field} value={form.lastName} onChange={set("lastName")} />
          </div>
        </div>
        <div>
          <label className={label} htmlFor="company">Business name</label>
          <input id="company" className={field} value={form.company} onChange={set("company")} />
        </div>
        <div>
          <label className={label} htmlFor="email">Email *</label>
          <input id="email" type="email" required className={field} value={form.email} onChange={set("email")} placeholder="you@business.com" />
        </div>
        <div>
          <label className={label} htmlFor="phone">Phone</label>
          <input id="phone" className={field} value={form.phone} onChange={set("phone")} />
        </div>
        <div>
          <label className={label} htmlFor="note">Anything else?</label>
          <textarea
            id="note"
            rows={3}
            className="w-full resize-y rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)]"
            value={form.note}
            onChange={set("note")}
            placeholder="What you sell, roughly how much you'd order…"
          />
        </div>

        {/* Honeypot — visually hidden, off-screen, not announced. Bots fill it. */}
        <div className="absolute -left-[9999px]" aria-hidden>
          <label htmlFor="website">Website</label>
          <input
            id="website"
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={set("website")}
          />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="flex h-11 w-full items-center justify-center rounded-md bg-accent text-sm font-semibold text-accentfg transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? "Submitting…" : "Apply for a trade account"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-muted">
        Already approved?{" "}
        <Link href="/shop/trade-login" className="font-medium text-accent hover:underline">
          Trade login
        </Link>
      </p>
    </div>
  );
}
