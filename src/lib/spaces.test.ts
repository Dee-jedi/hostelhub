import assert from "node:assert/strict";
import { test } from "node:test";
import type { RoomType } from "./model";
import { bedOf, bookableSpaces, listingRoomEntry, roomOfSpace, spaceIdsOf, spaceLabel } from "./spaces";
import { createDemoState } from "./seed";
import type { HostelState, Resident } from "./types";
import { availableRooms, freeSpaces, isBookable, occupantsByRoom, rentFor } from "./utils";

const twoPerRoom: RoomType = { id: "std", name: "2-person room", capacity: 2, pricingMode: "per_room", price: 350_000 };
const fourPerBed: RoomType = { id: "bed4", name: "4-person, per bed", capacity: 4, pricingMode: "per_bed", price: 150_000 };
const room = { id: "B7", label: "B7", number: 7, maintenance: null };

test("a per-room room is one space; a per-bed room has one per bed", () => {
  assert.deepEqual(spaceIdsOf("B7", twoPerRoom), ["B7"]);
  assert.deepEqual(spaceIdsOf("B7", fourPerBed), ["B7-A", "B7-B", "B7-C", "B7-D"]);
  assert.deepEqual(spaceIdsOf("B7", { ...fourPerBed, capacity: 3 }), ["B7-A", "B7-B", "B7-C"]);
});

test("bed letters and labels", () => {
  assert.equal(bedOf("B7-C", "B7"), "C");
  assert.equal(bedOf("B7", "B7"), null);
  assert.equal(roomOfSpace("B7-C"), "B7");
  assert.equal(roomOfSpace("H15"), "H15");
  assert.equal(spaceLabel("B7", "B7-C"), "Room B7, bed C");
  assert.equal(spaceLabel("B7", "B7"), "Room B7");
});

test("listing entry: per-bed rooms stay bookable until every bed is taken", () => {
  const half = listingRoomEntry(room, "B", fourPerBed, new Set(["B7-A", "B7-B"]));
  assert.equal(half.status, "vacant");
  assert.deepEqual(half.beds, { A: "occupied", B: "occupied", C: "vacant", D: "vacant" });
  assert.equal(listingRoomEntry(room, "B", fourPerBed, new Set(["B7-A", "B7-B", "B7-C", "B7-D"])).status, "occupied");
  assert.equal(listingRoomEntry(room, "B", twoPerRoom, new Set(["B7"])).status, "occupied");
  assert.equal(listingRoomEntry(room, "B", twoPerRoom, new Set()).beds, undefined);
  assert.equal(listingRoomEntry({ ...room, maintenance: { note: "Leak" } }, "B", fourPerBed, new Set()).status, "maintenance");
});

test("holds are per space: someone paying for one bed doesn't block the others", () => {
  const entry = listingRoomEntry(room, "B", fourPerBed, new Set(["B7-A"]));
  const now = 1_000;
  const holds = { "B7-B": { until: now + 60_000, bookingId: "x", uid: "other" }, "B7-C": { until: now - 1, bookingId: "y", uid: "old" } };
  assert.deepEqual(bookableSpaces("B7", entry, holds, now), ["B7-C", "B7-D"], "B held by someone, C's hold expired");
  assert.deepEqual(bookableSpaces("B7", entry, holds, now, "other"), ["B7-B", "B7-C", "B7-D"], "your own hold doesn't block you");
  const full = listingRoomEntry(room, "B", fourPerBed, new Set(["B7-A", "B7-C", "B7-D"]));
  assert.equal(isBookable({ rooms: { B7: full }, holds }, "B7", now), false, "the only free bed is held");
  assert.equal(isBookable({ rooms: { B7: full }, holds }, "B7", now, "other"), true);
});

test("a per-room hold still blocks the whole room (existing listings unchanged)", () => {
  const entry = listingRoomEntry(room, "B", twoPerRoom, new Set());
  const holds = { B7: { until: 2_000, bookingId: "x", uid: "other" } };
  assert.equal(isBookable({ rooms: { B7: entry }, holds }, "B7", 1_000), false);
  assert.equal(isBookable({ rooms: { B7: entry }, holds }, "B7", 3_000), true);
});

test("screen helpers count beds for per-bed rooms and rooms for per-room ones", () => {
  const base = createDemoState();
  const r = (id: string, roomId: string, spaceId: string): Resident => ({ ...base.residents[0], id, roomId, spaceId, status: "active" });
  const state: HostelState = {
    ...base,
    roomTypes: [twoPerRoom, fourPerBed],
    rentalModel: "per_bed",
    rooms: [
      { id: "A1", block: "A", number: 1, typeId: "bed4", underMaintenance: false },
      { id: "A2", block: "A", number: 2, typeId: "bed4", underMaintenance: false },
      { id: "A3", block: "A", number: 3, typeId: "bed4", underMaintenance: true },
    ],
    residents: [r("p1", "A1", "A1-A"), r("p2", "A1", "A1-B"), r("p3", "A2", "A2-A"), r("p4", "A2", "A2-B"), r("p5", "A2", "A2-C"), r("p6", "A2", "A2-D")],
  };
  assert.equal(occupantsByRoom(state).get("A1")?.length, 2);
  assert.deepEqual(freeSpaces(state, state.rooms[0]), ["A1-C", "A1-D"]);
  assert.deepEqual(freeSpaces(state, state.rooms[1]), []);
  assert.deepEqual(freeSpaces(state, state.rooms[2]), [], "maintenance");
  assert.deepEqual(availableRooms(state).map((x) => x.id), ["A1"]);
  assert.equal(rentFor(state, state.residents[0]), 150_000);
});
