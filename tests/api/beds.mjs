// Per-bed and room-type checks against the STAGING per-bed demo hostel ("unity"), reached by
// its subdomain through X-Forwarded-Host. Resets that hostel at the end.
// Run: HH_BASE=… node tests/api/beds.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cert, initializeApp as initAdmin } from "firebase-admin/app";
import { getAuth as adminAuth } from "firebase-admin/auth";
import { getFirestore as adminFirestore } from "firebase-admin/firestore";
import { deleteApp, initializeApp } from "firebase/app";
import { getAuth, signInWithCustomToken } from "firebase/auth";

process.loadEnvFile(".env.local");
const BASE = process.env.HH_BASE ?? "https://hostelhub-1--hostelhub-b51cc.us-central1.hosted.app";
const H = "unity";
const sa = JSON.parse(readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? "hostelhub_service_account.json", "utf8"));
const admin = initAdmin({ credential: cert(sa) }, "beds-test-admin");
const aauth = adminAuth(admin);
const db = adminFirestore(admin, "staging");
const web = { apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY, projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID };
const run = Date.now().toString(36);
const managerUid = `bt-mgr-${run}`;
const app = initializeApp(web, managerUid);
const manager = await (await signInWithCustomToken(getAuth(app), await aauth.createCustomToken(managerUid, { h: { [H]: "manager" } }))).user.getIdToken();

async function act(action, body) {
  const res = await fetch(`${BASE}/api/manage/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${manager}`, "x-forwarded-host": `${H}.localhost` },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}
const listing = async () => (await db.doc(`listings/${H}`).get()).data();
const stayOf = async (residentId) => (await db.collection(`hostels/${H}/tenancies`).where("residentId", "==", residentId).get()).docs.map((d) => d.data()).find((t) => t.status === "active");
const person = (name) => ({ fullName: name, sex: "Female", phone: "08012345678", email: "", matricNo: "", department: "", faculty: "", level: "", stateOfOrigin: "", homeAddress: "", nextOfKinName: "Kin", nextOfKinPhone: "08087654321", nextOfKinRelationship: "", occupants: [], isStudent: false });

let passed = 0;
let total = 0;
async function check(label, fn) {
  total++;
  try {
    const note = await fn();
    passed++;
    console.log("PASS ", label, note ?? "");
  } catch (e) {
    console.log("FAIL ", label, "-", e.message.split("\n")[0]);
    process.exitCode = 1;
  }
}

// A per-bed room with some free beds and some taken
const l0 = await listing();
const [partialId, partial] = Object.entries(l0.rooms).find(([, r]) => r.beds && r.status === "vacant" && Object.values(r.beds).includes("occupied"));
const emptyFour = Object.entries(l0.rooms).find(([, r]) => r.typeId === "bed4" && r.status === "vacant" && r.beds && Object.values(r.beds).every((b) => b === "vacant"))?.[0];
const added = [];

await check("the listing shows each bed of a per-bed room", async () => {
  assert.ok(partial.beds && Object.keys(partial.beds).length >= 2);
  return `${partialId}: ${JSON.stringify(partial.beds)}`;
});

