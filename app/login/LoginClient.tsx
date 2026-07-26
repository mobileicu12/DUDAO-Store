"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { BUSINESS } from "@/lib/business";
import { Logo } from "@/components/shell/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import {
  Alert,
  Button,
  Divider,
  Field,
  Input,
} from "@/components/ui/primitives";

type Mode = "password" | "master";

export default function LoginClient({
  googleEnabled,
  masterEnabled,
}: {
  googleEnabled: boolean;
  masterEnabled: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from") || "/portal";

  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [master, setMaster] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // NextAuth reports failures by redirecting back with ?error=
  const authError = params.get("error");
  const initialError = authError
    ? authError === "AccessDenied"
      ? "That account is not on the team yet. Ask the owner to invite you first."
      : "Sign in did not work. Please try again."
    : null;

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setBusy(false);
    if (res?.error) {
      // Deliberately vague: never confirm whether an address exists.
      setError("That email and password combination was not recognised.");
      return;
    }
    router.push(from);
    router.refresh();
  };

  const submitMaster = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: master }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "That password is not correct.");
        return;
      }
      router.push(from);
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* Brand panel — decorative on desktop, a slim header on mobile. */}
      <div className="relative hidden overflow-hidden bg-accent lg:flex lg:w-[44%] lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, #fff 0 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
          aria-hidden
        />
        <div className="relative">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 text-lg font-bold text-white backdrop-blur">
            {BUSINESS.name.slice(0, 2).toUpperCase()}
          </span>
        </div>
        <div className="relative">
          <h2 className="text-3xl font-semibold tracking-tight text-white">
            {BUSINESS.name}
          </h2>
          <p className="mt-2 max-w-sm text-sm text-white/70">
            {BUSINESS.tagline}
          </p>
        </div>
        <p className="relative text-xs text-white/50">
          Staff portal · {new Date().getFullYear()}
        </p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 flex-col px-5 py-8 sm:px-8">
        <div className="flex items-center justify-between lg:justify-end">
          <div className="lg:hidden">
            <Logo size="sm" />
          </div>
          <ThemeToggle compact />
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Sign in
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {mode === "master"
              ? "Emergency owner access."
              : "Use the account the owner set up for you."}
          </p>

          {(error || initialError) && (
            <div className="mt-5">
              <Alert tone="danger">{error ?? initialError}</Alert>
            </div>
          )}

          {mode === "password" ? (
            <>
              {googleEnabled && (
                <>
                  <Button
                    variant="secondary"
                    size="lg"
                    full
                    className="mt-6"
                    onClick={() => signIn("google", { callbackUrl: from })}
                    icon={
                      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
                        <path
                          fill="#4285F4"
                          d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.86c2.26-2.08 3.58-5.15 3.58-8.8z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.86-3c-1.08.72-2.45 1.15-4.08 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56V6.63H1.29a12 12 0 0 0 0 10.74z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.63l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
                        />
                      </svg>
                    }
                  >
                    Continue with Google
                  </Button>

                  <div className="my-6">
                    <Divider label="or" />
                  </div>
                </>
              )}

              <form onSubmit={submitPassword} className="space-y-4">
                <Field label="Email" htmlFor="email">
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </Field>
                <Field label="Password" htmlFor="password">
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </Field>
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  full
                  loading={busy}
                >
                  Sign in
                </Button>
              </form>
            </>
          ) : (
            <form onSubmit={submitMaster} className="mt-6 space-y-4">
              <Field
                label="Master password"
                htmlFor="master"
                hint="Grants owner access for 12 hours."
              >
                <Input
                  id="master"
                  type="password"
                  autoComplete="off"
                  required
                  value={master}
                  onChange={(e) => setMaster(e.target.value)}
                  placeholder="••••••••"
                />
              </Field>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                full
                loading={busy}
              >
                Unlock portal
              </Button>
            </form>
          )}

          {masterEnabled && (
            <button
              type="button"
              onClick={() => {
                setMode(mode === "master" ? "password" : "master");
                setError(null);
              }}
              className="mt-6 text-xs font-medium text-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
            >
              {mode === "master"
                ? "Back to normal sign in"
                : "Use the master password instead"}
            </button>
          )}
        </div>

        <p className="text-center text-xs text-faint">
          Trouble signing in? Ask the business owner to check your account.
        </p>
      </div>
    </div>
  );
}
