import { NextResponse } from "next/server";
import { errorResponse, requirePermission } from "@/lib/guard";
import { invalid } from "@/lib/db";
import { bulkCustomerSegments, bulkDeleteCustomers } from "@/lib/customers";
import { SEGMENT_KEYS, type SegmentKey } from "@/lib/segments";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type BulkBody = {
  action: string;
  ids: string[];
  segments?: string[];
};

/**
 * Bulk customer actions, action-switched like the products bulk route.
 * Deletion keeps anyone with invoice history; segment edits are additive or
 * subtractive across the whole selection.
 */
export async function POST(req: Request) {
  const denied = await requirePermission("customers");
  if (denied) return denied;

  try {
    const body = (await req.json()) as BulkBody;
    const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
    if (ids.length === 0) throw invalid("Select at least one customer first.");
    if (ids.length > 1000) {
      throw invalid("Select fewer than 1,000 customers at a time.");
    }

    switch (body.action) {
      case "delete": {
        const res = await bulkDeleteCustomers(ids);
        await audit("customer.delete", {
          detail: `Bulk delete — removed ${res.deleted}${
            res.skipped ? `, kept ${res.skipped} with invoice history` : ""
          }`,
        });
        return NextResponse.json(res);
      }

      case "addSegments":
      case "removeSegments": {
        const segments = (body.segments ?? []).filter((s): s is SegmentKey =>
          SEGMENT_KEYS.includes(s as SegmentKey),
        );
        if (segments.length === 0) throw invalid("Choose at least one segment.");
        const res = await bulkCustomerSegments(
          ids,
          segments,
          body.action === "addSegments" ? "add" : "remove",
        );
        return NextResponse.json(res);
      }

      default:
        throw invalid("That bulk action is not recognised.");
    }
  } catch (err) {
    return errorResponse(err, "apply that change");
  }
}
