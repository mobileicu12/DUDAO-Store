"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function TradeLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/shop/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Login failed.");
        return;
      }
      router.push("/shop");
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Trade login</h1>
      <p className="mt-1.5 text-sm text-muted">
        Use the email and access code your account manager gave you.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4 rounded-lg border border-line bg-surface p-5">
        {error && (
          <div className="rounded-md border border-transparent bg-danger-subtle px-3.5 py-3 text-sm text-danger">
            {error}
          </div>
        )}
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-xs font-medium text-ink-2">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@business.com"
            className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)]"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="code" className="block text-xs font-medium text-ink-2">
            Trade access code
          </label>
          <input
            id="code"
            type="text"
            autoComplete="off"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="XXXXXXXX"
            className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 font-mono text-sm tracking-widest text-ink uppercase placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)]"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="flex h-11 w-full items-center justify-center rounded-md bg-accent text-sm font-semibold text-accentfg transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-muted">
        No account yet?{" "}
        <Link href="/shop/register" className="font-medium text-accent hover:underline">
          Apply for trade pricing
        </Link>
      </p>
    </div>
  );
}
