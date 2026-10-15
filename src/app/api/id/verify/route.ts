import { adminDb } from "@/lib/server/admin";
import { readIdToken } from "@/lib/server/idcard";
import type { PublicBookingDoc, Resident } from "@/lib/types";
import { todayISO } from "@/lib/utils";

/**
 * Called by the page security opens when they scan a tenant's ID card. Returns only what a gate
 * check needs (photo, name, room, whether rent is current), never contact or personal details.
 */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("t") ?? "";
  const uid = readIdToken(token);
  if (!uid) return Response.json({ valid: false, reason: "This QR code isn't a genuine HostelHub tenant ID." });

  const [residentSnap, pubSnap] = await Promise.all([adminDb.doc(`residents/${uid}`).get(), adminDb.doc("public/booking").get()]);
  const r = residentSnap.data() as Resident | undefined;
  const hostelName = (pubSnap.data() as PublicBookingDoc | undefined)?.info.hostelName ?? "the hostel";
  if (!r) return Response.json({ valid: false, reason: "No tenant record found for this ID.", hostelName });

  const current = r.status === "active" && r.leaseEnd >= todayISO();
  return Response.json({
    valid: current,
    reason: r.status !== "active" ? "This person has moved out." : current ? undefined : "Rent for this room has expired.",
    hostelName,
    fullName: r.fullName,
    photoUrl: r.photoUrl ?? null,
    roomId: r.roomId,
    leaseEnd: r.leaseEnd,
    isStudent: r.isStudent !== false,
    matricNo: r.isStudent !== false ? r.matricNo : undefined,
  });
}
