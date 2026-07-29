import "server-only";
import ExcelJS from "exceljs";
import { db, money2, slugify } from "./db";
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
  workbook.creator = "DUDAO portal";
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

  // Run `worker` over `items` with at most `size` in flight. JS stays
  // single-threaded, so the per-item bookkeeping below is race-free; the
  // concurrency only overlaps the network latency of the DB round trips.
  const mapPool = async <T>(
    items: T[],
    size: number,
    worker: (item: T) => Promise<void>,
  ): Promise<void> => {
    let cursorPool = 0;
    const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
      while (cursorPool < items.length) {
        const item = items[cursorPool++];
        await worker(item);
      }
    });
    await Promise.all(runners);
  };

  const chunk = <T>(arr: T[], n: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  };

  type ProductData = {
    title: string;
    brand: string;
    model: string;
    productType: string;
    vendor: string;
    tags: string[];
    sku: string;
    barcode: string;
    price: number;
    compareAtPrice: number | null;
    priceWholesale: number | null;
    priceShop: number | null;
    priceEbay: number | null;
    priceAmazon: number | null;
    stock: number;
    status: string;
  };
  type Parsed = {
    row: number;
    title: string;
    handleGiven: string;
    data: ProductData;
    imageUrl: string;
    collectionNames: string[];
  };

  /* -- Phase 1: parse every row in memory (no DB work) -------------------- */
  const parsed: Parsed[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const title = cellString(get(row, "title"));
    const handleGiven = cellString(get(row, "handle"));

    // Wholly blank rows are normal at the end of a sheet.
    if (!title && !handleGiven) continue;

    if (!title) {
      results.push({
        row: r,
        title: handleGiven || "(no title)",
        ok: false,
        action: "failed",
        error: "No product name in this row.",
      });
      failed++;
      continue;
    }

    const price = cellNumber(get(row, "price"));
    const statusRaw = cellString(get(row, "status")).toUpperCase();
    const status =
      statusRaw === "DRAFT" || statusRaw === "ARCHIVED" ? statusRaw : "ACTIVE";

    parsed.push({
      row: r,
      title,
      handleGiven,
      data: {
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
      },
      imageUrl: cellString(get(row, "imageUrl")),
      collectionNames: cellString(get(row, "collections"))
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
    });
  }

  /* -- Phase 2: resolve update targets and handle uniqueness (2 queries) -- */
  const givenHandles = [...new Set(parsed.map((p) => p.handleGiven).filter(Boolean))];
  const existingByHandle = new Map<string, string>();
  for (const part of chunk(givenHandles, 500)) {
    const rows = await db.product.findMany({
      where: { handle: { in: part } },
      select: { id: true, handle: true },
    });
    for (const row of rows) existingByHandle.set(row.handle, row.id);
  }

  // Every handle already in use, so new products get a collision-free one
  // without a per-row round trip (the sequential equivalent of uniqueHandle).
  const handleSet = new Set(
    (await db.product.findMany({ select: { handle: true } })).map((h) => h.handle),
  );
  const freshHandle = (title: string): string => {
    const base = slugify(title);
    let candidate = base;
    for (let i = 2; handleSet.has(candidate); i++) candidate = `${base}-${i}`;
    handleSet.add(candidate);
    return candidate;
  };

  /* -- Phase 3: partition into updates / creates / typo failures --------- */
  const toUpdate: { p: Parsed; id: string }[] = [];
  const toCreate: { p: Parsed; handle: string; failed?: boolean }[] = [];
  for (const p of parsed) {
    if (p.handleGiven) {
      const id = existingByHandle.get(p.handleGiven);
      if (!id) {
        // A handle that does not exist is more likely a typo than an intent
        // to create, so say so rather than silently making a duplicate.
        results.push({
          row: p.row,
          title: p.title,
          ok: false,
          action: "failed",
          error: `No product with handle "${p.handleGiven}". Clear the handle to create a new one.`,
        });
        failed++;
        continue;
      }
      toUpdate.push({ p, id });
    } else {
      toCreate.push({ p, handle: freshHandle(p.title) });
    }
  }

  /* -- Phase 4: pre-create any missing collections (batched) ------------- */
  const neededNames = new Set<string>();
  for (const p of parsed) for (const n of p.collectionNames) neededNames.add(n);
  const missingNames = [...neededNames].filter(
    (n) => !collectionByName.has(n.toLowerCase()),
  );
  if (missingNames.length) {
    const stamp = Date.now().toString(36);
    await db.collection.createMany({
      data: missingNames.map((n, i) => ({
        title: n,
        handle: `${slugify(n)}-${stamp}${i}`,
      })),
      skipDuplicates: true,
    });
    const refreshed = await db.collection.findMany({ select: { id: true, title: true } });
    for (const c of refreshed) collectionByName.set(c.title.toLowerCase(), c.id);
  }

  /* -- Phase 5: create products (chunked, with per-row fallback) ---------- */
  for (const part of chunk(toCreate, 500)) {
    try {
      await db.product.createMany({
        data: part.map((c) => ({ ...c.p.data, handle: c.handle })),
      });
      for (const c of part) {
        results.push({ row: c.p.row, title: c.p.title, ok: true, action: "created" });
        created++;
      }
    } catch {
      // One bad row would abort the whole chunk — fall back to per-row so the
      // rest still land and the offender is pinpointed.
      for (const c of part) {
        try {
          await db.product.create({ data: { ...c.p.data, handle: c.handle } });
          results.push({ row: c.p.row, title: c.p.title, ok: true, action: "created" });
          created++;
        } catch (err) {
          c.failed = true;
          results.push({
            row: c.p.row,
            title: c.p.title,
            ok: false,
            action: "failed",
            error: err instanceof Error ? err.message.slice(0, 200) : "Row failed.",
          });
          failed++;
        }
      }
    }
  }

  // Map the freshly-created handles back to ids for images and collections.
  const createdHandles = toCreate.filter((c) => !c.failed).map((c) => c.handle);
  const idByHandle = new Map(existingByHandle);
  for (const part of chunk(createdHandles, 500)) {
    const rows = await db.product.findMany({
      where: { handle: { in: part } },
      select: { id: true, handle: true },
    });
    for (const row of rows) idByHandle.set(row.handle, row.id);
  }

  /* -- Phase 6: updates (bounded concurrency, per-row isolation) --------- */
  await mapPool(toUpdate, 15, async (u) => {
    try {
      await db.product.update({ where: { id: u.id }, data: u.p.data });
      results.push({ row: u.p.row, title: u.p.title, ok: true, action: "updated" });
      updated++;
    } catch (err) {
      results.push({
        row: u.p.row,
        title: u.p.title,
        ok: false,
        action: "failed",
        error: err instanceof Error ? err.message.slice(0, 200) : "Row failed.",
      });
      failed++;
    }
  });

  /* -- Phase 7: images and collection links (batched) -------------------- */
  const withProductId: { p: Parsed; productId: string }[] = [];
  for (const u of toUpdate) withProductId.push({ p: u.p, productId: u.id });
  for (const c of toCreate) {
    if (c.failed) continue;
    const productId = idByHandle.get(c.handle);
    if (productId) withProductId.push({ p: c.p, productId });
  }

  const imaged = withProductId.filter((w) => w.p.imageUrl);
  if (imaged.length) {
    const ids = imaged.map((w) => w.productId);
    for (const part of chunk(ids, 500)) {
      await db.productImage.deleteMany({ where: { productId: { in: part } } });
    }
    for (const part of chunk(imaged, 500)) {
      await db.productImage.createMany({
        data: part.map((w) => ({ productId: w.productId, url: w.p.imageUrl, position: 0 })),
      });
    }
  }

  const links: { collectionId: string; productId: string }[] = [];
  for (const w of withProductId) {
    for (const name of w.p.collectionNames) {
      const collectionId = collectionByName.get(name.toLowerCase());
      if (collectionId) links.push({ collectionId, productId: w.productId });
    }
  }
  for (const part of chunk(links, 1000)) {
    await db.collectionProduct.createMany({ data: part, skipDuplicates: true });
  }

  results.sort((a, b) => a.row - b.row);
  return { created, updated, failed, skipped, results };
}
