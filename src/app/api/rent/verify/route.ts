import { BookingError } from "@/lib/server/bookings";
import { finalizeRenewal } from "@/lib/server/renewals";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { reference?: string } | null;
  if (typeof body?.reference !== "string" || !body.reference.startsWith("RN-")) return Response.json({ error: "Missing reference." }, { status: 400 });
  try {
    return Response.json(await finalizeRenewal(body.reference));
  } catch (err) {
    if (err instanceof BookingError) return Response.json({ error: err.message }, { status: 404 });
    console.error("rent/verify", err);
    return Response.json({ error: "We couldn't confirm your payment yet. Please refresh in a moment." }, { status: 500 });
  }
}
