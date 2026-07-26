import { NextResponse } from "next/server";
import { currentCaller, errorResponse, requirePermission } from "@/lib/guard";
import { invalid } from "@/lib/db";
import {
  deleteCustomer,
  generateTradeCode,
  getCustomer,
  recordAccountPayment,
  updateCustomer,
} from "@/lib/customers";
import { revokePayment, type PaymentMethod } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const denied = await requirePermission("customers");
  if (denied) return denied;

  try {
    const { id } = await params;
    const customer = await getCustomer(id);
    if (!customer) {
      return NextResponse.json(
        { error: "That customer could not be found." },
        { status: 404 },
      );
    }
    return NextResponse.json(customer);
  } catch (err) {
    return errorResponse(err, "open this customer");
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const denied = await requirePermission("customers");
  if (denied) return denied;

  try {
    const { id } = await params;
    return NextResponse.json(await updateCustomer(id, await req.json()));
  } catch (err) {
    return errorResponse(err, "save this customer");
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const denied = await requirePermission("customers");
  if (denied) return denied;

  try {
    const { id } = await params;
    await deleteCustomer(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "delete this customer");
  }
}

/** Ledger actions: take money against the account, revoke, issue a code. */
export async function POST(req: Request, { params }: Ctx) {
  const denied = await requirePermission("customers");
  if (denied) return denied;

  try {
    const { id } = await params;
    const caller = (await currentCaller())!;
    const body = (await req.json()) as {
      action: string;
      amount?: number;
      method?: PaymentMethod;
      note?: string;
      paymentId?: string;
    };

    switch (body.action) {
      case "payment":
        await recordAccountPayment({
          customerId: id,
          amount: Number(body.amount) || 0,
          method: body.method ?? "cash",
          note: body.note,
          staffEmail: caller.email,
        });
        break;

      case "revoke-payment":
        if (!body.paymentId) throw invalid("Which payment should be revoked?");
        await revokePayment(body.paymentId);
        break;

      case "trade-code":
        return NextResponse.json({ code: await generateTradeCode(id) });

      default:
        throw invalid("That action is not recognised.");
    }

    return NextResponse.json(await getCustomer(id));
  } catch (err) {
    return errorResponse(err, "update this account");
  }
}
