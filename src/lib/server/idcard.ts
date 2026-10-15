import { createHmac, timingSafeEqual } from "node:crypto";

/*
 * Tenant ID card tokens: the tenant's id plus an HMAC signature, so a QR code can't be forged
 * or edited to point at someone else. Verification always reads the live record, so a moved-out
 * tenant's card stops passing immediately.
 */

function secret() {
  const s = process.env.ID_CARD_SECRET;
  if (!s) throw new Error("ID_CARD_SECRET is not set");
  return s;
}

const sign = (uid: string) => createHmac("sha256", secret()).update(`tenant-id:${uid}`).digest("base64url").slice(0, 22);

export function idToken(uid: string) {
  return `${uid}.${sign(uid)}`;
}

/** The tenant id inside a valid token, or null if it was tampered with. */
export function readIdToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const uid = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(uid));
  return given.length === expected.length && timingSafeEqual(given, expected) ? uid : null;
}
