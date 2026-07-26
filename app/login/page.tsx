import { Suspense } from "react";
import type { Metadata } from "next";
import LoginClient from "./LoginClient";
import { masterEnabled } from "@/lib/master-token";
import { Spinner } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default function LoginPage() {
  const googleEnabled = Boolean(
    process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
  );

  return (
    <Suspense
      fallback={
        <div className="flex h-dvh items-center justify-center">
          <Spinner className="h-6 w-6 text-muted" />
        </div>
      }
    >
      <LoginClient
        googleEnabled={googleEnabled}
        masterEnabled={masterEnabled()}
      />
    </Suspense>
  );
}
