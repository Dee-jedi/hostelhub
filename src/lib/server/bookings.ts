import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import type { HostelBooking, HostelMessage, HostelPayment, HostelResident, HostelRoom, Listing, Tenancy } from "../model";
import type { PublicBookingDoc, StudentInfo } from "../types";
import { addMonths, isBookable, todayISO, toStudentInfo } from "../utils";
import { adminDb } from "./admin";
import { setTenantOf } from "./claims";
import { hostelRefs, listingStatus, newId, readReceiptCounter, readTerms } from "./hostel-data";
import { initializeTransaction, verifyTransaction } from "./paystack";

/** How long a room stays reserved for someone at checkout. */
export const HOLD_MINUTES = 15;

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
  const reference = newReference();
  const now = Date.now();
  let amount = 0;

  await adminDb.runTransaction(async (tx) => {
    const [listingSnap, roomSnap] = await tx.getAll(r.listing, r.doc("rooms", input.roomId));
    if (!listingSnap.exists) throw new BookingError("Bookings are not open yet. Please contact the hostel.");
    const already = await tx.get(r.col("tenancies").where("uid", "==", input.uid).where("status", "==", "active").limit(1));
    const room = roomSnap.data() as HostelRoom | undefined;
    const { type } = await readTerms(tx, h, room ?? null);
    if (!already.empty) throw new BookingError("You already have a room. Log in to your portal instead.");

    const listing = listingSnap.data() as Listing;
    if (!room || !isBookable(listing as unknown as PublicBookingDoc, input.roomId, now, input.uid)) throw new BookingError(`Room ${input.roomId} was just taken. Please pick another room.`);
    amount = type.price;

    // One hold per person, and sweep expired holds while we're here
    const updates: Record<string, unknown> = {};
    for (const [roomId, hold] of Object.entries(listing.holds ?? {})) {
      if (hold.until <= now || (hold.uid === input.uid && roomId !== input.roomId)) updates[`holds.${roomId}`] = FieldValue.delete();
    }
    updates[`holds.${input.roomId}`] = { until: now + HOLD_MINUTES * 60_000, bookingId: reference, uid: input.uid };
    tx.update(r.listing, updates);

    const booking: HostelBooking = {
      ...toStudentInfo({ ...input.info, email: input.email }),
      id: reference,
      uid: input.uid,
      roomId: input.roomId,
      spaceId: input.roomId,
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
      metadata: { hostelId: h, bookingId: reference, roomId: input.roomId, uid: input.uid },
    });
    return { reference, accessCode: trx.access_code, amount };
  } catch (err) {
    await releaseHold(h, input.roomId, reference);
    await r.doc("bookings", reference).delete();
    throw err;
  }
}

async function releaseHold(h: string, roomId: string, reference: string) {
  const r = hostelRefs(h);
  await adminDb.runTransaction(async (tx) => {
    const hold = ((await tx.get(r.listing)).data() as Listing | undefined)?.holds?.[roomId];
    if (hold?.bookingId === reference) tx.update(r.listing, { [`holds.${roomId}`]: FieldValue.delete() });
  });
}

