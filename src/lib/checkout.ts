/*
 * What a student pays and for how long, from a room's class, the stay they picked and the
 * hostel's extra charges (docs/ARCHITECTURE-PLAN.md §10.11–10.13). Shared by the booking page and
 * the server, so the amount shown is the amount charged.
 */
import { checkoutTotal, type CheckoutLine } from "./fees";
import type { BlockOccupancy, ExtraCharge, RentPeriod, RoomType, StayOptionInfo } from "./model";
import { monthsBetween, monthsText } from "./room-setup";
import { addMonths } from "./utils";

/** A stay a student can pick on the booking page (a rent period, as the listing shows it). */
export type StayOption = StayOptionInfo;

/** The listing's view of a rent period. */
export const stayOptionOf = (p: RentPeriod): StayOption =>
  p.kind === "session" ? { id: p.id, name: p.name, kind: "session", start: p.start, end: p.end } : { id: p.id, name: p.name, kind: "rolling", months: p.months };

export type ChargeInfo = Pick<ExtraCharge, "name" | "amount" | "when" | "refundable">;

/** Rent for one space for a stay option; older room types have one price for everything. */
export const optionRent = (type: Pick<RoomType, "price" | "prices">, optionId?: string | null) => (optionId && type.prices?.[optionId]) || type.price;

/**
 * The first payment: rent, then every extra charge (one-off ones are paid on moving in), then
 * HostelHub's service fee when the hostel takes payments through its own payout account.
 */
export function firstPayment(type: Pick<RoomType, "price" | "prices">, optionId: string | null | undefined, charges: ChargeInfo[] = [], withServiceFee = false) {
  const lines: CheckoutLine[] = [{ label: "Rent", amount: optionRent(type, optionId) }, ...charges.map((c) => ({ label: c.name, amount: c.amount, refundable: c.refundable }))];
  const t = checkoutTotal(lines);
  return { lines, toHostel: t.toHostel, fee: withServiceFee ? t.fee : 0, total: withServiceFee ? t.total : t.toHostel };
}

/** A renewal: rent and the charges paid every time (one-off charges were paid on moving in). */
export function renewalPayment(type: Pick<RoomType, "price" | "prices">, optionId: string | null | undefined, charges: ChargeInfo[] = [], withServiceFee = false) {
  return firstPayment(type, optionId, charges.filter((c) => c.when === "every"), withServiceFee);
}

/**
 * The lease for a stay starting `today` (yyyy-mm-dd): a session ends on its end date; months
 * from move-in end that many months later. Returns null for a session that has already ended.
 */
export function leaseFor(option: StayOption, today: string): { start: string; end: string } | null {
  if (option.kind === "session") {
    if (!option.end || option.end <= today) return null;
    return { start: today, end: option.end };
  }
  return { start: today, end: addMonths(today, option.months ?? 12) };
}

const monthYear = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" });

/** "Oct 2026 – Jul 2027 · 10 months" for a session, "12 months from move-in" otherwise. */
export function stayLength(option: StayOption) {
  if (option.kind === "session" && option.start && option.end) return `${monthYear(option.start)} – ${monthYear(option.end)} · ${monthsText(monthsBetween(option.start, option.end))}`;
  return `${monthsText(option.months ?? 12)} from move-in`;
}

/** Whether someone of this sex may book in a block that admits `who` (absent = anyone). */
export function mayStay(who: BlockOccupancy | undefined, sex: string | undefined) {
  if (!who || who === "any") return true;
  return (sex ?? "").toLowerCase() === who;
}
