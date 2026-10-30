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

/**
 * What a hostel pays to add a tenant by hand once it's live (tenants living there before it went
 * live are added free during sign-up). Without it, rent collected offline would skip the fee.
 */
export const HAND_ADD_FEE = 1_500;

/** The terms a hostel accepts to go live; bump when they change, so we know who agreed to what. */
export const TERMS_VERSION = "2026-10";

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
 * What HostelHub keeps of a split payment: the whole fee goes to the main account, and Paystack
 * takes its charge from that share (`bearer: account`), so the hostel receives exactly its
 * amount. That needs the fee to cover Paystack's charge, which the minimum fee guarantees
 * (₦2,500 against a ₦2,000 cap). Checked 2026-10-28: on ₦22,500 with a ₦2,500 fee, the
 * subaccount got ₦20,000 and Paystack ₦437.50 from the main share. (When the main share is
 * smaller than Paystack's charge, Paystack takes the charge from the subaccount instead.)
 */
export const platformNet = (total: number, fee: number) => fee - paystackCharge(total);

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
