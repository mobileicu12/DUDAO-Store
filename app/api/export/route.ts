import { NextResponse } from "next/server";
import { errorResponse, requirePermission } from "@/lib/guard";
import { exportCatalog, exportTemplate } from "@/lib/excel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** ?template=1 returns the blank sheet instead of the catalog. */
export async function GET(req: Request) {
  const denied = await requirePermission("inventory");
  if (denied) return denied;

  try {
    const isTemplate = new URL(req.url).searchParams.get("template") === "1";
    const buffer = isTemplate ? await exportTemplate() : await exportCatalog();
    const name = isTemplate
      ? "dudao-product-template.xlsx"
      : `dudao-catalog-${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err, "build that spreadsheet");
  }
}
