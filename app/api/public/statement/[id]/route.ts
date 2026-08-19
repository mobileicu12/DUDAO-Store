import { NextResponse } from "next/server";
import { getCustomer } from "@/lib/customers";
import { verifyStatementToken } from "@/lib/invoice-link";
import { businessForDocs } from "@/lib/doc-business";
import { statementPdfBuffer } from "@/lib/statement-pdf";
import { assembleStatement } from "@/lib/statement-build";
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

  const pdf = statementPdfBuffer(
    assembleStatement(customer, period),
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
