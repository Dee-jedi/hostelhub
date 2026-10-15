import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cert, getApp, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/*
 * Server-only Firebase Admin SDK. Never import this from a client component.
 * Credentials come from FIREBASE_SERVICE_ACCOUNT_BASE64 (hosting) or
 * FIREBASE_SERVICE_ACCOUNT_PATH (local file, gitignored).
 */

function credentials(): ServiceAccount {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (b64) return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!path) throw new Error("Set FIREBASE_SERVICE_ACCOUNT_BASE64 or FIREBASE_SERVICE_ACCOUNT_PATH");
  return JSON.parse(readFileSync(resolve(/*turbopackIgnore: true*/ process.cwd(), path), "utf8"));
}

const app = getApps().length ? getApp() : initializeApp({ credential: cert(credentials()) });

export const adminDb = getFirestore(app);
try {
  // Optional fields (e.g. a resident's movedOutDate) are often undefined
  adminDb.settings({ ignoreUndefinedProperties: true });
} catch {
  // already configured (dev hot reload)
}
export const adminAuth = getAuth(app);

/** Returns the caller's uid and claims from an `Authorization: Bearer <idToken>` header, or null. */
export async function verifyRequest(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  try {
    return await adminAuth.verifyIdToken(token);
  } catch {
    return null;
  }
}
