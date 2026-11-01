import type { Hostel, HostelResident, Tenancy } from "../model";
import { joinIsOpen } from "../join";
import { isNigerianPhone, normalizePhone } from "../onboarding";
import type { Sex } from "../types";
import { addMonths, todayISO } from "../utils";
import { adminDb } from "./admin";
import { CommandError, type CommandContext } from "./command";
import { claimSpace, hostelRefs, listingUpdate, newId, plus, readTerms } from "./hostel-data";

/*
 * Tenants who lived in a hostel before it joined HostelHub: added free, with no payment
 * recorded, while the hostel is setting up and for the join-link window after it goes live.
 * Used by sign-up's "add them yourself" form and by the spreadsheet import.
 */

export interface ExistingTenant {
  fullName: string;
  phone: string;
  sex?: Sex;
  roomId: string;
  /** yyyy-mm-dd: the day their current rent runs out */
  paidUntil: string;
}

const EMPTY = {
  email: "", matricNo: "", department: "", faculty: "", level: "", stateOfOrigin: "", homeAddress: "",
  nextOfKinName: "", nextOfKinPhone: "", nextOfKinRelationship: "", occupants: [],
};

/** The tenant tidied and checked; throws a message the manager can act on. */
export function checkedTenant(row: ExistingTenant): ExistingTenant {
  const fullName = String(row.fullName ?? "").trim().replace(/\s+/g, " ");
  const phone = normalizePhone(String(row.phone ?? ""));
  const paidUntil = String(row.paidUntil ?? "");
  const today = todayISO();
  if (fullName.split(" ").length < 2) throw new CommandError("Enter the tenant's first and last name.");
  if (!isNigerianPhone(phone)) throw new CommandError("Enter their phone number, like 08031234567.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidUntil) || paidUntil <= today) throw new CommandError("Pick the date their rent is paid until (a date after today).");
  if (paidUntil > addMonths(today, 36)) throw new CommandError("Rent paid more than 3 years ahead? Check the date.");
  return { fullName, phone, sex: row.sex === "Female" ? "Female" : "Male", roomId: String(row.roomId ?? ""), paidUntil };
}

/**
 * Puts one existing tenant in their room: resident, tenancy and the listing in one transaction,
 * so two at once can't take the same bed. Refused once the free window has closed.
 */
export async function placeExistingTenant(ctx: CommandContext, h: string, row: ExistingTenant, action = "tenant.imported") {
  const tenant = checkedTenant(row);
  const r = hostelRefs(h);
  const tenancyId = newId("t_");
  const today = todayISO();
  return adminDb.runTransaction(async (tx) => {
    const claim = await claimSpace(tx, h, tenant.roomId);
    const { hostel } = await readTerms(tx, h, claim.room);
    if (!joinIsOpen(hostel as Hostel)) throw new CommandError("Adding tenants free has closed for this hostel. Add them from Residents.", 410);
    const residentId = newId("res_");
    const now = new Date().toISOString();
    const resident: HostelResident = { ...EMPTY, isStudent: true, fullName: tenant.fullName, phone: tenant.phone, sex: tenant.sex!, id: residentId, uid: null, createdAt: now };
    const tenancy: Tenancy = {
      id: tenancyId, residentId, uid: null, roomId: claim.room.id, spaceId: claim.spaceId, periodId: hostel.defaultPeriodId,
      status: "active", checkInDate: today, leaseStart: today, leaseEnd: tenant.paidUntil, occupants: [], createdAt: now,
    };
    tx.set(r.doc("residents", residentId), resident);
    tx.set(r.doc("tenancies", tenancyId), tenancy);
    tx.update(r.listing, listingUpdate(claim.room, claim.type, plus(claim.occupied, claim.spaceId)));
    ctx.auditIn(tx, action, { residentId, roomId: claim.room.id, spaceId: claim.spaceId, paidUntil: tenant.paidUntil });
    return { tenancyId, spaceId: claim.spaceId };
  });
}
