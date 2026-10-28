/*
 * Turns the single-hostel data (root collections: config/settings, residents, payments…)
 * into one hostel in the multi-hostel model (src/lib/model.ts). Pure: no database access, so
 * the migration script, the demo seed and the unit tests all share it.
 *
 * Mowarid must look exactly the same afterwards, so: one room type ("Standard", per room, the
 * hostel's max occupants, its rent), one rolling rent period of the hostel's lease length, room
 * ids unchanged, and one tenancy per resident carrying their current lease dates.
 */
import type {
  Block,
  Hostel,
  HostelBooking,
  HostelMessage,
  HostelPayment,
  HostelRequest,
  HostelResident,
  HostelRoom,
  Listing,
  RentPeriod,
  RoomCapacity,
  RoomType,
  Tenancy,
} from "../model";
import type { HostelState, Resident } from "../types";
import { tenantsByRoom } from "../utils";

export interface LegacyInput {
  hostelId: string;
  /** Rooms with `underMaintenance` already applied (from public/booking), as the staff app sees them */
  state: HostelState;
  receiptSeq: number;
  /** Checkout records for portal renewals (root `renewals` collection), kept as they are */
  renewals?: Record<string, unknown>[];
  /** Which resident ids are also logins (the booking flow and demo seed use the login uid as the id) */
  loginUids: Set<string>;
  now?: string;
}

export interface HostelDocs {
  hostel: Hostel;
  blocks: Block[];
  roomTypes: RoomType[];
  rooms: HostelRoom[];
  rentPeriods: RentPeriod[];
  residents: HostelResident[];
  tenancies: Tenancy[];
  payments: HostelPayment[];
  messages: HostelMessage[];
  requests: HostelRequest[];
  bookings: HostelBooking[];
  renewals: Record<string, unknown>[];
  counters: { receipts: { seq: number }; reminders: { sentKeys: string[] } };
  listing: Listing;
  /** Logins that should be marked as tenants of this hostel */
  tenantUids: string[];
}

/** A copy of `obj` without `keys`. */
export function omit<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Omit<T, K> {
  const copy = { ...obj };
  for (const k of keys) delete copy[k];
  return copy;
}

export const DEFAULT_TYPE_ID = "standard";
export const DEFAULT_PERIOD_ID = "rolling";

const clampCapacity = (n: number): RoomCapacity => (Math.min(8, Math.max(1, Math.round(n))) as RoomCapacity);

export function tenancyIdFor(residentId: string) {
  return `t_${residentId}`;
}

