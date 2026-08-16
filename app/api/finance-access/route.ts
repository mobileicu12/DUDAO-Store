import { NextResponse } from "next/server";
import {
  currentCaller,
  errorResponse,
  requireAuth,
  requireOwner,
} from "@/lib/guard";
import { invalid } from "@/lib/db";
import {
  approveFinanceAccess,
  listFinanceAccess,
  requestFinanceAccess,
  revokeFinanceAccess,
} from "@/lib/finance-access";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owner: who is waiting and who currently has a live reveal window. */
export async function GET() {
  const denied = await requireOwner();
  if (denied) return denied;
  try {
    return NextResponse.json(await listFinanceAccess());
  } catch (err) {
    return errorResponse(err, "load finance access");
  }
}

/** Staff: request a temporary look at the finance figures. */
export async function POST() {
  const denied = await requireAuth();
  if (denied) return denied;
  try {
    const caller = (await currentCaller())!;
    await requestFinanceAccess(caller.email, caller.name);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "request finance access");
  }
}

/** Owner: approve a reveal window for someone. */
export async function PATCH(req: Request) {
  const denied = await requireOwner();
  if (denied) return denied;
  try {
    const body = (await req.json()) as { email?: string };
    if (!body.email) throw invalid("Whose access should be approved?");
    const grant = await approveFinanceAccess(body.email);
    await audit("finance.grant", { detail: `Finance visible to ${grant.email} for 15 min` });
    return NextResponse.json({ ok: true, grant });
  } catch (err) {
    return errorResponse(err, "approve finance access");
  }
}

/** Owner: revoke access or dismiss a request immediately. */
export async function DELETE(req: Request) {
  const denied = await requireOwner();
  if (denied) return denied;
  try {
    const email = new URL(req.url).searchParams.get("email");
    if (!email) throw invalid("Whose access should be revoked?");
    await revokeFinanceAccess(email);
    await audit("finance.revoke", { detail: `Finance access removed for ${email}` });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "revoke finance access");
  }
}
