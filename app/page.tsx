import { redirect } from "next/navigation";

/**
 * There is no public storefront in this build — the portal is the whole site.
 * Auth is enforced in proxy.ts, so an unauthenticated visitor lands on /login
 * from here rather than seeing anything.
 */
export default function Home() {
  redirect("/portal");
}
