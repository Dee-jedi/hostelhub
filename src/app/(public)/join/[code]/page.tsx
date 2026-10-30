import type { Metadata } from "next";
import { Suspense } from "react";
import { JoinForm } from "@/components/JoinForm";

export const metadata: Metadata = {
  title: "Join your hostel · HostelHub",
  robots: { index: false },
};

/** The join link: tenants already living in a hostel add themselves (see JoinForm). */
export default function JoinPage() {
  // The code comes from the URL, so the form streams in after the page shell
  return (
    <Suspense fallback={null}>
      <JoinForm />
    </Suspense>
  );
}
