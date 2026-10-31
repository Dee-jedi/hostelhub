import { randomBytes } from "node:crypto";
import { normalizeHost, requestHost } from "@/lib/hostel-host";
import { PLATFORM_HOST } from "@/lib/platform";
import { adminAuth, adminDb, verifyRequest } from "@/lib/server/admin";

/*
 * Carrying a login from the platform address to a hostel's own address. Google sign-in only
 * runs on the platform address (Firebase can't allow every hostel subdomain), so afterwards:
 *   start:  the signed-in platform page asks for a one-time code for the hostel page it returns to;
 *   finish: that hostel page swaps the code for a sign-in token, once, within two minutes.
 * The code travels in the URL; the token never does, and a used or stale code is worthless.
 */

const TTL_MS = 2 * 60_000;

/** Only our own addresses: the platform and its hostel subdomains (and *.localhost in development). */
function ownAddress(raw: string): URL | null {
  try {
    const url = new URL(raw);
    const host = normalizeHost(url.host);
    const platform = normalizeHost(PLATFORM_HOST);
    const ok = host === platform || host.endsWith(`.${platform}`) || (process.env.NODE_ENV !== "production" && (host === "localhost" || host.endsWith(".localhost")));
    return ok && (url.protocol === "https:" || process.env.NODE_ENV !== "production") ? url : null;
  } catch {
    return null;
  }
}

const json = (body: object, status = 200) => Response.json(body, { status });

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { action?: string; returnTo?: string; code?: string };
  try {
    if (body.action === "start") {
      const user = await verifyRequest(req);
      if (!user) return json({ error: "Please sign in again." }, 401);
      const target = ownAddress(String(body.returnTo ?? ""));
      if (!target) return json({ error: "That address isn't part of HostelHub." }, 400);
      const code = randomBytes(18).toString("base64url");
      await adminDb.doc(`authHandoffs/${code}`).set({ uid: user.uid, host: normalizeHost(target.host), expiresAt: Date.now() + TTL_MS });
      target.searchParams.set("hh_code", code);
      return json({ url: target.toString() });
    }

    if (body.action === "finish") {
      const code = String(body.code ?? "");
      if (!/^[A-Za-z0-9_-]{20,40}$/.test(code)) return json({ error: "That sign-in link isn't valid." }, 400);
      const ref = adminDb.doc(`authHandoffs/${code}`);
      // Read and delete together, so a code works exactly once
      const handoff = await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists) tx.delete(ref);
        return snap.data() as { uid: string; host: string; expiresAt: number } | undefined;
      });
      if (!handoff || handoff.expiresAt < Date.now()) return json({ error: "That sign-in link has expired. Please sign in again." }, 410);
      // Only the page it was made for can use it
      if (handoff.host !== normalizeHost(requestHost(req))) return json({ error: "That sign-in link is for another address." }, 403);
      return json({ token: await adminAuth.createCustomToken(handoff.uid) });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (err) {
    console.error("auth/handoff", err);
    return json({ error: "Couldn't sign you in. Please try again." }, 500);
  }
}
