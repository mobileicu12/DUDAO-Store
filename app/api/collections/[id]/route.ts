import { NextResponse } from "next/server";
import { errorResponse, requirePermission } from "@/lib/guard";
import {
  addProducts,
  deleteCollection,
  getCollection,
  removeProducts,
  updateCollection,
} from "@/lib/collections";
import { invalid } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const denied = await requirePermission("collections");
  if (denied) return denied;

  try {
    const { id } = await params;
    const collection = await getCollection(id);
    if (!collection) {
      return NextResponse.json(
        { error: "That collection could not be found." },
        { status: 404 },
      );
    }
    return NextResponse.json(collection);
  } catch (err) {
    return errorResponse(err, "open this collection");
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const denied = await requirePermission("collections");
  if (denied) return denied;

  try {
    const { id } = await params;
    const body = (await req.json()) as {
      action?: string;
      productIds?: string[];
      title?: string;
      descriptionHtml?: string;
      imageUrl?: string;
    };

    // Products are added and removed in one request each, however many there
    // are — adding 100 products must not be 100 round trips.
    if (body.action === "add-products") {
      if (!body.productIds?.length) throw invalid("Choose some products first.");
      return NextResponse.json({ added: await addProducts(id, body.productIds) });
    }

    if (body.action === "remove-products") {
      if (!body.productIds?.length) throw invalid("Choose some products first.");
      return NextResponse.json({
        removed: await removeProducts(id, body.productIds),
      });
    }

    await updateCollection(id, body);
    return NextResponse.json(await getCollection(id));
  } catch (err) {
    return errorResponse(err, "save this collection");
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const denied = await requirePermission("collections");
  if (denied) return denied;

  try {
    const { id } = await params;
    await deleteCollection(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, "delete this collection");
  }
}
