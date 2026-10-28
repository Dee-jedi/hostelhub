/*
 * HostelHub's service fee (docs/ARCHITECTURE-PLAN.md §10.6, §10.13): paid by the student on top of
 * what they pay the hostel online. Refundable deposits are left out, since the hostel gives them back.
 */

export const SERVICE_FEE = {
  /** 2% of the amount the fee applies to */
  rate: 0.02,
  /** …but never less than this (₦), so a cheap room never costs HostelHub money */
  minimum: 2_500,
};

/** The fee on an amount the fee applies to (₦, whole naira). Nothing to pay means no fee. */
export function serviceFee(amount: number) {
  if (amount <= 0) return 0;
  return Math.max(SERVICE_FEE.minimum, Math.round(amount * SERVICE_FEE.rate));
}

/**
 * Paystack's charge on a local Nigerian payment: 1.5% + ₦100 (the ₦100 waived under ₦2,500),
 * capped at ₦2,000. International cards cost more; on those the hostel's share absorbs the rest.
 */
export function paystackCharge(total: number) {
  if (total <= 0) return 0;
  const charge = total * 0.015 + (total < 2_500 ? 0 : 100);
  return Math.min(2_000, Math.ceil(charge));
}

/**
 * HostelHub's share of a split payment. Paystack takes its charge from the subaccount's share
 * whenever a fixed amount goes to the main account (it ignores `bearer: account` then, as tested
 * on 2026-10-28), so HostelHub's share is the fee minus that charge: the hostel then receives
 * exactly its amount.
 */
export const platformShare = (total: number, fee: number) => Math.max(0, fee - paystackCharge(total));

export interface CheckoutLine {
  label: string;
  amount: number;
  refundable?: boolean;
}

/** What a student pays online: the hostel's lines, then the fee on everything that isn't refundable. */
export function checkoutTotal(lines: CheckoutLine[]) {
  const toHostel = lines.reduce((sum, l) => sum + l.amount, 0);
  const fee = serviceFee(lines.filter((l) => !l.refundable).reduce((sum, l) => sum + l.amount, 0));
  return { toHostel, fee, total: toHostel + fee };
}
