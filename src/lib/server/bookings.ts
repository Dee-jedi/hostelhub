import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import type { HostelBooking, HostelMessage, HostelPayment, HostelResident, HostelRoom, Listing, Tenancy } from "../model";
import type { StudentInfo } from "../types";
import { bedOf, bookableSpaces, spaceIdsOf } from "../spaces";
import { addMonths, todayISO, toStudentInfo } from "../utils";
import { adminDb } from "./admin";
import { setTenantOf } from "./claims";
import { hostelRefs, listingUpdate, newId, plus, readOccupancy, readReceiptCounter, readTerms } from "./hostel-data";
import { initializeTransaction, verifyTransaction } from "./paystack";

/** How long a room stays reserved for someone at checkout. */
export const HOLD_MINUTES = 15;
/** A bank transfer or USSD payment Paystack still reports as in progress after this is treated as abandoned. */
const PROCESSING_MINUTES = 60;
/** Paystack statuses that mean the money may still arrive. */
const IN_PROGRESS = new Set(["ongoing", "pending", "processing", "queued"]);

/** An error whose message is safe to show the student. */
export class BookingError extends Error {}

function newReference() {
  return `HH-${Date.now().toString(36).toUpperCase()}${randomBytes(2).toString("hex").toUpperCase()}`;
}

export function validateBookingInfo(info: StudentInfo): string | null {
  if (!info || typeof info !== "object") return "Missing form details.";
  if ((info.fullName ?? "").trim().split(/\s+/).length < 2) return "Enter your full name.";
  if (!/^\+?\d{10,14}$/.test((info.phone ?? "").replace(/[\s-]/g, ""))) return "Enter a valid phone number.";
  if (info.isStudent !== false && !(info.matricNo ?? "").trim()) return "Enter your matric number.";
  if (!(info.nextOfKinName ?? "").trim()) return "Next of kin name is required.";
  if ((info.occupants ?? []).length > 5) return "Too many occupants.";
  return null;
}

/** The person's details for the resident record; co-occupants go on the tenancy. */
function person(info: StudentInfo) {
  return { ...toStudentInfo(info), occupants: [] };
}

/**
 * Reserves the room for HOLD_MINUTES, records a pending booking and opens a Paystack
 * transaction for it. Returns the access code the browser uses to show the payment popup.
 */
export async function startBooking(input: { hostelId: string; uid: string; email: string; info: StudentInfo; roomId: string; agent?: string; origin: string }) {
  const h = input.hostelId;
  const r = hostelRefs(h);
  await refuseIfAlreadyPaying(h, input.uid);
  const reference = newReference();
  const now = Date.now();
  let amount = 0;
  let chosenSpace = input.roomId;

  await adminDb.runTransaction(async (tx) => {
    const [listingSnap, roomSnap] = await tx.getAll(r.listing, r.doc("rooms", input.roomId));
    if (!listingSnap.exists) throw new BookingError("Bookings are not open yet. Please contact the hostel.");
    const already = await tx.get(r.col("tenancies").where("uid", "==", input.uid).where("status", "==", "active").limit(1));
    const room = roomSnap.data() as HostelRoom | undefined;
    const { type } = await readTerms(tx, h, room ?? null);
    if (!already.empty) throw new BookingError("You already have a room. Log in to your portal instead.");

    const listing = listingSnap.data() as Listing;
    // The whole room, or the first free bed nobody else is paying for (students pick rooms, not beds)
    const spaceId = room ? bookableSpaces(input.roomId, listing.rooms[input.roomId], listing.holds, now, input.uid)[0] : undefined;
    if (!room || !spaceId) throw new BookingError(`Room ${input.roomId} was just taken. Please pick another room.`);
    amount = type.price;
    chosenSpace = spaceId;
    const sharing = (input.info.occupants ?? []).length;
    if (type.pricingMode === "per_bed" && sharing) throw new BookingError("Each bed is booked by one person. Remove the room occupants, or have each person book their own bed.");
    if (type.pricingMode === "per_room" && sharing + 1 > type.capacity) throw new BookingError(`Room ${input.roomId} takes up to ${type.capacity} people including you.`);

    // One hold per person, and sweep expired holds while we're here
    const updates: Record<string, unknown> = {};
    for (const [held, hold] of Object.entries(listing.holds ?? {})) {
      if (hold.until <= now || (hold.uid === input.uid && held !== spaceId)) updates[`holds.${held}`] = FieldValue.delete();
    }
    updates[`holds.${spaceId}`] = { until: now + HOLD_MINUTES * 60_000, bookingId: reference, uid: input.uid };
    tx.update(r.listing, updates);

    const booking: HostelBooking = {
      ...toStudentInfo({ ...input.info, email: input.email }),
      id: reference,
      uid: input.uid,
      roomId: input.roomId,
      spaceId: chosenSpace,
      amount,
      status: "pending",
      createdAt: new Date(now).toISOString(),
      ...(input.agent ? { agent: input.agent.slice(0, 40) } : {}),
    };
    tx.set(r.doc("bookings", reference), booking);
  });

  try {
    const trx = await initializeTransaction({
      email: input.email,
      amount,
      reference,
      callbackUrl: `${input.origin}/book`,
      metadata: { hostelId: h, bookingId: reference, roomId: input.roomId, spaceId: chosenSpace, uid: input.uid },
    });
    return { reference, accessCode: trx.access_code, amount };
  } catch (err) {
    await releaseHold(h, chosenSpace, reference);
    await r.doc("bookings", reference).delete();
    throw err;
  }
}

