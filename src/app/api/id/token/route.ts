import { verifyRequest } from "@/lib/server/admin";
import { hostelOfRequest } from "@/lib/server/hostel-data";
import { idToken } from "@/lib/server/idcard";

/** The signed value for the signed-in tenant's ID card QR code, for this hostel. */
export async function GET(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return Response.json({ error: "Please sign in again." }, { status: 401 });
  const hostelId = hostelOfRequest(req);
  if (!hostelId) return Response.json({ error: "Unknown hostel." }, { status: 404 });
  return Response.json({ token: idToken(hostelId, user.uid) });
}
