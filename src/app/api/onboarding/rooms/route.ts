import type { DocumentReference } from "firebase-admin/firestore";
import { accessFrom, isManagerOf } from "@/lib/access";
import type { Hostel, PricingMode } from "@/lib/model";
import { setupProblem, setupToDocs, type RoomsSetup } from "@/lib/room-setup";
import { adminDb, verifyRequest } from "@/lib/server/admin";
import { command, CommandError } from "@/lib/server/command";
import { hostelRefs } from "@/lib/server/hostel-data";

/** The most rooms sign-up creates in one go (bigger hostels add more blocks afterwards). */
const MAX_ROOMS = 1000;
/** The collections this step owns while the hostel is a draft. */
const SETUP_COLLECTIONS = ["roomTypes", "rentPeriods", "blocks", "rooms"] as const;

type Draft = Hostel & { setupDraft?: RoomsSetup };

/** GET ?hostelId=…: the rooms setup saved so far, so the wizard can resume on any device. */
export async function GET(req: Request) {
  const hostelId = new URL(req.url).searchParams.get("hostelId") ?? "";
  const user = await verifyRequest(req);
  if (!user) return Response.json({ error: "Please sign in again." }, { status: 401 });
  if (!hostelId || !isManagerOf(accessFrom(user as Record<string, unknown>), hostelId)) return Response.json({ error: "You don't have access to this." }, { status: 403 });
  const hostel = (await hostelRefs(hostelId).hostel.get()).data() as Draft | undefined;
  if (!hostel) return Response.json({ error: "Hostel not found." }, { status: 404 });
  return Response.json({ name: hostel.name, status: hostel.status, step: hostel.onboarding?.step ?? null, setup: hostel.setupDraft ?? null });
}

/**
 * Saves the rooms, classes, rent options and charges of a draft hostel, replacing whatever an
 * earlier save wrote (the manager can go back and change anything until going live).
 */
export const POST = command<{ hostelId: string; setup: RoomsSetup }, { rooms: number }>({ access: "manager", hostelFromBody: true }, async (ctx, body) => {
  const h = ctx.hostelId!;
  const setup = body.setup;
  if (!setup || typeof setup !== "object" || !Array.isArray(setup.classes)) throw new CommandError("Missing the rooms setup.");
  const problem = setupProblem(setup);
  if (problem) throw new CommandError(problem);
  const docs = setupToDocs(setup);
  if (docs.rooms.length > MAX_ROOMS) throw new CommandError(`Sign-up handles up to ${MAX_ROOMS} rooms. Add the rest from your dashboard afterwards.`);

  const r = hostelRefs(h);
  const [hostelSnap, tenancies] = await Promise.all([r.hostel.get(), r.col("tenancies").limit(1).get()]);
  const hostel = hostelSnap.data() as Draft | undefined;
  if (!hostel) throw new CommandError("Hostel not found.", 404);
  if (hostel.status !== "draft") throw new CommandError("This hostel is live. Change rooms and prices from your dashboard.", 409);
  if (!tenancies.empty) throw new CommandError("This hostel already has tenants. Change rooms from your dashboard.", 409);

  // Replace the previous save: delete this step's documents, then write the new ones
  const writer = adminDb.bulkWriter();
  const old = await Promise.all(SETUP_COLLECTIONS.map((c) => r.col(c).listDocuments()));
  for (const ref of old.flat()) void writer.delete(ref as DocumentReference);
  await writer.flush();
  const put = (coll: (typeof SETUP_COLLECTIONS)[number], id: string, data: object) => void writer.set(r.doc(coll, id), data);
  docs.types.forEach((t) => put("roomTypes", t.id, t));
  docs.periods.forEach((p) => put("rentPeriods", p.id, p));
  docs.blocks.forEach((b) => put("blocks", b.id, b));
  docs.rooms.forEach((room) => put("rooms", room.id, room));
  await writer.close();

  // Screens that still read one charging style for the whole hostel get the most common one
  const perBed = docs.types.filter((t) => t.pricingMode === "per_bed").length;
  const rentalModel: PricingMode = perBed * 2 >= docs.types.length ? "per_bed" : "per_room";
  await r.hostel.update({
    defaultPeriodId: docs.defaultPeriodId,
    defaultTypeId: docs.defaultTypeId,
    rentalModel,
    charges: docs.charges,
    setupDraft: setup,
    "onboarding.step": "payments",
  });
  await ctx.audit("hostel.rooms_set", { rooms: docs.rooms.length, classes: docs.types.length, options: docs.periods.length });
  return { rooms: docs.rooms.length };
});
