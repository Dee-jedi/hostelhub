import { DEMO_HOSTEL, DEMO_VIEWER_UID } from "@/lib/demo";
import { requestHost, resolveHost } from "@/lib/hostel-host";
import { adminAuth } from "@/lib/server/admin";

/*
 * "View demo": a sign-in token for the shared demo login (demo.ts), on the demo hostel's own
 * address only. Its one claim, h[demo] = "viewer", travels in the token, so nothing is stored
 * and every visitor gets the same read-only access.
 */
export async function POST(req: Request) {
  const host = resolveHost(requestHost(req));
  if (host.kind !== "hostel" || host.slug !== DEMO_HOSTEL) return Response.json({ error: "The demo is on the demo hostel's address." }, { status: 404 });
  try {
    return Response.json({ token: await adminAuth.createCustomToken(DEMO_VIEWER_UID, { h: { [DEMO_HOSTEL]: "viewer" } }) });
  } catch (err) {
    console.error("demo", err);
    return Response.json({ error: "Couldn't open the demo. Please try again." }, { status: 500 });
  }
}
