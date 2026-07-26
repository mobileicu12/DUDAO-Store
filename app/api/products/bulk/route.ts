import { NextResponse } from "next/server";
import { errorResponse, requirePermission } from "@/lib/guard";
import { invalid } from "@/lib/db";
import {
  assignBarcodes,
  bulkAddToCollection,
  bulkDelete,
  bulkSetChannels,
  bulkSetPrice,
  bulkSetStatus,
  bulkSetStock,
} from "@/lib/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Bulk edits over a few hundred rows can outlast the default limit. */
export const maxDuration = 300;

type BulkBody = {
  action: string;
  ids: string[];
  value?: unknown;
};

/**
 * One route, action-switched, rather than seven near-identical endpoints.
 * Each branch validates its own `value` — a bulk price edit that silently
 * coerced a bad number to zero would give away stock.
 */
export async function POST(req: Request) {
  const denied = await requirePermission("inventory");
  if (denied) return denied;

  try {
    const body = (await req.json()) as BulkBody;
    const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];

    if (ids.length === 0) {
      throw invalid("Select at least one product first.");
    }
    if (ids.length > 1000) {
      throw invalid("Select fewer than 1,000 products at a time.");
    }

    switch (body.action) {
      case "activate":
        return NextResponse.json(await bulkSetStatus(ids, "ACTIVE"));

      case "draft":
        return NextResponse.json(await bulkSetStatus(ids, "DRAFT"));

      case "archive":
        return NextResponse.json(await bulkSetStatus(ids, "ARCHIVED"));

      case "delete":
        return NextResponse.json(await bulkDelete(ids));

      case "price": {
        const price = Number(body.value);
        if (!Number.isFinite(price)) throw invalid("Enter a valid price.");
        return NextResponse.json(await bulkSetPrice(ids, price));
      }

      case "stock": {
        const stock = Number(body.value);
        if (!Number.isFinite(stock)) {
          throw invalid("Enter a valid stock number.");
        }
        return NextResponse.json(await bulkSetStock(ids, stock));
      }

      case "collection": {
        const collectionId = String(body.value ?? "");
        if (!collectionId) throw invalid("Choose a collection first.");
        return NextResponse.json(
          await bulkAddToCollection(ids, collectionId),
        );
      }

      case "channels": {
        const channels = Array.isArray(body.value)
          ? (body.value as string[])
          : [];
        return NextResponse.json(
          await bulkSetChannels(ids, channels as never),
        );
      }

      case "barcodes":
        return NextResponse.json(
          await assignBarcodes(ids, { overwrite: body.value === true }),
        );

      default:
        throw invalid("That bulk action is not recognised.");
    }
  } catch (err) {
    return errorResponse(err, "apply that change");
  }
}
