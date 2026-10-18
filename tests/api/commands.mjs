// Checks the server command layer (src/lib/server/command.ts) through /api/me and
// /api/platform/access on a running site that uses the STAGING database.
// Run: HH_BASE=http://localhost:3100 node tests/api/commands.mjs   (default: the staging site)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cert, initializeApp as initAdmin } from "firebase-admin/app";
import { getAuth as adminAuth } from "firebase-admin/auth";
import { getFirestore as adminFirestore } from "firebase-admin/firestore";
import { deleteApp, initializeApp } from "firebase/app";
import { getAuth, signInWithCustomToken } from "firebase/auth";

process.loadEnvFile(".env.local");
const BASE = process.env.HH_BASE ?? "https://hostelhub-1--hostelhub-b51cc.us-central1.hosted.app";
const sa = JSON.parse(readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? "hostelhub_service_account.json", "utf8"));
const admin = initAdmin({ credential: cert(sa) }, "cmd-test-admin");
const aauth = adminAuth(admin);
const adb = adminFirestore(admin, "staging");
const web = { apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY, projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID };

const run = Date.now().toString(36);
const HOSTEL = `ct-${run}`;
const platformUid = `ct-plt-${run}`;
const target = await aauth.createUser({ uid: `ct-tgt-${run}`, email: `ct.${run}@example.com`, password: "test1234" });
const apps = [];

async function idToken(uid, claims) {
  const app = initializeApp(web, uid);
  apps.push(app);
  const cred = await signInWithCustomToken(getAuth(app), await aauth.createCustomToken(uid, claims));
  return cred.user.getIdToken();
}
async function call(path, { token, body, host } = {}) {
  const res = await fetch(BASE + path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(host ? { "x-forwarded-host": host } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

let passed = 0;
async function check(label, fn) {
  try {
    await fn();
    passed++;
    console.log("PASS ", label);
  } catch (e) {
    console.log("FAIL ", label, "-", e.message.split("\n")[0]);
    process.exitCode = 1;
  }
}

const platform = await idToken(platformUid, { p: "admin" });
const nobody = await idToken(`ct-nb-${run}`, {});
const manager = await idToken(`ct-mgr-${run}`, { h: { [HOSTEL]: "manager" } });

await check("no login → 401", async () => assert.equal((await call("/api/me")).status, 401));
await check("a login on the default address → the default hostel", async () => {
  const r = await call("/api/me", { token: nobody });
  assert.equal(r.status, 200);
  assert.equal(r.json.hostelId, "mowarid");
  assert.equal(r.json.host.via, "default");
  assert.deepEqual(r.json.here, { manager: false, tenant: false });
});
await check("a hostel subdomain → that hostel, with the caller's role there", async () => {
  const r = await call("/api/me", { token: manager, host: `${HOSTEL}.localhost` });
  assert.equal(r.json.hostelId, HOSTEL);
  assert.equal(r.json.host.via, "subdomain");
  assert.deepEqual(r.json.here, { manager: true, tenant: false });
  assert.deepEqual(r.json.manages, [HOSTEL]);
});
await check("a reserved subdomain is not a hostel", async () => {
  const r = await call("/api/me", { token: nobody, host: "admin.localhost" });
  assert.equal(r.json.hostelId, null);
});
await check("platform tool refuses a manager (403)", async () => {
  const r = await call("/api/platform/access", { token: manager, body: { hostelId: HOSTEL, email: target.email, role: "manager" } });
  assert.equal(r.status, 403);
  assert.match(r.json.error, /access/);
});
await check("platform tool rejects a bad hostel id with a readable error", async () => {
  const r = await call("/api/platform/access", { token: platform, body: { hostelId: "Admin", email: target.email, role: "manager" } });
  assert.equal(r.status, 400);
});
await check("platform tool 404s an unknown email", async () => {
  const r = await call("/api/platform/access", { token: platform, body: { hostelId: HOSTEL, email: `nobody.${run}@example.com`, role: "manager" } });
  assert.equal(r.status, 404);
});
await check("platform admin makes someone a manager: claims set and audited", async () => {
  const r = await call("/api/platform/access", { token: platform, body: { hostelId: HOSTEL, email: target.email, role: "manager" } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal((await aauth.getUser(target.uid)).customClaims?.h?.[HOSTEL], "manager");
  const audit = await adb.collection(`hostels/${HOSTEL}/audit`).get();
  assert.equal(audit.size, 1);
  const entry = audit.docs[0].data();
  assert.equal(entry.action, "access.changed");
  assert.equal(entry.by.uid, platformUid);
});
await check("their next token carries the role, so the API sees them as manager", async () => {
  const token = await idToken(target.uid, undefined);
  const r = await call("/api/me", { token, host: `${HOSTEL}.localhost` });
  assert.deepEqual(r.json.here, { manager: true, tenant: false });
});
await check("removing the role clears it and keeps other claims", async () => {
  await aauth.setCustomUserClaims(target.uid, { ...(await aauth.getUser(target.uid)).customClaims, role: "admin" });
  const r = await call("/api/platform/access", { token: platform, body: { hostelId: HOSTEL, email: target.email, role: null } });
  assert.equal(r.status, 200);
  const claims = (await aauth.getUser(target.uid)).customClaims;
  assert.equal(claims?.h, undefined);
  assert.equal(claims?.role, "admin");
});

await adb.recursiveDelete(adb.doc(`hostels/${HOSTEL}`));
await aauth.deleteUsers([target.uid, platformUid, `ct-nb-${run}`, `ct-mgr-${run}`]);
await Promise.all(apps.map((a) => deleteApp(a)));
console.log(`\n${passed}/10 command checks passed`);
process.exit(process.exitCode ?? 0);
