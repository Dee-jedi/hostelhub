import type { HostelRole } from "@/lib/access";
import { isValidSlug } from "@/lib/hostel-host";
import { adminAuth } from "@/lib/server/admin";
import { setHostelRole, setTenantOf } from "@/lib/server/claims";
import { command, CommandError } from "@/lib/server/command";

interface Body {
  hostelId: string;
  email: string;
  /** "manager" to grant, null to remove; leave out to keep as is */
  role?: HostelRole | null;
  tenant?: boolean;
}

/** Platform admin tool: gives or removes a login's role in a hostel. */
export const POST = command<Body, unknown>({ access: "platform", hostelFromBody: true }, async (ctx, body) => {
  if (!ctx.hostelId || !isValidSlug(ctx.hostelId)) throw new CommandError("Pick a valid hostel id.");
  if (typeof body.email !== "string") throw new CommandError("Enter the person's email.");
  if (body.role !== undefined && body.role !== null && body.role !== "manager") throw new CommandError("Unknown role.");

  const user = await adminAuth.getUserByEmail(body.email.trim()).catch(() => null);
  if (!user) throw new CommandError("No login with that email. They need to sign up first.", 404);

  let access = null;
  if (body.role !== undefined) access = await setHostelRole(user.uid, ctx.hostelId, body.role);
  if (typeof body.tenant === "boolean") access = await setTenantOf(user.uid, ctx.hostelId, body.tenant);
  if (!access) throw new CommandError("Nothing to change.");

  await ctx.audit("access.changed", { email: user.email, uid: user.uid, role: body.role, tenant: body.tenant });
  return { uid: user.uid, access };
});
