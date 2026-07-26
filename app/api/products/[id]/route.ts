import { NextResponse } from "next/server";
import { errorResponse, requirePermission } from "@/lib/guard";
import { db } from "@/lib/db";
import { bulkDelete, getProduct, updateProduct } from "@/lib/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const denied = await requirePermission("inventory");
  if (denied) return denied;

  try {
    const { id } = await params;

    // The editor needs the full record, not the list projection.
    const row = await db.product.findUnique({
      where: { id },
      include: {
        images: { orderBy: { position: "asc" } },
        collections: { select: { collectionId: true } },
      },
    });

    if (!row) {
      return NextResponse.json(
        { error: "That product could not be found. It may have been deleted." },
        { status: 404 },
      );
    }

    const base = await getProduct(id);
    return NextResponse.json({
      ...base,
      descriptionHtml: row.descriptionHtml,
      images: row.images.map((i) => ({ url: i.url, alt: i.alt })),
      collectionIds: row.collections.map((c) => c.collectionId),
    });
  } catch (err) {
    return errorResponse(err, "open this product");
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const denied = await requirePermission("inventory");
  if (denied) return denied;

  try {
    const { id } = await params;
    const body = await req.json();
    return NextResponse.json(await updateProduct(id, body));
  } catch (err) {
    return errorResponse(err, "save this product");
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const denied = await requirePermission("inventory");
  if (denied) return denied;

  try {
    const { id } = await params;
    const result = await bulkDelete([id]);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err, "delete this product");
  }
}
