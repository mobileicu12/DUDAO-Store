import "server-only";
import { randomUUID } from "node:crypto";
import { putBinaryToR2 } from "./s3-backup";

/**
 * Product image uploads to Cloudflare R2.
 *
 * Images go to a PUBLIC bucket (separate from the private backups bucket) so
 * they can be shown on the storefront, in the portal and on PDFs by plain URL.
 * Configure with (reusing the R2 account + keys already set for backups):
 *   R2_IMAGE_BUCKET       a public R2 bucket, e.g. "dudao-images"
 *   R2_PUBLIC_BASE_URL    that bucket's public base, e.g. https://pub-xxxx.r2.dev
 */

const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

/** 10 MB — plenty for a product photo, and keeps a single request small. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function bucket(): string {
  return process.env.R2_IMAGE_BUCKET ?? "";
}
function publicBase(): string {
  return (process.env.R2_PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
}

export function imagesConfigured(): boolean {
  return Boolean(
    bucket() &&
      publicBase() &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      (process.env.R2_ACCOUNT_ID || process.env.R2_ENDPOINT),
  );
}

export type ImageUploadResult = { url: string; key: string };

/** Upload one product image; returns its public URL. Throws on bad input. */
export async function uploadProductImage(
  body: Buffer,
  contentType: string,
): Promise<ImageUploadResult> {
  if (!imagesConfigured()) {
    throw new Error(
      "Image storage isn't set up. Set R2_IMAGE_BUCKET and R2_PUBLIC_BASE_URL.",
    );
  }
  const ext = ALLOWED[contentType.toLowerCase()];
  if (!ext) {
    throw new Error("Unsupported image type. Use JPG, PNG, WEBP, GIF or AVIF.");
  }
  if (body.length === 0) throw new Error("The file is empty.");
  if (body.length > MAX_IMAGE_BYTES) {
    throw new Error(`Image too large (max ${MAX_IMAGE_BYTES / 1024 / 1024}MB).`);
  }

  const key = `products/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;
  await putBinaryToR2({ bucket: bucket(), key, body, contentType });
  return { url: `${publicBase()}/${key}`, key };
}
