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
 * Step one of sign-up: saves the hostel as a draft owned by this login, and makes the login its
 * manager. The rest of the wizard (rooms, rent, bank) fills the draft in until it goes live.
 * Saving again (they went back and changed an answer) updates their draft instead.
 */
export const POST = command<HostelBasics, { hostelId: string }>({ access: "signed-in" }, async (ctx, body) => {
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
