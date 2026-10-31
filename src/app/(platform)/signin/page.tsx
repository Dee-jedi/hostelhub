import type { Metadata } from "next";
import { PlatformSignIn } from "@/components/platform/PlatformSignIn";

export const metadata: Metadata = {
  title: "Log in · HostelHub",
};

/** "Log in" on the platform address (shown at /login there; see proxy.ts). */
export default function SignInPage() {
  return <PlatformSignIn />;
}