await check("adding a tenant to a per-bed room gives them the next free bed", async () => {
  const freeBed = Object.entries(partial.beds).find(([, s]) => s === "vacant")[0];
  const r = await act("addTenant", { info: person(`Bed Tester ${run}`), roomId: partialId, payment: { amount: 150000, method: "Cash", reference: "" } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  added.push(r.json.residentId);
  const stay = await stayOf(r.json.residentId);
  assert.equal(stay.spaceId, `${partialId}-${freeBed}`);
  assert.equal((await listing()).rooms[partialId].beds[freeBed], "occupied");
  return `${stay.spaceId}, ${r.json.receiptNo}`;
});

await check("filling the last bed marks the room full; one more is refused", async () => {
  let room = (await listing()).rooms[partialId];
  while (Object.values(room.beds).includes("vacant")) {
    const r = await act("addTenant", { info: person(`Filler ${run}`), roomId: partialId });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    added.push(r.json.residentId);
    room = (await listing()).rooms[partialId];
  }
  assert.equal(room.status, "occupied");
  const extra = await act("addTenant", { info: person(`One too many ${run}`), roomId: partialId });
  assert.equal(extra.status, 409);
  return extra.json.error;
});

await check("moving one tenant out frees just their bed", async () => {
  const stay = await stayOf(added[0]);
  assert.equal((await act("moveOut", { residentId: added[0] })).status, 200);
  const room = (await listing()).rooms[partialId];
  assert.equal(room.status, "vacant");
  assert.equal(room.beds[stay.spaceId.split("-").pop()], "vacant");
  assert.equal(Object.values(room.beds).filter((b) => b === "vacant").length, 1);
});

await check("changing room puts them in a free bed of the new room", async () => {
  // Someone already living in the partly full room
  const mover = (await db.collection(`hostels/${H}/tenancies`).where("roomId", "==", partialId).where("status", "==", "active").limit(1).get()).docs[0].data();
  const r = await act("updateTenant", { residentId: mover.residentId, patch: { roomId: emptyFour } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const stay = await stayOf(mover.residentId);
  assert.equal(stay.spaceId, `${emptyFour}-A`);
  const l = await listing();
  assert.equal(l.rooms[emptyFour].beds.A, "occupied");
  assert.equal(Object.values(l.rooms[partialId].beds).filter((b) => b === "vacant").length, 2, "their old bed and the moved-out one");
});

await check("a room type can be added, edited and (when unused) deleted", async () => {
  const created = await act("saveRoomType", { name: "Single room", capacity: 1, price: 300000 });
  assert.equal(created.status, 200, JSON.stringify(created.json));
  const id = created.json.id;
  let info = (await listing()).info;
  assert.ok(info.roomTypes.some((t) => t.id === id && t.price === 300000 && t.pricingMode === "per_bed"));
  assert.equal((await act("saveRoomType", { id, name: "Single room", capacity: 1, price: 320000 })).status, 200);
  info = (await listing()).info;
  assert.equal(info.roomTypes.find((t) => t.id === id).price, 320000);
  assert.equal((await act("deleteRoomType", { id })).status, 200);
  assert.ok(!(await listing()).info.roomTypes.some((t) => t.id === id));
});

await check("a room type in use can't be deleted", async () => {
  const r = await act("deleteRoomType", { id: "bed4" });
  assert.equal(r.status, 409);
  return r.json.error;
});

await check("set size: an empty room becomes 3-person, with 3 beds on the listing", async () => {
  // emptyFour now has one tenant in bed A, which a 3-person room still has
  const r = await act("setRoomsType", { roomIds: [emptyFour], typeId: "bed3" });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const room = (await listing()).rooms[emptyFour];
  assert.deepEqual(Object.keys(room.beds), ["A", "B", "C"]);
  assert.equal(room.beds.A, "occupied");
});

await check("set size: shrinking a room with someone in bed D is refused", async () => {
  const full = Object.entries((await listing()).rooms).find(([, r]) => r.typeId === "bed4" && r.beds?.D === "occupied")[0];
  const r = await act("setRoomsType", { roomIds: [full], typeId: "bed2" });
  assert.equal(r.status, 409);
  return r.json.error;
});

await check("switching per bed → per room is refused while tenants live there", async () => {
  const r = await act("setRentalModel", { model: "per_room" });
  assert.equal(r.status, 409);
});

await check("reset restores the per-bed demo", async () => {
  const res = await fetch(`${BASE}/api/admin/reset`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${manager}`, "x-forwarded-host": `${H}.localhost` }, body: JSON.stringify({ mode: "demo" }) });
  assert.equal(res.status, 200);
  const l = await listing();
  assert.deepEqual(l.rooms[partialId], partial);
  assert.equal(l.info.roomTypes.length, 3);
});

await aauth.deleteUser(managerUid);
await deleteApp(app);
console.log(`\n${passed}/${total} per-bed checks passed`);
process.exit(process.exitCode ?? 0);
