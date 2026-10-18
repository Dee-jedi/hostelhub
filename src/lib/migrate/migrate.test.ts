import assert from "node:assert/strict";
import { test } from "node:test";
import { createDemoState } from "../seed";
import type { HostelState } from "../types";
import { documentsOf, fromLegacy, tenancyIdFor } from "./from-legacy";
import { toLegacy, withoutSpaceFields } from "./to-legacy";

const state = createDemoState();
const logins = new Set(state.residents.filter((r) => r.status === "active" && r.email).map((r) => r.id));
const docs = fromLegacy({ hostelId: "mowarid", state, receiptSeq: 1109, loginUids: logins, now: "2026-10-19T00:00:00.000Z" });

/** Same data regardless of array order or undefined-vs-missing keys */
function normalize(s: HostelState) {
  const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));
  return JSON.parse(
    JSON.stringify({ ...s, rooms: byId(s.rooms), residents: byId(s.residents), payments: byId(s.payments), messages: byId(s.messages), bookings: byId(s.bookings), tickets: byId(s.tickets) }),
  );
}

test("the demo hostel survives the move unchanged (old → new → old)", () => {
  const back = toLegacy({ ...docs, sentReminderKeys: docs.counters.reminders.sentKeys });
  assert.deepEqual(normalize(withoutSpaceFields(back)), normalize(state));
});

test("Mowarid becomes one per-room type with the hostel's rent and size", () => {
  assert.equal(docs.roomTypes.length, 1);
  assert.deepEqual(
    { capacity: docs.roomTypes[0].capacity, pricingMode: docs.roomTypes[0].pricingMode, price: docs.roomTypes[0].price },
    { capacity: 2, pricingMode: "per_room", price: 350_000 },
  );
  assert.deepEqual(docs.rentPeriods, [{ id: "rolling", kind: "rolling", name: "12 months from move-in", months: 12 }]);
  assert.equal(docs.rooms.length, 120);
  assert.equal(docs.blocks.length, 8);
});

test("every resident has a tenancy, active exactly when they live here", () => {
  for (const r of state.residents) {
    const t = docs.tenancies.find((x) => x.id === tenancyIdFor(r.id));
    assert.ok(t, r.id);
    assert.equal(t.status === "active", r.status === "active", r.id);
    if (r.status === "active") assert.equal(t.roomId, r.roomId, r.id);
  }
});

test("records a tenant can read carry their login", () => {
  for (const p of docs.payments) assert.equal(p.uid, logins.has(p.residentId) ? p.residentId : null);
  for (const m of docs.messages) for (const id of m.recipientIds) if (logins.has(id)) assert.ok(m.recipientUids.includes(id));
  for (const q of docs.requests) assert.equal(q.uid, q.residentId && logins.has(q.residentId) ? q.residentId : null);
  assert.deepEqual(new Set(docs.tenantUids), new Set([...logins]));
});

test("the public listing matches room occupancy and holds no personal data", () => {
  const occupied = new Set(state.residents.filter((r) => r.status === "active" && r.roomId).map((r) => r.roomId));
  for (const r of state.rooms) {
    const l = docs.listing.rooms[r.id];
    assert.equal(l.status, r.underMaintenance ? "maintenance" : occupied.has(r.id) ? "occupied" : "vacant", r.id);
  }
  const text = JSON.stringify(docs.listing);
  for (const r of state.residents.slice(0, 20)) assert.ok(!text.includes(r.phone) && !text.includes(r.fullName), "no tenant details in the listing");
});

test("every document lands under the hostel, except the public listing", () => {
  const paths = documentsOf(docs).map(([p]) => p);
  assert.equal(new Set(paths).size, paths.length, "no duplicate paths");
  for (const p of paths) assert.ok(p === "hostels/mowarid" || p.startsWith("hostels/mowarid/") || p === "listings/mowarid", p);
});
