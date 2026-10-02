import { notFound } from "next/navigation";
import { getCustomer, customersBilledToday } from "@/lib/customers";
import { getSettings } from "@/lib/settings";
import { dayRange } from "@/lib/billing";
import { verifyStatementToken, daySharePath } from "@/lib/invoice-link";
import { money } from "@/lib/business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined): string | null =>
  typeof v === "string" ? v : null;

/**
 * Public "today's bills" landing page (shared by WhatsApp / email link).
 *
 * Signed HMAC token required (keyed on customer + date), else a 404. Unlike the
 * account statement, this lists the day's bills WITH their line items in the PDF,
 * which is what the shop sends out at close.
 */
export default async function DaySharePage({
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

  if (!verifyStatementToken(id, date, token)) notFound();
  const customer = await getCustomer(id);
  if (!customer) notFound();

  const s = await getSettings();
  const cur = s.currency;
  const pdf = daySharePath(id, date);

  // Today's figures for the summary panel (PDF carries the itemised detail).
  const groups = await customersBilledToday(dayRange(new Date(date)));
  const group = groups.find((g) => g.customer?.id === id);
  const dayTotal = group?.dayTotal ?? 0;
  const dayPaid = group?.dayPaid ?? 0;
  const billCount = group?.invoices.length ?? 0;
  const owed = customer.outstanding > 0.001;
  const dateLabel = new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-4 text-ink">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
          Today&apos;s bills · {dateLabel}
        </div>
        <h1 className="text-xl font-bold">{customer.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {billCount} bill{billCount === 1 ? "" : "s"} today — open the PDF for the itemised list.
        </p>

        <div className="mt-4 space-y-2 rounded-xl bg-subtle p-4 text-sm">
          <Row label="Billed today" value={money(dayTotal, cur)} />
          <Row label="Paid today" value={money(dayPaid, cur)} />
          <div className="border-t border-line pt-2">
            <Row
              label={customer.outstanding < 0 ? "Credit balance" : "Account outstanding"}
              value={`${money(Math.abs(customer.outstanding), cur)}${customer.outstanding < 0 ? " cr" : ""}`}
              strong
              tone={owed ? "danger" : "success"}
            />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <a
            href={pdf}
            target="_blank"
            rel="noreferrer"
            className="flex h-11 items-center justify-center rounded-lg border border-line bg-surface text-sm font-semibold text-ink transition-colors hover:bg-subtle"
          >
            View items (PDF)
          </a>
          <a
            href={`${pdf}&dl=1`}
            download={`day-${customer.name.replace(/[^a-z0-9]+/gi, "-")}-${date}.pdf`}
            className="flex h-11 items-center justify-center rounded-lg bg-accent text-sm font-semibold text-accentfg transition-colors hover:bg-accent-hover"
          >
            Download PDF
          </a>
        </div>
      </div>
    </main>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "danger" | "success" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span
        className={[
          strong ? "text-base font-bold" : "font-medium",
          tone === "danger" ? "text-danger" : tone === "success" ? "text-success" : "text-ink",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}