/**
 * Stops a second charge when the first is slow: before a new checkout, asks Paystack about this
 * person's earlier unpaid bookings. One that succeeded is completed now; one still in progress
 * (bank transfer, USSD) blocks a new payment until it settles or goes stale.
 */
async function refuseIfAlreadyPaying(h: string, uid: string) {
  const earlier = await hostelRefs(h).col("bookings").where("uid", "==", uid).where("status", "==", "pending").get();
  const recentFirst = earlier.docs.map((d) => d.data() as HostelBooking).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const booking of recentFirst.slice(0, 3)) {
    const trx = await verifyTransaction(booking.id).catch(() => null); // never reached Paystack
    if (trx?.status === "success") {
      const done = await finalizeBooking(h, booking.id);
      throw new BookingError(
        done.status === "paid"
          ? `You've already paid for room ${done.roomId} (reference ${booking.id}). Log in to your portal.`
          : `We received your earlier payment (reference ${booking.id}). The manager will allocate your room; please don't pay again.`,
      );
    }
    const ageMinutes = (Date.now() - Date.parse(booking.createdAt)) / 60_000;
    if (trx && IN_PROGRESS.has(trx.status) && ageMinutes < PROCESSING_MINUTES)
      throw new BookingError(
        `Your last payment (reference ${booking.id}) is still being processed by your bank. Please don't pay again; check your portal in a few minutes.`,
      );
  }
}

async function releaseHold(h: string, spaceId: string, reference: string) {
  const r = hostelRefs(h);
  await adminDb.runTransaction(async (tx) => {
    const hold = ((await tx.get(r.listing)).data() as Listing | undefined)?.holds?.[spaceId];
    if (hold?.bookingId === reference) tx.update(r.listing, { [`holds.${spaceId}`]: FieldValue.delete() });
  });
}

export interface BookingResult {
  status: HostelBooking["status"] | "failed";
  /** For a pending booking: whether Paystack may still complete it, or the student never paid */
  payment?: "processing" | "not_paid";
  reference?: string;
  roomId?: string;
  spaceId?: string;
  fullName?: string;
  amount?: number;
  receiptNo?: string;
  leaseStart?: string;
  leaseEnd?: string;
  whatsappGroupLink?: string;
}

/**
 * Confirms a booking once Paystack says the money arrived: creates the resident, their
 * tenancy and payment, and marks the room occupied, all in one transaction. Safe to call
 * repeatedly (the popup callback and the webhook may both arrive); only the first does work.
 */
