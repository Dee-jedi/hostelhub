// Checks the multi-hostel Firestore rules against the real STAGING database.
// Creates two throwaway hostels and five throwaway logins, tries what each may and may not
// do, then deletes everything it made. Run: node tests/rules/staging-rules.mjs
import { readFileSync } from "node:fs";
import { cert, initializeApp as initAdmin } from "firebase-admin/app";
import { getAuth as adminAuth } from "firebase-admin/auth";
import { getFirestore as adminFirestore } from "firebase-admin/firestore";
import { deleteApp, initializeApp } from "firebase/app";
import { getAuth, signInWithCustomToken } from "firebase/auth";
import { collection, doc, getDoc, getDocs, getFirestore, query, setDoc, updateDoc, where } from "firebase/firestore";

process.loadEnvFile(".env.local");
const DB = "staging";
const sa = JSON.parse(readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? "hostelhub_service_account.json", "utf8"));
const admin = initAdmin({ credential: cert(sa) }, "rules-test-admin");
const adb = adminFirestore(admin, DB);
const aauth = adminAuth(admin);
const web = { apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY, projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID };

const run = Date.now().toString(36);
const A = `rt-a-${run}`;
const B = `rt-b-${run}`;
const users = {
  manager: { uid: `rt-mgr-${run}`, claims: { h: { [A]: "manager" } } },
  tenant: { uid: `rt-ten-${run}`, claims: { t: { [A]: true } } },
  neighbour: { uid: `rt-nb-${run}`, claims: { t: { [A]: true } } },
  outsider: { uid: `rt-out-${run}`, claims: {} },
  platform: { uid: `rt-plt-${run}`, claims: { p: "admin" } },
};

// ---------------------------------------------------------------- fixtures (Admin SDK)
const put = (path, data) => adb.doc(path).set(data);
await Promise.all([
  put(`hostels/${A}`, { name: "Rules test A" }),
  put(`hostels/${B}`, { name: "Rules test B" }),
  put(`listings/${A}`, { info: { hostelName: "Rules test A" }, spaces: {} }),
  put(`hostels/${A}/rooms/r1`, { label: "A1" }),
  put(`hostels/${A}/audit/a1`, { action: "test" }),
  put(`hostels/${A}/residents/res-t`, { uid: users.tenant.uid, fullName: "Tenant", phone: "1", roomId: "r1" }),
  put(`hostels/${A}/residents/res-n`, { uid: users.neighbour.uid, fullName: "Neighbour", phone: "2" }),
  put(`hostels/${A}/payments/p-t`, { uid: users.tenant.uid, amount: 1 }),
  put(`hostels/${A}/payments/p-n`, { uid: users.neighbour.uid, amount: 2 }),
  put(`hostels/${A}/tenancies/x-t`, { uid: users.tenant.uid }),
  put(`hostels/${A}/requests/q-t`, { uid: users.tenant.uid, status: "open", title: "Tap" }),
  put(`hostels/${A}/messages/m-t`, { recipientUids: [users.tenant.uid], body: "Hi" }),
  put(`hostels/${A}/bookings/b-o`, { uid: users.outsider.uid, status: "pending" }),
  put(`hostels/${B}/residents/res-b`, { uid: users.tenant.uid, fullName: "Tenant elsewhere" }),
]);

// ---------------------------------------------------------------- one signed-in client per login
const clients = {};
for (const [name, u] of Object.entries(users)) {
  const app = initializeApp(web, `rt-${name}`);
  await signInWithCustomToken(getAuth(app), await aauth.createCustomToken(u.uid, u.claims));
  clients[name] = { app, db: getFirestore(app, DB) };
}
const anonApp = initializeApp(web, "rt-anon");
clients.anon = { app: anonApp, db: getFirestore(anonApp, DB) };

