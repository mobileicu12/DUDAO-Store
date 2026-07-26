import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { InvoiceTotals } from "./billing-shared";

/**
 * Invoice PDF.
 *
 * UNIVERSAL — no window, document or browser API anywhere in this file, so the
 * same code renders in a route handler for a public share link and in the
 * browser for a preview. Any DOM access added here breaks server rendering.
 *
 * White background, hairline rules, no dark header bands: these get printed on
 * cheap thermal and inkjet printers where a solid block wastes half a cartridge
 * and comes out grey anyway.
 */

const INK = "#1a1a1a";
const MUTED = "#6b655c";
const ACCENT = "#5b53e0";
const HAIRLINE = "#e2ddd3";
const FILL = "#f5f3ee";
const GREEN = "#1a7f4b";
const RED = "#b3261e";

const PAGE_W = 210;
const MARGIN = 15;

export type InvoiceDoc = {
  number: string;
  issuedAt: string;
  status: string;
  taxRate: number;
  taxable: boolean;
  notes: string;
  staffName: string;
  billTo: {
    name: string;
    company?: string;
    address?: string;
    phone?: string;
    email?: string;
  };
  lines: {
    title: string;
    sku: string;
    quantity: number;
    unitPrice: number;
  }[];
  totals: InvoiceTotals;
};

export type BusinessDoc = {
  name: string;
  tagline: string;
  addressLines: string[];
  email: string;
  phone: string;
  website: string;
  taxNumber: string;
  bankDetails: string;
  invoiceFooter: string;
  currency: string;
};

