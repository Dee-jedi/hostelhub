/*
 * Rebuilds the single-hostel view (HostelState: settings, rooms, residents with their lease…)
 * from one hostel's documents in the new model. The existing screens are written against that
 * view, so in Phase 1 the stores read the new collections and hand the screens this.
 * The inverse of fromLegacy(): toLegacy(fromLegacy(x)) gives back x.
 */
import type { Block, Hostel, HostelBooking, HostelMessage, HostelPayment, HostelRequest, HostelResident, HostelRoom, RentPeriod, RoomType, Tenancy } from "../model";
import { STATE_VERSION } from "../seed";
import type { Booking, HostelState, Message, Payment, Resident, Room, Settings, Ticket } from "../types";
import { DEFAULT_TYPE_ID, omit } from "./from-legacy";

export interface HostelView {
  hostel: Hostel;
  blocks: Block[];
  roomTypes: RoomType[];
  rooms: HostelRoom[];
  rentPeriods: RentPeriod[];
  residents: HostelResident[];
  tenancies: Tenancy[];
  payments: HostelPayment[];
  messages: HostelMessage[];
  requests: HostelRequest[];
  bookings: HostelBooking[];
  sentReminderKeys: string[];
}

export function settingsOf(v: Pick<HostelView, "hostel" | "blocks" | "roomTypes" | "rooms" | "rentPeriods">): Settings {
  const h = v.hostel;
  const type = v.roomTypes.find((t) => t.id === DEFAULT_TYPE_ID) ?? v.roomTypes[0];
  const period = v.rentPeriods.find((p) => p.id === h.defaultPeriodId) ?? v.rentPeriods[0];
  const blocks = [...v.blocks].sort((a, b) => a.order - b.order);
  const roomsPerBlock = Math.max(0, ...v.rooms.map((r) => r.number));
  return {
    hostelName: h.name,
    address: h.address,
    managerName: h.manager.name,
    managerPhone: h.manager.phone,
    rentAmount: type?.price ?? 0,
    leaseMonths: period?.kind === "rolling" ? period.months : 12,
    maxOccupants: type?.capacity ?? 1,
    roomsPerBlock,
    blocks: blocks.map((b) => ({ name: b.name })),
    reminderDays: h.reminderDays,
    bankName: h.bank.bankName,
    accountName: h.bank.accountName,
    accountNumber: h.bank.accountNumber,
    whatsappGroupLink: h.whatsappGroupLink,
  };
}

export function roomOf(r: HostelRoom, blockName: (id: string) => string): Room {
  return {
    id: r.id,
    block: blockName(r.blockId),
    number: r.number,
    underMaintenance: !!r.maintenance,
    ...(r.maintenance?.note ? { note: r.maintenance.note } : {}),
  };
}

/** The tenancy that describes a resident now: the active one, else the most recent. */
export function currentTenancy(tenancies: Tenancy[]) {
  return tenancies.find((t) => t.status === "active") ?? [...tenancies].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export function residentOf(p: HostelResident, tenancy: Tenancy | undefined): Resident {
  const person = omit(p, ["uid"]);
  const active = tenancy?.status === "active";
  return {
    ...person,
    occupants: tenancy?.occupants ?? [],
    roomId: active ? tenancy.roomId : null,
    status: active ? "active" : "moved_out",
    checkInDate: tenancy?.checkInDate ?? p.createdAt.slice(0, 10),
    leaseStart: tenancy?.leaseStart ?? p.createdAt.slice(0, 10),
    leaseEnd: tenancy?.leaseEnd ?? p.createdAt.slice(0, 10),
    ...(tenancy?.movedOutDate ? { movedOutDate: tenancy.movedOutDate } : {}),
  };
}

export const paymentOf = (p: HostelPayment): Payment => omit(p, ["uid", "tenancyId"]);
export const messageOf = (m: HostelMessage): Message => omit(m, ["recipientUids"]);
export const ticketOf = (t: HostelRequest): Ticket => omit(t, ["uid"]);
export const bookingOf = (b: HostelBooking): Booking => omit(b, ["spaceId"]);

export function toLegacy(v: HostelView): HostelState {
  const blockName = new Map(v.blocks.map((b) => [b.id, b.name]));
  const byResident = new Map<string, Tenancy[]>();
  for (const t of v.tenancies) byResident.set(t.residentId, [...(byResident.get(t.residentId) ?? []), t]);
  return {
    version: STATE_VERSION,
    settings: settingsOf(v),
    rooms: v.rooms.map((r) => roomOf(r, (id) => blockName.get(id) ?? id)),
    residents: v.residents.map((p) => residentOf(p, currentTenancy(byResident.get(p.id) ?? []))),
    payments: v.payments.map(paymentOf),
    messages: v.messages.map(messageOf),
    bookings: v.bookings.map(bookingOf),
    tickets: v.requests.map(ticketOf),
    sentReminderKeys: v.sentReminderKeys,
  };
}