export async function finalizeBooking(hostelId: string, reference: string, { forUid }: { forUid?: string } = {}): Promise<BookingResult> {
  const h = hostelId;
  const r = hostelRefs(h);
  const first = await r.doc("bookings", reference).get();
  const pending = first.data() as HostelBooking | undefined;
  // The browser may only ask about its own booking (the summary has their name and room)
  if (!pending || (forUid !== undefined && pending.uid !== forUid)) throw new BookingError("Booking not found.");
  if (pending.status !== "pending") {
    // Repeat calls (verify, webhook retries) also repair access if granting it failed the first
    // time, but only while they still live here (not after moving out)
    if (pending.status === "paid") {
      const living = await r.col("tenancies").where("uid", "==", pending.uid).where("status", "==", "active").limit(1).get();
      if (!living.empty) await setTenantOf(pending.uid, h, true);
    }
    return summarize(h, reference);
  }

  const trx = await verifyTransaction(reference);
  if (trx.status !== "success") {
    if (IN_PROGRESS.has(trx.status)) return { status: "pending", payment: "processing", reference };
    return { status: trx.status === "abandoned" ? "pending" : "failed", payment: "not_paid", reference };
  }
  if (trx.currency !== "NGN" || trx.amount < Math.round(pending.amount * 100)) {
    await r.doc("bookings", reference).update({ status: "needs_attention", paidAt: new Date().toISOString(), issue: `Amount mismatch: received ₦${trx.amount / 100}` });
    return summarize(h, reference);
  }

  const placed = await adminDb.runTransaction(async (tx) => {
    const [bookingSnap, listingSnap] = await tx.getAll(r.doc("bookings", reference), r.listing);
    const booking = bookingSnap.data() as HostelBooking;
    if (booking.status !== "pending") return false; // another caller finished first
    const occ = await readOccupancy(tx, h, booking.roomId);
    const existing = await tx.get(r.col("tenancies").where("uid", "==", booking.uid).where("status", "==", "active").limit(1));
    const { hostel, months } = await readTerms(tx, h, occ.room);
    const receipt = await readReceiptCounter(tx, h);

    const listing = listingSnap.data() as Listing;
    const paidAt = trx.paid_at ?? new Date().toISOString();
    const held = booking.spaceId ?? booking.roomId;
    const checkedAt = Date.now();
    const freeForUs = (space: string) => {
      if (occ.occupied.has(space)) return false;
      const hold = listing.holds?.[space];
      return !hold || hold.bookingId === reference || hold.until <= checkedAt;
    };
    // Their held bed, or (per-bed rooms) any other free bed in the same room
    const spaceId = occ.room.maintenance ? undefined : freeForUs(held) ? held : spaceIdsOf(booking.roomId, occ.type).find(freeForUs);
    const clearHold = listing.holds?.[held]?.bookingId === reference ? { [`holds.${held}`]: FieldValue.delete() } : {};

    if (!spaceId || !existing.empty) {
      tx.update(r.doc("bookings", reference), {
        status: "needs_attention",
        paidAt,
        issue: !existing.empty ? "Already has an active room" : `Room ${booking.roomId} was taken before payment completed`,
      });
      if (Object.keys(clearHold).length) tx.update(r.listing, clearHold);
      return false;
    }

    const leaseStart = todayISO();
    const leaseEnd = addMonths(leaseStart, months);
    const now = new Date().toISOString();
    const tenancyId = newId("t_");
    const resident: HostelResident = { ...person(booking), id: booking.uid, uid: booking.uid, createdAt: now };
    const tenancy: Tenancy = {
      id: tenancyId, residentId: booking.uid, uid: booking.uid, roomId: booking.roomId, spaceId,
      periodId: hostel.defaultPeriodId, status: "active", checkInDate: leaseStart, leaseStart, leaseEnd, occupants: booking.occupants ?? [], createdAt: now,
    };
    const payment: HostelPayment = {
      id: `pay_${reference}`, receiptNo: receipt.receiptNo, residentId: booking.uid, roomId: booking.roomId, amount: trx.amount / 100,
      method: "Online", reference, date: leaseStart, periodStart: leaseStart, periodEnd: leaseEnd, note: `Paystack · ${trx.channel}`,
      uid: booking.uid, tenancyId,
    };
    const welcome: HostelMessage = {
      id: newId("msg_"), kind: "notice", channel: "Email", recipientIds: [booking.uid], recipientUids: [booking.uid],
      body: `Welcome to ${hostel.name}, ${booking.fullName.split(" ")[0]}! Your payment of ₦${(trx.amount / 100).toLocaleString("en-NG")} is confirmed and ${bedOf(spaceId, booking.roomId) ? `bed ${bedOf(spaceId, booking.roomId)} in room ${booking.roomId}` : `room ${booking.roomId}`} is yours until ${leaseEnd}. Receipt ${receipt.receiptNo}.`,
      sentAt: now, automated: true,
    };

    tx.set(r.doc("residents", booking.uid), resident);
    tx.set(r.doc("tenancies", tenancyId), tenancy);
    tx.set(r.doc("payments", payment.id), payment);
    tx.set(r.doc("messages", welcome.id), welcome);
    receipt.claim();
    tx.update(r.listing, { ...listingUpdate(occ.room, occ.type, plus(occ.occupied, spaceId)), ...clearHold });
    tx.update(r.doc("bookings", reference), { status: "paid", paidAt, residentId: booking.uid, receiptNo: receipt.receiptNo, spaceId });
    tx.set(r.col("audit").doc(), { action: "booking.paid", at: FieldValue.serverTimestamp(), by: { uid: booking.uid, email: booking.email, role: null }, details: { reference, roomId: booking.roomId, receiptNo: receipt.receiptNo } });
    return true;
  });

  // The new tenant's portal reads their records through this claim
  if (placed) await setTenantOf(pending.uid, h, true);
  return summarize(h, reference);
}

async function summarize(h: string, reference: string): Promise<BookingResult> {
  const r = hostelRefs(h);
  const booking = (await r.doc("bookings", reference).get()).data() as HostelBooking;
  if (booking.status !== "paid") return { status: booking.status, reference, roomId: booking.roomId, fullName: booking.fullName, amount: booking.amount };
  const [tenancies, listing] = await Promise.all([r.col("tenancies").where("uid", "==", booking.uid).where("status", "==", "active").limit(1).get(), r.listing.get()]);
  const t = tenancies.docs[0]?.data() as Tenancy | undefined;
  return {
    status: "paid",
    reference,
    roomId: booking.roomId,
    spaceId: booking.spaceId,
    fullName: booking.fullName,
    amount: booking.amount,
    receiptNo: booking.receiptNo,
    leaseStart: t?.leaseStart,
    leaseEnd: t?.leaseEnd,
    whatsappGroupLink: (listing.data() as Listing | undefined)?.info.whatsappGroupLink,
  };
}
