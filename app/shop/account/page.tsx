import Link from "next/link";
import { redirect } from "next/navigation";
import { money } from "@/lib/business";
import { currentTradeCustomer, tradeAccount } from "@/lib/storefront";
import { cx } from "@/lib/cx";
import AccountForm from "./AccountForm";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  PAID: "bg-success-subtle text-success",
  UNPAID: "bg-warning-subtle text-warning",
  DRAFT: "bg-subtle text-muted",
  VOID: "bg-danger-subtle text-danger",
};

export default async function AccountPage() {
  const customer = await currentTradeCustomer();
  if (!customer) redirect("/shop/trade-login");

  const account = await tradeAccount(customer.id);
  if (!account) redirect("/shop/trade-login");

  const { profile, orders } = account;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Your account</h1>
          <p className="mt-1 text-sm text-muted">{profile.company || profile.name}</p>
        </div>
        <div className="rounded-lg border border-line bg-surface px-4 py-2.5 text-right">
          <p className="text-[0.7rem] font-semibold tracking-wider text-muted uppercase">
            Account balance
          </p>
          <p
            className={cx(
              "tnum text-xl font-semibold",
              customer.outstanding > 0 ? "text-warning" : "text-success",
            )}
          >
            {money(customer.outstanding)}
          </p>
        </div>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-ink">Order history</h2>
        {orders.length === 0 ? (
          <div className="rounded-lg border border-line bg-surface px-6 py-12 text-center">
            <p className="text-sm font-semibold text-ink">No orders yet</p>
            <p className="mt-1 text-sm text-muted">Your orders will appear here.</p>
            <Link
              href="/shop"
              className="mt-4 inline-flex h-9 items-center rounded-md bg-accent px-4 text-sm font-semibold text-accentfg hover:bg-accent-hover"
            >
              Start shopping
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-4 py-2.5 font-medium">Order</th>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Items</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total</th>
                  <th className="px-4 py-2.5 text-right font-medium">Balance</th>
                  <th className="px-4 py-2.5 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-2.5 font-medium text-ink">{o.number}</td>
                    <td className="px-4 py-2.5 text-muted">
                      {new Date(o.issuedAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-2.5 text-muted">{o.itemCount}</td>
                    <td className="tnum px-4 py-2.5 text-right font-medium text-ink">
                      {money(o.total)}
                    </td>
                    <td className="tnum px-4 py-2.5 text-right text-ink-2">
                      {money(o.balance)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span
                        className={cx(
                          "inline-block rounded px-2 py-0.5 text-xs font-medium",
                          STATUS_TONE[o.status] ?? "bg-subtle text-muted",
                        )}
                      >
                        {o.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">Your details</h2>
        <div className="rounded-lg border border-line bg-surface p-5">
          <AccountForm
            initial={{
              name: profile.name,
              company: profile.company,
              email: profile.email,
              phone: profile.phone,
            }}
          />
        </div>
      </section>
    </div>
  );
}
