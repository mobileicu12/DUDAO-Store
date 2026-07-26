import "server-only";
import ExcelJS from "exceljs";
import { db, money2, slugify, uniqueHandle } from "./db";
import { EXPORT_COLUMNS } from "./products";
import { tierNum } from "./pricing";

/**
 * Catalog import and export.
 *
 * The round-trip guarantee: exporting the catalog and re-importing the same
 * file unchanged must change nothing. That is why the handle column comes
 * first and is what decides update-vs-create.
 */

const HEADER_FILL = "FFF5F3EE";
const HEADER_FONT = "FF6B655C";

function styleSheet(sheet: ExcelJS.Worksheet): void {
  sheet.columns = EXPORT_COLUMNS.map((c) => ({
    key: c.key,
    header: c.header,
    width: c.width,
  }));

  const header = sheet.getRow(1);
  header.font = { bold: true, size: 10, color: { argb: HEADER_FONT } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: HEADER_FILL },
  };
  header.height = 22;
  header.alignment = { vertical: "middle" };
  // Frozen so the headers stay put on a 5,000-row catalog.
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

export async function exportCatalog(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DUDAU portal";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Products");
  styleSheet(sheet);

  const products = await db.product.findMany({
    orderBy: { title: "asc" },
    include: {
      images: { orderBy: { position: "asc" }, take: 1 },
      collections: { include: { collection: { select: { title: true } } } },
    },
  });

  for (const p of products) {
    sheet.addRow({
      handle: p.handle,
      title: p.title,
      brand: p.brand,
      model: p.model,
      productType: p.productType,
      vendor: p.vendor,
      tags: p.tags.join(", "),
      sku: p.sku,
      barcode: p.barcode,
      price: Number(p.price),
      compareAtPrice: p.compareAtPrice ? Number(p.compareAtPrice) : "",
      priceWholesale: p.priceWholesale ? Number(p.priceWholesale) : "",
      priceShop: p.priceShop ? Number(p.priceShop) : "",
      priceEbay: p.priceEbay ? Number(p.priceEbay) : "",
      priceAmazon: p.priceAmazon ? Number(p.priceAmazon) : "",
      stock: p.stock,
      status: p.status,
      imageUrl: p.images[0]?.url ?? "",
      collections: p.collections.map((c) => c.collection.title).join(", "),
    });
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Blank sheet with one worked example, so the format is self-explanatory. */
export async function exportTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Products");
  styleSheet(sheet);

  sheet.addRow({
    handle: "",
    title: "Example — iPhone 12 screen",
    brand: "Apple",
    model: "iPhone 12",
    productType: "Parts",
    vendor: "Your supplier",
    tags: "screens, lcd",
    sku: "SCR-IP12",
    barcode: "5012345678900",
    price: 65,
    compareAtPrice: 80,
    priceWholesale: 48,
    priceShop: 60,
    priceEbay: 72,
    priceAmazon: 75,
    stock: 10,
    status: "ACTIVE",
    imageUrl: "",
    collections: "Screens",
  });

  const note = sheet.addRow({
    handle: "",
    title: "↑ Delete this row. Leave Handle blank to create; fill it to update.",
  });
  note.font = { italic: true, color: { argb: "FF9A9AA8" }, size: 9 };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/* -------------------------------------------------------------------------- */
/* Import                                                                     */
/* -------------------------------------------------------------------------- */

export type ImportRowResult = {
  row: number;
  title: string;
  ok: boolean;
  action: "created" | "updated" | "skipped" | "failed";
  error?: string;
};

export type ImportSummary = {
  created: number;
  updated: number;
  failed: number;
  skipped: number;
  results: ImportRowResult[];
};

const cellString = (value: ExcelJS.CellValue): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "text" in value) return String(value.text);
  if (typeof value === "object" && "result" in value) {
    return String((value as { result: unknown }).result ?? "");
  }
  return String(value).trim();
};

