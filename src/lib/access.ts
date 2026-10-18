/*
 * What a login may do, as stored in its Firebase Auth custom claims. The database rules read
 * the same fields, so the rules and the server agree on every check.
 *
 *   p: "admin"                    platform admin (HostelHub staff)
 *   o: { orgId: "owner" }         owner of an organisation (set by the platform admin)
 *   h: { hostelId: "manager" }    staff role per hostel ("manager" only at launch)
 *   t: { hostelId: true }         tenant of that hostel
 *   role: "admin"                 legacy single-hostel staff flag, still used by the live app
 *
 * Claims must stay under 1,000 bytes; one person's memberships fit easily.
 */

export type HostelRole = "manager";

export interface AccessClaims {
  p?: "admin";
  o?: Record<string, "owner">;
  h?: Record<string, HostelRole>;
  t?: Record<string, true>;
  role?: "admin";
}

/** Only the keys above are ours; Firebase adds others (iss, aud, email…) to a decoded token. */
export function accessFrom(token: Record<string, unknown> | null | undefined): AccessClaims {
  const t = token ?? {};
  const map = <V>(v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, V>) : undefined);
  return {
    ...(t.p === "admin" ? { p: "admin" as const } : {}),
    ...(map<"owner">(t.o) ? { o: map<"owner">(t.o) } : {}),
    ...(map<HostelRole>(t.h) ? { h: map<HostelRole>(t.h) } : {}),
    ...(map<true>(t.t) ? { t: map<true>(t.t) } : {}),
    ...(t.role === "admin" ? { role: "admin" as const } : {}),
  };
}

export const isPlatformAdmin = (a: AccessClaims) => a.p === "admin";
export const roleIn = (a: AccessClaims, hostelId: string): HostelRole | null => a.h?.[hostelId] ?? null;
export const isManagerOf = (a: AccessClaims, hostelId: string) => roleIn(a, hostelId) === "manager";
export const isTenantOf = (a: AccessClaims, hostelId: string) => a.t?.[hostelId] === true;
