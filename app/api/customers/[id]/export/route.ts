import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCustomer } from "@/lib/customers";
import { SEGMENTS } from "@/lib/segments";
import { requirePermission } from "@/lib/guard";
import { BUSINESS } from "@/lib/business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A customer's full record as an .xlsx — profile, invoices and ledger — for
 * backup/safekeeping, mirroring MOBILE ICU's per-customer export.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requirePermission("customers");
  if (denied) return denied;

  const { id } = await ctx.params;
  const c = await getCustomer(id);
  if (!c) return new NextResponse("Not found", { status: 404 });

  const money = '"£"#,##0.00';
  const wb = new ExcelJS.Workbook();

  // Profile
  const p = wb.addWorksheet("Profile");
  p.columns = [{ width: 24 }, { width: 48 }];
  p.addRow([`${BUSINESS.name} — Customer record`]).font = { bold: true, size: 14 };
  p.addRow(["Exported", new Date().toLocaleString("en-GB")]);
  p.addRow([]);
  const row = (k: string, v: string | number) => p.addRow([k, v]);
  row("Name", c.name);
  row("Company", c.company);
  row("Email", c.email);
  row("Phone", c.phone);
  row(
    "Address",
    [c.address, c.city, c.postcode, c.country].filter(Boolean).join(", "),
  );
  row(
    "Segments",
    c.segments.map((k) => SEGMENTS.find((s) => s.key === k)?.label ?? k).join(", "),
  );
  row("Trade code", c.tradeCode ?? "");
  row("Notes", c.notes);
  p.addRow([]);
  const ob = row("Opening balance", c.openingBalance);
  ob.getCell(2).numFmt = money;
  const tb = row("Total billed", c.totalBilled);
  tb.getCell(2).numFmt = money;
  const tp = row("Total paid", c.totalPaid);
  tp.getCell(2).numFmt = money;
  const os = row("Outstanding", c.outstanding);
  os.getCell(2).numFmt = money;
  os.font = { bold: true };

  // Invoices
  const iws = wb.addWorksheet("Invoices");
  iws.columns = [
    { header: "Number", key: "number", width: 18 },
    { header: "Date", key: "date", width: 14 },
    { header: "Status", key: "status", width: 12 },
    { header: "Total", key: "total", width: 12, style: { numFmt: money } },
    { header: "Paid", key: "paid", width: 12, style: { numFmt: money } },
    { header: "Balance", key: "balance", width: 12, style: { numFmt: money } },
  ];
  iws.getRow(1).font = { bold: true };
  for (const inv of c.invoices) {
    iws.addRow({
      number: inv.number,
      date: new Date(inv.issuedAt).toLocaleDateString("en-GB"),
      status: inv.status,
      total: inv.total,
      paid: inv.paid,
      balance: inv.balance,
    });
  }

  // Ledger
  const lws = wb.addWorksheet("Ledger");
  lws.columns = [
    { header: "Date", key: "date", width: 18 },
    { header: "Amount", key: "amount", width: 12, style: { numFmt: money } },
    { header: "Method", key: "method", width: 14 },
    { header: "Against", key: "against", width: 16 },
    { header: "Note", key: "note", width: 32 },
    { header: "Revoked", key: "revoked", width: 10 },
  ];
  lws.getRow(1).font = { bold: true };
  for (const l of c.ledger) {
    lws.addRow({
      date: new Date(l.takenAt).toLocaleString("en-GB"),
      amount: l.amount,
      method: l.method,
      against: l.invoiceNumber ?? "On account",
      note: l.note,
      revoked: l.revoked ? "yes" : "",
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const safe = c.name.replace(/[^a-z0-9]+/gi, "-");
  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="customer-${safe}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
