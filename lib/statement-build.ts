import "server-only";
import type { CustomerDetail } from "./customers";
import type { StatementDoc, StatementEntry } from "./statement-pdf";

/**
 * Assemble the statement document data for a customer, optionally scoped to a
 * date range. Shared by the public statement PDF route and the "send statement"
 * route so both read the same running balance the customer experienced.
 */
export function assembleStatement(
  customer: CustomerDetail,
  period: { from: string; to: string } | null,
): StatementDoc {
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

  return {
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
  };
}
