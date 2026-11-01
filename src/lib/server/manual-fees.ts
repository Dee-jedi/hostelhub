import { randomBytes } from "node:crypto";
import type { Transaction } from "firebase-admin/firestore";
import { manualFee } from "../fees";
import { joinIsOpen } from "../join";
import type { Hostel } from "../model";
import { naira } from "../utils";
import { CommandError, command } from "./command";
import { hostelRefs } from "./hostel-data";
import { initializeTransaction, verifyTransaction } from "./paystack";

/*
 * The fee a hostel pays when it collects rent outside HostelHub: adding a tenant by hand, or
 * recording a payment by hand (fees.ts manualFee). It's paid first, through Paystack, to
 * HostelHub alone; then the action is allowed, once, for that fee. Not charged while the hostel
 * is setting up or inside its join-link window, or on hostels that never accepted these terms.
 */

/** hostels/{h}/manualFees/{reference} */
interface ManualFee {
  reference: string;
  fee: number;
  /** The rent it was worked out from */
  amount: number;
  purpose: "addTenant" | "recordPayment";
  uid: string;
  status: "pending" | "used";
  createdAt: string;
  usedAt?: string;
}

/** The fee due on rent collected outside HostelHub (0 when none is due for this hostel). */
export function manualFeeDue(hostel: Pick<Hostel, "status" | "liveAt" | "terms">, rentCollected: number) {
  if (!hostel.terms || joinIsOpen(hostel)) return 0;
  return manualFee(rentCollected);
}

/** Starts paying the fee: a Paystack payment the manager completes in the popup. */
export const startManualFee = command<{ purpose: ManualFee["purpose"]; amount: number; origin?: string }, { reference: string; accessCode: string; fee: number }>(
  { access: "manager" },
  async (ctx, body) => {
    const h = ctx.hostelId!;
    const r = hostelRefs(h);
    const hostel = (await r.hostel.get()).data() as Hostel | undefined;
    if (!hostel) throw new CommandError("Hostel not found.", 404);
    const amount = Math.round(Number(body.amount) || 0);
    const fee = manualFeeDue(hostel, amount);
    if (!fee) throw new CommandError("No HostelHub fee is due for this.", 409);
    if (!ctx.user?.email) throw new CommandError("Your login needs an email address to pay the fee.", 409);
    const reference = `MF-${Date.now().toString(36).toUpperCase()}${randomBytes(3).toString("hex").toUpperCase()}`;
    const doc: ManualFee = { reference, fee, amount, purpose: body.purpose === "recordPayment" ? "recordPayment" : "addTenant", uid: ctx.user.uid, status: "pending", createdAt: new Date().toISOString() };
    await r.doc("manualFees", reference).set(doc);
    // All of it to HostelHub: no split, it's not rent
    const trx = await initializeTransaction({
      email: ctx.user.email,
      amount: fee,
      reference,
      callbackUrl: `${body.origin ?? ""}/`,
      metadata: { kind: "manual_fee", hostelId: h, purpose: doc.purpose, custom_fields: [{ display_name: "HostelHub fee", variable_name: "manual_fee", value: `${naira(fee)} on ${naira(amount)} rent collected by ${hostel.name}` }] },
    });
    return { reference, accessCode: trx.access_code, fee };
  },
);

/**
 * Checks the fee for an action was paid (asking Paystack, before the transaction) and returns a
 * function that marks it used inside the action's transaction, so one payment allows one action.
 * Returns null when no fee is due.
 */
export async function requireManualFee(h: string, hostel: Hostel, rentCollected: number, reference: string | undefined, purpose: ManualFee["purpose"]) {
  const due = manualFeeDue(hostel, rentCollected);
  if (!due) return null;
  if (!reference) throw new CommandError(`A HostelHub fee of ${naira(due)} is due first.`, 402, { feeDue: due });
  const ref = hostelRefs(h).doc("manualFees", reference);
  const saved = (await ref.get()).data() as ManualFee | undefined;
  if (!saved || saved.purpose !== purpose) throw new CommandError("That fee payment isn't for this. Please pay the fee again.", 409, { feeDue: due });
  if (saved.status === "used") throw new CommandError("That fee payment was already used. Please pay the fee again.", 409, { feeDue: due });
  if (saved.fee < due) throw new CommandError(`The amount changed: the fee is now ${naira(due)}. Please pay it again.`, 409, { feeDue: due });
  const paid = await verifyTransaction(reference);
  if (paid.status !== "success" || paid.amount < Math.round(saved.fee * 100)) throw new CommandError("The fee payment hasn't gone through yet. Try again in a moment.", 402, { feeDue: due });
  return async (tx: Transaction) => {
    const now = (await tx.get(ref)).data() as ManualFee | undefined;
    if (now?.status !== "pending") throw new CommandError("That fee payment was already used. Please pay the fee again.", 409, { feeDue: due });
    return () => tx.update(ref, { status: "used", usedAt: new Date().toISOString() });
  };
}
