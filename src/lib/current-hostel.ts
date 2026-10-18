"use client";

import { DEFAULT_HOSTEL } from "./env";
import { resolveHost } from "./hostel-host";

/** The hostel this page belongs to, from the address bar (see hostel-host.ts). */
export function currentHostelId(): string | null {
  if (typeof window === "undefined") return DEFAULT_HOSTEL || null;
  const host = resolveHost(window.location.host);
  return host.kind === "hostel" ? host.slug : null;
}

/** Firestore paths for the current hostel. Throws on addresses that aren't a hostel. */
export function hostelPath(sub = "") {
  const h = currentHostelId();
  if (!h) throw new Error("This address isn't a hostel");
  return sub ? `hostels/${h}/${sub}` : `hostels/${h}`;
}

export function listingPath() {
  const h = currentHostelId();
  if (!h) throw new Error("This address isn't a hostel");
  return `listings/${h}`;
}