// ---------------------------------------------------------------- expectations
const results = [];
async function expect(who, label, allowed, fn) {
  let ok;
  try {
    await fn(clients[who].db);
    ok = true;
  } catch (e) {
    if (e.code !== "permission-denied") throw e;
    ok = false;
  }
  const pass = ok === allowed;
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}  ${who.padEnd(9)} ${allowed ? "may   " : "may not"} ${label}${pass ? "" : `  (got ${ok ? "allowed" : "denied"})`}`);
}
const read = (p) => (db) => getDoc(doc(db, p));
const list = (p, ...w) => (db) => getDocs(w.length ? query(collection(db, p), ...w) : collection(db, p));

await expect("anon", "read the public listing", true, read(`listings/${A}`));
await expect("anon", "read the hostel", false, read(`hostels/${A}`));
await expect("anon", "write the listing", false, (db) => setDoc(doc(db, `listings/${A}`), { x: 1 }));

await expect("manager", "read their hostel", true, read(`hostels/${A}`));
await expect("manager", "read rooms", true, read(`hostels/${A}/rooms/r1`));
await expect("manager", "read the audit log", true, read(`hostels/${A}/audit/a1`));
await expect("manager", "list all residents", true, list(`hostels/${A}/residents`));
await expect("manager", "list all payments", true, list(`hostels/${A}/payments`));
await expect("manager", "read another hostel", false, read(`hostels/${B}`));
await expect("manager", "list another hostel's residents", false, list(`hostels/${B}/residents`));
await expect("manager", "write a payment directly", false, (db) => setDoc(doc(db, `hostels/${A}/payments/fake`), { uid: "x", amount: 1 }));
await expect("manager", "edit a room directly", false, (db) => updateDoc(doc(db, `hostels/${A}/rooms/r1`), { label: "Z" }));
await expect("manager", "reply on a request", true, (db) => updateDoc(doc(db, `hostels/${A}/requests/q-t`), { status: "in_progress" }));
await expect("manager", "send a message", true, (db) => setDoc(doc(db, `hostels/${A}/messages/m-new`), { recipientUids: [], body: "x" }));

await expect("tenant", "read their hostel", true, read(`hostels/${A}`));
await expect("tenant", "read own resident record", true, read(`hostels/${A}/residents/res-t`));
await expect("tenant", "read a neighbour's record", false, read(`hostels/${A}/residents/res-n`));
await expect("tenant", "list own payments", true, list(`hostels/${A}/payments`, where("uid", "==", users.tenant.uid)));
await expect("tenant", "list all payments", false, list(`hostels/${A}/payments`));
await expect("tenant", "read own tenancy", true, read(`hostels/${A}/tenancies/x-t`));
await expect("tenant", "read rooms", false, read(`hostels/${A}/rooms/r1`));
await expect("tenant", "read the audit log", false, read(`hostels/${A}/audit/a1`));
await expect("tenant", "update own phone", true, (db) => updateDoc(doc(db, `hostels/${A}/residents/res-t`), { phone: "08000000000" }));
await expect("tenant", "move themselves to another room", false, (db) => updateDoc(doc(db, `hostels/${A}/residents/res-t`), { roomId: "r9" }));
await expect("tenant", "open a request", true, (db) => setDoc(doc(db, `hostels/${A}/requests/q-new`), { uid: users.tenant.uid, status: "open", title: "Fan" }));
await expect("tenant", "open a request already resolved", false, (db) => setDoc(doc(db, `hostels/${A}/requests/q-bad`), { uid: users.tenant.uid, status: "resolved", title: "x" }));
await expect("tenant", "open a request as someone else", false, (db) => setDoc(doc(db, `hostels/${A}/requests/q-bad2`), { uid: users.neighbour.uid, status: "open", title: "x" }));
await expect("tenant", "change a request's status", false, (db) => updateDoc(doc(db, `hostels/${A}/requests/q-t`), { status: "resolved" }));
await expect("tenant", "list messages sent to them", true, list(`hostels/${A}/messages`, where("recipientUids", "array-contains", users.tenant.uid)));
await expect("tenant", "read a record about them in a hostel they don't live in", false, read(`hostels/${B}/residents/res-b`));

await expect("neighbour", "read the tenant's payment", false, read(`hostels/${A}/payments/p-t`));
await expect("outsider", "read a resident", false, read(`hostels/${A}/residents/res-t`));
await expect("outsider", "read their own pending booking", true, read(`hostels/${A}/bookings/b-o`));
await expect("outsider", "read the hostel", false, read(`hostels/${A}`));
await expect("platform", "read any hostel", true, read(`hostels/${B}`));
await expect("platform", "list any hostel's residents", true, list(`hostels/${B}/residents`));

await expect("tenant", "write own user profile", true, (db) => setDoc(doc(db, `users/${users.tenant.uid}`), { name: "T", fcmTokens: [] }));
await expect("tenant", "give themselves a role in their user profile", false, (db) => setDoc(doc(db, `users/${users.tenant.uid}`), { name: "T", h: { [A]: "manager" } }));
await expect("tenant", "read someone else's user profile", false, read(`users/${users.neighbour.uid}`));

// ---------------------------------------------------------------- clean up
await Promise.all([adb.recursiveDelete(adb.doc(`hostels/${A}`)), adb.recursiveDelete(adb.doc(`hostels/${B}`)), adb.doc(`listings/${A}`).delete()]);
await Promise.all(Object.values(users).map((u) => adb.doc(`users/${u.uid}`).delete()));
await aauth.deleteUsers(Object.values(users).map((u) => u.uid));
await Promise.all(Object.values(clients).map((c) => deleteApp(c.app)));

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} rule checks passed`);
process.exit(failed ? 1 : 0);
