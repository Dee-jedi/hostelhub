import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import type { HostelMessage, HostelPayment, HostelResident, HostelRoom, Tenancy } from "../model";
import { addMonths, todayISO } from "../utils";
import { adminDb } from "./admin";
import { BookingError } from "./bookings";
import { hostelRefs, newId, readReceiptCounter, readTerms } from "./hostel-data";
import { initializeTransaction, verifyTransaction } from "./paystack";

/*
 * Rent renewal from the tenant portal. Same safety as bookings: the server sets the amount,
 * Paystack confirms the money, and the lease is extended in one transaction that only ever
 * runs once per reference (popup callback and webhook may both arrive).
 */

export interface Renewal {
  id: string;
  uid: string;
  tenancyId: string;
  amount: number;
  status: "pending" | "paid" | "needs_attention";
  createdAt: string;
  paidAt?: string;
  receiptNo?: string;
  paymentId?: string;
  issue?: string;
}

async function activeTenancyOf(h: string, uid: string) {
  const snap = await hostelRefs(h).col("tenancies").where("uid", "==", uid).where("status", "==", "active").limit(1).get();
  return snap.empty ? null : ({ ...(snap.docs[0].data() as Tenancy), id: snap.docs[0].id } as Tenancy);
}

export async function startRenewal(input: { hostelId: string; uid: string; email: string; origin: string }) {
  const h = input.hostelId;
  const r = hostelRefs(h);
  const tenancy = await activeTenancyOf(h, input.uid);
  if (!tenancy) throw new BookingError("Only current tenants can renew. Contact the hostel manager.");
  const room = tenancy.roomId ? ((await r.doc("rooms", tenancy.roomId).get()).data() as HostelRoom | undefined) : undefined;
  const { type } = await adminDb.runTransaction((tx) => readTerms(tx, h, room ?? null));
  const amount = type.price;
  const reference = `RN-${Date.now().toString(36).toUpperCase()}${randomBytes(2).toString("hex").toUpperCase()}`;

  const renewal: Renewal = { id: reference, uid: input.uid, tenancyId: tenancy.id, amount, status: "pending", createdAt: new Date().toISOString() };
  await r.doc("renewals", reference).set(renewal);
  try {
    const trx = await initializeTransaction({
      email: input.email,
      amount,
      reference,
      callbackUrl: `${input.origin}/portal/payments`,
      metadata: { hostelId: h, renewalId: reference, uid: input.uid, roomId: tenancy.roomId },
    });
    return { reference, accessCode: trx.access_code, amount };
  } catch (err) {
    await r.doc("renewals", reference).delete();
    throw err;
  }
}

export interface RenewalResult {
  status: Renewal["status"] | "failed";
  receiptNo?: string;
  paymentId?: string;
  leaseEnd?: string;
}

export async function finalizeRenewal(hostelId: string, reference: string): Promise<RenewalResult> {
  const h = hostelId;
  const r = hostelRefs(h);
  const first = await r.doc("renewals", reference).get();
  if (!first.exists) throw new BookingError("Payment not found.");
  const pending = first.data() as Renewal;
  if (pending.status !== "pending") return summarize(h, reference);

  const trx = await verifyTransaction(reference);
  if (trx.status !== "success") return { status: trx.status === "abandoned" || trx.status === "ongoing" ? "pending" : "failed" };
  if (trx.currency !== "NGN" || trx.amount < Math.round(pending.amount * 100)) {
    await r.doc("renewals", reference).update({ status: "needs_attention", paidAt: new Date().toISOString(), issue: `Amount mismatch: received ₦${trx.amount / 100}` });
    return summarize(h, reference);
  }

  await adminDb.runTransaction(async (tx) => {
    const [renewalSnap, tenancySnap] = await tx.getAll(r.doc("renewals", reference), r.doc("tenancies", pending.tenancyId));
    const renewal = renewalSnap.data() as Renewal;
    if (renewal.status !== "pending") return;
    const tenancy = tenancySnap.data() as Tenancy | undefined;
    const roomSnap = tenancy?.roomId ? await tx.get(r.doc("rooms", tenancy.roomId)) : null;
    const residentSnap = tenancy ? await tx.get(r.doc("residents", tenancy.residentId)) : null;
    const { months } = await readTerms(tx, h, (roomSnap?.data() as HostelRoom | undefined) ?? null);
    const receipt = await readReceiptCounter(tx, h);
    const paidAt = trx.paid_at ?? new Date().toISOString();
    if (!tenancy || tenancy.status !== "active") {
      tx.update(r.doc("renewals", reference), { status: "needs_attention", paidAt, issue: "Tenant is no longer active" });
      return;
    }
    const resident = residentSnap?.data() as HostelResident;
    const today = todayISO();
    // Paying early extends from the current end date; paying late starts from today
    const periodStart = tenancy.leaseEnd >= today ? tenancy.leaseEnd : today;
    const periodEnd = addMonths(periodStart, months);
    const payment: HostelPayment = {
      id: `pay_${reference}`, receiptNo: receipt.receiptNo, residentId: tenancy.residentId, roomId: tenancy.roomId ?? undefined,
      amount: trx.amount / 100, method: "Online", reference, date: today, periodStart, periodEnd, note: `Renewal · Paystack · ${trx.channel}`,
      uid: pending.uid, tenancyId: pending.tenancyId,
    };
    const notice: HostelMessage = {
      id: newId("msg_"), kind: "notice", channel: "Email", recipientIds: [tenancy.residentId], recipientUids: [pending.uid],
      body: `Thank you, ${resident.fullName.split(" ")[0]}! Your rent renewal of ₦${(trx.amount / 100).toLocaleString("en-NG")} is confirmed. Room ${tenancy.roomId} is now yours until ${periodEnd}. Receipt ${receipt.receiptNo}.`,
      sentAt: new Date().toISOString(), automated: true,
    };
    tx.set(r.doc("payments", payment.id), payment);
    tx.update(r.doc("tenancies", pending.tenancyId), { leaseStart: periodStart, leaseEnd: periodEnd });
    tx.set(r.doc("messages", notice.id), notice);
    receipt.claim();
    tx.update(r.doc("renewals", reference), { status: "paid", paidAt, receiptNo: receipt.receiptNo, paymentId: payment.id });
    tx.set(r.col("audit").doc(), { action: "renewal.paid", at: FieldValue.serverTimestamp(), by: { uid: pending.uid, email: resident.email ?? null, role: null }, details: { reference, receiptNo: receipt.receiptNo } });
  });

  return summarize(h, reference);
}

async function summarize(h: string, reference: string): Promise<RenewalResult> {
  const r = hostelRefs(h);
  const renewal = (await r.doc("renewals", reference).get()).data() as Renewal;
  if (renewal.status !== "paid") return { status: renewal.status };
  // Renewals from before the move to hostels/{id} have no tenancy link
  const tenancy = renewal.tenancyId ? ((await r.doc("tenancies", renewal.tenancyId).get()).data() as Tenancy | undefined) : undefined;
  return { status: "paid", receiptNo: renewal.receiptNo, paymentId: renewal.paymentId, leaseEnd: tenancy?.leaseEnd };
}
