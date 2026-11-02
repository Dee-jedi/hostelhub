"use client";

import { signInWithCustomToken } from "firebase/auth";
import { useEffect, useState } from "react";
import { BrandLoader } from "@/components/BrandLoader";
import { accessFrom, isManagerOf, isPlatformAdmin } from "@/lib/access";
import { DEMO_HOSTEL } from "@/lib/demo";
import { auth } from "@/lib/firebase";
import { resolveHost } from "@/lib/hostel-host";
import { PLATFORM_HOST } from "@/lib/platform";

let entering: Promise<void> | null = null;

/** Signs in as the shared read-only demo login (demo.ts) and opens the dashboard. */
async function enterDemo() {
  const here = resolveHost(window.location.host);
  if (here.kind !== "hostel" || here.slug !== DEMO_HOSTEL) {
    // Opened on another address: the demo lives on the demo hostel's own
    const { protocol, port } = window.location;
    return window.location.replace(`${protocol}//${DEMO_HOSTEL}.${PLATFORM_HOST}${port ? `:${port}` : ""}/demo`);
  }
  await auth.authStateReady();
  const user = auth.currentUser;
  // The demo's real manager (or HostelHub staff) keeps their own login
  const access = user ? accessFrom((await user.getIdTokenResult()).claims) : null;
  if (!access || !(isManagerOf(access, DEMO_HOSTEL) || isPlatformAdmin(access))) {
    const res = await fetch("/api/demo", { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
    if (!res.ok || !data.token) throw new Error(data.error ?? "Couldn't open the demo. Please try again.");
    await signInWithCustomToken(auth, data.token);
  }
  window.location.replace("/");
}

/** "View demo" on the marketing site: Sunrise Hostel's dashboard, read-only, no login. */
export default function DemoPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Once, even when React runs effects twice in development
    entering ??= enterDemo();
    entering.catch((err: unknown) => {
      entering = null;
      setError(err instanceof Error ? err.message : "Couldn't open the demo. Please try again.");
    });
  }, []);

  if (!error) return <BrandLoader label="Opening the demo hostel…" />;
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#f6f8f7] px-6 text-center">
      <p className="text-[15px] text-heading-5">{error}</p>
      <button type="button" onClick={() => window.location.reload()} className="text-[15px] font-semibold text-brand-800 underline-offset-4 hover:underline">
        Try again
      </button>
    </div>
  );
}
