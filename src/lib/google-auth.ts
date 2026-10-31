"use client";

import { GoogleAuthProvider, signInWithCustomToken, signInWithPopup, type User } from "firebase/auth";
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

export const onPlatform = () => resolveHost(window.location.host).kind === "platform";

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
  const res = await fetch("/api/auth/handoff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "finish", code }) });
  const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
  if (!res.ok || !data.token) throw new Error(data.error ?? "Couldn't finish signing in with Google. Please try again.");
  return (await signInWithCustomToken(auth, data.token)).user;
}

/** The person's first and last name from their Google profile, for pre-filling forms. */
export const googleName = (user: User | null) => user?.displayName?.trim() ?? "";
