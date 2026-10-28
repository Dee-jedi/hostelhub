import type { Hostel } from "@/lib/model";
import { basicsProblem, fullAddress, normalizePhone, slugProblem, type HostelBasics } from "@/lib/onboarding";
import { adminDb, verifyRequest } from "@/lib/server/admin";
import { setHostelRole } from "@/lib/server/claims";
import { command, CommandError } from "@/lib/server/command";
import { hostelRefs } from "@/lib/server/hostel-data";

/** One person can't hold more unfinished sign-ups than this (stops web addresses being hoarded). */
const MAX_DRAFTS_PER_OWNER = 3;

/** A draft this login started holds its address for them: going back to it isn't "taken". */
const ownDraft = (data: Hostel | undefined, uid: string | undefined) => !!uid && data?.ownerUid === uid && data.status === "draft";

/**
 * GET ?slug=…: can a new hostel use this web address? Public, because the wizard asks before
 * sign-up; a signed-in caller's own unfinished hostel counts as theirs (`yours: true`).
 */
export async function GET(req: Request) {
  const slug = (new URL(req.url).searchParams.get("slug") ?? "").trim().toLowerCase();
  const problem = slugProblem(slug);
  if (problem) return Response.json({ slug, available: false, problem });
  try {
    // The address is the hostel's id, so "taken" means "a hostel document exists"
    const [snap, caller] = await Promise.all([hostelRefs(slug).hostel.get(), verifyRequest(req)]);
    if (snap.exists && ownDraft(snap.data() as Hostel, caller?.uid)) return Response.json({ slug, available: true, yours: true, problem: null });
    return Response.json({ slug, available: !snap.exists, problem: snap.exists ? "That address is taken. Try another." : null });
  } catch (err) {
    console.error("onboarding/hostel GET", err);
    return Response.json({ error: "Couldn't check that address. Try again." }, { status: 500 });
  }
}

/**
 * Moves an unfinished hostel to a new web address. The address is the id everything is filed
 * under, so its records are copied across and the old address freed. Only before any booking:
 * after that, receipts and links carry the address. Safe to retry: a half-done move finds the
 * new address already theirs and carries on.
 */
async function moveDraft(uid: string, from: string, to: string) {
  const old = hostelRefs(from);
  const next = hostelRefs(to);
  const snap = await old.hostel.get();
  if (!ownDraft(snap.data() as Hostel | undefined, uid)) {
    // Already moved (a retry after the copy finished), or not theirs to move
    if (ownDraft((await next.hostel.get()).data() as Hostel | undefined, uid)) return;
    throw new CommandError("Only an unfinished hostel you started can change its web address.", 403);
  }
  const [bookings, tenancies] = await Promise.all([old.col("bookings").limit(1).get(), old.col("tenancies").limit(1).get()]);
  if (!bookings.empty || !tenancies.empty) throw new CommandError("This hostel has taken bookings, so its web address can't change here. Message us to change it.", 409);

  await adminDb.runTransaction(async (tx) => {
    const target = await tx.get(next.hostel);
    if (target.exists && !ownDraft(target.data() as Hostel, uid)) throw new CommandError("Someone just took that web address. Pick another.", 409);
    tx.set(next.hostel, { ...(snap.data() as Hostel), id: to });
  });
  const writer = adminDb.bulkWriter();
  const [cols, listing] = await Promise.all([old.hostel.listCollections(), old.listing.get()]);
  for (const docs of await Promise.all(cols.map((c) => c.get()))) for (const d of docs.docs) writer.set(next.col(d.ref.parent.id).doc(d.id), d.data());
  if (listing.exists) writer.set(next.listing, listing.data()!);
  await writer.close();

  await setHostelRole(uid, to, "manager");
  await setHostelRole(uid, from, null);
  await Promise.all([adminDb.recursiveDelete(old.hostel), old.listing.delete()]);
  await next.col("audit").add({ action: "hostel.moved", at: new Date().toISOString(), by: { uid, email: null, role: "manager" }, details: { from, to } });
}

/**
 * Step one of sign-up: saves the hostel as a draft owned by this login, and makes the login its
 * manager. The rest of the wizard (rooms, rent, bank) fills the draft in until it goes live.
 * Saving again (they went back and changed an answer) updates their draft instead.
 */
export const POST = command<HostelBasics & { from?: string }, { hostelId: string }>({ access: "signed-in" }, async (ctx, body) => {
  const basics: HostelBasics = {
    name: String(body.name ?? "").trim(),
    slug: String(body.slug ?? "").trim().toLowerCase(),
    street: String(body.street ?? "").trim(),
    city: String(body.city ?? "").trim(),
    state: String(body.state ?? ""),
    managerName: String(body.managerName ?? "").trim(),
    managerPhone: normalizePhone(String(body.managerPhone ?? "")),
  };
  const problem = basicsProblem(basics);
  if (problem) throw new CommandError(problem);
  const uid = ctx.user!.uid;
  const ref = hostelRefs(basics.slug).hostel;
  const now = new Date().toISOString();
  // They went back and picked a new web address for the hostel they already saved
  const from = String(body.from ?? "").trim().toLowerCase();
  if (from && from !== basics.slug) await moveDraft(uid, from, basics.slug);

  if (ownDraft((await ref.get()).data() as Hostel | undefined, uid)) {
    await ref.update({
      name: basics.name,
      address: fullAddress(basics),
      location: { street: basics.street, city: basics.city, state: basics.state },
      manager: { name: basics.managerName, phone: basics.managerPhone },
    });
    await setHostelRole(uid, basics.slug, "manager");
    await hostelRefs(basics.slug)
      .col("audit")
      .add({ action: "hostel.details", at: now, by: { uid, email: ctx.user!.email ?? null, role: "manager" }, details: { name: basics.name } });
    return { hostelId: basics.slug };
  }

  const drafts = await adminDb.collection("hostels").where("ownerUid", "==", uid).where("status", "==", "draft").get();
  if (drafts.size >= MAX_DRAFTS_PER_OWNER) throw new CommandError("Finish or remove one of your unfinished hostels before starting another.", 409);

  const hostel: Hostel = {
    id: basics.slug,
    name: basics.name,
    address: fullAddress(basics),
    location: { street: basics.street, city: basics.city, state: basics.state },
    manager: { name: basics.managerName, phone: basics.managerPhone },
    bank: { bankName: "", accountName: "", accountNumber: "" },
    whatsappGroupLink: "",
    currency: "NGN",
    timezone: "Africa/Lagos",
    status: "draft",
    reminderDays: [30, 14, 7, 1],
    // Created by the rent step; the id is fixed so later steps can refer to it now
    defaultPeriodId: "main",
    createdAt: now,
    ownerUid: uid,
    onboarding: { step: "rooms", startedAt: now },
  };

  await adminDb.runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) throw new CommandError("Someone just took that web address. Pick another.", 409);
    tx.create(ref, hostel);
  });
  await setHostelRole(uid, basics.slug, "manager");
  // The hostel exists now, so the audit goes in its log (command() only knows the address's hostel)
  await hostelRefs(basics.slug)
    .col("audit")
    .add({ action: "hostel.created", at: now, by: { uid, email: ctx.user!.email ?? null, role: "manager" }, details: { name: basics.name } });

  return { hostelId: basics.slug };
});
