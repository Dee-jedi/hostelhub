import { randomBytes } from "node:crypto";
import { joinIsOpen, joinOpenUntil } from "@/lib/join";
import type { Hostel, HostelResident, JoinRequest, Listing, Tenancy } from "@/lib/model";
import { adminDb } from "@/lib/server/admin";
import { setTenantOf } from "@/lib/server/claims";
import { command, CommandError } from "@/lib/server/command";
import { claimSpace, hostelRefs, listingUpdate, newId, plus, readTerms } from "@/lib/server/hostel-data";
import { isNigerianPhone, normalizePhone } from "@/lib/onboarding";
import { addMonths, todayISO } from "@/lib/utils";

/*
 * The join link, manager side: the link to share, the tenants waiting for approval, and
 * approving (they get their room and portal) or turning them away. Used by sign-up's last step
 * and by the dashboard, so the hostel comes from the body (sign-up runs on the platform address).
 */

type Body =
  | { hostelId: string; action: "overview" }
  | { hostelId: string; action: "newLink" }
  | { hostelId: string; action: "approve"; uid: string; edits?: JoinEdits }
  | { hostelId: string; action: "reject"; uid: string };

/** What the manager may correct before approving (a wrong date, the wrong room, a typo). */
export interface JoinEdits {
  fullName?: string;
  phone?: string;
  roomId?: string;
  movedIn?: string;
  paidUntil?: string;
}

export interface JoinOverview {
  code: string | null;
  open: boolean;
  openUntil: string | null;
  requests: (JoinRequest & { roomLabel: string })[];
  /** Every room, for moving a request to another one */
  rooms: { id: string; label: string; block: string }[];
}

/** The request with the manager's corrections, checked the same way the tenant's form is. */
function corrected(req: JoinRequest, edits: JoinEdits = {}) {
  const fullName = (edits.fullName ?? req.info.fullName).trim().replace(/\s+/g, " ");
  const phone = normalizePhone(edits.phone ?? req.info.phone);
  const movedIn = edits.movedIn ?? req.movedIn;
  const paidUntil = edits.paidUntil ?? req.paidUntil;
  const today = todayISO();
  if (fullName.split(" ").length < 2) throw new CommandError("Enter their first and last name.");
  if (!isNigerianPhone(phone)) throw new CommandError("Enter their phone number, like 08031234567.");
  if (!/^\d{4}-\d{2}$/.test(movedIn) || movedIn > today.slice(0, 7)) throw new CommandError("Pick the month they moved in (not in the future).");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidUntil) || paidUntil <= today) throw new CommandError("Pick the date their rent is paid until (after today).");
  if (paidUntil > addMonths(today, 36)) throw new CommandError("Rent paid more than 3 years ahead? Check the date.");
  return { info: { ...req.info, fullName, phone }, roomId: edits.roomId || req.roomId, movedIn, paidUntil };
}

const newCode = () => randomBytes(5).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6).padEnd(6, "x");

export const POST = command<Body, JoinOverview | { ok: true }>({ access: "manager", hostelFromBody: true }, async (ctx, body) => {
  const h = ctx.hostelId!;
  const r = hostelRefs(h);

  if (body.action === "overview" || body.action === "newLink") {
    const [hostelSnap, pending, listingSnap] = await Promise.all([r.hostel.get(), r.col("joinRequests").where("status", "==", "pending").limit(200).get(), r.listing.get()]);
    const hostel = hostelSnap.data() as Hostel | undefined;
    if (!hostel) throw new CommandError("Hostel not found.", 404);
    let code = hostel.joinCode ?? null;
    // The first look makes the link; a new one turns the old one off (it was shared too widely)
    if ((!code || body.action === "newLink") && joinIsOpen(hostel)) {
      code = newCode();
      await r.hostel.update({ joinCode: code });
      if (body.action === "newLink") await ctx.audit("join.link_changed");
    }
    const rooms = (listingSnap.data() as Listing | undefined)?.rooms ?? {};
    return {
      code,
      open: joinIsOpen(hostel),
      openUntil: joinOpenUntil(hostel),
      requests: pending.docs
        .map((d) => d.data() as JoinRequest)
        .map((q) => ({ ...q, roomLabel: rooms[q.roomId]?.label ?? q.roomId }))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      rooms: Object.entries(rooms)
        .map(([id, room]) => ({ id, label: room.label ?? id, block: (listingSnap.data() as Listing).info.blockNames?.[room.block] ?? room.block, n: room.number }))
        .sort((a, b) => a.block.localeCompare(b.block) || a.n - b.n)
        .map(({ id, label, block }) => ({ id, label, block })),
    };
  }

  if (body.action === "reject") {
    const ref = r.doc("joinRequests", String(body.uid ?? ""));
    const req = (await ref.get()).data() as JoinRequest | undefined;
    if (!req || req.status !== "pending") throw new CommandError("That request was already dealt with.", 409);
    await ref.update({ status: "rejected", decidedAt: new Date().toISOString() });
    await ctx.audit("join.rejected", { uid: req.uid, name: req.info.fullName });
    return { ok: true };
  }

  if (body.action === "approve") {
    const uid = String(body.uid ?? "");
    await adminDb.runTransaction(async (tx) => {
      const ref = r.doc("joinRequests", uid);
      const [reqSnap, hostelSnap] = await tx.getAll(ref, r.hostel);
      const req = reqSnap.data() as JoinRequest | undefined;
      if (!req || req.status !== "pending") throw new CommandError("That request was already dealt with.", 409);
      if (!joinIsOpen(hostelSnap.data() as Hostel)) throw new CommandError("The join link has closed. Add this tenant from Residents instead.", 410);
      // With the manager's corrections, if any (room, dates, name, phone)
      const fixed = corrected(req, body.edits);
      const claim = await claimSpace(tx, h, fixed.roomId);
      const { hostel } = await readTerms(tx, h, claim.room);
      const already = await tx.get(r.col("tenancies").where("uid", "==", uid).where("status", "==", "active").limit(1));
      if (!already.empty) throw new CommandError(`${fixed.info.fullName} is already a tenant here.`, 409);

      const now = new Date().toISOString();
      const movedIn = `${fixed.movedIn}-01`;
      const resident: HostelResident = { ...fixed.info, occupants: [], id: uid, uid, createdAt: now };
      const tenancy: Tenancy = {
        id: newId("t_"), residentId: uid, uid, roomId: claim.room.id, spaceId: claim.spaceId, periodId: hostel.defaultPeriodId,
        status: "active", checkInDate: movedIn, leaseStart: movedIn, leaseEnd: fixed.paidUntil, occupants: [], createdAt: now,
      };
      tx.set(r.doc("residents", uid), resident);
      tx.set(r.doc("tenancies", tenancy.id), tenancy);
      tx.update(r.listing, listingUpdate(claim.room, claim.type, plus(claim.occupied, claim.spaceId)));
      // The request keeps what was approved, so it matches the tenancy
      tx.update(ref, { status: "approved", decidedAt: now, roomId: claim.room.id, info: fixed.info, movedIn: fixed.movedIn, paidUntil: fixed.paidUntil });
      ctx.auditIn(tx, "join.approved", { uid, roomId: claim.room.id, spaceId: claim.spaceId, paidUntil: fixed.paidUntil, edited: !!body.edits });
    });
    // Their login can now open the tenant portal
    await setTenantOf(uid, h, true);
    return { ok: true };
  }

  throw new CommandError("Unknown action.");
});
