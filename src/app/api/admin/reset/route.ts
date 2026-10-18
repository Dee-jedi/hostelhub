import { command } from "@/lib/server/command";
import { seedFirestore } from "@/lib/server/seed-firestore";

/** "Reset demo data" / "Start fresh" in Settings: replaces this hostel's data. */
export const POST = command<{ mode?: "demo" | "empty" }, { ok: true }>({ access: "manager" }, async (ctx, body) => {
  await seedFirestore(body.mode === "empty" ? "empty" : "demo", ctx.hostelId!);
  await ctx.audit("hostel.reset", { mode: body.mode === "empty" ? "empty" : "demo" });
  return { ok: true };
});
