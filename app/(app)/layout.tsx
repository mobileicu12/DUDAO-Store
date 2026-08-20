import type { ReactNode } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import Sidebar from "@/components/shell/Sidebar";
import MobileNav from "@/components/shell/MobileNav";
import AppHeader, { AppFooter } from "@/components/shell/AppHeader";
import { ToastProvider } from "@/components/ui/Toast";
import FaviconManager from "@/components/FaviconManager";
import TodaySendDrawer from "@/components/TodaySendDrawer";
import { getSettings } from "@/lib/settings";
import { TAPIN_COOKIE } from "@/lib/attendance";

/**
 * Staff tap-in gate. When the owner has switched on "Require staff to tap in",
 * a signed-in user must clock in once per shift before the portal opens. The
 * tap-in cookie holds today's date; anything else (missing, or yesterday's)
 * sends them to the tap-in screen. Everyone is auto-tapped-out overnight, so
 * the cookie naturally goes stale and the gate re-arms each morning.
 */
async function tapInGate(): Promise<void> {
  let requireTapIn = false;
  try {
    requireTapIn = (await getSettings()).requireTapIn;
  } catch {
    return; // Never let a settings hiccup lock staff out of the portal.
  }
  if (!requireTapIn) return;

  const path = (await headers()).get("x-pathname") ?? "";
  if (path === "/portal/tap-in") return;

  const jar = await cookies();
  const today = new Date().toISOString().slice(0, 10);
  if (jar.get(TAPIN_COOKIE)?.value === today) return;

  const from = path.startsWith("/portal") ? path : "/portal";
  redirect(`/portal/tap-in?from=${encodeURIComponent(from)}`);
}

/**
 * Portal chrome.
 *
 * Fixed-height flex rather than page scroll: the sidebar and header stay put
 * while only the content column scrolls, so the till's search box never
 * scrolls out of reach mid-sale.
 */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  await tapInGate();
  return (
    <ToastProvider>
      <FaviconManager />
      {/* Fixed to the viewport (not just h-dvh in flow) so the shell can never
          be pushed taller than the screen and scroll as one block — only the
          content column below scrolls. */}
      <div className="fixed inset-0 flex overflow-hidden bg-bg">
        <Sidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader />

          <main className="min-h-0 flex-1 overflow-y-auto">
            {/* Bottom padding clears the floating mobile bar; dropped at md+ */}
            <div className="mx-auto w-full max-w-[1600px] px-4 py-5 pb-28 sm:px-6 md:pb-6">
              {children}
            </div>
          </main>
          {/* Pinned to the bottom of the column, below the scrolling content. */}
          <AppFooter />
        </div>

        <MobileNav />
        <TodaySendDrawer />
      </div>
    </ToastProvider>
  );
}
