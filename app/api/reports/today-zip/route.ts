import { NextResponse } from "next/server";
import JSZip from "jszip";
import { currentCaller } from "@/lib/guard";
import { customersBilledToday } from "@/lib/customers";
import { dayRange } from "@/lib/billing";
import { buildCustomerDayDoc } from "@/lib/report-pdf";
import { businessForDocs } from "@/lib/doc-business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One PDF day-statement per account customer billed today, bundled into a ZIP.
 * This is what the header's "Today's reports" button downloads. Owner or the
 * invoices permission; anyone else gets a 404, never a 403.
 */
export async function GET() {
  const caller = await currentCaller();
  if (!caller || (caller.role !== "owner" && !caller.permissions.includes("invoices"))) {
    return new NextResponse("Not found", { status: 404 });
  }

  const groups = (await customersBilledToday(dayRange())).filter((g) => g.customer);
  if (groups.length === 0) {
    return NextResponse.json(
      { error: "No account customers billed today yet." },
      { status: 400 },
    );
  }

  const business = await businessForDocs();
  const dateStr = new Date().toISOString().slice(0, 10);
  const stamp = dateStr.replace(/-/g, "");
  const zip = new JSZip();
  const used = new Set<string>();

  for (const g of groups) {
    const doc = buildCustomerDayDoc(
      { name: g.customer!.name, company: g.customer!.company },
      g.invoices,
      { date: dateStr, business },
    );
    let safe =
      (g.customer!.name || "customer")
        .replace(/[^\w\- ]/g, "")
        .trim()
        .replace(/\s+/g, "_")
        .slice(0, 60) || "customer";
    while (used.has(safe)) safe += "_";
    used.add(safe);
    zip.file(`${safe}_${stamp}.pdf`, doc.output("arraybuffer"));
  }

  const buf = await zip.generateAsync({ type: "nodebuffer" });
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="customer-reports-${dateStr}.zip"`,
    },
  });
}
