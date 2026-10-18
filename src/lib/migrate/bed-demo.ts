/*
 * A second demo hostel that rents by the bed, so managers can see both models side by side.
 * "Unity Hostel": blocks A–B have 4-person rooms, C 3-person, D 2-person, each bed priced on
 * its own. The people come from the Mowarid demo (same names, new ids and emails), placed in
 * about four of every five beds. Pure, like fromLegacy: returns documents, writes nothing.
 */
import type { Hostel, HostelPayment, HostelResident, HostelRoom, Listing, RoomType, Tenancy } from "../model";
import { createDemoState } from "../seed";
import { listingRoomEntry, spaceIdsOf } from "../spaces";
import { omit, type HostelDocs } from "./from-legacy";

const TYPES: RoomType[] = [
  { id: "bed4", name: "4-person room", capacity: 4, pricingMode: "per_bed", price: 150_000 },
  { id: "bed3", name: "3-person room", capacity: 3, pricingMode: "per_bed", price: 180_000 },
  { id: "bed2", name: "2-person room", capacity: 2, pricingMode: "per_bed", price: 220_000 },
];
const BLOCKS: { name: string; typeId: string }[] = [
  { name: "A", typeId: "bed4" },
  { name: "B", typeId: "bed4" },
  { name: "C", typeId: "bed3" },
  { name: "D", typeId: "bed2" },
];
const ROOMS_PER_BLOCK = 10;

export function createBedDemo(hostelId: string, now = new Date().toISOString()): HostelDocs {
  const hostel: Hostel = {
    id: hostelId,
    name: "Unity Hostel",
    address: "12 Stadium Road, by the School Gate",
    manager: { name: "Mr. Okonkwo", phone: "08051234567" },
    bank: { bankName: "Access Bank", accountName: "Unity Hostel Ventures", accountNumber: "0987654321" },
    whatsappGroupLink: "https://chat.whatsapp.com/your-group-invite",
    currency: "NGN",
    timezone: "Africa/Lagos",
    status: "live",
    rentalModel: "per_bed",
    defaultTypeId: "bed4",
    reminderDays: [30, 14, 7, 1],
    defaultPeriodId: "rolling",
    createdAt: now,
  };

  const rooms: HostelRoom[] = BLOCKS.flatMap((b) =>
    Array.from({ length: ROOMS_PER_BLOCK }, (_, i) => ({ id: `${b.name}${i + 1}`, label: `${b.name}${i + 1}`, blockId: b.name, number: i + 1, typeId: b.typeId, maintenance: null })),
  );
  rooms[13].maintenance = { note: "Bunk being replaced" };
  const typeById = new Map(TYPES.map((t) => [t.id, t]));

  // Reuse the Mowarid demo's people, with ids and emails of their own
  const people = createDemoState().residents.filter((r) => r.status === "active");
  const residents: HostelResident[] = [];
  const tenancies: Tenancy[] = [];
  const payments: HostelPayment[] = [];
  const occupied = new Map<string, Set<string>>();
  let n = 0;
  let seq = 2000;
  let slot = 0;
  for (const room of rooms) {
    // The last room of each block stays empty, so the demo shows wholly free rooms too
    if (room.maintenance || room.number === ROOMS_PER_BLOCK) continue;
    const type = typeById.get(room.typeId)!;
    for (const spaceId of spaceIdsOf(room.id, type)) {
      slot++;
      if (slot % 5 === 0 || n >= people.length) continue; // about one bed in five is free
      const p = people[n++];
      const id = `u_${n}`;
      const email = p.email.replace("@", `.unity@`);
      residents.push({ ...omit(p, ["roomId", "spaceId", "status", "checkInDate", "leaseStart", "leaseEnd", "movedOutDate"]), id, uid: id, email, occupants: [] });
      const t: Tenancy = {
        id: `t_${id}`, residentId: id, uid: id, roomId: room.id, spaceId, periodId: "rolling", status: "active",
        checkInDate: p.checkInDate, leaseStart: p.leaseStart, leaseEnd: p.leaseEnd, occupants: [], createdAt: p.createdAt,
      };
      tenancies.push(t);
      payments.push({
        id: `pay_${id}`, receiptNo: `RCP-${++seq}`, residentId: id, roomId: room.id, amount: type.price, method: n % 3 === 0 ? "Cash" : n % 3 === 1 ? "Transfer" : "Online",
        reference: "", date: p.leaseStart, periodStart: p.leaseStart, periodEnd: p.leaseEnd, uid: id, tenancyId: t.id,
      });
      occupied.set(room.id, new Set([...(occupied.get(room.id) ?? []), spaceId]));
    }
  }
  const listing: Listing = {
    info: {
      hostelName: hostel.name,
      address: hostel.address,
      managerName: hostel.manager.name,
      managerPhone: hostel.manager.phone,
      whatsappGroupLink: hostel.whatsappGroupLink,
      blocks: BLOCKS.map((b) => b.name),
      roomTypes: [...TYPES].sort((a, b) => a.capacity - b.capacity),
      rentAmount: Math.min(...TYPES.map((t) => t.price)),
      leaseMonths: 12,
      maxOccupants: 4,
    },
    rooms: Object.fromEntries(rooms.map((r) => [r.id, listingRoomEntry(r, r.blockId, typeById.get(r.typeId)!, occupied.get(r.id) ?? new Set())])),
    holds: {},
  };

  return {
    hostel,
    blocks: BLOCKS.map((b, order) => ({ id: b.name, name: b.name, order })),
    roomTypes: TYPES,
    rooms,
    rentPeriods: [{ id: "rolling", kind: "rolling", name: "12 months from move-in", months: 12 }],
    residents,
    tenancies,
    payments,
    messages: [],
    requests: [],
    bookings: [],
    renewals: [],
    counters: { receipts: { seq }, reminders: { sentKeys: [] } },
    listing,
    tenantUids: residents.map((r) => r.uid!),
  };
}

/** Logins for the bed demo's tenants (same password as the other demo). */
export function bedDemoLogins(docs: HostelDocs) {
  return docs.residents.map((r) => ({ uid: r.uid!, email: r.email, displayName: r.fullName }));
}
