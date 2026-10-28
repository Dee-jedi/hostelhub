import { randomBytes } from "node:crypto";
import type { DocumentReference, Transaction } from "firebase-admin/firestore";
import { stayOptionOf } from "../checkout";
import type { Block, Hostel, HostelRoom, Listing, RentPeriod, RoomType, Tenancy } from "../model";
import { monthsBetween } from "../room-setup";
import { listingRoomEntry, spaceIdsOf } from "../spaces";
import { DEFAULT_TYPE_ID } from "../migrate/from-legacy";
import { requestHost, resolveHost } from "../hostel-host";
import { adminDb } from "./admin";
import { CommandError } from "./command";

/*
 * Server-side access to one hostel's data in the multi-hostel model. Commands, the booking
 * flow and renewals all use these, so paths, receipt numbering and the room-availability
 * rule exist in one place.
 */

export function hostelRefs(h: string) {
  const base = `hostels/${h}`;
  return {
    hostel: adminDb.doc(base),
    col: (name: string) => adminDb.collection(`${base}/${name}`),
    doc: (name: string, id: string) => adminDb.doc(`${base}/${name}/${id}`),
    listing: adminDb.doc(`listings/${h}`),
    receipts: adminDb.doc(`${base}/counters/receipts`),
    reminders: adminDb.doc(`${base}/counters/reminders`),
  };
}

export const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

/**
 * Receipt numbers. Read inside the transaction before any write (Firestore requires reads
 * first); `claim()` then writes the new counter. The counter is only ever changed this way,
 * so two receipts can never share a number.
 */
export async function readReceiptCounter(tx: Transaction, h: string) {
  const ref = hostelRefs(h).receipts;
  const seq = (((await tx.get(ref)).data()?.seq as number | undefined) ?? 1000) + 1;
  return {
    receiptNo: `RCP-${seq}`,
    claim: () => void tx.set(ref, { seq }, { merge: true }),
  };
}

export async function getOrThrow<T>(tx: Transaction, ref: DocumentReference, missing: string): Promise<T> {
  const snap = await tx.get(ref);
  if (!snap.exists) throw new CommandError(missing, 404);
  return { ...(snap.data() as T), id: snap.id };
}

/** The hostel's terms for a room: its room type (price, size) and the default rent period. */
export async function readTerms(tx: Transaction, h: string, room: Pick<HostelRoom, "typeId"> | null) {
  const r = hostelRefs(h);
  const hostel = (await tx.get(r.hostel)).data() as Hostel | undefined;
  if (!hostel) throw new CommandError("This hostel isn't set up yet.", 404);
  const [typeSnap, periodSnap] = await tx.getAll(r.doc("roomTypes", room?.typeId ?? DEFAULT_TYPE_ID), r.doc("rentPeriods", hostel.defaultPeriodId));
  const type = typeSnap.data() as RoomType | undefined;
  const period = periodSnap.data() as RentPeriod | undefined;
  if (!type || !period) throw new CommandError("This hostel's rent settings are incomplete.", 409);
  const months = period.kind === "rolling" ? period.months : 12;
  return { hostel, type, period, months };
}

/** The active tenancy in a room, if any (per-room spaces: at most one). */
export async function activeTenancyIn(tx: Transaction, h: string, roomId: string) {
  const q = hostelRefs(h).col("tenancies").where("roomId", "==", roomId).where("status", "==", "active").limit(1);
  const snap = await tx.get(q);
  return snap.empty ? null : ({ ...(snap.docs[0].data() as Tenancy), id: snap.docs[0].id } as Tenancy);
}

