import { isManagerOf, isPlatformAdmin, isTenantOf } from "@/lib/access";
import { command } from "@/lib/server/command";

/** Who the caller is and what they can do on the hostel this address belongs to. */
export const GET = command({ access: "signed-in" }, async (ctx) => {
  const { hostelId, access, user } = ctx;
  return {
    uid: user!.uid,
    email: user!.email ?? null,
    host: ctx.host,
    hostelId,
    here: hostelId ? { manager: isManagerOf(access, hostelId), tenant: isTenantOf(access, hostelId) } : null,
    platformAdmin: isPlatformAdmin(access),
    manages: Object.keys(access.h ?? {}),
    tenantOf: Object.keys(access.t ?? {}),
  };
});
