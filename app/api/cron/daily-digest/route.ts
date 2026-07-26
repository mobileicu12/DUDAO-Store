import { NextResponse } from "next/server";
import { runDailyDigest, autoTapOutAll } from "@/lib/digest";
import { isOwnerRequest } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Authorised three ways:
 *  - a CRON_SECRET bearer token (how Vercel Cron calls it),
 *  - the vercel-cron user-agent when no secret is configured,
 *  - a signed-in owner clicking "send now".
 *
 * GET is the scheduled entry point; POST is the owner button (force=true so it
 * runs even when the digest is disabled or already ran today).
 */
async function authorised(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET ?? "";
  const auth = req.headers.get("authorization") ?? "";
  const ua = req.headers.get("user-agent") ?? "";

  if (secret) {
    if (auth === `Bearer ${secret}`) return true;
  } else if (ua.includes("vercel-cron")) {
    return true;
  }
  return isOwnerRequest();
}

async function handle(req: Request, force: boolean) {
  if (!(await authorised(req))) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  try {
    const closed = await autoTapOutAll();
    const result = await runDailyDigest({ force });
    return NextResponse.json({ ...result, shiftsClosed: closed });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[digest] ${detail}`);
    return NextResponse.json(
      { error: "The digest run hit an error.", detail },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  return handle(req, false);
}

export async function POST(req: Request) {
  // Owner "send now" forces a run.
  return handle(req, true);
}
