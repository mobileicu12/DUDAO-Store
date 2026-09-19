import { NextResponse } from "next/server";
import { errorResponse, requirePermission } from "@/lib/guard";
import { findDuplicateGroups } from "@/lib/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requirePermission("inventory");
  if (denied) return denied;

  try {
    return NextResponse.json({ groups: await findDuplicateGroups() });
  } catch (err) {
    return errorResponse(err, "scan for duplicate products");
  }
}