/** The tenancy describing a resident now: the active one, else the most recent. */
export async function currentTenancyOf(tx: Transaction, h: string, residentId: string) {
  const snap = await tx.get(hostelRefs(h).col("tenancies").where("residentId", "==", residentId));
  const all = snap.docs.map((d) => ({ ...(d.data() as Tenancy), id: d.id }));
  return all.find((t) => t.status === "active") ?? all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

/** A room, its type, and the spaces taken by active tenancies. Reads only. */
export async function readOccupancy(tx: Transaction, h: string, roomId: string) {
  const r = hostelRefs(h);
  const roomSnap = await tx.get(r.doc("rooms", roomId));
  if (!roomSnap.exists) throw new CommandError(`Room ${roomId} doesn't exist.`, 404);
  const room = { ...(roomSnap.data() as HostelRoom), id: roomSnap.id };
  const type = (await tx.get(r.doc("roomTypes", room.typeId))).data() as RoomType | undefined;
  if (!type) throw new CommandError(`Room ${roomId} has no room type.`, 409);
  const stays = (await tx.get(r.col("tenancies").where("roomId", "==", roomId).where("status", "==", "active"))).docs.map((d) => ({ ...(d.data() as Tenancy), id: d.id }));
  const occupied = new Set(type.pricingMode === "per_room" ? (stays.length ? [roomId] : []) : stays.map((t) => t.spaceId).filter((x): x is string => !!x));
  return { room, type, stays, occupied };
}

/**
 * Finds a free space in a room for someone and returns it (reads only): the whole room for a
 * per-room type, otherwise the first free bed (or `preferSpaceId` if that bed is free).
 * `exceptResidentId`: a tenant already in this room doesn't block it. `holdOwnerUid`: that
 * login's own checkout hold doesn't block them.
 */
export async function claimSpace(tx: Transaction, h: string, roomId: string, opts: { exceptResidentId?: string; holdOwnerUid?: string; preferSpaceId?: string | null } = {}) {
  const occ = await readOccupancy(tx, h, roomId);
  const listing = (await tx.get(hostelRefs(h).listing)).data() as Listing | undefined;
  if (occ.room.maintenance) throw new CommandError(`Room ${roomId} is under maintenance.`, 409);
  const mine = opts.exceptResidentId ? occ.stays.find((t) => t.residentId === opts.exceptResidentId)?.spaceId : undefined;
  const now = Date.now();
  const free = spaceIdsOf(roomId, occ.type).filter((s) => {
    if (occ.occupied.has(s) && s !== mine) return false;
    const hold = listing?.holds?.[s];
    return !hold || hold.until <= now || hold.uid === opts.holdOwnerUid;
  });
  if (!free.length) {
    const held = spaceIdsOf(roomId, occ.type).some((s) => !occ.occupied.has(s));
    throw new CommandError(held ? `Someone is paying for room ${roomId} right now.` : `Room ${roomId} is already ${occ.type.pricingMode === "per_bed" ? "full" : "occupied"}.`, 409);
  }
  const spaceId = opts.preferSpaceId && free.includes(opts.preferSpaceId) ? opts.preferSpaceId : free[0];
  return { ...occ, spaceId };
}

/** The listing update for a room after a change, given which of its spaces end up taken. */
/**
 * The booking page's summary of a hostel: details, room classes and prices, the stays students
 * can pick, extra charges, block names and who may stay, and whether the service fee applies.
 */
export function listingInfoFor(hostel: Hostel, types: RoomType[], periods: RentPeriod[], blocks: Block[]): Listing["info"] {
  const sortedTypes = [...types].sort((a, b) => a.capacity - b.capacity || a.price - b.price);
  const sortedBlocks = [...blocks].sort((a, b) => a.order - b.order);
  const online = [...periods].filter((p) => p.online !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const usual = periods.find((p) => p.id === hostel.defaultPeriodId);
  const leaseMonths = !usual ? 12 : usual.kind === "rolling" ? usual.months : Math.round(monthsBetween(usual.start, usual.end));
  return {
    hostelName: hostel.name,
    address: hostel.address,
    managerName: hostel.manager.name,
    managerPhone: hostel.manager.phone,
    whatsappGroupLink: hostel.whatsappGroupLink,
    blocks: sortedBlocks.map((b) => b.id),
    blockNames: Object.fromEntries(sortedBlocks.map((b) => [b.id, b.name])),
    blockWho: Object.fromEntries(sortedBlocks.map((b) => [b.id, b.who ?? "any"])),
    roomTypes: sortedTypes.map((t) => ({ id: t.id, name: t.name, capacity: t.capacity, pricingMode: t.pricingMode, price: t.price, ...(t.prices ? { prices: t.prices } : {}), ...(t.features ? { features: t.features } : {}) })),
    rentAmount: sortedTypes.length ? Math.min(...sortedTypes.map((t) => t.price)) : 0,
    leaseMonths,
    maxOccupants: sortedTypes.length ? Math.max(...sortedTypes.map((t) => t.capacity)) : 1,
    options: online.map(stayOptionOf),
    defaultOptionId: online.some((p) => p.id === hostel.defaultPeriodId) ? hostel.defaultPeriodId : online[0]?.id,
    charges: (hostel.charges ?? []).map((c) => ({ name: c.name, amount: c.amount, when: c.when, refundable: c.refundable })),
    serviceFee: !!hostel.payout,
  };
}

/** A whole listing for a hostel nobody lives in yet (sign-up): every room free, no holds. */
export function freshListing(hostel: Hostel, types: RoomType[], periods: RentPeriod[], blocks: Block[], rooms: HostelRoom[]): Listing {
  const byId = new Map(types.map((t) => [t.id, t]));
  return {
    info: listingInfoFor(hostel, types, periods, blocks),
    rooms: Object.fromEntries(rooms.map((room) => [room.id, listingRoomEntry(room, room.blockId, byId.get(room.typeId)!, new Set())])),
    holds: {},
  };
}

export function listingUpdate(room: HostelRoom, type: RoomType, occupied: Set<string>) {
  return { [`rooms.${room.id}`]: listingRoomEntry(room, room.blockId, type, occupied) };
}

export const plus = (set: Set<string>, id: string) => new Set([...set, id]);
export const minus = (set: Set<string>, id: string | null | undefined) => new Set([...set].filter((x) => x !== id));

/** The hostel a public request (booking page, Paystack callback) is for, from its address. */
export function hostelOfRequest(req: Request): string | null {
  const host = resolveHost(requestHost(req));
  return host.kind === "hostel" ? host.slug : null;
}
