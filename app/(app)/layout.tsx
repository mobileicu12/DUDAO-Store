import type { ReactNode } from "react";
import Sidebar from "@/components/shell/Sidebar";
import MobileNav from "@/components/shell/MobileNav";
import AppHeader, { AppFooter } from "@/components/shell/AppHeader";
import { ToastProvider } from "@/components/ui/Toast";
import FaviconManager from "@/components/FaviconManager";
import TodaySendDrawer from "@/components/TodaySendDrawer";

/**
 * Portal chrome.
 *
 * Fixed-height flex rather than page scroll: the sidebar and header stay put
 * while only the content column scrolls, so the till's search box never
 * scrolls out of reach mid-sale.
 */
export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <FaviconManager />
      <div className="flex h-dvh overflow-hidden bg-bg">
        <Sidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader />

          <main className="min-h-0 flex-1 overflow-y-auto">
            {/* Bottom padding clears the floating mobile bar; dropped at md+ */}
            <div className="mx-auto w-full max-w-[1600px] px-4 py-5 pb-28 sm:px-6 md:pb-6">
              {children}
            </div>
            <AppFooter />
          </main>
        </div>

        <MobileNav />
        <TodaySendDrawer />
      </div>
    </ToastProvider>
  );
}
