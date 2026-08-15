import { jsPDF } from "jspdf";
import type { BusinessDoc } from "./invoice-pdf";

/**
 * Payment receipt PDF — "we received this much from you, and here's where your
 * account stands now".
 *
 * UNIVERSAL, like the invoice and statement generators: no window or document,
 * so it renders on the server for a share link and in the browser alike.
 *
 * DUDAO holds account payments against the running balance rather than
 * allocating them to specific bills, so the receipt states the amount received
 * and the current account balance — it never invents a per-invoice breakdown
 * the ledger does not actually have.
 */

const INK = "#1a1a1a";
const MUTED = "#6b655c";
const ACCENT = "#b7891f";
const HAIRLINE = "#e2ddd3";
const FILL = "#f5f3ee";
const GREEN = "#1a7f4b";
const RED = "#b3261e";

const PAGE_W = 210;
const PAGE_H = 297;
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
  const day = String(d.getDate()).padStart(2, "0");
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export type ReceiptDoc = {
  customer: {
    name: string;
    company?: string;
    address?: string;
    phone?: string;
    email?: string;
  };
  amount: number;
  method: string;
  date: string; // ISO
  note?: string;
  /** Set when the payment was taken against a specific bill. */
  reference?: string | null;
  /** The customer's outstanding balance now (opening + billed − paid). */
  balanceNow: number;
  generatedAt: string;
};

export function receiptFilename(r: ReceiptDoc): string {
  return `receipt-${r.customer.name.replace(/[^a-z0-9]+/gi, "-")}-${r.date.slice(0, 10)}.pdf`;
}

const methodLabel = (m: string): string =>
  ({ cash: "Cash", card: "Card", bank: "Bank transfer", account: "On account" })[m] ??
  m.charAt(0).toUpperCase() + m.slice(1);

export function buildReceiptDoc(r: ReceiptDoc, business: BusinessDoc): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const right = PAGE_W - MARGIN;
  let y = MARGIN;

  /* Letterhead ----------------------------------------------------------- */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(INK);
  doc.text(business.name, MARGIN, y + 2);

  doc.setFontSize(19);
  doc.setTextColor(ACCENT);
  doc.text("RECEIPT", right, y + 2, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(MUTED);
  doc.text(formatDate(r.date), right, y + 8, { align: "right" });

  y += 14;
  doc.setDrawColor(HAIRLINE);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, right, y);
  y += 6;

  /* Two columns: received from / paid to --------------------------------- */
  const colR = PAGE_W / 2 + 5;
  doc.setFontSize(7.5);
  doc.setTextColor(MUTED);
  doc.text("RECEIVED FROM", MARGIN, y);
  doc.text("PAID TO", colR, y);
  y += 4.5;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(INK);
  doc.text(r.customer.name, MARGIN, y);
  doc.text(business.name, colR, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  const fromLines = [
    r.customer.company,
    r.customer.address,
    r.customer.phone,
    r.customer.email,
  ].filter(Boolean) as string[];
  const toLines = [...business.addressLines, business.phone, business.email].filter(
    Boolean,
  ) as string[];
  fromLines.forEach((line, i) => doc.text(line, MARGIN, y + 4.5 + i * 4));
  toLines.forEach((line, i) => doc.text(line, colR, y + 4.5 + i * 4));

  y += 6 + Math.max(fromLines.length, toLines.length) * 4 + 4;

  /* The amount, made unmissable ------------------------------------------ */
  const boxH = 22;
  doc.setFillColor(FILL);
  doc.setDrawColor(HAIRLINE);
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN, y, PAGE_W - MARGIN * 2, boxH, 2, 2, "FD");

  doc.setFontSize(7.5);
  doc.setTextColor(MUTED);
  doc.text("AMOUNT RECEIVED", MARGIN + 5, y + 7);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(GREEN);
  doc.text(fmt(r.amount, business.currency), MARGIN + 5, y + 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  doc.text(`Method: ${methodLabel(r.method)}`, right - 5, y + 7, { align: "right" });
  if (r.reference) {
    doc.text(`Against: ${r.reference}`, right - 5, y + 13, { align: "right" });
  }
  if (r.note) {
    doc.text(r.note.slice(0, 40), right - 5, y + 18, { align: "right" });
  }
  y += boxH + 10;

  /* Where the account stands now ----------------------------------------- */
  const settled = r.balanceNow <= 0.001;
  const labelX = right - 70;
  doc.setDrawColor(ACCENT);
  doc.setLineWidth(0.5);
  doc.line(labelX, y, right, y);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(settled ? GREEN : RED);
  doc.text(settled ? "ACCOUNT SETTLED" : "BALANCE ON ACCOUNT", labelX, y);
  doc.text(fmt(Math.max(0, r.balanceNow), business.currency), right, y, {
    align: "right",
  });

  /* Footer --------------------------------------------------------------- */
  const footY = PAGE_H - MARGIN - 6;
  doc.setDrawColor(HAIRLINE);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, footY - 5, right, footY - 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(MUTED);
  doc.text(
    settled
      ? "Thank you — your account is fully settled."
      : "Thank you. The balance above remains outstanding on your account.",
    MARGIN,
    footY,
  );
  doc.text(`Generated ${formatDate(r.generatedAt)}`, right, footY, { align: "right" });

  return doc;
}

export function receiptPdfBuffer(r: ReceiptDoc, business: BusinessDoc): Buffer {
  return Buffer.from(buildReceiptDoc(r, business).output("arraybuffer"));
}