export interface BookingResult {
  status: HostelBooking["status"] | "failed";
  roomId?: string;
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
export async function finalizeBooking(hostelId: string, reference: string): Promise<BookingResult> {
  const h = hostelId;
  const r = hostelRefs(h);
  const first = await r.doc("bookings", reference).get();
  if (!first.exists) throw new BookingError("Booking not found.");
  const pending = first.data() as HostelBooking;
  if (pending.status !== "pending") return summarize(h, reference);

  const trx = await verifyTransaction(reference);
  if (trx.status !== "success") return { status: trx.status === "abandoned" || trx.status === "ongoing" ? "pending" : "failed" };
  if (trx.currency !== "NGN" || trx.amount < Math.round(pending.amount * 100)) {
    await r.doc("bookings", reference).update({ status: "needs_attention", paidAt: new Date().toISOString(), issue: `Amount mismatch: received ₦${trx.amount / 100}` });
    return summarize(h, reference);
  }

  const placed = await adminDb.runTransaction(async (tx) => {
    const [bookingSnap, listingSnap, roomSnap] = await tx.getAll(r.doc("bookings", reference), r.listing, r.doc("rooms", pending.roomId));
    const booking = bookingSnap.data() as HostelBooking;
    if (booking.status !== "pending") return false; // another caller finished first
    const occupant = await tx.get(r.col("tenancies").where("roomId", "==", booking.roomId).where("status", "==", "active").limit(1));
    const existing = await tx.get(r.col("tenancies").where("uid", "==", booking.uid).where("status", "==", "active").limit(1));
    const { hostel, months } = await readTerms(tx, h, (roomSnap.data() as HostelRoom | undefined) ?? null);
    const receipt = await readReceiptCounter(tx, h);

    const listing = listingSnap.data() as Listing;
    const paidAt = trx.paid_at ?? new Date().toISOString();
    const hold = listing.holds?.[booking.roomId];
    const room = roomSnap.data() as HostelRoom | undefined;
    const roomFree = !!room && !room.maintenance && occupant.empty && (!hold || hold.bookingId === reference || hold.until <= Date.now());

    if (!roomFree || !existing.empty) {
      tx.update(r.doc("bookings", reference), {
        status: "needs_attention",
        paidAt,
        issue: !existing.empty ? "Already has an active room" : `Room ${booking.roomId} was taken before payment completed`,
      });
      if (hold?.bookingId === reference) tx.update(r.listing, { [`holds.${booking.roomId}`]: FieldValue.delete() });
      return false;
    }

    const leaseStart = todayISO();
    const leaseEnd = addMonths(leaseStart, months);
    const now = new Date().toISOString();
    const tenancyId = newId("t_");
    const resident: HostelResident = { ...person(booking), id: booking.uid, uid: booking.uid, createdAt: now };
    const tenancy: Tenancy = {
      id: tenancyId, residentId: booking.uid, uid: booking.uid, roomId: booking.roomId, spaceId: booking.spaceId ?? booking.roomId,
      periodId: hostel.defaultPeriodId, status: "active", checkInDate: leaseStart, leaseStart, leaseEnd, occupants: booking.occupants ?? [], createdAt: now,
    };
    const payment: HostelPayment = {
      id: `pay_${reference}`, receiptNo: receipt.receiptNo, residentId: booking.uid, roomId: booking.roomId, amount: trx.amount / 100,
      method: "Online", reference, date: leaseStart, periodStart: leaseStart, periodEnd: leaseEnd, note: `Paystack · ${trx.channel}`,
      uid: booking.uid, tenancyId,
    };
    const welcome: HostelMessage = {
      id: newId("msg_"), kind: "notice", channel: "Email", recipientIds: [booking.uid], recipientUids: [booking.uid],
      body: `Welcome to ${hostel.name}, ${booking.fullName.split(" ")[0]}! Your payment of ₦${(trx.amount / 100).toLocaleString("en-NG")} is confirmed and room ${booking.roomId} is yours until ${leaseEnd}. Receipt ${receipt.receiptNo}.`,
      sentAt: now, automated: true,
    };

    tx.set(r.doc("residents", booking.uid), resident);
    tx.set(r.doc("tenancies", tenancyId), tenancy);
    tx.set(r.doc("payments", payment.id), payment);
    tx.set(r.doc("messages", welcome.id), welcome);
    receipt.claim();
    tx.update(r.listing, { ...listingStatus(booking.roomId, "occupied"), [`holds.${booking.roomId}`]: FieldValue.delete() });
    tx.update(r.doc("bookings", reference), { status: "paid", paidAt, residentId: booking.uid, receiptNo: receipt.receiptNo });
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
  if (booking.status !== "paid") return { status: booking.status, roomId: booking.roomId, fullName: booking.fullName, amount: booking.amount };
  const [tenancies, listing] = await Promise.all([r.col("tenancies").where("uid", "==", booking.uid).where("status", "==", "active").limit(1).get(), r.listing.get()]);
  const t = tenancies.docs[0]?.data() as Tenancy | undefined;
  return {
    status: "paid",
    roomId: booking.roomId,
    fullName: booking.fullName,
    amount: booking.amount,
    receiptNo: booking.receiptNo,
    leaseStart: t?.leaseStart,
    leaseEnd: t?.leaseEnd,
    whatsappGroupLink: (listing.data() as Listing | undefined)?.info.whatsappGroupLink,
  };
}
