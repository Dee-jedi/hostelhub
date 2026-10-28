import { adminAuth } from "@/lib/server/admin";

/**
 * GET ?email=…: does this email already have a HostelHub login? Lets sign-up say "log in" or
 * "create a password" as they type, instead of failing after they press save. It tells anyone
 * whether an email is registered, which the sign-up form would reveal anyway.
 */
export async function GET(req: Request) {
  const email = (new URL(req.url).searchParams.get("email") ?? "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  try {
    await adminAuth.getUserByEmail(email);
    return Response.json({ exists: true });
  } catch (err) {
    if ((err as { code?: string }).code === "auth/user-not-found") return Response.json({ exists: false });
    console.error("onboarding/login GET", err);
    return Response.json({ error: "Couldn't check that email." }, { status: 500 });
  }
}
