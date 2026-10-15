import { createHmac, randomBytes } from "node:crypto";
import type { UserImportRecord } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import { createDemoState, createEmptyState } from "../seed";
import type { HostelState, PublicBookingDoc } from "../types";
import { publicInfo, publicRooms } from "../utils";
import { adminAuth, adminDb } from "./admin";

export const ADMIN_EMAIL = "admin@hostelhub.app";
export const ADMIN_DEFAULT_PASSWORD = "admin1234";
export const DEMO_PASSWORD = "demo1234";

const COLLECTIONS = ["residents", "payments", "messages", "tickets", "bookings"] as const;

/**
 * Replaces all hostel data with the demo hostel (or an empty one) and recreates tenant logins.
 * The staff account is kept. Used by `npm run seed` and the "Reset demo data" button.
 */
export async function seedFirestore(mode: "demo" | "empty" = "demo") {
  const state = mode === "demo" ? createDemoState() : createEmptyState();

  await Promise.all([
    ...[...COLLECTIONS, "renewals"].map((c) => adminDb.recursiveDelete(adminDb.collection(c))),
    // Passport photos belong to tenant logins, which are recreated below
    getStorage()
      .bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET)
      .deleteFiles({ prefix: "passports/" }),
  ]);

  const writer = adminDb.bulkWriter();
  const put = (path: string, data: object) => void writer.set(adminDb.doc(path), data);

  put("config/settings", state.settings);
  put("config/meta", { sentReminderKeys: [], receiptSeq: maxReceipt(state) });
  const pub: PublicBookingDoc = { info: publicInfo(state.settings), rooms: publicRooms(state), holds: {} };
  put("public/booking", pub);
  for (const c of COLLECTIONS) for (const item of state[c]) put(`${c}/${item.id}`, item);
  await writer.close();

  await recreateTenantLogins(state);
  await ensureAdmin();
}

function maxReceipt(state: HostelState) {
  return state.payments.reduce((m, p) => Math.max(m, Number(p.receiptNo.replace(/\D/g, "")) || 0), 1000);
}

/** Deletes every non-staff login, then imports one per current tenant with the demo password. */
async function recreateTenantLogins(state: HostelState) {
  const stale: string[] = [];
  let page: string | undefined;
  do {
    const res = await adminAuth.listUsers(1000, page);
    for (const u of res.users) if (u.customClaims?.role !== "admin") stale.push(u.uid);
    page = res.pageToken;
  } while (page);
  for (let i = 0; i < stale.length; i += 1000) await adminAuth.deleteUsers(stale.slice(i, i + 1000));

  const key = randomBytes(32);
  const users: UserImportRecord[] = state.residents
    .filter((r) => r.status === "active" && r.email)
    .map((r) => ({
      uid: r.id,
      email: r.email,
      emailVerified: true,
      displayName: r.fullName,
      passwordHash: createHmac("sha256", key).update(DEMO_PASSWORD).digest(),
    }));
  for (let i = 0; i < users.length; i += 1000) {
    const res = await adminAuth.importUsers(users.slice(i, i + 1000), { hash: { algorithm: "HMAC_SHA256", key } });
    if (res.failureCount) console.warn("Some demo logins failed to import:", res.errors.map((e) => e.error.message));
  }
}

async function ensureAdmin() {
  let user = await adminAuth.getUserByEmail(ADMIN_EMAIL).catch(() => null);
  if (!user) user = await adminAuth.createUser({ email: ADMIN_EMAIL, password: ADMIN_DEFAULT_PASSWORD, displayName: "Hostel Manager", emailVerified: true });
  if (user.customClaims?.role !== "admin") await adminAuth.setCustomUserClaims(user.uid, { role: "admin" });
}
