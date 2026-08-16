import { NextResponse } from "next/server";
import { currentCaller, errorResponse, requirePermission } from "@/lib/guard";
import { invalid } from "@/lib/db";
import { addExpense, deleteExpense, listExpenses } from "@/lib/expenses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requirePermission("expenses");
  if (denied) return denied;
  try {
    return NextResponse.json({ expenses: await listExpenses() });
  } catch (err) {
    return errorResponse(err, "load expenses");
  }
}

export async function POST(req: Request) {
  const denied = await requirePermission("expenses");
  if (denied) return denied;
  try {
    const caller = (await currentCaller())!;
    const body = (await req.json()) as {
      date?: string;
      category?: string;
      description?: string;
      amount?: number;
      method?: string;
      note?: string;
    };
    const expense = await addExpense({
      date: body.date,
      category: body.category ?? "",
      description: body.description,
      amount: Number(body.amount) || 0,
      method: body.method,
      note: body.note,
      createdBy: caller.name || caller.email,
    });
    return NextResponse.json(expense, { status: 201 });
  } catch (err) {
    return errorResponse(err, "record this expense");
  }
}

export async function DELETE(req: Request) {
  const denied = await requirePermission("expenses");
  if (denied) return denied;
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw invalid("Which expense should be removed?");
    await deleteExpense(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "delete this expense");
  }
}
