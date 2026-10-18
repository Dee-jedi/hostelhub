import type { HostelResident, Listing, Tenancy } from "@/lib/model";
import { hostelOfRequest, hostelRefs } from "@/lib/server/hostel-data";
import { readIdToken } from "@/lib/server/idcard";
import { todayISO } from "@/lib/utils";

/**
 * Called by the page security opens when they scan a tenant's ID card. Returns only what a gate
 * check needs (photo, name, room, whether rent is current), never contact or personal details.
 */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("t") ?? "";
  const card = readIdToken(token);
  if (!card) return Response.json({ valid: false, reason: "This QR code isn't a genuine HostelHub tenant ID." });
  // The card names its hostel; old cards are checked against the hostel of this page
  const hostelId = card.hostelId ?? hostelOfRequest(req);
  if (!hostelId) return Response.json({ valid: false, reason: "This QR code isn't a genuine HostelHub tenant ID." });

  const r = hostelRefs(hostelId);
  const [residentSnap, listingSnap, tenancies] = await Promise.all([
    r.doc("residents", card.uid).get(),
    r.listing.get(),
    r.col("tenancies").where("residentId", "==", card.uid).get(),
  ]);
  const person = residentSnap.data() as HostelResident | undefined;
  const hostelName = (listingSnap.data() as Listing | undefined)?.info.hostelName ?? "the hostel";
  if (!person) return Response.json({ valid: false, reason: "No tenant record found for this ID.", hostelName });

  const stays = tenancies.docs.map((d) => d.data() as Tenancy);
  const stay = stays.find((t) => t.status === "active") ?? stays.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const active = stay?.status === "active";
  const current = active && stay.leaseEnd >= todayISO();
  return Response.json({
    valid: current,
    reason: !active ? "This person has moved out." : current ? undefined : "Rent for this room has expired.",
    hostelName,
    fullName: person.fullName,
    photoUrl: person.photoUrl ?? null,
    roomId: active ? stay.roomId : null,
    leaseEnd: stay?.leaseEnd ?? null,
    isStudent: person.isStudent !== false,
    matricNo: person.isStudent !== false ? person.matricNo : undefined,
  });
}
