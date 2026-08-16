import { NextResponse } from "next/server";
import { getCustomer } from "@/lib/customers";
import { verifyStatementToken } from "@/lib/invoice-link";
import { businessForDocs } from "@/lib/doc-business";
import { statementPdfBuffer, type StatementEntry } from "@/lib/statement-pdf";
import { currentCaller } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Customer statement PDF.
 *
 * Same rule as the invoice route: a valid HMAC token or a signed-in staff
 * member gets through, everything else gets a 404 rather than a 403 so the
 * response never confirms an ID exists.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(req.url);
  const token = url.searchParams.get("t");
  const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

  const tokenOk = verifyStatementToken(id, date, token);
  const staffOk = tokenOk ? false : Boolean(await currentCaller());

  if (!tokenOk && !staffOk) {
    return new NextResponse("Not found", { status: 404 });
  }

  const customer = await getCustomer(id);
  if (!customer) return new NextResponse("Not found", { status: 404 });

  // A date-range ("period") statement: opening balance is as-of `from`, and
  // only entries within [from, to] are listed. Without a range it's the full
  // as-at statement as before.
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const period =
    fromParam && toParam ? { from: fromParam, to: toParam } : null;
  const fromMs = period ? +new Date(`${period.from}T00:00:00`) : -Infinity;
  const toMs = period ? +new Date(`${period.to}T23:59:59.999`) : Infinity;
  const before = (iso: string) => +new Date(iso) < fromMs;
  const inRange = (iso: string) => {
    const t = +new Date(iso);
    return t >= fromMs && t <= toMs;
  };

  // Balance carried forward is dated to the account's creation — before any
  // period — so it always seeds the opening figure.
  let openingBalance = customer.openingBalance;
  if (period) {
    for (const inv of customer.invoices) {
      if (inv.status === "VOID") continue;
      if (before(inv.issuedAt)) openingBalance += inv.total;
    }
    for (const p of customer.ledger) {
      if (p.revoked) continue;
      if (before(p.takenAt)) openingBalance -= p.amount;
    }
  }
  openingBalance = Math.round(openingBalance * 100) / 100;

  // Interleave invoices and payments in date order so the running balance
  // reads the way the customer experienced it.
  const entries: StatementEntry[] = [];

  if (!period && customer.openingBalance !== 0) {
    entries.push({
      date: customer.createdAt,
      kind: "opening",
      reference: "Opening",
      detail: "Balance carried forward",
      amount: customer.openingBalance,
    });
  }

  let periodBilled = 0;
  let periodPaid = 0;
  for (const inv of customer.invoices) {
    if (inv.status === "VOID") continue;
    if (period && !inRange(inv.issuedAt)) continue;
    periodBilled += inv.total;
    entries.push({
      date: inv.issuedAt,
      kind: "invoice",
      reference: inv.number,
      detail: "Invoice",
      amount: inv.total,
    });
  }

  for (const p of customer.ledger) {
    if (p.revoked) continue;
    if (period && !inRange(p.takenAt)) continue;
    periodPaid += p.amount;
    entries.push({
      date: p.takenAt,
      kind: "payment",
      reference: p.invoiceNumber ?? "Payment",
      detail: p.note || "Payment received",
      amount: p.amount,
    });
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));

  const outstanding = period
    ? Math.round((openingBalance + periodBilled - periodPaid) * 100) / 100
    : customer.outstanding;

  const pdf = statementPdfBuffer(
    {
      customer: {
        name: customer.name,
        company: customer.company,
        address: [customer.address, customer.city, customer.postcode]
          .filter(Boolean)
          .join(", "),
        phone: customer.phone,
        email: customer.email,
      },
      entries,
      openingBalance,
      totalBilled: period ? Math.round(periodBilled * 100) / 100 : customer.totalBilled,
      totalPaid: period ? Math.round(periodPaid * 100) / 100 : customer.totalPaid,
      outstanding,
      generatedAt: new Date().toISOString(),
      period: period ?? undefined,
    },
    await businessForDocs(),
  );

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="statement-${customer.name.replace(/[^a-z0-9]+/gi, "-")}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
