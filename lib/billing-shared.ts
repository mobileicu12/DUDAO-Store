/**
 * Invoice types and arithmetic. CLIENT-SAFE.
 *
 * The till needs to total a cart before anything is saved, and the invoice
 * screens need to total a saved bill. Both must agree to the penny, so the
 * calculation lives here and is imported by the client and by the server-only
 * lib/billing.ts alike.
 *
 * Nothing in this file may import Prisma or anything server-only.
 */

export type InvoiceStatus = "DRAFT" | "UNPAID" | "PAID" | "VOID";
export type PaymentMethod = "cash" | "card" | "bank" | "account";

export const PAYMENT_METHODS: { key: PaymentMethod; label: string }[] = [
  { key: "cash", label: "Cash" },
  { key: "card", label: "Card" },
  { key: "bank", label: "Bank transfer" },
  { key: "account", label: "On account" },
];

export const methodLabel = (key: string): string =>
  PAYMENT_METHODS.find((m) => m.key === key)?.label ?? key;

export type BillLineInput = {
  /** Null for a custom line typed at the counter. */
  productId?: string | null;
  title: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
};

export type InvoiceTotals = {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  balance: number;
};

const round2 = (n: number): number =>
  Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

/**
 * Invoice arithmetic, in one place so the PDF, the list, the detail screen and
 * the till can never disagree about what a bill comes to.
 *
 * Tax is applied AFTER the discount. Discounting a total and then adding tax
 * on the original would overcharge the customer.
 */
export function computeTotals(args: {
  lines: { quantity: number; unitPrice: number }[];
  discount: number;
  taxable: boolean;
  taxRate: number;
  paid: number;
}): InvoiceTotals {
  const subtotal = round2(
    args.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0),
  );
  const discount = round2(Math.min(Math.max(args.discount, 0), subtotal));
  const net = round2(subtotal - discount);
  const tax = args.taxable ? round2(net * (args.taxRate / 100)) : 0;
  const total = round2(net + tax);
  const paid = round2(args.paid);

  return { subtotal, discount, tax, total, paid, balance: round2(total - paid) };
}

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: "Draft",
  UNPAID: "Unpaid",
  PAID: "Paid",
  VOID: "Void",
};

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

/**
 * How an invoice's payment state should read, deriving "Part-paid" when some
 * money has been taken but a balance remains. Single source of truth so the
 * list, the detail page and the customer ledger never disagree.
 */
export function statusView(
  status: InvoiceStatus,
  paid: number,
  balance: number,
): { label: string; tone: StatusTone } {
  if (status === "VOID") return { label: "Void", tone: "neutral" };
  if (status === "PAID") return { label: "Paid", tone: "success" };
  if (status === "DRAFT") return { label: "Draft", tone: "neutral" };
  if (paid > 0.001 && balance > 0.001) return { label: "Part-paid", tone: "info" };
  return { label: "Unpaid", tone: "warning" };
}
