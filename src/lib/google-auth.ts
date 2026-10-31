"use client";

import { GoogleAuthProvider, signInWithCustomToken, signInWithPopup, type User } from "firebase/auth";
import { useSyncExternalStore } from "react";
import { auth } from "./firebase";
import { resolveHost } from "./hostel-host";
import { PLATFORM_HOST } from "./platform";

/*
 * "Continue with Google" everywhere. On the platform address (sign-up, admin) it's a popup. On a
 * hostel's address the person goes to the platform's /auth/google, signs in there, and comes back
 * with a one-time code (api/auth/handoff) that signs them in here: Firebase can only allow Google
 * sign-in on listed addresses, and every hostel has its own.
 */

export const googleProvider = () => {
  const provider = new GoogleAuthProvider();
  // Shared phones are common: let them pick which Google account
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
};

/** The platform's own address, keeping this page's protocol and port (localhost:3000 in development). */
export function platformOrigin() {
  const { protocol, port } = window.location;
  return `${protocol}//${PLATFORM_HOST}${port ? `:${port}` : ""}`;
}

/**
 * Whether Google sign-in can run on this address itself: the platform, or a single fixed
 * address showing one hostel (staging's *.hosted.app). Hostel subdomains go via the platform.
 */
export function onPlatform() {
  const host = resolveHost(window.location.host);
  return host.kind === "platform" || (host.kind === "hostel" && host.via === "default");
}

/**
 * Signs in with Google. Resolves with the user on the platform address; on a hostel's address
 * the page leaves for Google and comes back signed in (see finishGoogleReturn), so it never resolves.
 * `returnTo` is where to come back to (this page by default).
 */
export async function continueWithGoogle(returnTo = window.location.href): Promise<User> {
  if (onPlatform()) return (await signInWithPopup(auth, googleProvider())).user;
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- another origin (the platform address), not a page of this one
  window.location.assign(`${platformOrigin()}/auth/google?return=${encodeURIComponent(returnTo)}`);
  return new Promise<User>(() => {});
}

/**
 * Back from Google sign-in on the platform: swaps the one-time code in the address for a login
 * here, and tidies the address. Returns the user, or null when there's nothing to finish.
 */
export async function finishGoogleReturn(): Promise<User | null> {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("hh_code");
  if (!code) return null;
  url.searchParams.delete("hh_code");
  window.history.replaceState(window.history.state, "", url.toString());
  setReturning(true);
  try {
    const res = await fetch("/api/auth/handoff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "finish", code }) });
    const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
    if (!res.ok || !data.token) throw new Error(data.error ?? "Couldn't finish signing in with Google. Please try again.");
    return (await signInWithCustomToken(auth, data.token)).user;
  } finally {
    setReturning(false);
  }
}

// Whether a Google sign-in is being finished on this page, so forms can show "Signing you in…"
// instead of their login fields for the second or two it takes
let returning = false;
const returningListeners = new Set<() => void>();
function setReturning(value: boolean) {
  returning = value;
  returningListeners.forEach((l) => l());
}

export function useGoogleReturning() {
  return useSyncExternalStore(
    (l) => {
      returningListeners.add(l);
      return () => returningListeners.delete(l);
    },
    () => returning,
    () => false,
  );
}

/** The person's first and last name from their Google profile, for pre-filling forms. */
export const googleName = (user: User | null) => user?.displayName?.trim() ?? "";
