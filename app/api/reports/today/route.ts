import { NextResponse } from "next/server";
import { canSeeFinanceRequest, errorResponse, requireAuth } from "@/lib/guard";
import { db, money2, num } from "@/lib/db";
import { computeTotals, dayRange } from "@/lib/billing";

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

    const [todayInvoices, todayPayments, allCustomers, allInvoices] =
      await Promise.all([
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
        db.customer.aggregate({ _sum: { openingBalance: true } }),
        // Outstanding is a whole-book figure, not a today figure, so it needs
        // every live invoice and every live payment.
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

    const paidEver = await db.payment.aggregate({
      where: { revoked: false },
      _sum: { amount: true },
    });

    const outstanding = money2(
      num(allCustomers._sum.openingBalance) +
        allTimeSales -
        num(paidEver._sum.amount),
    );

    return NextResponse.json({
      invoiced,
      paid: money2(num(todayPayments._sum.amount)),
      invoiceCount: todayInvoices.length,
      outstanding,
      // Omitted entirely rather than zeroed — a zero would read as "no sales".
      ...(canSeeFinance ? { allTimeSales } : {}),
    });
  } catch (err) {
    return errorResponse(err, "load today's figures");
  }
}
