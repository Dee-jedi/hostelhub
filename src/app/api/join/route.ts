import type { Hostel, HostelRoom, JoinRequest } from "@/lib/model";
import { joinIsOpen, joinOpenUntil } from "@/lib/join";
import { isNigerianPhone, normalizePhone } from "@/lib/onboarding";
import { adminDb } from "@/lib/server/admin";
import { command, CommandError } from "@/lib/server/command";
import { hostelOfRequest, hostelRefs } from "@/lib/server/hostel-data";
import type { StudentInfo } from "@/lib/types";
import { addMonths, todayISO, toStudentInfo } from "@/lib/utils";

/*
 * The join link, tenant side (/join/{code} on the hostel's address). GET checks the link; POST
 * sends the tenant's details for the manager to approve. Nothing is added until they do.
 */

async function hostelForCode(h: string | null, code: string) {
  if (!h) throw new CommandError("This address isn't a hostel.", 404);
  const hostel = (await hostelRefs(h).hostel.get()).data() as Hostel | undefined;
  if (!hostel || !hostel.joinCode || hostel.joinCode !== code) throw new CommandError("This link isn't valid any more. Ask your hostel manager for the current one.", 404);
  if (!joinIsOpen(hostel)) throw new CommandError(`This link closed. Ask your hostel manager to add you.`, 410);
  return hostel;
}

export async function GET(req: Request) {
  try {
    const code = new URL(req.url).searchParams.get("code") ?? "";
    const hostel = await hostelForCode(hostelOfRequest(req), code);
    return Response.json({ hostelName: hostel.name, openUntil: joinOpenUntil(hostel) });
  } catch (err) {
    if (err instanceof CommandError) return Response.json({ error: err.message }, { status: err.status });
    console.error("join GET", err);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

export const POST = command<{ code: string; info: StudentInfo; roomId: string; movedIn: string; paidUntil: string }, { ok: true }>({ access: "signed-in" }, async (ctx, body) => {
  const h = ctx.hostelId;
  await hostelForCode(h, String(body.code ?? ""));
  const r = hostelRefs(h!);
  const uid = ctx.user!.uid;
  const info = toStudentInfo({ ...(body.info ?? ({} as StudentInfo)), email: ctx.user!.email ?? "", occupants: [] });
  const today = todayISO();

  if (info.fullName?.trim().split(/\s+/).length < 2) throw new CommandError("Enter your first and last name.");
  if (!isNigerianPhone(info.phone ?? "")) throw new CommandError("Enter your phone number, like 08031234567.");
  if (info.sex !== "Male" && info.sex !== "Female") throw new CommandError("Pick male or female.");
  if (!/^\d{4}-\d{2}$/.test(String(body.movedIn)) || body.movedIn > today.slice(0, 7)) throw new CommandError("Pick the month you moved in.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.paidUntil)) || body.paidUntil <= today) throw new CommandError("Pick the date your rent is paid until (after today).");
  if (body.paidUntil > addMonths(today, 36)) throw new CommandError("Rent paid more than 3 years ahead? Check the date.");

  const [room, mine] = await Promise.all([
    r.doc("rooms", String(body.roomId ?? "")).get(),
    r.col("tenancies").where("uid", "==", uid).where("status", "==", "active").limit(1).get(),
  ]);
  if (!room.exists) throw new CommandError("Pick your room.");
  if (!mine.empty) throw new CommandError("You're already a tenant here. Log in to your portal.", 409);

  // One request per login: sending again replaces the earlier one (e.g. after fixing the room)
  const request: JoinRequest = {
    uid,
    info: { ...info, phone: normalizePhone(info.phone) },
    roomId: (room.data() as HostelRoom).id ?? room.id,
    movedIn: body.movedIn,
    paidUntil: body.paidUntil,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  await adminDb.runTransaction(async (tx) => {
    const ref = r.doc("joinRequests", uid);
    const existing = (await tx.get(ref)).data() as JoinRequest | undefined;
    if (existing?.status === "approved") throw new CommandError("Your manager already approved you. Log in to your portal.", 409);
    tx.set(ref, request);
  });
  return { ok: true };
});
