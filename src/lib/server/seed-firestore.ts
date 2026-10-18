import { createHmac, randomBytes } from "node:crypto";
import type { UserImportRecord } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import { DEFAULT_HOSTEL, IS_LIVE_DATABASE } from "../env";
import { bedDemoLogins, createBedDemo } from "../migrate/bed-demo";
import { documentsOf, fromLegacy } from "../migrate/from-legacy";
import { createDemoState, createEmptyState } from "../seed";
import type { HostelState } from "../types";
import { adminAuth, adminDb } from "./admin";
import { setHostelRole, setTenantOf } from "./claims";

export const ADMIN_EMAIL = "admin@hostelhub.app";
export const ADMIN_DEFAULT_PASSWORD = "admin1234";
export const DEMO_PASSWORD = "demo1234";
/** The demo hostel that rents by the bed (see migrate/bed-demo.ts) */
export const BED_DEMO_HOSTEL = "unity";

/** The single-hostel collections this replaced; a reset clears them so nothing stale lingers. */
const LEGACY_COLLECTIONS = ["residents", "payments", "messages", "tickets", "bookings", "renewals", "config"] as const;

/**
 * Replaces one hostel's data with the demo hostel (or an empty one) in the multi-hostel model,
 * and recreates its tenant logins. Staff logins are kept. Used by `npm run seed` and the
 * "Reset demo data" button.
 */
export async function seedFirestore(mode: "demo" | "empty" = "demo", hostelId = DEFAULT_HOSTEL || "mowarid") {
  const state = mode === "demo" ? createDemoState() : createEmptyState();

  const isDefault = hostelId === (DEFAULT_HOSTEL || "mowarid");
  await Promise.all([
    adminDb.recursiveDelete(adminDb.doc(`hostels/${hostelId}`)),
    adminDb.doc(`listings/${hostelId}`).delete(),
    // The old single-hostel data belonged to the default hostel
    ...(isDefault ? [...LEGACY_COLLECTIONS.map((c) => adminDb.recursiveDelete(adminDb.collection(c))), adminDb.doc("public/booking").delete()] : []),
    // Passport photos belong to tenant logins, which are recreated below. Storage is shared with
    // staging, so only the live reset clears it.
    IS_LIVE_DATABASE &&
      isDefault &&
      getStorage()
        .bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET)
        .deleteFiles({ prefix: "passports/" }),
  ]);

  // The per-bed demo has its own generator; every other hostel gets the Mowarid demo (or an empty one)
  const bedDemo = mode === "demo" && hostelId === BED_DEMO_HOSTEL ? createBedDemo(hostelId) : null;
  const logins = bedDemo ? bedDemoLogins(bedDemo) : demoLogins(state);
  const docs = bedDemo ?? fromLegacy({ hostelId, state, receiptSeq: maxReceipt(state), loginUids: new Set(logins.map((u) => u.uid)) });
  const writer = adminDb.bulkWriter();
  for (const [path, data] of documentsOf(docs)) void writer.set(adminDb.doc(path), data);
  await writer.close();

  await recreateTenantLogins(logins, hostelId);
  await ensureStaff(hostelId);
}

function maxReceipt(state: HostelState) {
  return state.payments.reduce((m, p) => Math.max(m, Number(p.receiptNo.replace(/\D/g, "")) || 0), 1000);
}

/** One login per current demo tenant, with the demo password. Their resident id is their uid. */
function demoLogins(state: HostelState) {
  return state.residents.filter((r) => r.status === "active" && r.email).map((r) => ({ uid: r.id, email: r.email, displayName: r.fullName }));
}

/** Staff logins (any hostel, the platform, or the old single-hostel flag) are never deleted. */
function isStaff(claims: Record<string, unknown> | undefined) {
  return !!claims && (claims.role === "admin" || claims.p === "admin" || (typeof claims.h === "object" && claims.h !== null && Object.keys(claims.h).length > 0));
}

/** A login that is a tenant of this hostel only (or of none), so this hostel's reset may delete it. */
function onlyTenantOf(claims: Record<string, unknown> | undefined, hostelId: string) {
  const t = claims?.t;
  if (!t || typeof t !== "object") return true;
  return Object.keys(t).every((h) => h === hostelId);
}

/**
 * Deletes every non-staff login that belongs only to this hostel, then imports one per demo tenant as a tenant of the hostel.
 * Logins are shared with staging, so a staging reset only imports (same ids and emails as live,
 * so it refreshes them) and never deletes anyone.
 */
async function recreateTenantLogins(logins: ReturnType<typeof demoLogins>, hostelId: string) {
  const stale: string[] = [];
  let page: string | undefined;
  if (IS_LIVE_DATABASE)
    do {
      const res = await adminAuth.listUsers(1000, page);
      for (const u of res.users) if (!isStaff(u.customClaims) && onlyTenantOf(u.customClaims, hostelId)) stale.push(u.uid);
      page = res.pageToken;
    } while (page);
  for (let i = 0; i < stale.length; i += 1000) await adminAuth.deleteUsers(stale.slice(i, i + 1000));

  const key = randomBytes(32);
  const users: UserImportRecord[] = logins.map((u) => ({
    ...u,
    emailVerified: true,
    passwordHash: createHmac("sha256", key).update(DEMO_PASSWORD).digest(),
    customClaims: { t: { [hostelId]: true } },
  }));
  const failed: string[] = [];
  for (let i = 0; i < users.length; i += 1000) {
    const res = await adminAuth.importUsers(users.slice(i, i + 1000), { hash: { algorithm: "HMAC_SHA256", key } });
    for (const e of res.errors) failed.push(users[i + e.index].uid);
  }
  // Logins that already existed (staging reset) keep their other claims; just mark them as tenants
  for (const uid of failed) await setTenantOf(uid, hostelId, true).catch((err) => console.warn(`Couldn't mark ${uid} as a tenant:`, err.message));
}

async function ensureStaff(hostelId: string) {
  let user = await adminAuth.getUserByEmail(ADMIN_EMAIL).catch(() => null);
  if (!user) user = await adminAuth.createUser({ email: ADMIN_EMAIL, password: ADMIN_DEFAULT_PASSWORD, displayName: "Hostel Manager", emailVerified: true });
  // Keep the old single-hostel flag while the live app still reads it
  if (user.customClaims?.role !== "admin") await adminAuth.setCustomUserClaims(user.uid, { ...user.customClaims, role: "admin" });
  await setHostelRole(user.uid, hostelId, "manager");
}
