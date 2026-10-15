import { randomBytes } from "node:crypto";
import type { Message, Payment, Resident, Settings } from "../types";
import { addMonths, todayISO } from "../utils";
import { adminDb } from "./admin";
import { BookingError } from "./bookings";
import { initializeTransaction, verifyTransaction } from "./paystack";

/*
 * Rent renewal from the tenant portal. Same safety as bookings: the server sets the amount,
 * Paystack confirms the money, and the lease is extended in one transaction that only ever
 * runs once per reference (popup callback and webhook may both arrive).
 */

export interface Renewal {
  id: string;
  uid: string;
  amount: number;
  status: "pending" | "paid" | "needs_attention";
  createdAt: string;
  paidAt?: string;
  receiptNo?: string;
  paymentId?: string;
  issue?: string;
}

const renewalRef = (id: string) => adminDb.doc(`renewals/${id}`);
const residentRef = (id: string) => adminDb.doc(`residents/${id}`);
const settingsRef = () => adminDb.doc("config/settings");
const metaRef = () => adminDb.doc("config/meta");

export async function startRenewal(input: { uid: string; email: string; origin: string }) {
  const [residentSnap, settingsSnap] = await Promise.all([residentRef(input.uid).get(), settingsRef().get()]);
  const resident = residentSnap.data() as Resident | undefined;
  if (!resident || resident.status !== "active") throw new BookingError("Only current tenants can renew. Contact the hostel manager.");
  const amount = (settingsSnap.data() as Settings).rentAmount;
  const reference = `RN-${Date.now().toString(36).toUpperCase()}${randomBytes(2).toString("hex").toUpperCase()}`;

  const renewal: Renewal = { id: reference, uid: input.uid, amount, status: "pending", createdAt: new Date().toISOString() };
  await renewalRef(reference).set(renewal);
  try {
    const trx = await initializeTransaction({
      email: input.email,
      amount,
      reference,
      callbackUrl: `${input.origin}/portal/payments`,
      metadata: { renewalId: reference, uid: input.uid, roomId: resident.roomId },
    });
    return { reference, accessCode: trx.access_code, amount };
  } catch (err) {
    await renewalRef(reference).delete();
    throw err;
  }
}

export interface RenewalResult {
  status: Renewal["status"] | "failed";
  receiptNo?: string;
  paymentId?: string;
  leaseEnd?: string;
}

export async function finalizeRenewal(reference: string): Promise<RenewalResult> {
  const first = await renewalRef(reference).get();
  if (!first.exists) throw new BookingError("Payment not found.");
  const pending = first.data() as Renewal;
  if (pending.status !== "pending") return summarize(reference);

  const trx = await verifyTransaction(reference);
  if (trx.status !== "success") return { status: trx.status === "abandoned" || trx.status === "ongoing" ? "pending" : "failed" };
  if (trx.currency !== "NGN" || trx.amount < Math.round(pending.amount * 100)) {
    await renewalRef(reference).update({ status: "needs_attention", paidAt: new Date().toISOString(), issue: `Amount mismatch: received ₦${trx.amount / 100}` });
    return summarize(reference);
  }

  await adminDb.runTransaction(async (tx) => {
    const [renewalSnap, residentSnap, settingsSnap, metaSnap] = await tx.getAll(renewalRef(reference), residentRef(pending.uid), settingsRef(), metaRef());
    const renewal = renewalSnap.data() as Renewal;
    if (renewal.status !== "pending") return;
    const resident = residentSnap.data() as Resident | undefined;
    const paidAt = trx.paid_at ?? new Date().toISOString();
    if (!resident || resident.status !== "active") {
      tx.update(renewalRef(reference), { status: "needs_attention", paidAt, issue: "Tenant is no longer active" });
      return;
    }
    const settings = settingsSnap.data() as Settings;
    const today = todayISO();
    // Paying early extends from the current end date; paying late starts from today
    const periodStart = resident.leaseEnd >= today ? resident.leaseEnd : today;
    const periodEnd = addMonths(periodStart, settings.leaseMonths);
    const seq = ((metaSnap.data()?.receiptSeq as number | undefined) ?? 1000) + 1;
    const receiptNo = `RCP-${seq}`;
    const payment: Payment = {
      id: `pay_${reference}`,
      receiptNo,
      residentId: pending.uid,
      roomId: resident.roomId ?? undefined,
      amount: trx.amount / 100,
      method: "Online",
      reference,
      date: today,
      periodStart,
      periodEnd,
      note: `Renewal · Paystack · ${trx.channel}`,
    };
    const notice: Omit<Message, "id"> = {
      kind: "notice",
      channel: "Email",
      recipientIds: [pending.uid],
      body: `Thank you, ${resident.fullName.split(" ")[0]}! Your rent renewal of ₦${(trx.amount / 100).toLocaleString("en-NG")} is confirmed. Room ${resident.roomId} is now yours until ${periodEnd}. Receipt ${receiptNo}.`,
      sentAt: new Date().toISOString(),
      automated: true,
    };
    tx.set(adminDb.doc(`payments/${payment.id}`), payment);
    tx.update(residentRef(pending.uid), { leaseStart: periodStart, leaseEnd: periodEnd });
    tx.set(adminDb.collection("messages").doc(), notice);
    tx.set(metaRef(), { receiptSeq: seq }, { merge: true });
    tx.update(renewalRef(reference), { status: "paid", paidAt, receiptNo, paymentId: payment.id });
  });

  return summarize(reference);
}

async function summarize(reference: string): Promise<RenewalResult> {
  const r = (await renewalRef(reference).get()).data() as Renewal;
  if (r.status !== "paid") return { status: r.status };
  const resident = (await residentRef(r.uid).get()).data() as Resident;
  return { status: "paid", receiptNo: r.receiptNo, paymentId: r.paymentId, leaseEnd: resident.leaseEnd };
}
