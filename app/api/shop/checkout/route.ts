import { NextResponse } from "next/server";
import {
  createTradeCheckout,
  currentTradeCustomer,
  type CheckoutMethod,
} from "@/lib/storefront";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const METHODS: CheckoutMethod[] = ["cash", "bank", "account"];

/**
 * Place a storefront order. Must be an approved trade customer; prices are
 * re-derived server-side, so the request only names product ids and quantities.
 */
export async function POST(req: Request) {
  const customer = await currentTradeCustomer();
  if (!customer) {
    return NextResponse.json(
      { error: "Please sign in to your trade account first." },
      { status: 401 },
    );
  }

  let body: { lines?: unknown; method?: unknown; note?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const method = (typeof body.method === "string" && METHODS.includes(body.method as CheckoutMethod)
    ? body.method
    : "bank") as CheckoutMethod;

  const lines = Array.isArray(body.lines)
    ? (body.lines as unknown[]).map((l) => {
        const o = (l ?? {}) as Record<string, unknown>;
        return { productId: String(o.productId ?? ""), quantity: Number(o.quantity ?? 0) };
      })
    : [];

  try {
    const invoice = await createTradeCheckout({
      customer,
      lines,
      method,
      note: typeof body.note === "string" ? body.note : "",
    });
    return NextResponse.json({
      ok: true,
      invoice: { id: invoice.id, number: invoice.number, total: invoice.totals.total },
    });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    const message =
      status < 500 ? (err as Error).message : "Could not place the order. Please try again.";
    return NextResponse.json({ error: message }, { status });
  }
}
