import type { AccessClaims, HostelRole } from "../access";
import { accessFrom } from "../access";
import { isValidSlug } from "../hostel-host";
import { adminAuth } from "./admin";

/*
 * Changing what a login may do. Every change reads the current claims and writes them back
 * whole, keeping anything we don't own. The user's app picks the change up the next time its
 * token refreshes; call `user.getIdToken(true)` in the browser to apply it at once.
 */

const MAX_CLAIMS_BYTES = 1000;

async function update(uid: string, change: (a: AccessClaims) => AccessClaims) {
  const user = await adminAuth.getUser(uid);
  const current = user.customClaims ?? {};
  const next = change(accessFrom(current));
  // Keep claims set by other features; drop empty maps so the token stays small
  const merged: Record<string, unknown> = { ...current, ...next };
  for (const key of ["o", "h", "t"] as const) if (!next[key] || !Object.keys(next[key]!).length) delete merged[key];
  if (!next.p) delete merged.p;
  if (JSON.stringify(merged).length > MAX_CLAIMS_BYTES) throw new Error("This login belongs to too many hostels.");
  await adminAuth.setCustomUserClaims(uid, merged);
  return accessFrom(merged);
}

function assertHostel(hostelId: string) {
  if (!isValidSlug(hostelId)) throw new Error(`"${hostelId}" isn't a valid hostel id.`);
}

/** Gives (or with null, removes) a staff role in one hostel. */
export function setHostelRole(uid: string, hostelId: string, role: HostelRole | null) {
  assertHostel(hostelId);
  return update(uid, (a) => {
    const h = { ...a.h };
    if (role) h[hostelId] = role;
    else delete h[hostelId];
    return { ...a, h };
  });
}

/** Marks (or unmarks) the login as a tenant of one hostel. */
export function setTenantOf(uid: string, hostelId: string, tenant: boolean) {
  assertHostel(hostelId);
  return update(uid, (a) => {
    const t = { ...a.t };
    if (tenant) t[hostelId] = true;
    else delete t[hostelId];
    return { ...a, t };
  });
}

export function setPlatformAdmin(uid: string, admin: boolean) {
  return update(uid, (a) => ({ ...a, p: admin ? "admin" : undefined }));
}
