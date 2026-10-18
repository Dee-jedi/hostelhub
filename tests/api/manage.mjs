// Checks every manager action (/api/manage/*) against the STAGING demo hostel and verifies the
// database after each one, then resets the demo. Run: HH_BASE=… node tests/api/manage.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cert, initializeApp as initAdmin } from "firebase-admin/app";
import { getAuth as adminAuth } from "firebase-admin/auth";
import { getFirestore as adminFirestore } from "firebase-admin/firestore";
import { deleteApp, initializeApp } from "firebase/app";
import { getAuth, signInWithCustomToken } from "firebase/auth";

process.loadEnvFile(".env.local");
const BASE = process.env.HH_BASE ?? "https://hostelhub-1--hostelhub-b51cc.us-central1.hosted.app";
const H = "mowarid";
const sa = JSON.parse(readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? "hostelhub_service_account.json", "utf8"));
const admin = initAdmin({ credential: cert(sa) }, "manage-test-admin");
const aauth = adminAuth(admin);
const db = adminFirestore(admin, "staging");
const web = { apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY, projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID };
const run = Date.now().toString(36);
const apps = [];

async function token(uid, claims) {
  const app = initializeApp(web, uid);
  apps.push(app);
  return (await signInWithCustomToken(getAuth(app), await aauth.createCustomToken(uid, claims))).user.getIdToken();
}
const managerUid = `mt-mgr-${run}`;
const manager = await token(managerUid, { h: { [H]: "manager" } });
const stranger = await token(`mt-x-${run}`, { t: { [H]: true } });

async function act(action, body, as = manager) {
  const res = await fetch(`${BASE}/api/manage/${action}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${as}` }, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => null) };
}
const get = async (path) => (await db.doc(`hostels/${H}/${path}`).get()).data();
const listingRoom = async (id) => (await db.doc(`listings/${H}`).get()).data().rooms[id];
const activeStay = async (residentId) => (await db.collection(`hostels/${H}/tenancies`).where("residentId", "==", residentId).get()).docs.map((d) => d.data()).find((t) => t.status === "active");
const stayOf = async (residentId) => (await db.collection(`hostels/${H}/tenancies`).where("residentId", "==", residentId).get()).docs.map((d) => d.data())[0];

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

// Pick a tenant and some vacant rooms from the demo data
const listing = (await db.doc(`listings/${H}`).get()).data();
const vacant = Object.entries(listing.rooms).filter(([, r]) => r.status === "vacant").map(([id]) => id);
const occupiedRoom = Object.entries(listing.rooms).find(([, r]) => r.status === "occupied")[0];
const stays = (await db.collection(`hostels/${H}/tenancies`).where("status", "==", "active").get()).docs.map((d) => d.data());
// Tenants from the demo data itself (ids res_…), so the reset at the end puts them back
const demo = stays.filter((t) => t.residentId.startsWith("res_") && t.roomId);
const tenant = demo.find((t) => t.uid);
const other = demo.find((t) => t.residentId !== tenant.residentId);
assert.ok(vacant.length >= 3 && tenant && other, "demo data has vacant rooms and tenants");

await check("a tenant can't use manager actions (403)", async () => assert.equal((await act("moveOut", { residentId: other.residentId }, stranger)).status, 403));
await check("unknown action → 404", async () => assert.equal((await act("nope", {})).status, 404));

await check("edit a tenant's details", async () => {
  assert.equal((await act("updateTenant", { residentId: tenant.residentId, patch: { phone: "08099990000" } })).status, 200);
  assert.equal((await get(`residents/${tenant.residentId}`)).phone, "08099990000");
});

