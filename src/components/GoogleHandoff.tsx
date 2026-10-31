"use client";

import { getRedirectResult, signInWithRedirect, type User } from "firebase/auth";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/site/brand";
import { auth } from "@/lib/firebase";
import { googleProvider } from "@/lib/google-auth";

/*
 * The platform's /auth/google: a hostel page sends people here to sign in with Google, then they
 * go straight back with a one-time code (api/auth/handoff).
 */

const STARTED = "hostelhub:google-started";
let started = false;

async function handBack(user: User, returnTo: string) {
  const res = await fetch("/api/auth/handoff", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
    body: JSON.stringify({ action: "start", returnTo }),
  });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error ?? "Couldn't sign you in. Please try again.");
  window.location.replace(data.url);
}

export function GoogleHandoff() {
  const returnTo = useSearchParams().get("return") ?? "";
  const [failed, setProblem] = useState<string | null>(null);
  const problem = returnTo ? failed : "Nothing to sign in to. Go back and try again.";

  useEffect(() => {
    // Once per page load: development runs effects twice, and a second run would read the
    // first one's "started" note as a cancelled sign-in
    if (!returnTo || started) return;
    started = true;
    (async () => {
      try {
        // Back from Google?
        const back = await getRedirectResult(auth);
        if (back?.user) return await handBack(back.user, returnTo);
        // No silent reuse of whoever is signed in here: Google's account chooser always shows
        // (one tap), so "Not you?" on the hostel page really lets them pick someone else
        // Came back from Google without an account: they closed it or pressed back
        if (sessionStorage.getItem(STARTED) === returnTo) {
          sessionStorage.removeItem(STARTED);
          return setProblem("Google sign-in was cancelled.");
        }
        sessionStorage.setItem(STARTED, returnTo);
        await signInWithRedirect(auth, googleProvider());
      } catch (err) {
        sessionStorage.removeItem(STARTED);
        setProblem(err instanceof Error ? err.message : "Couldn't sign in with Google.");
      }
    })();
  }, [returnTo]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-[#f6f8f7] px-6 text-center">
      <Wordmark />
      {problem ? (
        <div className="max-w-sm">
          <p className="text-lg font-semibold text-grey-950">{problem}</p>
          {returnTo && (
            <a href={returnTo} className="mt-4 inline-block font-semibold text-brand-700 underline-offset-4 hover:underline">
              Go back
            </a>
          )}
        </div>
      ) : (
        <p className="flex items-center gap-2 text-heading-5">
          <Loader2 className="size-4 animate-spin" /> Signing you in with Google…
        </p>
      )}
    </div>
  );
}
