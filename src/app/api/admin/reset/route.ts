import { IS_LIVE_DATABASE } from "@/lib/env";
import { command, CommandError } from "@/lib/server/command";
import { seedFirestore } from "@/lib/server/seed-firestore";

/**
 * "Reset demo data" / "Start fresh" in Settings: replaces this hostel's data. Staging only: on the
 * live database it would wipe a real hostel's tenants and payments (use `npm run seed -- --live`).
 */
export const POST = command<{ mode?: "demo" | "empty" }, { ok: true }>({ access: "manager" }, async (ctx, body) => {
  if (IS_LIVE_DATABASE) throw new CommandError("Resetting a hostel is turned off on the live site.", 403);
  await seedFirestore(body.mode === "empty" ? "empty" : "demo", ctx.hostelId!);
  await ctx.audit("hostel.reset", { mode: body.mode === "empty" ? "empty" : "demo" });
  return { ok: true };
});
