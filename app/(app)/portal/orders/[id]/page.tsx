import { redirect } from "next/navigation";

/**
 * An order is a completed invoice, so its detail lives on the invoice screen.
 * This route exists for parity and for anyone who lands on an order URL.
 */
export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/portal/invoices/${id}`);
}
