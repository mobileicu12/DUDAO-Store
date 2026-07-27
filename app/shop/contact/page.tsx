import Link from "next/link";
import { loadBusiness } from "@/lib/business";

export const dynamic = "force-dynamic";

export default async function ContactPage() {
  const biz = await loadBusiness();
  const addressLines = biz.addressLines ?? [];

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Contact us</h1>
      <p className="mt-1.5 text-sm text-muted">{biz.tagline}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {biz.email && (
          <a
            href={`mailto:${biz.email}`}
            className="rounded-lg border border-line bg-surface p-4 transition-colors hover:border-accent"
          >
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">Email</p>
            <p className="mt-1 text-sm font-medium text-ink">{biz.email}</p>
          </a>
        )}
        {biz.phone && (
          <a
            href={`tel:${biz.phone.replace(/\s+/g, "")}`}
            className="rounded-lg border border-line bg-surface p-4 transition-colors hover:border-accent"
          >
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">Phone</p>
            <p className="mt-1 text-sm font-medium text-ink">{biz.phone}</p>
          </a>
        )}
      </div>

      {addressLines.length > 0 && (
        <div className="mt-4 rounded-lg border border-line bg-surface p-4">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Address</p>
          <address className="mt-1 text-sm text-ink not-italic">
            {addressLines.map((line: string, i: number) => (
              <span key={i} className="block">
                {line}
              </span>
            ))}
          </address>
        </div>
      )}

      {biz.website && (
        <a
          href={biz.website.startsWith("http") ? biz.website : `https://${biz.website}`}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-block text-sm font-medium text-accent hover:underline"
        >
          {biz.website} ↗
        </a>
      )}

      <div className="mt-8 rounded-lg border border-accent/30 bg-accent-subtle p-5">
        <p className="text-sm font-semibold text-ink">Want trade pricing?</p>
        <p className="mt-1 text-sm text-ink-2">
          Open a trade account to see wholesale prices and order online.
        </p>
        <div className="mt-4 flex gap-2">
          <Link
            href="/shop/register"
            className="flex h-10 items-center rounded-md bg-accent px-4 text-sm font-semibold text-accentfg hover:bg-accent-hover"
          >
            Register
          </Link>
          <Link
            href="/shop/trade-login"
            className="flex h-10 items-center rounded-md border border-line-strong bg-surface px-4 text-sm font-medium text-ink hover:bg-subtle"
          >
            Trade login
          </Link>
        </div>
      </div>
    </div>
  );
}
