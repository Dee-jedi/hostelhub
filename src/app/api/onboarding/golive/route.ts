import { FieldValue } from "firebase-admin/firestore";
import { accessFrom, isManagerOf } from "@/lib/access";
import { TERMS_VERSION } from "@/lib/fees";
import type { Hostel, HostelResident, Listing, Tenancy } from "@/lib/model";
import { adminDb, verifyRequest } from "@/lib/server/admin";
import { command, CommandError } from "@/lib/server/command";
import { placeExistingTenant } from "@/lib/server/existing-tenants";
import { hostelRefs, listingUpdate, minus, readOccupancy } from "@/lib/server/hostel-data";
import { isTestMode } from "@/lib/server/paystack";
import type { Sex } from "@/lib/types";

/*
 * Sign-up, part four: going live. Before that, the owner adds the tenants already living there
 * (free: they weren't found through HostelHub), checks their booking page, and accepts the fee
 * terms. Going live opens the booking page and flags the payout account for verification.
 */

/** GET ?hostelId=…: rooms with free spaces and the tenants added so far (two reads and a small query). */
export async function GET(req: Request) {
  const hostelId = new URL(req.url).searchParams.get("hostelId") ?? "";
  const user = await verifyRequest(req);
  if (!user) return Response.json({ error: "Please sign in again." }, { status: 401 });
  if (!hostelId || !isManagerOf(accessFrom(user as Record<string, unknown>), hostelId)) return Response.json({ error: "You don't have access to this." }, { status: 403 });
  const r = hostelRefs(hostelId);
  const [hostelSnap, listingSnap, stays] = await Promise.all([r.hostel.get(), r.listing.get(), r.col("tenancies").where("status", "==", "active").get()]);
  const hostel = hostelSnap.data() as Hostel | undefined;
  const listing = listingSnap.data() as Listing | undefined;
  if (!hostel || !listing) return Response.json({ error: "Set up your rooms first." }, { status: 409 });

  const tenancies = stays.docs.map((d) => ({ ...(d.data() as Tenancy), id: d.id }));
  const people = tenancies.length ? await adminDb.getAll(...tenancies.map((t) => r.doc("residents", t.residentId))) : [];
  const names = new Map(people.map((p) => [p.id, p.data() as HostelResident | undefined]));
  const blockName = (id: string) => listing.info.blockNames?.[id] ?? id;
  const rooms = Object.entries(listing.rooms)
    .map(([id, room]) => ({
      id,
      label: room.label ?? id,
      block: blockName(room.block),
      free: room.beds ? Object.values(room.beds).filter((s) => s === "vacant").length : room.status === "vacant" ? 1 : 0,
      perBed: !!room.beds,
      order: room.number,
    }))
    .sort((a, b) => a.block.localeCompare(b.block) || a.order - b.order);

  return Response.json({
    name: hostel.name,
    status: hostel.status,
    payout: !!hostel.payout,
    testMode: isTestMode(),
    rooms,
    tenants: tenancies
      .map((t) => ({ tenancyId: t.id, name: names.get(t.residentId)?.fullName ?? "", phone: names.get(t.residentId)?.phone ?? "", roomLabel: listing.rooms[t.roomId ?? ""]?.label ?? t.roomId, spaceId: t.spaceId, paidUntil: t.leaseEnd, online: !!t.uid }))
      .sort((a, b) => (a.roomLabel ?? "").localeCompare(b.roomLabel ?? "", undefined, { numeric: true })),
  });
}

type Body =
  | { hostelId: string; action: "addTenant"; fullName: string; phone: string; sex?: Sex; roomId: string; paidUntil: string }
  | { hostelId: string; action: "removeTenant"; tenancyId: string }
  | { hostelId: string; action: "goLive"; acceptTerms: boolean };

async function draftOf(h: string) {
  const hostel = (await hostelRefs(h).hostel.get()).data() as Hostel | undefined;
  if (!hostel) throw new CommandError("Hostel not found.", 404);
  if (hostel.status !== "draft") throw new CommandError("This hostel is already live. Manage tenants from your dashboard.", 409);
  return hostel;
}

export const POST = command<Body, { ok: true; tenancyId?: string; spaceId?: string }>({ access: "manager", hostelFromBody: true }, async (ctx, body) => {
  const h = ctx.hostelId!;
  const r = hostelRefs(h);

  if (body.action === "addTenant") {
    // Tenants living there before the hostel joined: free to add, no payment recorded
    const placed = await placeExistingTenant(ctx, h, body);
    // The screen shows the tenant straight away; this tells it which bed they got
    return { ok: true, tenancyId: placed.tenancyId, spaceId: placed.spaceId };
  }

  if (body.action === "removeTenant") {
    // A mistake while importing: the tenant and their stay go, and the space is free again
    await adminDb.runTransaction(async (tx) => {
      const [snap, hostelSnap] = await tx.getAll(r.doc("tenancies", String(body.tenancyId ?? "")), r.hostel);
      if ((hostelSnap.data() as Hostel | undefined)?.status !== "draft") throw new CommandError("This hostel is already live. Manage tenants from your dashboard.", 409);
      const tenancy = snap.data() as Tenancy | undefined;
      if (!tenancy) throw new CommandError("That tenant was already removed.", 404);
      if (tenancy.uid) throw new CommandError("This tenant booked online. Manage them from your dashboard.", 409);
      const occ = tenancy.roomId ? await readOccupancy(tx, h, tenancy.roomId) : null;
      tx.delete(snap.ref);
      tx.delete(r.doc("residents", tenancy.residentId));
      if (occ) tx.update(r.listing, listingUpdate(occ.room, occ.type, minus(occ.occupied, tenancy.spaceId)));
      ctx.auditIn(tx, "tenant.import_removed", { residentId: tenancy.residentId, roomId: tenancy.roomId });
    });
    return { ok: true };
  }

  if (body.action === "goLive") {
    const hostel = await draftOf(h);
    if (body.acceptTerms !== true) throw new CommandError("Tick the box to accept the fees first.");
    if (!(await r.col("rooms").limit(1).get()).size) throw new CommandError("Set up your rooms and prices first.", 409);
    if (!hostel.payout) throw new CommandError("Set up where your rent goes first.", 409);
    // A payout account made with test keys can't receive real money
    if (hostel.payout.mode === "test" && !isTestMode()) throw new CommandError("Set up your payout account again before going live.", 409);
    const now = new Date().toISOString();
    const batch = adminDb.batch();
    batch.update(r.hostel, { status: "live", liveAt: now, "onboarding.step": "done", terms: { version: TERMS_VERSION, acceptedAt: now, uid: ctx.user!.uid } });
    batch.update(r.listing, { "info.open": FieldValue.delete() });
    // Paystack holds a new subaccount's first payout until someone verifies it on the dashboard
    batch.set(adminDb.doc(`platformTasks/verify-payout-${h}`), {
      kind: "verify_payout", hostelId: h, hostelName: hostel.name, subaccountCode: hostel.payout.subaccountCode, mode: hostel.payout.mode, createdAt: now, done: false,
    });
    await batch.commit();
    await ctx.audit("hostel.live", { termsVersion: TERMS_VERSION });
    return { ok: true };
  }

  throw new CommandError("Unknown action.");
});