/** Currency without Intl — Node and the browser must agree byte for byte. */
function fmt(amount: number, currency: string): string {
  const symbol =
    currency === "GBP" ? "£" : currency === "EUR" ? "€" : currency === "USD" ? "$" : "";
  const n = Number.isFinite(amount) ? amount : 0;
  const fixed = Math.abs(n).toFixed(2);
  const [whole, frac] = fixed.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${n < 0 ? "-" : ""}${symbol}${grouped}.${frac}${symbol ? "" : ` ${currency}`}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function buildInvoiceDoc(
  invoice: InvoiceDoc,
  business: BusinessDoc,
): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const right = PAGE_W - MARGIN;
  let y = MARGIN;

  /* Letterhead ----------------------------------------------------------- */

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(INK);
  doc.text(business.name, MARGIN, y + 2);

  if (business.tagline) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(MUTED);
    doc.text(business.tagline, MARGIN, y + 7);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.setTextColor(ACCENT);
  doc.text("INVOICE", right, y + 2, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(INK);
  doc.text(invoice.number, right, y + 8, { align: "right" });
  doc.setTextColor(MUTED);
  doc.setFontSize(8.5);
  doc.text(formatDate(invoice.issuedAt), right, y + 12.5, { align: "right" });

  y += 18;
  doc.setDrawColor(HAIRLINE);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, right, y);
  y += 6;

  /* From / To ------------------------------------------------------------ */

  const colW = (right - MARGIN) / 2;

  doc.setFontSize(7.5);
  doc.setTextColor(MUTED);
  doc.text("FROM", MARGIN, y);
  doc.text("BILL TO", MARGIN + colW, y);
  y += 4.5;

  doc.setFontSize(9);
  doc.setTextColor(INK);

  const fromLines = [
    ...business.addressLines,
    business.phone,
    business.email,
    business.taxNumber ? `VAT ${business.taxNumber}` : "",
  ].filter(Boolean);

  const toLines = [
    invoice.billTo.company,
    invoice.billTo.address,
    invoice.billTo.phone,
    invoice.billTo.email,
  ].filter(Boolean) as string[];

  doc.setFont("helvetica", "bold");
  doc.text(business.name, MARGIN, y);
  doc.text(invoice.billTo.name || "Walk-in customer", MARGIN + colW, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(MUTED);

  const blockTop = y + 4.5;
  fromLines.forEach((line, i) => doc.text(line, MARGIN, blockTop + i * 4));
  toLines.forEach((line, i) => doc.text(line, MARGIN + colW, blockTop + i * 4));

  y = blockTop + Math.max(fromLines.length, toLines.length) * 4 + 5;

  /* Lines ---------------------------------------------------------------- */

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [["Description", "SKU", "Qty", "Unit", "Amount"]],
    body: invoice.lines.map((l) => [
      l.title,
      l.sku || "—",
      String(l.quantity),
      fmt(l.unitPrice, business.currency),
      fmt(l.quantity * l.unitPrice, business.currency),
    ]),
    theme: "plain",
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 2.4, bottom: 2.4, left: 2, right: 2 },
      textColor: INK,
      lineColor: HAIRLINE,
      lineWidth: { bottom: 0.2, top: 0, left: 0, right: 0 },
    },
    headStyles: {
      fillColor: FILL,
      textColor: MUTED,
      fontSize: 7.5,
      fontStyle: "bold",
      lineWidth: { bottom: 0.3, top: 0, left: 0, right: 0 },
    },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 26 },
      2: { cellWidth: 14, halign: "right" },
      3: { cellWidth: 24, halign: "right" },
      4: { cellWidth: 26, halign: "right" },
    },
    // Repeat the header on every page — a 200-line invoice is unreadable
    // otherwise.
    showHead: "everyPage",
  });

  // autoTable stashes its finishing position on the doc.
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
    .finalY + 6;

  /* Totals --------------------------------------------------------------- */

  const boxW = 68;
  const boxX = right - boxW;

  const row = (label: string, value: string, bold = false, colour = INK) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 10 : 9);
    doc.setTextColor(bold ? INK : MUTED);
    doc.text(label, boxX, y);
    doc.setTextColor(colour);
    doc.text(value, right, y, { align: "right" });
    y += bold ? 6 : 5;
  };

  row("Subtotal", fmt(invoice.totals.subtotal, business.currency));
  if (invoice.totals.discount > 0) {
    row("Discount", `-${fmt(invoice.totals.discount, business.currency)}`);
  }
  if (invoice.taxable) {
    row(`VAT ${invoice.taxRate}%`, fmt(invoice.totals.tax, business.currency));
  }

  doc.setDrawColor(HAIRLINE);
  doc.line(boxX, y - 3, right, y - 3);
  y += 1;
  row("Total", fmt(invoice.totals.total, business.currency), true);

  if (invoice.totals.paid > 0) {
    row("Paid", `-${fmt(invoice.totals.paid, business.currency)}`, false, GREEN);
  }

  const settled = invoice.totals.balance <= 0;
  row(
    settled ? "Balance" : "Balance due",
    fmt(Math.max(invoice.totals.balance, 0), business.currency),
    true,
    settled ? GREEN : RED,
  );

  /* Stamp ---------------------------------------------------------------- */

  const stamp =
    invoice.status === "VOID" ? "VOID" : settled ? "PAID" : "OUTSTANDING";
  const stampColour =
    invoice.status === "VOID" ? MUTED : settled ? GREEN : RED;

  doc.setDrawColor(stampColour);
  doc.setTextColor(stampColour);
  doc.setLineWidth(0.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.roundedRect(MARGIN, y - 12, 42, 12, 1.5, 1.5);
  doc.text(stamp, MARGIN + 21, y - 4, { align: "center" });

  y += 6;

  /* Footer --------------------------------------------------------------- */

  if (invoice.notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(MUTED);
    doc.text("NOTES", MARGIN, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(INK);
    y += 4;
    doc.text(doc.splitTextToSize(invoice.notes, right - MARGIN), MARGIN, y);
    y += 8;
  }

  if (business.bankDetails && !settled) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(MUTED);
    doc.text("HOW TO PAY", MARGIN, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(INK);
    y += 4;
    doc.text(doc.splitTextToSize(business.bankDetails, right - MARGIN), MARGIN, y);
  }

  // Footer line on every page, with page numbers for long invoices.
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(HAIRLINE);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, 282, right, 282);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(MUTED);
    doc.text(business.invoiceFooter || "", MARGIN, 287);
    if (pages > 1) {
      doc.text(`Page ${p} of ${pages}`, right, 287, { align: "right" });
    }
  }

  return doc;
}

/** Node-side bytes for a route handler response. */
export function invoicePdfBuffer(
  invoice: InvoiceDoc,
  business: BusinessDoc,
): Buffer {
  const doc = buildInvoiceDoc(invoice, business);
  return Buffer.from(doc.output("arraybuffer"));
}
