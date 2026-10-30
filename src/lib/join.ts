/*
 * The join link: tenants already living in a hostel when it signs up add themselves (their
 * details, room, and how long they've paid for), and the manager approves each one. It's free,
 * since they paid the hostel directly, so it only works while the hostel is setting up and for
 * a while after it goes live; after that, tenants added by hand cost the hostel a fee.
 */
import type { Hostel } from "./model";

/** How long the join link keeps working after the hostel goes live. */
export const JOIN_DAYS_AFTER_LIVE = 30;

/** The last moment the link works (ISO), or null while it has no end yet (still setting up). */
export function joinOpenUntil(hostel: Pick<Hostel, "status" | "liveAt">): string | null {
  if (hostel.status === "draft") return null;
  if (!hostel.liveAt) return new Date(0).toISOString();
  return new Date(Date.parse(hostel.liveAt) + JOIN_DAYS_AFTER_LIVE * 86_400_000).toISOString();
}

export function joinIsOpen(hostel: Pick<Hostel, "status" | "liveAt">, now = Date.now()) {
  if (hostel.status === "suspended") return false;
  const until = joinOpenUntil(hostel);
  return until === null || Date.parse(until) > now;
}
