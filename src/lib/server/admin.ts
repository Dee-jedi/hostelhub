import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cert, getApp, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { FIRESTORE_DATABASE } from "../env";

/*
 * Server-only Firebase Admin SDK. Never import this from a client component.
 * On Firebase App Hosting no key is needed: the server runs as the project's own service account.
 * Elsewhere, credentials come from FIREBASE_SERVICE_ACCOUNT_BASE64 (Vercel: the JSON file
 * base64-encoded, or the raw JSON pasted as-is) or FIREBASE_SERVICE_ACCOUNT_PATH (local file, gitignored).
 */

const hasServiceAccount = () =>
  !!(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_PATH)?.trim();

/** True on App Hosting (Cloud Run), which sets FIREBASE_CONFIG and K_SERVICE for every instance. */
export const onGoogleCloud = () => !!(process.env.FIREBASE_CONFIG || process.env.K_SERVICE);

/** Reads the service account from the environment, with an error that says exactly what's wrong. */
export function credentials(): ServiceAccount {
  // Tolerate stray whitespace or wrapping quotes from copy-pasting into a hosting dashboard
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 ?? process.env.FIREBASE_SERVICE_ACCOUNT ?? "").trim().replace(/^["']|["']$/g, "");
  if (raw) {
    const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    let parsed: ServiceAccount & { private_key?: string; client_email?: string; project_id?: string };
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_BASE64 is not valid base64 of the service account JSON (it may be cut off). Re-copy it.");
    }
    if (!parsed.private_key || !parsed.client_email) throw new Error("The service account JSON is missing private_key or client_email.");
    // Some dashboards turn the key's line breaks into a literal backslash-n
    return { ...parsed, private_key: parsed.private_key.replace(/\\n/g, "\n") } as ServiceAccount;
  }
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!path) throw new Error("No Firebase service account: set FIREBASE_SERVICE_ACCOUNT_BASE64 (on hosting) or FIREBASE_SERVICE_ACCOUNT_PATH (locally).");
  try {
    return JSON.parse(readFileSync(resolve(/*turbopackIgnore: true*/ process.cwd(), path), "utf8"));
  } catch {
    throw new Error(`Couldn't read the service account file at "${path}". On hosting, use FIREBASE_SERVICE_ACCOUNT_BASE64 instead (the file isn't uploaded).`);
  }
}

function init() {
  // A key, if given, always wins, so a Vercel deploy or local dev behaves exactly as before
  if (hasServiceAccount() || !onGoogleCloud()) return initializeApp({ credential: cert(credentials()) });
  // No arguments: the SDK reads the project from FIREBASE_CONFIG and signs in as the backend's service account
  return initializeApp();
}

const app = getApps().length ? getApp() : init();

export const adminDb = getFirestore(app, FIRESTORE_DATABASE);
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
