import { NextResponse } from "next/server";
import { verifyStatementToken } from "@/lib/invoice-link";
import { customerDayPdf } from "@/lib/digest";
import { currentCaller } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The itemised "today's bills" PDF for one customer — every line item of each
 * bill raised on `date`, plus today's total, paid and the account balance.
 *
 * Shares the statement's capability token (keyed on customer + date), so the
 * same signed link that a day summary already carries can open it. A wrong or
 * missing token gets a 404, never a 403.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(req.url);
  const token = url.searchParams.get("t");
  const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  const download = url.searchParams.get("dl") === "1";

  const tokenOk = verifyStatementToken(id, date, token);
  const staffOk = tokenOk ? false : Boolean(await currentCaller());
  if (!tokenOk && !staffOk) {
    return new NextResponse("Not found", { status: 404 });
  }

  const pdf = await customerDayPdf(id, date);
  if (!pdf) return new NextResponse("No bills for this customer on that day.", { status: 404 });

  return new NextResponse(new Uint8Array(pdf.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${pdf.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
