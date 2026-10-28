import assert from "node:assert/strict";
import { test } from "node:test";
import { checkoutTotal, serviceFee } from "./fees";
import { defaultOptions, defaultPrefix, monthsBetween, regenerateRooms, roomIdFor, setupProblem, setupToDocs, summarize, type RoomsSetup } from "./room-setup";
import { roomOfSpace } from "./spaces";

test("the service fee is 2%, at least ₦2,500, and skips refundable deposits", () => {
  assert.equal(serviceFee(350_000), 7_000);
  assert.equal(serviceFee(100_000), 2_500, "2% would be ₦2,000, so the minimum applies");
  assert.equal(serviceFee(0), 0);
  const t = checkoutTotal([
    { label: "Rent", amount: 350_000 },
    { label: "Utility", amount: 25_000 },
    { label: "Caution deposit", amount: 20_000, refundable: true },
  ]);
  assert.deepEqual(t, { toHostel: 395_000, fee: 7_500, total: 402_500 });
});

test("session length in months, and the suggested session follows the calendar", () => {
  assert.equal(monthsBetween("2026-10-01", "2027-07-31"), 10);
  assert.equal(monthsBetween("2026-10-01", "2027-06-15"), 8.5);
  assert.equal(monthsBetween("2027-01-01", "2026-12-01"), 0, "an end before the start is no length");
  assert.equal(defaultOptions(new Date("2026-10-28")).at(0)!.start, "2026-10-01");
  assert.equal(defaultOptions(new Date("2027-03-10")).at(0)!.start, "2026-10-01", "mid-session: the one running");
  assert.equal(defaultOptions(new Date("2027-07-20")).at(0)!.start, "2027-10-01", "after it ends: the next one");
});

test("room names from a block's name, and ids that can't be mistaken for beds", () => {
  assert.equal(defaultPrefix("Block A"), "A");
  assert.equal(defaultPrefix("Ruby"), "Ruby ");
  assert.equal(defaultPrefix("B"), "B");
  const taken = new Set<string>();
  assert.equal(roomIdFor("Ruby 1", taken), "Ruby1");
  assert.equal(roomIdFor("Room-A", taken), "RoomA");
  assert.equal(roomOfSpace(`${roomIdFor("A-12", taken)}-C`), "A12");
  assert.equal(roomIdFor("ruby-1", taken), "ruby1x2", "same letters, different case: still unique");
  const block = { key: "b", name: "Ruby", who: "any" as const, classKey: "two", prefix: "Ruby ", start: 1, rooms: [] };
  assert.deepEqual(regenerateRooms(block, 3, "two").map((r) => r.label), ["Ruby 1", "Ruby 2", "Ruby 3"]);
  assert.deepEqual(regenerateRooms({ ...block, prefix: "", start: 101 }, 2, "two").map((r) => r.label), ["101", "102"]);
});

const setup: RoomsSetup = {
  classes: [
    { key: "two", name: "2 in a room", capacity: 2, pricing: "per_bed", features: [], prices: { session: 350_000, year: 420_000 } },
    { key: "self", name: "Self-contained", capacity: 1, pricing: "per_room", features: ["own_toilet"], prices: { session: 900_000, year: 1_000_000 } },
  ],
  options: [
    { key: "session", name: "Per session", kind: "session", start: "2026-10-01", end: "2027-07-31", online: true },
    { key: "year", name: "Per year", kind: "rolling", months: 12, online: false },
  ],
  defaultOptionKey: "session",
  blocks: [
    { key: "ruby", name: "Ruby", who: "female", classKey: "two", prefix: "Ruby ", start: 1, rooms: [{ label: "Ruby 1", classKey: "two" }, { label: "Ruby 2", classKey: "two" }] },
    { key: "annex", name: "Annex", who: "any", classKey: "mixed", prefix: "", start: 101, rooms: [{ label: "101", classKey: "self" }, { label: "102", classKey: "two" }] },
  ],
  charges: [{ key: "c1", name: "Caution deposit", amount: 20_000, when: "once", refundable: true }],
};

test("a complete setup passes; the checks name what's missing", () => {
  assert.equal(setupProblem(setup), null);
  assert.match(setupProblem({ ...setup, classes: [] })!, /at least one kind of room/);
  assert.match(setupProblem({ ...setup, classes: [{ ...setup.classes[0], prices: { session: 350_000 } }, setup.classes[1]] })!, /price of "2 in a room" per year/);
  const dupe = { ...setup.blocks[1], rooms: [{ label: "ruby 1", classKey: "self" }] };
  assert.match(setupProblem({ ...setup, blocks: [setup.blocks[0], dupe] })!, /Two rooms are called/);
  assert.match(setupProblem({ ...setup, options: setup.options.map((o) => ({ ...o, online: false })) })!, /at least one way of paying online/);
});

test("totals: bed spaces in per-bed rooms, whole rooms otherwise", () => {
  // Ruby: 2 rooms × 2 beds; Annex: 1 self-con + 1 two-bed room
  assert.deepEqual(summarize(setup), { rooms: 4, spaces: 7, people: 7, fullRent: 6 * 350_000 + 900_000 });
});

test("the setup becomes documents with stable ids", () => {
  const docs = setupToDocs(setup);
  assert.deepEqual(docs.rooms.map((r) => [r.id, r.label]), [["Ruby1", "Ruby 1"], ["Ruby2", "Ruby 2"], ["101", "101"], ["102", "102"]]);
  const two = docs.types.find((t) => t.name === "2 in a room")!;
  assert.equal(two.price, 350_000, "the default option's price");
  assert.deepEqual(two.prices, { "p_per-session": 350_000, "p_per-year": 420_000 });
  assert.equal(docs.defaultPeriodId, "p_per-session");
  assert.equal(docs.blocks[0].who, "female");
  assert.equal(docs.blocks[0].defaultTypeId, two.id);
  assert.equal(docs.blocks[1].defaultTypeId, undefined, "a mixed block has no default class");
  assert.equal(docs.periods.find((p) => p.id === "p_per-year")!.online, false);
  assert.equal(docs.charges[0].refundable, true);
});
