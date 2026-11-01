import type { Metadata } from "next";
import { PlatformSignIn } from "@/components/platform/PlatformSignIn";

export const metadata: Metadata = {
  title: "Find your hostel · HostelHub",
};

/** "Find your hostel" on the platform address: every live hostel, and signing in (shown at /login there; see proxy.ts). */
export default function SignInPage() {
  return <PlatformSignIn />;
}