export function fromLegacy(input: LegacyInput): HostelDocs {
  const { state, hostelId } = input;
  const s = state.settings;
  const now = input.now ?? new Date().toISOString();
  const uidOf = (residentId: string | null | undefined) => (residentId && input.loginUids.has(residentId) ? residentId : null);

  const hostel: Hostel = {
    id: hostelId,
    name: s.hostelName,
    address: s.address,
    manager: { name: s.managerName, phone: s.managerPhone },
    bank: { bankName: s.bankName, accountName: s.accountName, accountNumber: s.accountNumber },
    whatsappGroupLink: s.whatsappGroupLink,
    currency: "NGN",
    timezone: "Africa/Lagos",
    status: "live",
    rentalModel: "per_room",
    defaultTypeId: DEFAULT_TYPE_ID,
    reminderDays: s.reminderDays,
    defaultPeriodId: DEFAULT_PERIOD_ID,
    createdAt: now,
  };

  const blocks: Block[] = s.blocks.map((b, i) => ({ id: b.name, name: b.name, order: i }));
  const standard: RoomType = {
    id: DEFAULT_TYPE_ID,
    name: `Standard (${s.maxOccupants} ${s.maxOccupants === 1 ? "person" : "people"})`,
    capacity: clampCapacity(s.maxOccupants),
    pricingMode: "per_room",
    price: s.rentAmount,
  };
  const rentPeriods: RentPeriod[] = [{ id: DEFAULT_PERIOD_ID, kind: "rolling", name: `${s.leaseMonths} months from move-in`, months: s.leaseMonths }];

  const rooms: HostelRoom[] = state.rooms.map((r) => ({
    id: r.id,
    label: r.id,
    blockId: r.block,
    number: r.number,
    typeId: standard.id,
    maintenance: r.underMaintenance ? (r.note ? { note: r.note } : {}) : null,
  }));

  // Moved-out tenants no longer have a room; their last receipt says which one it was
  const lastRoom = new Map<string, string>();
  for (const p of [...state.payments].sort((a, b) => a.date.localeCompare(b.date))) if (p.roomId) lastRoom.set(p.residentId, p.roomId);

  const residents: HostelResident[] = [];
  const tenancies: Tenancy[] = [];
  const residentById = new Map<string, Resident>();
  for (const r of state.residents) {
    residentById.set(r.id, r);
    // The person's details exactly as they were; the stay's details move to the tenancy
    residents.push({
      ...omit(r, ["roomId", "status", "checkInDate", "leaseStart", "leaseEnd", "movedOutDate"]),
      // Co-occupants belong to the stay, so they live on the tenancy only
      occupants: [],
      uid: uidOf(r.id),
    });
    const roomId = r.status === "active" ? r.roomId : (r.roomId ?? lastRoom.get(r.id) ?? null);
    tenancies.push({
      id: tenancyIdFor(r.id),
      residentId: r.id,
      uid: uidOf(r.id),
      roomId,
      spaceId: roomId,
      periodId: DEFAULT_PERIOD_ID,
      status: r.status === "active" ? "active" : "ended",
      checkInDate: r.checkInDate,
      leaseStart: r.leaseStart,
      leaseEnd: r.leaseEnd,
      ...(r.movedOutDate ? { movedOutDate: r.movedOutDate } : {}),
      occupants: r.occupants ?? [],
      createdAt: r.createdAt,
    });
  }

  const payments: HostelPayment[] = state.payments.map((p) => ({
    ...p,
    uid: uidOf(p.residentId),
    tenancyId: residentById.has(p.residentId) ? tenancyIdFor(p.residentId) : null,
  }));
  const messages: HostelMessage[] = state.messages.map((m) => ({
    ...m,
    recipientUids: m.recipientIds.map((id) => uidOf(id)).filter((u): u is string => !!u),
  }));
  const requests: HostelRequest[] = state.tickets.map((t) => ({ ...t, uid: uidOf(t.residentId) }));
  const bookings: HostelBooking[] = state.bookings.map((b) => ({ ...b, spaceId: b.roomId }));

  const tenants = tenantsByRoom(state);
  const listing: Listing = {
    info: {
      hostelName: s.hostelName,
      address: s.address,
      managerName: s.managerName,
      managerPhone: s.managerPhone,
      whatsappGroupLink: s.whatsappGroupLink,
      blocks: s.blocks.map((b) => b.name),
      roomTypes: [{ id: standard.id, name: standard.name, capacity: standard.capacity, pricingMode: standard.pricingMode, price: standard.price }],
      rentAmount: s.rentAmount,
      leaseMonths: s.leaseMonths,
      maxOccupants: s.maxOccupants,
    },
    rooms: Object.fromEntries(
      state.rooms.map((r) => [
        r.id,
        {
          block: r.block,
          number: r.number,
          label: r.id,
          typeId: standard.id,
          status: r.underMaintenance ? "maintenance" : tenants.has(r.id) ? "occupied" : "vacant",
          ...(r.underMaintenance && r.note ? { note: r.note } : {}),
        },
      ]),
    ),
    holds: {},
  };

  const tenantUids = [...new Set(state.residents.filter((r) => r.status === "active").map((r) => uidOf(r.id)).filter((u): u is string => !!u))];

  return {
    hostel,
    blocks,
    roomTypes: [standard],
    rooms,
    rentPeriods,
    residents,
    tenancies,
    payments,
    messages,
    requests,
    bookings,
    renewals: input.renewals ?? [],
    counters: { receipts: { seq: input.receiptSeq }, reminders: { sentKeys: state.sentReminderKeys ?? [] } },
    listing,
    tenantUids,
  };
}

/** Every document to write, as [path, data] pairs, for a bulk writer. */
export function documentsOf(d: HostelDocs): [string, object][] {
  const h = `hostels/${d.hostel.id}`;
  const each = <T extends { id: string }>(coll: string, items: T[]) => items.map((x): [string, object] => [`${h}/${coll}/${x.id}`, x]);
  return [
    [h, d.hostel],
    ...each("blocks", d.blocks),
    ...each("roomTypes", d.roomTypes),
    ...each("rooms", d.rooms),
    ...each("rentPeriods", d.rentPeriods),
    ...each("residents", d.residents),
    ...each("tenancies", d.tenancies),
    ...each("payments", d.payments),
    ...each("messages", d.messages),
    ...each("requests", d.requests),
    ...each("bookings", d.bookings),
    ...d.renewals.map((r): [string, object] => [`${h}/renewals/${String(r.id)}`, r]),
    [`${h}/counters/receipts`, d.counters.receipts],
    [`${h}/counters/reminders`, d.counters.reminders],
    [`listings/${d.hostel.id}`, d.listing],
  ];
}