const cellNumber = (value: ExcelJS.CellValue): number | null => {
  const s = cellString(value).replace(/[^0-9.\-]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/**
 * Import a filled sheet.
 *
 * Rows are processed one at a time and each failure is caught individually —
 * a single malformed row must not abort a 2,000-row import and leave the
 * catalog half-updated with no way to tell where it stopped.
 */
export async function importCatalog(buffer: Buffer): Promise<ImportSummary> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error("That file has no sheets in it.");
  }

  // Map headers by position so a sheet with reordered columns still imports.
  const headerRow = sheet.getRow(1);
  const columnIndex = new Map<string, number>();
  headerRow.eachCell((cell, col) => {
    const header = cellString(cell.value).toLowerCase();
    const def = EXPORT_COLUMNS.find(
      (c) => c.header.toLowerCase() === header || c.key.toLowerCase() === header,
    );
    if (def) columnIndex.set(def.key, col);
  });

  if (!columnIndex.has("title")) {
    throw new Error(
      "That sheet has no Title column. Download the template and use its headings.",
    );
  }

  const get = (row: ExcelJS.Row, key: string): ExcelJS.CellValue => {
    const col = columnIndex.get(key);
    return col ? row.getCell(col).value : null;
  };

  const results: ImportRowResult[] = [];
  let created = 0;
  let updated = 0;
  let failed = 0;
  let skipped = 0;

  // Resolve collection names once rather than per row.
  const collections = await db.collection.findMany({
    select: { id: true, title: true },
  });
  const collectionByName = new Map(
    collections.map((c) => [c.title.toLowerCase(), c.id]),
  );

  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const title = cellString(get(row, "title"));
    const handle = cellString(get(row, "handle"));

    // Wholly blank rows are normal at the end of a sheet.
    if (!title && !handle) {
      continue;
    }

    if (!title) {
      results.push({
        row: r,
        title: handle || "(no title)",
        ok: false,
        action: "failed",
        error: "No product name in this row.",
      });
      failed++;
      continue;
    }

    try {
      const price = cellNumber(get(row, "price"));
      const statusRaw = cellString(get(row, "status")).toUpperCase();
      const status =
        statusRaw === "DRAFT" || statusRaw === "ARCHIVED" ? statusRaw : "ACTIVE";

      const data = {
        title,
        brand: cellString(get(row, "brand")),
        model: cellString(get(row, "model")),
        productType: cellString(get(row, "productType")),
        vendor: cellString(get(row, "vendor")),
        tags: cellString(get(row, "tags"))
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        sku: cellString(get(row, "sku")),
        barcode: cellString(get(row, "barcode")),
        price: money2(price ?? 0),
        compareAtPrice: cellNumber(get(row, "compareAtPrice")),
        priceWholesale: tierNum(cellNumber(get(row, "priceWholesale"))),
        priceShop: tierNum(cellNumber(get(row, "priceShop"))),
        priceEbay: tierNum(cellNumber(get(row, "priceEbay"))),
        priceAmazon: tierNum(cellNumber(get(row, "priceAmazon"))),
        stock: Math.max(0, Math.round(cellNumber(get(row, "stock")) ?? 0)),
        status,
      };

      const existing = handle
        ? await db.product.findUnique({ where: { handle }, select: { id: true } })
        : null;

      if (handle && !existing) {
        // A handle that does not exist is more likely a typo than an intent to
        // create, so say so rather than silently making a duplicate.
        results.push({
          row: r,
          title,
          ok: false,
          action: "failed",
          error: `No product with handle "${handle}". Clear the handle to create a new one.`,
        });
        failed++;
        continue;
      }

      const productId = existing
        ? (
            await db.product.update({
              where: { id: existing.id },
              data,
              select: { id: true },
            })
          ).id
        : (
            await db.product.create({
              data: {
                ...data,
                handle: await uniqueHandle("product", title),
              },
              select: { id: true },
            })
          ).id;

      const imageUrl = cellString(get(row, "imageUrl"));
      if (imageUrl) {
        await db.productImage.deleteMany({ where: { productId } });
        await db.productImage.create({
          data: { productId, url: imageUrl, position: 0 },
        });
      }

      const collectionNames = cellString(get(row, "collections"))
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);

      if (collectionNames.length > 0) {
        for (const name of collectionNames) {
          let collectionId = collectionByName.get(name.toLowerCase());
          if (!collectionId) {
            const fresh = await db.collection.create({
              data: { title: name, handle: slugify(name) + "-" + Date.now().toString(36) },
              select: { id: true },
            });
            collectionId = fresh.id;
            collectionByName.set(name.toLowerCase(), collectionId);
          }
          await db.collectionProduct.createMany({
            data: [{ collectionId, productId }],
            skipDuplicates: true,
          });
        }
      }

      results.push({
        row: r,
        title,
        ok: true,
        action: existing ? "updated" : "created",
      });
      if (existing) updated++;
      else created++;
    } catch (err) {
      results.push({
        row: r,
        title,
        ok: false,
        action: "failed",
        error:
          err instanceof Error
            ? err.message.slice(0, 200)
            : "Something went wrong on this row.",
      });
      failed++;
    }
  }

  return { created, updated, failed, skipped, results };
}
