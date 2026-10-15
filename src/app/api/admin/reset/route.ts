import { verifyRequest } from "@/lib/server/admin";
import { seedFirestore } from "@/lib/server/seed-firestore";

export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (user?.role !== "admin") return Response.json({ error: "Not allowed." }, { status: 403 });
  const { mode } = ((await req.json().catch(() => ({}))) ?? {}) as { mode?: "demo" | "empty" };
  await seedFirestore(mode === "empty" ? "empty" : "demo");
  return Response.json({ ok: true });
}
