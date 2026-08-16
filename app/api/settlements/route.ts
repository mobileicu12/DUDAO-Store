import { NextResponse } from "next/server";
import { currentCaller, errorResponse, requireOwner } from "@/lib/guard";
import { invalid } from "@/lib/db";
import {
  addBuying,
  deleteBuying,
  listBuying,
  salesReceivedBetween,
  setBuyingIncluded,
} from "@/lib/settlements";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await requireOwner();
  if (denied) return denied;
  try {
    const url = new URL(req.url);
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");
    const from = fromParam ? new Date(`${fromParam}T00:00:00`) : new Date(0);
    const to = toParam ? new Date(`${toParam}T23:59:59`) : new Date();
    const [buying, sales] = await Promise.all([
      listBuying(),
      salesReceivedBetween(from, to),
    ]);
    return NextResponse.json({ buying, salesReceived: sales });
  } catch (err) {
    return errorResponse(err, "load settlements");
  }
}

export async function POST(req: Request) {
  const denied = await requireOwner();
  if (denied) return denied;
  try {
    const caller = (await currentCaller())!;
    const body = (await req.json()) as {
      date?: string;
      supplier?: string;
      description?: string;
      amount?: number;
      included?: boolean;
    };
    if (!(Number(body.amount) > 0)) throw invalid("A positive amount is required.");
    const buying = await addBuying({
      date: body.date,
      supplier: body.supplier,
      description: body.description,
      amount: Number(body.amount),
      included: body.included,
      createdBy: caller.name || caller.email,
    });
    await audit("buying.add", {
      detail: `£${buying.amount.toFixed(2)}${buying.supplier ? ` · ${buying.supplier}` : ""}`,
    });
    return NextResponse.json({ ok: true, buying }, { status: 201 });
  } catch (err) {
    return errorResponse(err, "add this buying entry");
  }
}

export async function PATCH(req: Request) {
  const denied = await requireOwner();
  if (denied) return denied;
  try {
    const body = (await req.json()) as { id?: string; included?: boolean };
    if (!body.id || typeof body.included !== "boolean") {
      throw invalid("id and included are required.");
    }
    await setBuyingIncluded(body.id, body.included);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "update this entry");
  }
}

export async function DELETE(req: Request) {
  const denied = await requireOwner();
  if (denied) return denied;
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw invalid("Which entry should be removed?");
    await deleteBuying(id);
    await audit("buying.delete", { detail: `Deleted buying ${id}` });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "delete this entry");
  }
}
