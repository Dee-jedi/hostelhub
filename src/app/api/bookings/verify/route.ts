import { BookingError, finalizeBooking } from "@/lib/server/bookings";
import { hostelOfRequest } from "@/lib/server/hostel-data";

/** Called by the browser after the Paystack popup reports success (or on return from a redirect). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { reference?: string } | null;
  if (typeof body?.reference !== "string" || !body.reference) return Response.json({ error: "Missing reference." }, { status: 400 });
  const hostelId = hostelOfRequest(req);
  if (!hostelId) return Response.json({ error: "Unknown hostel." }, { status: 404 });
  try {
    return Response.json(await finalizeBooking(hostelId, body.reference));
  } catch (err) {
    if (err instanceof BookingError) return Response.json({ error: err.message }, { status: 404 });
    console.error("bookings/verify", err);
    return Response.json({ error: "We couldn't confirm your payment yet. Please refresh in a moment." }, { status: 500 });
  }
}
