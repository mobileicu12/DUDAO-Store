import { NextResponse } from "next/server";
import { errorResponse, requirePermission } from "@/lib/guard";
import { invalid } from "@/lib/db";
import { importCatalog } from "@/lib/excel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** A few thousand rows takes real time; the default limit would cut it off. */
export const maxDuration = 300;

export async function POST(req: Request) {
  const denied = await requirePermission("inventory");
  if (denied) return denied;

  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      throw invalid("Choose a spreadsheet to upload first.");
    }
    if (file.size > 25 * 1024 * 1024) {
      throw invalid("That file is over 25MB. Split it into smaller sheets.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    return NextResponse.json(await importCatalog(buffer));
  } catch (err) {
    return errorResponse(err, "import that spreadsheet");
  }
}
