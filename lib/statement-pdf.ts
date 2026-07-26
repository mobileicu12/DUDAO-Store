import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { BusinessDoc } from "./invoice-pdf";

/**
 * Customer statement — every invoice, every payment, and a running balance.
 *
 * UNIVERSAL, like the invoice generator: no window or document, so a public
 * share link can render it server-side.
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

export type StatementEntry = {
  date: string;
  /** "invoice" adds to what they owe, "payment" reduces it. */
  kind: "invoice" | "payment" | "opening";
  reference: string;
  detail: string;
  amount: number;
};

export type StatementDoc = {
  customer: {
    name: string;
    company?: string;
    address?: string;
    phone?: string;
    email?: string;
  };
  entries: StatementEntry[];
  openingBalance: number;
  totalBilled: number;
  totalPaid: number;
  outstanding: number;
  generatedAt: string;
};

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
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${String(d.getDate()).padStart(2, "0")} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function buildStatementDoc(
  statement: StatementDoc,
  business: BusinessDoc,
): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const right = PAGE_W - MARGIN;
  let y = MARGIN;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(INK);
  doc.text(business.name, MARGIN, y + 2);

  doc.setFontSize(19);
  doc.setTextColor(ACCENT);
  doc.text("STATEMENT", right, y + 2, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(MUTED);
  doc.text(
    `As at ${formatDate(statement.generatedAt)}`,
    right,
    y + 8,
    { align: "right" },
  );

  y += 14;
  doc.setDrawColor(HAIRLINE);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, right, y);
  y += 6;

  doc.setFontSize(7.5);
  doc.setTextColor(MUTED);
  doc.text("ACCOUNT", MARGIN, y);
  y += 4.5;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(INK);
  doc.text(statement.customer.name, MARGIN, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  const details = [
    statement.customer.company,
    statement.customer.address,
    statement.customer.phone,
    statement.customer.email,
  ].filter(Boolean) as string[];
  details.forEach((line, i) => doc.text(line, MARGIN, y + 4.5 + i * 4));

  y += 6 + details.length * 4;

  /* Running balance ------------------------------------------------------ */

  let running = 0;
  const body = statement.entries.map((e) => {
    running += e.kind === "payment" ? -e.amount : e.amount;
    return [
      formatDate(e.date),
      e.reference,
      e.detail,
      e.kind === "payment" ? "" : fmt(e.amount, business.currency),
      e.kind === "payment" ? fmt(e.amount, business.currency) : "",
      fmt(running, business.currency),
    ];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [["Date", "Reference", "Detail", "Charged", "Paid", "Balance"]],
    body,
    theme: "plain",
    styles: {
      fontSize: 8,
      cellPadding: { top: 2.2, bottom: 2.2, left: 2, right: 2 },
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
      0: { cellWidth: 22 },
      1: { cellWidth: 30 },
      2: { cellWidth: "auto" },
      3: { cellWidth: 24, halign: "right" },
      4: { cellWidth: 24, halign: "right", textColor: GREEN },
      5: { cellWidth: 26, halign: "right", fontStyle: "bold" },
    },
    showHead: "everyPage",
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
    .finalY + 8;

  /* Summary -------------------------------------------------------------- */

  const boxX = right - 68;
  const row = (label: string, value: string, bold = false, colour = INK) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 10.5 : 9);
    doc.setTextColor(bold ? INK : MUTED);
    doc.text(label, boxX, y);
    doc.setTextColor(colour);
    doc.text(value, right, y, { align: "right" });
    y += bold ? 6.5 : 5;
  };

  if (statement.openingBalance !== 0) {
    row("Opening balance", fmt(statement.openingBalance, business.currency));
  }
  row("Total charged", fmt(statement.totalBilled, business.currency));
  row("Total paid", fmt(statement.totalPaid, business.currency), false, GREEN);

  doc.setDrawColor(HAIRLINE);
  doc.line(boxX, y - 3, right, y - 3);
  y += 1;

  const owed = statement.outstanding > 0;
  row(
    owed ? "Amount due" : "Balance",
    fmt(Math.abs(statement.outstanding), business.currency) +
      (statement.outstanding < 0 ? " credit" : ""),
    true,
    owed ? RED : GREEN,
  );

  if (owed && business.bankDetails) {
    y += 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(MUTED);
    doc.text("HOW TO PAY", MARGIN, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(INK);
    doc.text(
      doc.splitTextToSize(business.bankDetails, right - MARGIN),
      MARGIN,
      y + 4,
    );
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(HAIRLINE);
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

export function statementPdfBuffer(
  statement: StatementDoc,
  business: BusinessDoc,
): Buffer {
  return Buffer.from(
    buildStatementDoc(statement, business).output("arraybuffer"),
  );
}
