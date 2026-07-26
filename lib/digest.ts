import "server-only";
import { getSettings, saveSettings } from "./settings";
import { customersBilledToday } from "./customers";
import { dayRange } from "./billing";
import { businessForDocs } from "./doc-business";
import { sendEmail, emailConfigured, emailShell } from "./email";
import { sendWhatsApp, waConfigured } from "./whatsapp";
import { buildCustomerDayItemisedDoc, reportBuffer } from "./report-pdf";
import { statementSharePath, absoluteUrl } from "./invoice-link";
import { db } from "./db";

/**
 * End-of-day digest.
 *
 * Two guarantees drive the design:
 *  - Idempotent. The cron can fire twice; a digestLastRun date stamp means the
 *    second run does nothing. Money messages must never double-send.
 *  - Strictly grouped by account. One customer's bills never appear in
 *    another's message. Walk-in sales feed only the owner's summary.
 *
 * One failed recipient never aborts the rest — every send is caught and
 * recorded, and the run reports a per-recipient error list.
 */

export type DigestResult = {
  ran: boolean;
  reason?: string;
  customers: number;
  ownerSent: boolean;
  errors: { recipient: string; error: string }[];
};

function money(n: number, currency: string): string {
  const s = currency === "GBP" ? "£" : currency === "USD" ? "$" : currency === "EUR" ? "€" : "";
  return `${s}${n.toFixed(2)}${s ? "" : " " + currency}`;
}

export async function runDailyDigest(
  opts: { force?: boolean } = {},
): Promise<DigestResult> {
  const settings = await getSettings(true);
  const today = new Date().toISOString().slice(0, 10);

  if (!settings.digestEnabled && !opts.force) {
    return { ran: false, reason: "Digest is switched off.", customers: 0, ownerSent: false, errors: [] };
  }

  // Idempotency: skip if already run today, unless forced from the "send now"
  // button.
  if (settings.digestLastRun === today && !opts.force) {
    return { ran: false, reason: "Already sent today.", customers: 0, ownerSent: false, errors: [] };
  }

  const business = await businessForDocs();
  const range = dayRange();
  const groups = await customersBilledToday(range);

  const errors: { recipient: string; error: string }[] = [];
  let customerCount = 0;

  const emailOk = emailConfigured();
  const waOk = await waConfigured();

  for (const group of groups) {
    // Walk-ins (no account) are for the owner report only.
    if (!group.customer) continue;

    const c = group.customer;
    customerCount++;

    // Look up the account's outstanding for the message.
    const outstanding = await accountOutstanding(c.id);

    const link = absoluteUrl(statementSharePath(c.id, today));
    const summaryLine = `${group.invoices.length} invoice${group.invoices.length === 1 ? "" : "s"} today totalling ${money(group.dayTotal, business.currency)}, of which ${money(group.dayPaid, business.currency)} paid. Account balance ${money(outstanding, business.currency)}.`;

    if (settings.digestToCustomers) {
      if (emailOk && c.email) {
        const res = await sendEmail({
          to: c.email,
          subject: `${business.name} — your account summary for today`,
          html: emailShell(
            business.name,
            `<p>Hi ${c.name},</p><p>${summaryLine}</p><p><a href="${link}">View your statement</a></p>`,
          ),
        });
        if (!res.ok) errors.push({ recipient: c.email, error: res.error ?? "email failed" });
      }
      if (waOk && c.phone) {
        const res = await sendWhatsApp(
          c.phone,
          `${business.name}: ${summaryLine} Statement: ${link}`,
          [c.name, money(group.dayTotal, business.currency), link],
        );
        if (!res.ok) errors.push({ recipient: c.phone, error: res.error ?? "WhatsApp failed" });
      }
    }
  }

  // Owner summary — all customers plus walk-ins.
  let ownerSent = false;
  if (settings.digestToOwner && settings.digestOwnerEmail && emailOk) {
    const rows = groups
      .map((g) => {
        const who = g.customer?.name ?? "Walk-in";
        return `<tr><td style="padding:4px 8px">${who}</td><td style="padding:4px 8px;text-align:right">${money(g.dayTotal, business.currency)}</td><td style="padding:4px 8px;text-align:right;color:#1a7f4b">${money(g.dayPaid, business.currency)}</td></tr>`;
      })
      .join("");
    const grandTotal = groups.reduce((s, g) => s + g.dayTotal, 0);
    const grandPaid = groups.reduce((s, g) => s + g.dayPaid, 0);

    const res = await sendEmail({
      to: settings.digestOwnerEmail,
      subject: `${business.name} — day summary ${today}`,
      html: emailShell(
        business.name,
        `<p>Day summary for ${today}:</p>
         <table style="width:100%;border-collapse:collapse;font-size:13px">
           <tr style="color:#6b655c"><th style="text-align:left;padding:4px 8px">Customer</th><th style="text-align:right;padding:4px 8px">Billed</th><th style="text-align:right;padding:4px 8px">Paid</th></tr>
           ${rows}
           <tr style="font-weight:700;border-top:1px solid #e5e5ea"><td style="padding:6px 8px">Total</td><td style="padding:6px 8px;text-align:right">${money(grandTotal, business.currency)}</td><td style="padding:6px 8px;text-align:right;color:#1a7f4b">${money(grandPaid, business.currency)}</td></tr>
         </table>`,
      ),
    });
    if (res.ok) ownerSent = true;
    else errors.push({ recipient: settings.digestOwnerEmail, error: res.error ?? "email failed" });
  }

  // Stamp the run so a second firing today is a no-op.
  await saveSettings({ digestLastRun: today });

  return { ran: true, customers: customerCount, ownerSent, errors };
}

async function accountOutstanding(customerId: string): Promise<number> {
  const { getCustomer } = await import("./customers");
  const c = await getCustomer(customerId);
  return c?.outstanding ?? 0;
}

/**
 * Auto-close any shift left open, used by the same nightly job. Kept here so
 * the cron route has a single import for its end-of-day work.
 */
export async function autoTapOutAll(): Promise<number> {
  const open = await db.attendance.findMany({ where: { tapOut: null } });
  if (open.length === 0) return 0;
  await db.attendance.updateMany({
    where: { tapOut: null },
    data: { tapOut: new Date(), autoOut: true },
  });
  return open.length;
}

/** Itemised day PDF for one customer — used by the manual send drawer. */
export async function customerDayPdf(
  customerId: string,
  date = new Date().toISOString().slice(0, 10),
): Promise<{ filename: string; buffer: Buffer } | null> {
  const range = dayRange(new Date(date));
  const groups = await customersBilledToday(range);
  const group = groups.find((g) => g.customer?.id === customerId);
  if (!group || !group.customer) return null;

  const business = await businessForDocs();
  const outstanding = await accountOutstanding(customerId);

  const doc = buildCustomerDayItemisedDoc(
    { name: group.customer.name, company: group.customer.company },
    group.invoices.map((i) => ({
      number: i.number,
      total: i.total,
      paid: i.paid,
      lines: i.lines,
    })),
    { date, business, outstanding },
  );

  return {
    filename: `day-${group.customer.name.replace(/[^a-z0-9]+/gi, "-")}-${date}.pdf`,
    buffer: reportBuffer(doc),
  };
}
