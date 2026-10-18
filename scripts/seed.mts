/**
 * One-time setup and demo reset: publishes firestore.rules, loads the demo hostel into
 * Firestore and creates the logins. Run with `npm run seed` (or `npm run seed -- --empty`).
 * Which database: `--staging` or `--live` (otherwise NEXT_PUBLIC_FIRESTORE_DATABASE from .env.local).
 * Staging's rules are deployed from firebase.json.
 */
import { readFileSync } from "node:fs";

process.loadEnvFile(".env.local");
if (process.argv.includes("--staging")) process.env.NEXT_PUBLIC_FIRESTORE_DATABASE = "staging";
// .env.local points local development at staging; --live targets the live database explicitly
if (process.argv.includes("--live")) process.env.NEXT_PUBLIC_FIRESTORE_DATABASE = "(default)";

const { getSecurityRules } = await import("firebase-admin/security-rules");
const { seedFirestore, ADMIN_EMAIL, ADMIN_DEFAULT_PASSWORD, DEMO_PASSWORD } = await import("../src/lib/server/seed-firestore");
const { FIRESTORE_DATABASE, IS_LIVE_DATABASE } = await import("../src/lib/env");

console.log(`Database: ${FIRESTORE_DATABASE}`);
if (IS_LIVE_DATABASE) {
  // These release to the live database and the shared bucket only
  await getSecurityRules().releaseFirestoreRulesetFromSource(readFileSync("firestore.rules", "utf8"));
  console.log("✓ Firestore rules published");
  await getSecurityRules().releaseStorageRulesetFromSource(readFileSync("storage.rules", "utf8"), process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
  console.log("✓ Storage rules published");
}

const mode = process.argv.includes("--empty") ? "empty" : "demo";
await seedFirestore(mode);
console.log(`✓ ${mode === "demo" ? "Demo hostel" : "Empty hostel"} loaded`);
console.log(`  Staff login:  ${ADMIN_EMAIL} / ${ADMIN_DEFAULT_PASSWORD} (if newly created)`);
if (mode === "demo") console.log(`  Tenant logins: any resident's email / ${DEMO_PASSWORD}`);
