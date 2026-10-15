"use client";

import { FirebaseError } from "firebase/app";
import { onIdTokenChanged, signOut as fbSignOut, type User } from "firebase/auth";
import { useSyncExternalStore } from "react";
import { clearIndexedDbPersistence, terminate } from "firebase/firestore";
import { auth, db } from "./firebase";
import { stopHostelSync } from "./store";
import { stopTenantSync } from "./tenant-store";

export interface Session {
  /** undefined while Firebase restores the session on page load */
  user: User | null | undefined;
  role: "admin" | "tenant" | null;
}

let session: Session = { user: undefined, role: null };
const listeners = new Set<() => void>();
let started = false;

function start() {
  if (started) return;
  started = true;
  onIdTokenChanged(auth, async (user) => {
    const role = user ? ((await user.getIdTokenResult()).claims.role === "admin" ? "admin" : "tenant") : null;
    session = { user, role };
    listeners.forEach((l) => l());
  });
}

const serverSession: Session = { user: undefined, role: null };

export function useSession(): Session {
  return useSyncExternalStore(
    (l) => {
      start();
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => session,
    () => serverSession,
  );
}

/**
 * Signs out and wipes the browser's cached copy of the data, so nothing is left behind on a
 * shared computer. The page reloads because Firestore can't be reused after clearing its cache.
 */
export async function signOut() {
  stopHostelSync();
  stopTenantSync();
  await fbSignOut(auth);
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch (err) {
    console.error(err);
  }
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full reload is required after terminate()
  window.location.assign("/login");
}

export function homeFor(role: Session["role"]) {
  return role === "admin" ? "/" : "/portal";
}

/** Friendly text for Firebase Auth errors. */
export function authMessage(err: unknown) {
  const code = err instanceof FirebaseError ? err.code : "";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") return "Wrong email or password.";
  if (code === "auth/too-many-requests") return "Too many attempts. Wait a minute and try again.";
  if (code === "auth/invalid-email") return "Enter a valid email address.";
  if (code === "auth/network-request-failed") return "No internet connection.";
  if (code === "auth/email-already-in-use") return "This email already has an account. Use its password, or reset it from the login page.";
  if (code === "auth/weak-password") return "Use a password of at least 6 characters.";
  return "Something went wrong. Please try again.";
}
