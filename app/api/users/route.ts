import { NextResponse } from "next/server";
import { errorResponse, requirePermission } from "@/lib/guard";
import { invalid } from "@/lib/db";
import {
  listTeam,
  removeMember,
  upsertMember,
  UserError,
} from "@/lib/portal-users";
import { sanitizePerms } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requirePermission("users");
  if (denied) return denied;

  try {
    // listTeam returns PublicUser — the password hash is never in this shape,
    // so it cannot leak through this route.
    return NextResponse.json({ users: await listTeam() });
  } catch (err) {
    return errorResponse(err, "load your team");
  }
}

export async function POST(req: Request) {
  const denied = await requirePermission("users");
  if (denied) return denied;

  try {
    const body = (await req.json()) as {
      email?: string;
      name?: string;
      phone?: string;
      password?: string;
      permissions?: unknown;
    };
    if (!body.email) throw invalid("Enter an email address to invite.");

    const user = await upsertMember({
      email: body.email,
      name: body.name,
      phone: body.phone,
      password: body.password || undefined,
      permissions: body.permissions
        ? sanitizePerms(body.permissions)
        : undefined,
    });
    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    if (err instanceof UserError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return errorResponse(err, "save this team member");
  }
}

export async function DELETE(req: Request) {
  const denied = await requirePermission("users");
  if (denied) return denied;

  try {
    const email = new URL(req.url).searchParams.get("email");
    if (!email) throw invalid("Which member should be removed?");
    await removeMember(email);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UserError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return errorResponse(err, "remove this team member");
  }
}
