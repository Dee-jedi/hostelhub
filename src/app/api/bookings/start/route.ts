import { verifyRequest } from "@/lib/server/admin";
import { BookingError, startBooking, validateBookingInfo } from "@/lib/server/bookings";
import type { StudentInfo } from "@/lib/types";

export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user?.email) return Response.json({ error: "Please sign in again." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { info?: StudentInfo; roomId?: string; agent?: string } | null;
  if (!body?.info || typeof body.roomId !== "string") return Response.json({ error: "Missing booking details." }, { status: 400 });
  const invalid = validateBookingInfo(body.info);
  if (invalid) return Response.json({ error: invalid }, { status: 400 });
  // The passport photo must be the one this tenant uploaded to their own Storage folder
  const photoPrefix = `https://firebasestorage.googleapis.com/v0/b/${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}/o/passports%2F${user.uid}%2F`;
  if (!body.info.photoUrl?.startsWith(photoPrefix)) return Response.json({ error: "Please add a passport photograph." }, { status: 400 });

  try {
    const result = await startBooking({
      uid: user.uid,
      email: user.email,
      info: body.info,
      roomId: body.roomId,
      agent: typeof body.agent === "string" ? body.agent : undefined,
      origin: new URL(req.url).origin,
    });
    return Response.json(result);
  } catch (err) {
    if (err instanceof BookingError) return Response.json({ error: err.message }, { status: 409 });
    console.error("bookings/start", err);
    return Response.json({ error: "Could not start payment. Please try again." }, { status: 500 });
  }
}
