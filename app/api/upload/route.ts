import { NextResponse } from "next/server";
import { errorResponse, requirePermission } from "@/lib/guard";
import { invalid } from "@/lib/db";
import { uploadProductImage, imagesConfigured, MAX_IMAGE_BYTES } from "@/lib/r2-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Upload a product image to R2 and return its public URL.
 *
 * Staff with the inventory permission only. The image goes to the public image
 * bucket; the returned URL is what gets saved on the product.
 */
export async function POST(req: Request) {
  const denied = await requirePermission("inventory");
  if (denied) return denied;

  try {
    if (!imagesConfigured()) {
      throw invalid(
        "Image uploads aren't set up yet. Add R2_IMAGE_BUCKET and R2_PUBLIC_BASE_URL.",
      );
    }
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) throw invalid("No file was uploaded.");
    if (file.size > MAX_IMAGE_BYTES) {
      throw invalid(`Image too large (max ${MAX_IMAGE_BYTES / 1024 / 1024}MB).`);
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || "application/octet-stream";
    const result = await uploadProductImage(buffer, contentType);
    return NextResponse.json({ ok: true, url: result.url });
  } catch (err) {
    return errorResponse(err, "upload that image");
  }
}
