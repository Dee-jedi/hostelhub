import { Suspense } from "react";
import { TenantShell } from "@/components/TenantShell";
import { BrandLoader } from "@/components/BrandLoader";

// The shell reads the URL (active tab) and the tenant's data in the browser, so the
// portal prerenders as this loading state and fills in on the client.
function Loading() {
  return <BrandLoader label="Opening your portal…" />;
}

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<Loading />}>
      <TenantShell>{children}</TenantShell>
    </Suspense>
  );
}
