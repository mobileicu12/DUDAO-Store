import { NextResponse } from "next/server";
import { errorResponse, requireAnyPermission, requirePermission } from "@/lib/guard";
import { autoOrganise, createCollection, listCollections } from "@/lib/collections";
import { invalid } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  // The bulk "add to collection" action in inventory needs this list too.
  const denied = await requireAnyPermission(["collections", "inventory"]);
  if (denied) return denied;

  try {
    return NextResponse.json({ collections: await listCollections() });
  } catch (err) {
    return errorResponse(err, "load your collections");
  }
}

export async function POST(req: Request) {
  const denied = await requirePermission("collections");
  if (denied) return denied;

  try {
    const body = (await req.json()) as {
      action?: string;
      title?: string;
      descriptionHtml?: string;
      smartRule?: string;
    };

    if (body.action === "organize") {
      return NextResponse.json(await autoOrganise());
    }

    if (!body.title) throw invalid("Give the collection a name.");
    return NextResponse.json(
      await createCollection({
        title: body.title,
        descriptionHtml: body.descriptionHtml,
        smartRule: body.smartRule,
      }),
      { status: 201 },
    );
  } catch (err) {
    return errorResponse(err, "save this collection");
  }
}
