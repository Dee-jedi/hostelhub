import { verifyRequest } from "@/lib/server/admin";
import { BookingError } from "@/lib/server/bookings";
import { startRenewal } from "@/lib/server/renewals";

/** Tenant portal: start paying the next rent period. The amount comes from hostel settings, not the browser. */
export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user?.email) return Response.json({ error: "Please sign in again." }, { status: 401 });
  try {
    return Response.json(await startRenewal({ uid: user.uid, email: user.email, origin: new URL(req.url).origin }));
  } catch (err) {
    if (err instanceof BookingError) return Response.json({ error: err.message }, { status: 409 });
    console.error("rent/start", err);
    return Response.json({ error: "Could not start payment. Please try again." }, { status: 500 });
  }
}
