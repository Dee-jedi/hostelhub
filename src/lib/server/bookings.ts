import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import type { Booking, Message, Payment, PublicBookingDoc, Resident, Settings, StudentInfo } from "../types";
import { addMonths, isBookable, todayISO, toStudentInfo } from "../utils";
import { adminDb } from "./admin";
import { initializeTransaction, verifyTransaction } from "./paystack";

/** How long a room stays reserved for someone at checkout. */
export const HOLD_MINUTES = 15;

const publicRef = () => adminDb.doc("public/booking");
const settingsRef = () => adminDb.doc("config/settings");
const metaRef = () => adminDb.doc("config/meta");
const bookingRef = (id: string) => adminDb.doc(`bookings/${id}`);
const residentRef = (id: string) => adminDb.doc(`residents/${id}`);

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

/**
 * Reserves the room for HOLD_MINUTES, records a pending booking and opens a Paystack
 * transaction for it. Returns the access code the browser uses to show the payment popup.
 */
export async function startBooking(input: { uid: string; email: string; info: StudentInfo; roomId: string; agent?: string; origin: string }) {
  const reference = newReference();
  const now = Date.now();
  let amount = 0;

  await adminDb.runTransaction(async (tx) => {
    const [pubSnap, residentSnap, settingsSnap] = await tx.getAll(publicRef(), residentRef(input.uid), settingsRef());
    if (!pubSnap.exists || !settingsSnap.exists) throw new BookingError("Bookings are not open yet. Please contact the hostel.");
    const resident = residentSnap.data() as Resident | undefined;
    if (resident?.status === "active") throw new BookingError("You already have a room. Log in to your portal instead.");

    const pub = pubSnap.data() as PublicBookingDoc;
    const settings = settingsSnap.data() as Settings;
    if (!isBookable(pub, input.roomId, now, input.uid)) throw new BookingError(`Room ${input.roomId} was just taken. Please pick another room.`);
    amount = settings.rentAmount;

    // One hold per person, and sweep expired holds while we're here
    const updates: Record<string, unknown> = {};
    for (const [roomId, hold] of Object.entries(pub.holds ?? {})) {
      if (hold.until <= now || (hold.uid === input.uid && roomId !== input.roomId)) updates[`holds.${roomId}`] = FieldValue.delete();
    }
    updates[`holds.${input.roomId}`] = { until: now + HOLD_MINUTES * 60_000, bookingId: reference, uid: input.uid };
    tx.update(publicRef(), updates);

    const booking: Booking = {
      ...toStudentInfo({ ...input.info, email: input.email }),
      id: reference,
      uid: input.uid,
      roomId: input.roomId,
      amount,
      status: "pending",
      createdAt: new Date(now).toISOString(),
      ...(input.agent ? { agent: input.agent.slice(0, 40) } : {}),
    };
    tx.set(bookingRef(reference), booking);
  });

  try {
    const trx = await initializeTransaction({
      email: input.email,
      amount,
      reference,
      callbackUrl: `${input.origin}/book`,
      metadata: { bookingId: reference, roomId: input.roomId, uid: input.uid },
    });
    return { reference, accessCode: trx.access_code, amount };
  } catch (err) {
    await releaseHold(input.roomId, reference);
    await bookingRef(reference).delete();
    throw err;
  }
}

async function releaseHold(roomId: string, reference: string) {
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(publicRef());
    const hold = (snap.data() as PublicBookingDoc | undefined)?.holds?.[roomId];
    if (hold?.bookingId === reference) tx.update(publicRef(), { [`holds.${roomId}`]: FieldValue.delete() });
  });
}

export interface BookingResult {
  status: Booking["status"] | "failed";
  roomId?: string;
  fullName?: string;
  amount?: number;
  receiptNo?: string;
  leaseStart?: string;
  leaseEnd?: string;
  whatsappGroupLink?: string;
}

/**
 * Confirms a booking once Paystack says the money arrived: creates the resident, records the
 * payment and marks the room occupied, all in one transaction. Safe to call repeatedly (the
 * popup callback and the webhook may both arrive); only the first call does any work.
 */
