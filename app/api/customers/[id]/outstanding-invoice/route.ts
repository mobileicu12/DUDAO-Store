import { NextResponse } from "next/server";
import { errorResponse, requireAnyPermission } from "@/lib/guard";
import { getCustomer } from "@/lib/customers";
import { businessForDocs } from "@/lib/doc-business";
import { invoicePdfBuffer } from "@/lib/invoice-pdf";
import { computeTotals } from "@/lib/billing-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * A branded, one-line invoice for the account's current outstanding balance —
 * a document to hand over. It does not create a new billable order; the debt
 * already comes from the existing invoices on the account.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const denied = await requireAnyPermission(["customers", "invoices"]);
  if (denied) return denied;

  try {
    const { id } = await params;
    const customer = await getCustomer(id);
    if (!customer) return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    const outstanding = Math.round(customer.outstanding * 100) / 100;
    if (outstanding <= 0.001) {
      return NextResponse.json({ error: "This account has nothing outstanding." }, { status: 400 });
    }

    const business = await businessForDocs();
    const today = new Date();
    const dateLabel = today.toLocaleDateString("en-GB");
    const lines = [
      { title: `Outstanding balance as of ${dateLabel}`, sku: "", quantity: 1, unitPrice: outstanding },
    ];
    const totals = computeTotals({ lines, discount: 0, taxable: false, taxRate: 0, paid: 0 });

    const pdf = invoicePdfBuffer(
      {
        number: `BAL-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`,
        issuedAt: today.toISOString(),
        status: "OPEN",
        taxRate: 0,
        taxable: false,
        notes:
          "This invoice reflects the total outstanding balance on the account. Please settle at your earliest convenience.",
        staffName: "",
        billTo: {
          name: customer.name || "Customer",
          company: customer.company,
          address: [customer.address, customer.city, customer.postcode].filter(Boolean).join(", "),
          phone: customer.phone,
          email: customer.email,
        },
        lines,
        totals,
      },
      business,
    );

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="outstanding-${(customer.name || "customer").replace(/[^a-z0-9]+/gi, "-")}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return errorResponse(err, "build the outstanding invoice");
  }
}
