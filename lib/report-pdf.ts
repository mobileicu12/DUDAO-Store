import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { BusinessDoc } from "./invoice-pdf";

/**
 * Business and day reports. UNIVERSAL — no DOM, renders server-side.
 *
 * Three builders share this file because they share a header and a money
 * formatter, and keeping them together stops the three reports drifting apart
 * in look.
 */

const INK = "#1a1a1a";
const MUTED = "#6b655c";
const ACCENT = "#b7891f";
const HAIRLINE = "#e2ddd3";
const FILL = "#f5f3ee";
const GREEN = "#1a7f4b";

const PAGE_W = 210;
const MARGIN = 15;

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
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${String(d.getDate()).padStart(2, "0")} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function header(doc: jsPDF, business: BusinessDoc, title: string, subtitle: string): number {
  const right = PAGE_W - MARGIN;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(INK);
  doc.text(business.name, MARGIN, 20);

  doc.setFontSize(15);
  doc.setTextColor(ACCENT);
  doc.text(title, right, 20, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(MUTED);
  doc.text(subtitle, right, 26, { align: "right" });

  doc.setDrawColor(HAIRLINE);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, 30, right, 30);
  return 36;
}

function footer(doc: jsPDF, business: BusinessDoc): void {
  const right = PAGE_W - MARGIN;
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(HAIRLINE);
    doc.line(MARGIN, 282, right, 282);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(MUTED);
    doc.text(business.invoiceFooter || "", MARGIN, 287);
    if (pages > 1) doc.text(`Page ${p} of ${pages}`, right, 287, { align: "right" });
  }
}

/* -------------------------------------------------------------------------- */
/* 1. Filtered multi-invoice business report                                  */
/* -------------------------------------------------------------------------- */

export type ReportInvoiceRow = {
  number: string;
  date: string;
  customer: string;
  segment: string;
  total: number;
  paid: number;
  method: string;
};