await check("change room: stay moves, listing follows", async () => {
  const from = tenant.roomId;
  const to = vacant[0];
  const r = await act("updateTenant", { residentId: tenant.residentId, patch: { roomId: to } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal((await activeStay(tenant.residentId)).roomId, to);
  assert.equal((await listingRoom(from)).status, "vacant");
  assert.equal((await listingRoom(to)).status, "occupied");
  return `${from} → ${to}`;
});

await check("change into an occupied room is refused (409)", async () => {
  const r = await act("updateTenant", { residentId: tenant.residentId, patch: { roomId: other.roomId } });
  assert.equal(r.status, 409);
  return r.json.error;
});

await check("maintenance on and off", async () => {
  const room = vacant[1];
  assert.equal((await act("setMaintenance", { roomId: room, on: true, note: "Painting" })).status, 200);
  assert.deepEqual((await get(`rooms/${room}`)).maintenance, { note: "Painting" });
  assert.equal((await listingRoom(room)).status, "maintenance");
  assert.equal((await act("setMaintenance", { roomId: room, on: false })).status, 200);
  assert.equal((await get(`rooms/${room}`)).maintenance, null);
  assert.equal((await listingRoom(room)).status, "vacant");
  assert.equal((await listingRoom(room)).note, undefined);
});

await check("move-out ends the stay and frees the room; twice is refused", async () => {
  assert.equal((await act("moveOut", { residentId: other.residentId })).status, 200);
  const stay = await stayOf(other.residentId);
  assert.equal(stay.status, "ended");
  assert.ok(stay.movedOutDate);
  assert.equal((await listingRoom(other.roomId)).status, "vacant");
  assert.equal((await act("moveOut", { residentId: other.residentId })).status, 409);
});

await check("re-admitting with a payment reactivates them without their old room", async () => {
  const r = await act("recordPayment", { residentId: other.residentId, payment: { amount: 350000, method: "Cash", reference: "" } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const stay = await activeStay(other.residentId);
  assert.ok(stay, "active again");
  assert.equal(stay.roomId, null);
  assert.match(r.json.payment.receiptNo, /^RCP-\d+$/);
  return r.json.payment.receiptNo;
});

await check("approve a room change request", async () => {
  const id = `tk_test_${run}`;
  await db.doc(`hostels/${H}/requests/${id}`).set({ id, kind: "room_change", roomId: vacant[0], residentId: tenant.residentId, uid: tenant.uid, title: "Move", category: "Other", status: "open", requestedRoomId: vacant[2], createdAt: new Date().toISOString() });
  const r = await act("approveRoomChange", { requestId: id, note: "Keys at the office" });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal((await activeStay(tenant.residentId)).roomId, vacant[2]);
  const req = await get(`requests/${id}`);
  assert.equal(req.status, "resolved");
  assert.equal(req.updates.at(-1).text, "Keys at the office");
  assert.equal((await listingRoom(vacant[0])).status, "vacant");
  assert.equal((await listingRoom(vacant[2])).status, "occupied");
});

await check("reminders go out once per threshold", async () => {
  const first = await act("runReminders", { channel: "SMS" });
  assert.equal(first.status, 200);
  const second = await act("runReminders", { channel: "SMS" });
  assert.equal(second.json.sent, 0);
  return `${first.json.sent} sent, then 0`;
});

await check("send a message: recipients' logins are attached for their portal", async () => {
  const r = await act("sendMessage", { kind: "notice", channel: "SMS", recipientIds: [tenant.residentId], body: "Water off tomorrow" });
  assert.equal(r.status, 200);
  assert.deepEqual((await get(`messages/${r.json.id}`)).recipientUids, [tenant.uid]);
});

await check("log a repair", async () => {
  const r = await act("logRepair", { roomId: vacant[1], title: "Broken window", category: "Other" });
  assert.equal(r.status, 200);
  assert.equal((await get(`requests/${r.json.id}`)).status, "open");
});

await check("place a paid booking that needed a room", async () => {
  const uid = `mt-bk-${run}`;
  await aauth.createUser({ uid, email: `mt.${run}@example.com`, password: "test1234" });
  const id = `HH-TEST${run}`.toUpperCase();
  await db.doc(`hostels/${H}/bookings/${id}`).set({ id, uid, roomId: vacant[1], spaceId: vacant[1], amount: 350000, status: "needs_attention", createdAt: new Date().toISOString(), fullName: "Placed Student", phone: "08011112222", email: `mt.${run}@example.com`, occupants: [] });
  const r = await act("addTenant", { info: { fullName: "Placed Student", phone: "08011112222", email: `mt.${run}@example.com`, occupants: [] }, roomId: vacant[1], bookingId: id });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.residentId, uid);
  assert.equal((await get(`bookings/${id}`)).status, "resolved");
  assert.equal((await get(`residents/${uid}`)).uid, uid);
  assert.equal((await aauth.getUser(uid)).customClaims?.t?.[H], true, "their login is now a tenant");
  assert.equal((await listingRoom(vacant[1])).status, "occupied");
  await aauth.deleteUser(uid);
  return r.json.receiptNo;
});

await check("room type rent reaches the listing; a new block in settings gets rooms of the default type", async () => {
  const type = await get("roomTypes/standard");
  assert.equal((await act("saveRoomType", { id: "standard", name: type.name, capacity: type.capacity, price: 400000 })).status, 200);
  assert.equal((await get("roomTypes/standard")).price, 400000);
  assert.equal((await db.doc(`listings/${H}`).get()).data().info.rentAmount, 400000);
  const hostel = await get("");
  const settings = {
    hostelName: hostel.name, address: hostel.address, managerName: hostel.manager.name, managerPhone: hostel.manager.phone,
    rentAmount: 400000, leaseMonths: 12, maxOccupants: 2, roomsPerBlock: 15,
    blocks: [..."ABCDEFGH"].map((name) => ({ name })).concat([{ name: "Z" }]),
    reminderDays: hostel.reminderDays, bankName: hostel.bank.bankName, accountName: hostel.bank.accountName, accountNumber: hostel.bank.accountNumber, whatsappGroupLink: hostel.whatsappGroupLink,
  };
  assert.equal((await act("updateSettings", { settings })).status, 200);
  assert.equal((await get("rooms/Z15")).typeId, "standard", "block Z rooms created with the default type");
  assert.equal((await listingRoom("Z1")).status, "vacant");
  // Removing an occupied block is refused
  const blocked = await act("updateSettings", { settings: { ...settings, blocks: [{ name: "Z" }] } });
  assert.equal(blocked.status, 409);
  assert.equal((await act("updateSettings", { settings: { ...settings, blocks: settings.blocks.slice(0, 8) } })).status, 200);
  assert.equal(await get("rooms/Z1"), undefined, "block Z removed again");
  assert.equal((await act("saveRoomType", { id: "standard", name: type.name, capacity: type.capacity, price: type.price })).status, 200);
});

await check("every change above left an audit entry by this manager", async () => {
  const audit = (await db.collection(`hostels/${H}/audit`).where("by.uid", "==", managerUid).get()).docs.map((d) => d.data().action);
  for (const a of ["tenant.edited", "tenant.moved", "room.maintenance_on", "tenant.moved_out", "payment.recorded", "reminders.sent", "message.sent", "booking.placed", "settings.updated", "roomType.updated"]) assert.ok(audit.includes(a), `missing ${a}`);
  return `${audit.length} entries`;
});

await check("reset restores the demo hostel", async () => {
  const res = await fetch(`${BASE}/api/admin/reset`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${manager}` }, body: JSON.stringify({ mode: "demo" }) });
  assert.equal(res.status, 200);
  assert.equal((await activeStay(tenant.residentId)).roomId, tenant.roomId, "tenant back in their original room");
  assert.equal((await db.collection(`hostels/${H}/residents`).count().get()).data().count, 115);
});

await aauth.deleteUsers([managerUid, `mt-x-${run}`]);
await Promise.all(apps.map((a) => deleteApp(a)));
console.log(`\n${passed}/${total} manager action checks passed`);
process.exit(process.exitCode ?? 0);
