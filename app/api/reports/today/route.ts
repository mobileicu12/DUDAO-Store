import { NextResponse } from "next/server";
import { canSeeFinanceRequest, errorResponse, requireAuth } from "@/lib/guard";
import { db, money2, num } from "@/lib/db";
import { computeTotals, dayRange, outstandingTotal } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Today's money, for the dashboard.
 *
 * Today's figures are visible to every staff member — they need to reconcile
 * the till at close. All-time turnover is gated behind `reports`: knowing what
 * the shop is worth is a different thing from knowing what came through the
 * door today.
 */
export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;

  try {
    const { start, end } = dayRange();
    const canSeeFinance = await canSeeFinanceRequest();

    const [
      todayInvoices,
      todayPayments,
      todayByMethod,
      latestInvoice,
      allInvoices,
    ] = await Promise.all([
      db.invoice.findMany({
        where: {
          issuedAt: { gte: start, lte: end },
          status: { not: "VOID" },
        },
        include: { lines: true },
      }),
      db.payment.aggregate({
        where: { takenAt: { gte: start, lte: end }, revoked: false },
        _sum: { amount: true },
      }),
      // Split today's takings by how the money came in.
      db.payment.groupBy({
        by: ["method"],
        where: { takenAt: { gte: start, lte: end }, revoked: false },
        _sum: { amount: true },
      }),
      // The most recent sale, for the "latest sale" strip.
      db.invoice.findFirst({
        where: { issuedAt: { gte: start, lte: end }, status: { not: "VOID" } },
        orderBy: { issuedAt: "desc" },
        include: { lines: true, customer: { select: { name: true, company: true } } },
      }),
      // All-time sales (for the finance-only turnover figure below).
      db.invoice.findMany({
        where: { status: { not: "VOID" } },
        include: { lines: true },
      }),
    ]);

    const totalOf = (inv: (typeof todayInvoices)[number]) =>
      computeTotals({
        lines: inv.lines.map((l) => ({
          quantity: l.quantity,
          unitPrice: num(l.unitPrice),
        })),
        discount: num(inv.discount),
        taxable: inv.taxable,
        taxRate: num(inv.taxRate),
        paid: 0,
      }).total;

    const invoiced = money2(todayInvoices.reduce((s, i) => s + totalOf(i), 0));
    const allTimeSales = money2(allInvoices.reduce((s, i) => s + totalOf(i), 0));

    // By channel, exactly as MOBILE ICU splits it: online/trade is wholesale,
    // eBay/Amazon are marketplace, and shop / POS / unset is retail.
    const sumSeg = (pred: (seg: string) => boolean) =>
      money2(
        todayInvoices
          .filter((i) => pred(i.segment))
          .reduce((s, i) => s + totalOf(i), 0),
      );
    const wholesale = sumSeg((seg) => seg === "online");
    const marketplace = sumSeg((seg) => seg === "ebay" || seg === "amazon");
    const retail = money2(invoiced - wholesale - marketplace);

    // By method — bucket into the four the till offers.
    const methodSum = (m: string) =>
      money2(
        num(todayByMethod.find((r) => r.method === m)?._sum.amount ?? 0),
      );
    const cash = methodSum("cash");
    const card = methodSum("card");
    const bank = methodSum("bank");

    const latest = latestInvoice
      ? {
          number: latestInvoice.number,
          name:
            latestInvoice.customer?.company ||
            latestInvoice.customer?.name ||
            latestInvoice.walkInName ||
            "Walk-in",
          total: totalOf(latestInvoice),
        }
      : null;

    // The same figure the invoices list shows, from one shared function, so
    // the dashboard and the invoices page can never disagree. Voided and
    // deleted invoices drop out of it immediately.
    const outstanding = await outstandingTotal();

    return NextResponse.json({
      invoiced,
      paid: money2(num(todayPayments._sum.amount)),
      invoiceCount: todayInvoices.length,
      retail,
      wholesale,
      marketplace,
      cash,
      card,
      bank,
      collected: money2(num(todayPayments._sum.amount)),
      outstanding,
      latest,
      // Omitted entirely rather than zeroed — a zero would read as "no sales".
      ...(canSeeFinance ? { allTimeSales } : {}),
    });
  } catch (err) {
    return errorResponse(err, "load today's figures");
  }
}
