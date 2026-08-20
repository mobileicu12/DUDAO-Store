import { NextResponse } from "next/server";
import { currentActor } from "@/lib/audit";
import { errorResponse, requirePermission } from "@/lib/guard";
import { invalid } from "@/lib/db";
import { importCatalog, listImportBatches } from "@/lib/excel";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** A few thousand rows takes real time; the default limit would cut it off. */
export const maxDuration = 300;

/** Recent import batches, for the undo list. */
export async function GET() {
  const denied = await requirePermission("inventory");
  if (denied) return denied;
  try {
    return NextResponse.json({ batches: await listImportBatches() });
  } catch (err) {
    return errorResponse(err, "load recent imports");
  }
}

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

    const dryRun = form.get("dryRun") === "1";
    const who = await currentActor();
    const buffer = Buffer.from(await file.arrayBuffer());
    const summary = await importCatalog(buffer, { who, fileName: file.name }, { dryRun });
    if (!dryRun && summary.batchId) {
      await audit("catalog.import", {
        ref: summary.batchId,
        name: file.name,
        detail: `${summary.created} created, ${summary.updated} updated, ${summary.failed} failed`,
      });
    }
    return NextResponse.json(summary);
  } catch (err) {
    return errorResponse(err, "import that spreadsheet");
  }
}
