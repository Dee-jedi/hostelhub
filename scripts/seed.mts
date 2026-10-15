/**
 * One-time setup and demo reset: publishes firestore.rules, loads the demo hostel into
 * Firestore and creates the logins. Run with `npm run seed` (or `npm run seed -- --empty`).
 */
import { readFileSync } from "node:fs";

process.loadEnvFile(".env.local");

const { getSecurityRules } = await import("firebase-admin/security-rules");
const { seedFirestore, ADMIN_EMAIL, ADMIN_DEFAULT_PASSWORD, DEMO_PASSWORD } = await import("../src/lib/server/seed-firestore");

await getSecurityRules().releaseFirestoreRulesetFromSource(readFileSync("firestore.rules", "utf8"));
console.log("✓ Firestore rules published");
await getSecurityRules().releaseStorageRulesetFromSource(readFileSync("storage.rules", "utf8"), process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
console.log("✓ Storage rules published");

const mode = process.argv.includes("--empty") ? "empty" : "demo";
await seedFirestore(mode);
console.log(`✓ ${mode === "demo" ? "Demo hostel" : "Empty hostel"} loaded`);
console.log(`  Staff login:  ${ADMIN_EMAIL} / ${ADMIN_DEFAULT_PASSWORD} (if newly created)`);
if (mode === "demo") console.log(`  Tenant logins: any resident's email / ${DEMO_PASSWORD}`);
