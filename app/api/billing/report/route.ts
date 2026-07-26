import { NextResponse } from "next/server";
import { errorResponse, requirePermission } from "@/lib/guard";
import { listInvoices, type InvoiceStatus } from "@/lib/billing";
import { methodLabel } from "@/lib/billing-shared";
import { segmentLabel } from "@/lib/segments";
import { businessForDocs } from "@/lib/doc-business";
import { buildInvoicesReportDoc, reportBuffer } from "@/lib/report-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Multi-invoice business report PDF for the current filter set.
 * Needs `reports` — this is all-time turnover territory, not a single day, so
 * it sits behind the finance gate.
 */
export async function GET(req: Request) {
  const denied = await requirePermission("reports");
  if (denied) return denied;

  try {
    const url = new URL(req.url);
    const from = url.searchParams.get("from") ?? undefined;
    const to = url.searchParams.get("to") ?? undefined;

    // Pull the filtered set, walking pages so the report is not capped at 50.
    const rows = [];
    let cursor: string | null = null;
    do {
      const page = await listInvoices({
        search: url.searchParams.get("q") ?? undefined,
        status: (url.searchParams.get("status") as InvoiceStatus | "all" | "open") ?? "all",
        segment: url.searchParams.get("segment") ?? undefined,
        from,
        to,
        cursor,
        limit: 200,
      });
      for (const inv of page.invoices) {
        rows.push({
          number: inv.number,
          date: inv.issuedAt,
          customer: inv.customer?.name || inv.walkInName || "Walk-in",
          segment: segmentLabel(inv.segment),
          total: inv.totals.total,
          paid: inv.totals.paid,
          method:
            inv.payments.length > 0
              ? methodLabel(inv.payments[inv.payments.length - 1].method)
              : "unpaid",
        });
      }
      cursor = page.nextCursor;
    } while (cursor && rows.length < 5000);

    const range =
      from || to
        ? `${from ?? "start"} to ${to ?? "today"}`
        : "All invoices";

    const doc = buildInvoicesReportDoc(rows, {
      title: "SALES REPORT",
      range,
      business: await businessForDocs(),
    });

    return new NextResponse(new Uint8Array(reportBuffer(doc)), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="sales-report.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err, "build that report");
  }
}
