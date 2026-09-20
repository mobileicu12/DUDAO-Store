import { notFound } from "next/navigation";
import { getCustomer } from "@/lib/customers";
import { getSettings } from "@/lib/settings";
import { verifyStatementToken, statementSharePath } from "@/lib/invoice-link";
import { money } from "@/lib/business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined): string | null =>
  typeof v === "string" ? v : null;

/**
 * Public statement landing page (shared by WhatsApp / email link).
 *
 * Signed HMAC token required (keyed on customer + date), else a 404. Customer
 * statements carry no seller identity, so this page shows only the account and
 * balance plus "View PDF" / "Download PDF" buttons.
 */
export default async function StatementSharePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const token = str(sp.t);
  const date = str(sp.date) ?? new Date().toISOString().slice(0, 10);
  const from = str(sp.from);
  const to = str(sp.to);

  if (!verifyStatementToken(id, date, token)) notFound();
  const customer = await getCustomer(id);
  if (!customer) notFound();

  const s = await getSettings();
  const cur = s.currency;
  const period = from && to ? `&from=${from}&to=${to}` : "";
  const pdf = statementSharePath(id, date) + period;
  const owed = customer.outstanding > 0.001;

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-4 text-ink">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
          Account statement
        </div>
        <h1 className="text-xl font-bold">{customer.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {from && to
            ? `${from} — ${to}`
            : `As at ${new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`}
        </p>

        <div className="mt-4 rounded-xl bg-subtle p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">
              {customer.outstanding < 0 ? "Credit balance" : "Balance outstanding"}
            </span>
            <span
              className={`text-lg font-bold ${owed ? "text-danger" : "text-success"}`}
            >
              {money(Math.abs(customer.outstanding), cur)}
              {customer.outstanding < 0 ? " cr" : ""}
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
