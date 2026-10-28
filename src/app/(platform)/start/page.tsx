import type { Metadata } from "next";
import { StartWizard } from "@/components/onboarding/StartWizard";

export const metadata: Metadata = {
  title: "Set up your hostel · HostelHub",
  description: "Get your hostel online in an afternoon. Free for hostels.",
};

/** Owner sign-up. Every "Get started" on the marketing site comes here. */
export default function StartPage() {
  return <StartWizard />;
}
