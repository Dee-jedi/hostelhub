import { randomBytes } from "node:crypto";
import { FieldValue, type DocumentReference, type Transaction } from "firebase-admin/firestore";
import type { Hostel, HostelRoom, Listing, RentPeriod, RoomType, Tenancy } from "../model";
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

/**
 * Checks a room can take someone now, reading the room, its occupancy and the public listing
 * (for checkout holds). `exceptResidentId` lets a tenant "move" into the room they're in;
 * `holdOwnerUid` lets a booking's own hold through.
 */
export async function assertRoomFree(tx: Transaction, h: string, roomId: string, opts: { exceptResidentId?: string; holdOwnerUid?: string } = {}) {
  const r = hostelRefs(h);
  const [roomSnap, listingSnap] = await tx.getAll(r.doc("rooms", roomId), r.listing);
  if (!roomSnap.exists) throw new CommandError(`Room ${roomId} doesn't exist.`, 404);
  const room = { ...(roomSnap.data() as HostelRoom), id: roomSnap.id };
  if (room.maintenance) throw new CommandError(`Room ${roomId} is under maintenance.`, 409);
  const tenant = await activeTenancyIn(tx, h, roomId);
  if (tenant && tenant.residentId !== opts.exceptResidentId) throw new CommandError(`Room ${roomId} is already occupied.`, 409);
  const hold = (listingSnap.data() as Listing | undefined)?.holds?.[roomId];
  if (hold && hold.until > Date.now() && hold.uid !== opts.holdOwnerUid) throw new CommandError(`Someone is paying for room ${roomId} right now.`, 409);
  return room;
}

/** Listing fields for a room's public status. */
export function listingStatus(roomId: string, status: Listing["rooms"][string]["status"], note?: string) {
  return {
    [`rooms.${roomId}.status`]: status,
    [`rooms.${roomId}.note`]: note ?? FieldValue.delete(),
  };
}

/** The hostel a public request (booking page, Paystack callback) is for, from its address. */
export function hostelOfRequest(req: Request): string | null {
  const host = resolveHost(requestHost(req));
  return host.kind === "hostel" ? host.slug : null;
}
