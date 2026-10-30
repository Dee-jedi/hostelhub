import { randomBytes } from "node:crypto";
import { joinIsOpen, joinOpenUntil } from "@/lib/join";
import type { Hostel, HostelResident, JoinRequest, Listing, Tenancy } from "@/lib/model";
import { adminDb } from "@/lib/server/admin";
import { setTenantOf } from "@/lib/server/claims";
import { command, CommandError } from "@/lib/server/command";
import { claimSpace, hostelRefs, listingUpdate, newId, plus, readTerms } from "@/lib/server/hostel-data";

/*
 * The join link, manager side: the link to share, the tenants waiting for approval, and
 * approving (they get their room and portal) or turning them away. Used by sign-up's last step
 * and by the dashboard, so the hostel comes from the body (sign-up runs on the platform address).
 */

type Body =
  | { hostelId: string; action: "overview" }
  | { hostelId: string; action: "newLink" }
  | { hostelId: string; action: "approve"; uid: string; roomId?: string }
  | { hostelId: string; action: "reject"; uid: string };

export interface JoinOverview {
  code: string | null;
  open: boolean;
  openUntil: string | null;
  requests: (JoinRequest & { roomLabel: string })[];
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
      // The manager may put them in a different room from the one they picked
      const claim = await claimSpace(tx, h, body.roomId || req.roomId);
      const { hostel } = await readTerms(tx, h, claim.room);
      const already = await tx.get(r.col("tenancies").where("uid", "==", uid).where("status", "==", "active").limit(1));
      if (!already.empty) throw new CommandError(`${req.info.fullName} is already a tenant here.`, 409);

      const now = new Date().toISOString();
      const movedIn = `${req.movedIn}-01`;
      const resident: HostelResident = { ...req.info, occupants: [], id: uid, uid, createdAt: now };
      const tenancy: Tenancy = {
        id: newId("t_"), residentId: uid, uid, roomId: claim.room.id, spaceId: claim.spaceId, periodId: hostel.defaultPeriodId,
        status: "active", checkInDate: movedIn, leaseStart: movedIn, leaseEnd: req.paidUntil, occupants: [], createdAt: now,
      };
      tx.set(r.doc("residents", uid), resident);
      tx.set(r.doc("tenancies", tenancy.id), tenancy);
      tx.update(r.listing, listingUpdate(claim.room, claim.type, plus(claim.occupied, claim.spaceId)));
      tx.update(ref, { status: "approved", decidedAt: now, roomId: claim.room.id });
      ctx.auditIn(tx, "join.approved", { uid, roomId: claim.room.id, spaceId: claim.spaceId, paidUntil: req.paidUntil });
    });
    // Their login can now open the tenant portal
    await setTenantOf(uid, h, true);
    return { ok: true };
  }

  throw new CommandError("Unknown action.");
});
