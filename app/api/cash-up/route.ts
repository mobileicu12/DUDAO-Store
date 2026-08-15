import { NextResponse } from "next/server";
import { currentCaller, errorResponse, requirePermission } from "@/lib/guard";
import { invalid } from "@/lib/db";
import { listCashUps, recordCashUp, todaysSettlement } from "@/lib/cashup";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Today's settlement figures plus recent cash-up history. */
export async function GET() {
  const denied = await requirePermission("billing");
  if (denied) return denied;

  try {
    const [settlement, history] = await Promise.all([
      todaysSettlement(),
      listCashUps(30),
    ]);
    return NextResponse.json({ settlement, history });
  } catch (err) {
    return errorResponse(err, "load the cash-up");
  }
}

/** Record an end-of-day cash-up. */
export async function POST(req: Request) {
  const denied = await requirePermission("billing");
  if (denied) return denied;

  try {
    const caller = (await currentCaller())!;
    const body = (await req.json()) as {
      countedCash?: number;
      float?: number;
      note?: string;
    };
    if (!Number.isFinite(Number(body.countedCash))) {
      throw invalid("Enter the counted cash amount.");
    }

    const record = await recordCashUp({
      countedCash: Number(body.countedCash),
      float: Number(body.float) || 0,
      note: body.note,
      who: caller.name || caller.email,
    });

    await audit("cashup.record", {
      name: record.businessDay,
      detail: `Counted £${record.countedCash.toFixed(2)}, expected £${record.expectedCash.toFixed(
        2,
      )} + £${record.float.toFixed(2)} float — variance £${record.variance.toFixed(2)}`,
    });

    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    return errorResponse(err, "record the cash-up");
  }
}
