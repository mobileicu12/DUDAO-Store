// Client-safe audit constants (no server imports) — usable in the browser.
// lib/audit.ts pulls in the database and cookies(), so the log screen imports
// from here instead of dragging server-only code into the client bundle.

export type AuditEntry = {
  id?: string;     // AuditLog row id (present on entries read back from the DB)
  at: string;      // ISO timestamp
  who: string;     // actor email, or "master-password"
  action: string;  // dotted verb, e.g. "invoice.void"
  ref?: string;    // id the action applied to (invoice / customer)
  name?: string;   // human label, e.g. DUD-2026-0042
  detail?: string; // short summary, including amounts
  restorable?: boolean; // true for a deletion whose snapshot can be restored
};

export const AUDIT_LABELS: Record<string, string> = {
  "invoice.create": "Invoice created",
  "invoice.update": "Invoice edited",
  "invoice.complete": "Invoice marked paid",
  "invoice.void": "Invoice voided",
  "invoice.duplicate": "Invoice duplicated",
  "invoice.delete": "Invoice DELETED",
  "invoice.restore": "Invoice restored",
  "invoice.payment.add": "Payment recorded on bill",
  "invoice.payment.revoke": "Payment revoked from bill",
  "customer.payment.add": "Payment received",
  "customer.payment.revoke": "Payment revoked",
  "customer.delete": "Customer deleted",
  "cashup.record": "Cash-up recorded",
};

// Actions that change money and should stand out in the log.
export const AUDIT_CRITICAL = new Set([
  "invoice.delete",
  "invoice.void",
  "customer.payment.revoke",
  "invoice.payment.revoke",
  "customer.delete",
]);