export async function finalizeBooking(reference: string): Promise<BookingResult> {
  const first = await bookingRef(reference).get();
  if (!first.exists) throw new BookingError("Booking not found.");
  const pending = first.data() as Booking;
  if (pending.status !== "pending") return summarize(reference);

  const trx = await verifyTransaction(reference);
  if (trx.status !== "success") return { status: trx.status === "abandoned" || trx.status === "ongoing" ? "pending" : "failed" };
  if (trx.currency !== "NGN" || trx.amount < Math.round(pending.amount * 100)) {
    await bookingRef(reference).update({ status: "needs_attention", paidAt: new Date().toISOString(), issue: `Amount mismatch: received ₦${trx.amount / 100}` });
    return summarize(reference);
  }

  await adminDb.runTransaction(async (tx) => {
    const [bookingSnap, pubSnap, settingsSnap, metaSnap, residentSnap] = await tx.getAll(
      bookingRef(reference),
      publicRef(),
      settingsRef(),
      metaRef(),
      residentRef(pending.uid),
    );
    const booking = bookingSnap.data() as Booking;
    if (booking.status !== "pending") return; // another caller finished first

    const pub = pubSnap.data() as PublicBookingDoc;
    const settings = settingsSnap.data() as Settings;
    const paidAt = trx.paid_at ?? new Date().toISOString();
    const room = pub.rooms[booking.roomId];
    const hold = pub.holds?.[booking.roomId];
    const roomFree = room?.status === "vacant" && (!hold || hold.bookingId === reference || hold.until <= Date.now());
    const existing = residentSnap.data() as Resident | undefined;

    if (!roomFree || existing?.status === "active") {
      tx.update(bookingRef(reference), {
        status: "needs_attention",
        paidAt,
        issue: existing?.status === "active" ? "Already has an active room" : `Room ${booking.roomId} was taken before payment completed`,
      });
      if (hold?.bookingId === reference) tx.update(publicRef(), { [`holds.${booking.roomId}`]: FieldValue.delete() });
      return;
    }

    const leaseStart = todayISO();
    const leaseEnd = addMonths(leaseStart, settings.leaseMonths);
    const seq = ((metaSnap.data()?.receiptSeq as number | undefined) ?? 1000) + 1;
    const receiptNo = `RCP-${seq}`;

    const resident: Resident = {
      ...toStudentInfo(booking),
      id: booking.uid,
      roomId: booking.roomId,
      status: "active",
      checkInDate: leaseStart,
      leaseStart,
      leaseEnd,
      createdAt: new Date().toISOString(),
    };
    const payment: Payment = {
      id: `pay_${reference}`,
      receiptNo,
      residentId: booking.uid,
      roomId: booking.roomId,
      amount: trx.amount / 100,
      method: "Online",
      reference,
      date: leaseStart,
      periodStart: leaseStart,
      periodEnd: leaseEnd,
      note: `Paystack · ${trx.channel}`,
    };
    const welcome: Omit<Message, "id"> = {
      kind: "notice",
      channel: "Email",
      recipientIds: [booking.uid],
      body: `Welcome to ${settings.hostelName}, ${booking.fullName.split(" ")[0]}! Your payment of ₦${(trx.amount / 100).toLocaleString("en-NG")} is confirmed and room ${booking.roomId} is yours until ${leaseEnd}. Receipt ${receiptNo}.`,
      sentAt: new Date().toISOString(),
      automated: true,
    };

    tx.set(residentRef(booking.uid), resident);
    tx.set(adminDb.doc(`payments/${payment.id}`), payment);
    tx.set(adminDb.collection("messages").doc(), welcome);
    tx.set(metaRef(), { receiptSeq: seq }, { merge: true });
    tx.update(publicRef(), {
      [`rooms.${booking.roomId}.status`]: "occupied",
      [`holds.${booking.roomId}`]: FieldValue.delete(),
    });
    tx.update(bookingRef(reference), { status: "paid", paidAt, residentId: booking.uid, receiptNo });
  });

  return summarize(reference);
}

async function summarize(reference: string): Promise<BookingResult> {
  const booking = (await bookingRef(reference).get()).data() as Booking;
  if (booking.status !== "paid") return { status: booking.status, roomId: booking.roomId, fullName: booking.fullName, amount: booking.amount };
  const [resident, pub] = await Promise.all([residentRef(booking.uid).get(), publicRef().get()]);
  const r = resident.data() as Resident;
  return {
    status: "paid",
    roomId: booking.roomId,
    fullName: booking.fullName,
    amount: booking.amount,
    receiptNo: booking.receiptNo,
    leaseStart: r.leaseStart,
    leaseEnd: r.leaseEnd,
    whatsappGroupLink: (pub.data() as PublicBookingDoc).info.whatsappGroupLink,
  };
}
