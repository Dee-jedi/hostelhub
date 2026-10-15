import { Suspense } from "react";
import { TenantShell } from "@/components/TenantShell";

// The shell reads the URL (active tab) and the tenant's data in the browser, so the
// portal prerenders as this loading state and fills in on the client.
function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-grey-10 text-sm text-heading-6">
      <span className="flex items-center gap-3">
        <span className="size-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" /> Loading your portal…
      </span>
    </div>
  );
}

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<Loading />}>
      <TenantShell>{children}</TenantShell>
    </Suspense>
  );
}
