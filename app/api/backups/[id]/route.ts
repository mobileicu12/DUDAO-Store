import { NextResponse } from "next/server";
import { requireOwner, errorResponse } from "@/lib/guard";
import { getDbBackup } from "@/lib/db-backups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Download one saved backup's full snapshot as JSON — owner only. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireOwner();
  if (denied) return denied;

  try {
    const { id } = await params;
    const data = await getDbBackup(id);
    if (!data) {
      return NextResponse.json({ error: "That backup could not be found." }, { status: 404 });
    }
    const date =
      (data && typeof data === "object" && "generatedAt" in data
        ? String((data as { generatedAt?: string }).generatedAt)
        : ""
      ).slice(0, 10) || new Date().toISOString().slice(0, 10);

    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="dudao-backup-${date}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err, "download that backup");
  }
}
