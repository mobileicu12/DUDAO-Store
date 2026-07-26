import { NextResponse } from "next/server";
import { errorResponse, requirePermission } from "@/lib/guard";
import { getSettings } from "@/lib/settings";
import {
  createProduct,
  listProducts,
  type ProductStatus,
  type StockFilter,
} from "@/lib/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await requirePermission("inventory");
  if (denied) return denied;

  try {
    const url = new URL(req.url);
    const { lowStockThreshold } = await getSettings();

    const result = await listProducts({
      search: url.searchParams.get("q") ?? undefined,
      status: (url.searchParams.get("status") as ProductStatus | "all") ?? "all",
      stock: (url.searchParams.get("stock") as StockFilter) ?? "all",
      productType: url.searchParams.get("type") ?? undefined,
      collectionId: url.searchParams.get("collection") ?? undefined,
      cursor: url.searchParams.get("cursor"),
      limit: Number(url.searchParams.get("limit")) || 50,
      sort:
        (url.searchParams.get("sort") as
          | "title"
          | "price"
          | "stock"
          | "updated") ?? "title",
      dir: url.searchParams.get("dir") === "desc" ? "desc" : "asc",
      lowStockThreshold,
    });

    return NextResponse.json({ ...result, threshold: lowStockThreshold });
  } catch (err) {
    return errorResponse(err, "load your products");
  }
}

export async function POST(req: Request) {
  const denied = await requirePermission("inventory");
  if (denied) return denied;

  try {
    const body = await req.json();
    const product = await createProduct(body);
    return NextResponse.json(product, { status: 201 });
  } catch (err) {
    return errorResponse(err, "save this product");
  }
}