export function buildInvoicesReportDoc(
  rows: ReportInvoiceRow[],
  opts: { title?: string; range?: string; business: BusinessDoc },
): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const { business } = opts;
  const right = PAGE_W - MARGIN;
  let y = header(doc, business, opts.title ?? "SALES REPORT", opts.range ?? "");

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [["Invoice", "Date", "Customer", "Source", "Total", "Paid"]],
    body: rows.map((r) => [
      r.number,
      formatDate(r.date),
      r.customer,
      r.segment,
      fmt(r.total, business.currency),
      fmt(r.paid, business.currency),
    ]),
    theme: "plain",
    styles: { fontSize: 8, cellPadding: 2, textColor: INK, lineColor: HAIRLINE, lineWidth: { bottom: 0.2 } },
    headStyles: { fillColor: FILL, textColor: MUTED, fontSize: 7.5, fontStyle: "bold" },
    columnStyles: { 4: { halign: "right" }, 5: { halign: "right", textColor: GREEN } },
    showHead: "everyPage",
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // Totals by segment and by method.
  const bySegment = new Map<string, number>();
  const byMethod = new Map<string, number>();
  let grandTotal = 0;
  let grandPaid = 0;
  for (const r of rows) {
    bySegment.set(r.segment, (bySegment.get(r.segment) ?? 0) + r.total);
    byMethod.set(r.method || "unpaid", (byMethod.get(r.method || "unpaid") ?? 0) + r.paid);
    grandTotal += r.total;
    grandPaid += r.paid;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  doc.text("BY SOURCE", MARGIN, y);
  doc.text("BY PAYMENT METHOD", MARGIN + 90, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(INK);
  const segEntries = Array.from(bySegment.entries());
  const methodEntries = Array.from(byMethod.entries());
  const maxRows = Math.max(segEntries.length, methodEntries.length);
  for (let i = 0; i < maxRows; i++) {
    if (segEntries[i]) {
      doc.text(segEntries[i][0], MARGIN, y);
      doc.text(fmt(segEntries[i][1], business.currency), MARGIN + 75, y, { align: "right" });
    }
    if (methodEntries[i]) {
      doc.text(methodEntries[i][0], MARGIN + 90, y);
      doc.text(fmt(methodEntries[i][1], business.currency), right, y, { align: "right" });
    }
    y += 4.5;
  }

  y += 3;
  doc.setDrawColor(HAIRLINE);
  doc.line(MARGIN, y, right, y);
  y += 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(INK);
  doc.text(`${rows.length} invoices`, MARGIN, y);
  doc.text(`Billed ${fmt(grandTotal, business.currency)}`, MARGIN + 70, y);
  doc.setTextColor(GREEN);
  doc.text(`Collected ${fmt(grandPaid, business.currency)}`, right, y, { align: "right" });

  footer(doc, business);
  return doc;
}

/* -------------------------------------------------------------------------- */
/* 2 & 3. One customer's bills for one day                                     */
/* -------------------------------------------------------------------------- */

export type CustomerDayInvoice = {
  number: string;
  total: number;
  paid: number;
  lines: { title: string; sku: string; quantity: number; unitPrice: number }[];
};

export function buildCustomerDayDoc(
  customer: { name: string; company?: string },
  invoices: CustomerDayInvoice[],
  opts: { date: string; business: BusinessDoc; outstanding?: number },
): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const { business } = opts;
  const right = PAGE_W - MARGIN;
  let y = header(doc, business, "DAY STATEMENT", formatDate(opts.date));

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(INK);
  doc.text(customer.name, MARGIN, y);
  if (customer.company) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(MUTED);
    doc.text(customer.company, MARGIN, y + 4.5);
    y += 4.5;
  }
  y += 8;

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [["Invoice", "Items", "Paid", "Total"]],
    body: invoices.map((i) => [
      i.number,
      `${i.lines.length} item${i.lines.length === 1 ? "" : "s"}`,
      fmt(i.paid, business.currency),
      fmt(i.total, business.currency),
    ]),
    theme: "plain",
    styles: { fontSize: 8.5, cellPadding: 2.2, textColor: INK, lineColor: HAIRLINE, lineWidth: { bottom: 0.2 } },
    headStyles: { fillColor: FILL, textColor: MUTED, fontSize: 7.5, fontStyle: "bold" },
    columnStyles: { 2: { halign: "right", textColor: GREEN }, 3: { halign: "right" } },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  const dayTotal = invoices.reduce((s, i) => s + i.total, 0);
  const dayPaid = invoices.reduce((s, i) => s + i.paid, 0);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(INK);
  doc.text("Today's total", right - 60, y);
  doc.text(fmt(dayTotal, business.currency), right, y, { align: "right" });
  y += 5.5;
  doc.setTextColor(GREEN);
  doc.text("Paid today", right - 60, y);
  doc.text(fmt(dayPaid, business.currency), right, y, { align: "right" });

  if (opts.outstanding !== undefined) {
    y += 5.5;
    doc.setTextColor(opts.outstanding > 0 ? "#b3261e" : GREEN);
    doc.text("Account balance", right - 60, y);
    doc.text(fmt(opts.outstanding, business.currency), right, y, { align: "right" });
  }

  footer(doc, business);
  return doc;
}

/** Same, but line-level: every item on every bill. */
export function buildCustomerDayItemisedDoc(
  customer: { name: string; company?: string },
  invoices: CustomerDayInvoice[],
  opts: { date: string; business: BusinessDoc; outstanding?: number },
): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const { business } = opts;
  const right = PAGE_W - MARGIN;
  let y = header(doc, business, "DAY STATEMENT", formatDate(opts.date));

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(INK);
  doc.text(customer.name, MARGIN, y);
  y += 8;

  const body: (string | number)[][] = [];
  for (const inv of invoices) {
    for (const l of inv.lines) {
      body.push([
        inv.number,
        l.title,
        l.sku || "—",
        String(l.quantity),
        fmt(l.unitPrice, business.currency),
        fmt(l.quantity * l.unitPrice, business.currency),
      ]);
    }
  }

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [["Invoice", "Item", "SKU", "Qty", "Unit", "Amount"]],
    body,
    theme: "plain",
    styles: { fontSize: 8, cellPadding: 2, textColor: INK, lineColor: HAIRLINE, lineWidth: { bottom: 0.2 } },
    headStyles: { fillColor: FILL, textColor: MUTED, fontSize: 7.5, fontStyle: "bold" },
    columnStyles: { 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
    showHead: "everyPage",
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  const dayTotal = invoices.reduce((s, i) => s + i.total, 0);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(INK);
  doc.text("Today's total", right - 60, y);
  doc.text(fmt(dayTotal, business.currency), right, y, { align: "right" });

  footer(doc, business);
  return doc;
}

export const reportBuffer = (doc: jsPDF): Buffer =>
  Buffer.from(doc.output("arraybuffer"));
