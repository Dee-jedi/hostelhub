import type { Metadata } from "next";
import { Suspense } from "react";
import { GoogleHandoff } from "@/components/GoogleHandoff";

export const metadata: Metadata = {
  title: "Signing in · HostelHub",
  robots: { index: false },
};

/** Google sign-in for hostel pages (see GoogleHandoff). */
export default function GoogleSignInPage() {
  // Where to return comes from the URL, so the page streams in after its shell
  return (
    <Suspense fallback={null}>
      <GoogleHandoff />
    </Suspense>
  );
}
