import assert from "node:assert/strict";
import { test } from "node:test";
import { firstPayment, leaseFor, mayStay, optionRent, renewalPayment } from "./checkout";
import { paystackCharge, platformShare } from "./fees";

const exec = { price: 450_000, prices: { "p_session": 450_000, "p_year": 520_000 } };
const charges = [
  { name: "Caution deposit", amount: 20_000, when: "once" as const, refundable: true },
  { name: "Utility fee", amount: 25_000, when: "once" as const, refundable: false },
  { name: "Cleaning", amount: 5_000, when: "every" as const, refundable: false },
];

test("rent follows the stay picked; older room types have one price", () => {
  assert.equal(optionRent(exec, "p_year"), 520_000);
  assert.equal(optionRent(exec, "p_unknown"), 450_000);
  assert.equal(optionRent({ price: 350_000 }, "p_year"), 350_000);
});

test("first payment: rent and every charge, the fee on top when the hostel has a payout account", () => {
  const withFee = firstPayment(exec, "p_session", charges, true);
  assert.equal(withFee.toHostel, 500_000);
  assert.equal(withFee.fee, 9_600, "2% of 480,000: the refundable deposit is left out");
  assert.equal(withFee.total, 509_600);
  const noPayout = firstPayment(exec, "p_session", charges, false);
  assert.deepEqual([noPayout.fee, noPayout.total], [0, 500_000], "no payout account: no fee, the hostel's amount only");
});

test("a renewal leaves out one-off charges", () => {
  const r = renewalPayment(exec, "p_year", charges, true);
  assert.deepEqual(r.lines.map((l) => l.label), ["Rent", "Cleaning"]);
  assert.equal(r.toHostel, 525_000);
});

test("leases: sessions end on their date, months run from move-in, an ended session is no lease", () => {
  const session = { id: "s", name: "Per session", kind: "session" as const, start: "2026-10-01", end: "2027-07-31" };
  assert.deepEqual(leaseFor(session, "2026-11-15"), { start: "2026-11-15", end: "2027-07-31" });
  assert.equal(leaseFor(session, "2027-08-01"), null);
  assert.deepEqual(leaseFor({ id: "y", name: "Per year", kind: "rolling", months: 12 }, "2026-11-15"), { start: "2026-11-15", end: "2027-11-15" });
});

test("the split: the hostel gets exactly its amount, HostelHub the fee less Paystack's charge", () => {
  assert.equal(paystackCharge(10_000), 250, "1.5% + ₦100, as Paystack charged in the test on 2026-10-28");
  assert.equal(paystackCharge(2_000), 30, "the ₦100 is waived under ₦2,500");
  assert.equal(paystackCharge(575_900), 2_000, "capped");
  const p = firstPayment(exec, "p_year", charges.slice(0, 2), true); // ₦575,900 total, ₦10,900 fee
  const share = platformShare(p.total, p.fee);
  assert.equal(share, 8_900);
  assert.equal(p.total - share - paystackCharge(p.total), p.toHostel, "what reaches the hostel's account");
});

test("who may stay in a block", () => {
  assert.equal(mayStay("female", "Female"), true);
  assert.equal(mayStay("female", "Male"), false);
  assert.equal(mayStay("any", "Male"), true);
  assert.equal(mayStay(undefined, undefined), true);
});
