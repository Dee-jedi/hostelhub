import { verifyRequest } from "@/lib/server/admin";
import { idToken } from "@/lib/server/idcard";

/** The signed value for the signed-in tenant's ID card QR code. */
export async function GET(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return Response.json({ error: "Please sign in again." }, { status: 401 });
  return Response.json({ token: idToken(user.uid) });
}
