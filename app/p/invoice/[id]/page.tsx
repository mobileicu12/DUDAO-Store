import { notFound } from "next/navigation";
import { getInvoice } from "@/lib/billing";
import { getSettings } from "@/lib/settings";
import { verifyInvoiceToken, invoiceSharePath } from "@/lib/invoice-link";
import { money } from "@/lib/business";
import { statusView } from "@/lib/billing-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

const toneClass: Record<string, string> = {
  success: "bg-success-subtle text-success",
  warning: "bg-warning-subtle text-warning",
  danger: "bg-danger-subtle text-danger",
  info: "bg-info-subtle text-info",
  neutral: "bg-subtle text-muted",
};

/**
 * Public invoice landing page (shared by WhatsApp / email link).
 *
 * A signed HMAC token is required — an invalid or missing one gets a 404, never
 * a confirmation that the id exists. The page shows a short summary and clear
 * "View PDF" / "Download PDF" buttons so there's always a download option, on
 * any device. Seller identity (business name) is shown only for VAT invoices.
 */
export default async function InvoiceSharePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const token = typeof sp.t === "string" ? sp.t : null;

  if (!verifyInvoiceToken(id, token)) notFound();
  const invoice = await getInvoice(id);
  if (!invoice) notFound();

  const s = await getSettings();
  const cur = s.currency;
  const pdf = invoiceSharePath(id);
  const sv = statusView(invoice.status, invoice.totals.paid, invoice.totals.balance);
  const issued = new Date(invoice.issuedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-4 text-ink">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
          {invoice.taxable ? "VAT Invoice" : "Invoice"}
        </div>
        <h1 className="text-xl font-bold">
          {invoice.taxable ? s.name : `Invoice ${invoice.number}`}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {invoice.number} · {issued}
        </p>

        <div className="mt-4 rounded-xl bg-subtle p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Total</span>
            <span className="text-lg font-bold">{money(invoice.totals.total, cur)}</span>
          </div>
          {invoice.totals.balance > 0.001 && (
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="text-muted">Balance due</span>
              <span className="font-semibold text-danger">
                {money(invoice.totals.balance, cur)}
              </span>
            </div>
          )}
          <div className="mt-3">
            <span
              className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${
                toneClass[sv.tone] ?? toneClass.neutral
              }`}
            >
              {sv.label}
            </span>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <a
            href={pdf}
            target="_blank"
            rel="noreferrer"
            className="flex h-11 items-center justify-center rounded-lg border border-line bg-surface text-sm font-semibold text-ink transition-colors hover:bg-subtle"
          >
            View PDF
          </a>
          <a
            href={`${pdf}&dl=1`}
            className="flex h-11 items-center justify-center rounded-lg bg-accent text-sm font-semibold text-accentfg transition-colors hover:bg-accent-hover"
          >
            Download PDF
          </a>
        </div>
      </div>
    </main>
  );
}
