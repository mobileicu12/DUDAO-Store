import Link from "next/link";
import { loadBusiness } from "@/lib/business";

export const dynamic = "force-dynamic";

export default async function AboutPage() {
  const biz = await loadBusiness();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        About {biz.name}
      </h1>
      <p className="mt-1.5 text-sm text-muted">{biz.tagline}</p>

      <div className="mt-6 space-y-4 text-sm leading-relaxed text-ink-2">
        <p>
          {biz.name} is a trade counter and wholesale supplier. Approved trade
          customers get their own account with wholesale pricing, order online,
          and settle on account or on collection.
        </p>
        <p>
          Not set up yet? Open a trade account and we&apos;ll review your details
          and send your access code. Once approved you&apos;ll see your prices and
          can order straight from the catalogue.
        </p>
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        <Link
          href="/shop/register"
          className="flex h-10 items-center rounded-md bg-accent px-4 text-sm font-semibold text-accentfg hover:bg-accent-hover"
        >
          Open a trade account
        </Link>
        <Link
          href="/shop"
          className="flex h-10 items-center rounded-md border border-line-strong bg-surface px-4 text-sm font-medium text-ink hover:bg-subtle"
        >
          Browse the catalogue
        </Link>
        <Link
          href="/shop/contact"
          className="flex h-10 items-center rounded-md border border-line-strong bg-surface px-4 text-sm font-medium text-ink hover:bg-subtle"
        >
          Contact us
        </Link>
      </div>
    </div>
  );
}
