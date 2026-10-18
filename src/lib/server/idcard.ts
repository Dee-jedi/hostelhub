import { createHmac, timingSafeEqual } from "node:crypto";

/*
 * Tenant ID card tokens: `${hostelId}~${uid}` plus an HMAC signature, so a QR code can't be
 * forged or edited to point at someone else or another hostel. Verification always reads the
 * live record, so a moved-out tenant's card stops passing immediately.
 * Cards issued before multi-hostel carry only the uid; they verify against the page's hostel.
 */

function secret() {
  const s = process.env.ID_CARD_SECRET;
  if (!s) throw new Error("ID_CARD_SECRET is not set");
  return s;
}

const sign = (subject: string) => createHmac("sha256", secret()).update(`tenant-id:${subject}`).digest("base64url").slice(0, 22);

export function idToken(hostelId: string, uid: string) {
  const subject = `${hostelId}~${uid}`;
  return `${subject}.${sign(subject)}`;
}

/** The hostel and tenant inside a valid token (hostel null on old cards), or null if tampered with. */
export function readIdToken(token: string): { hostelId: string | null; uid: string } | null {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const subject = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(subject));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const tilde = subject.indexOf("~");
  return tilde < 0 ? { hostelId: null, uid: subject } : { hostelId: subject.slice(0, tilde), uid: subject.slice(tilde + 1) };
}
