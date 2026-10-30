import type { Hostel } from "@/lib/model";
import { adminAuth } from "@/lib/server/admin";
import { command, CommandError } from "@/lib/server/command";
import { hostelRefs } from "@/lib/server/hostel-data";

/*
 * The platform admin's overview: every hostel with its tenant count, and the jobs waiting on
 * HostelHub (platformTasks: verifying a new hostel's Paystack payout account). Counts use
 * aggregation queries, which cost one read per 1,000 records counted, not one per record.
 */

export interface PlatformTask {
  id: string;
  kind: "verify_payout";
  hostelId: string;
  hostelName: string;
  subaccountCode: string;
  mode: "test" | "live";
  createdAt: string;
  done: boolean;
  doneAt?: string;
}

export interface OverviewHostel {
  id: string;
  name: string;
  status: Hostel["status"];
  city: string | null;
  createdAt: string;
  liveAt: string | null;
  ownerEmail: string | null;
  payout: "test" | "live" | null;
  tenants: number;
  onlineBookings: number;
}

export const GET = command<Record<string, never>, { hostels: OverviewHostel[]; tasks: PlatformTask[] }>({ access: "platform" }, async (ctx) => {
  const [hostelSnap, taskSnap] = await Promise.all([
    ctx.db.collection("hostels").orderBy("createdAt", "desc").limit(500).get(),
    ctx.db.collection("platformTasks").where("done", "==", false).limit(100).get(),
  ]);
  const hostels = hostelSnap.docs.map((d) => ({ ...(d.data() as Hostel), id: d.id }));

  // Tenants and paid online bookings per hostel, counted on the server
  const counts = await Promise.all(
    hostels.map(async (h) => {
      const r = hostelRefs(h.id);
      const [tenants, booked] = await Promise.all([r.col("tenancies").where("status", "==", "active").count().get(), r.col("bookings").where("status", "==", "paid").count().get()]);
      return [tenants.data().count, booked.data().count] as const;
    }),
  );

  // Owners' emails, looked up in one call (up to 100 logins per call)
  const owners = [...new Set(hostels.map((h) => h.ownerUid).filter((x): x is string => !!x))];
  const emails = new Map<string, string>();
  for (let i = 0; i < owners.length; i += 100) {
    const res = await adminAuth.getUsers(owners.slice(i, i + 100).map((uid) => ({ uid })));
    res.users.forEach((u) => u.email && emails.set(u.uid, u.email));
  }

  return {
    hostels: hostels.map((h, i) => ({
      id: h.id,
      name: h.name,
      status: h.status,
      city: h.location?.city ?? null,
      createdAt: h.createdAt,
      liveAt: h.liveAt ?? null,
      ownerEmail: h.ownerUid ? (emails.get(h.ownerUid) ?? null) : null,
      payout: h.payout?.mode ?? null,
      tenants: counts[i][0],
      onlineBookings: counts[i][1],
    })),
    tasks: taskSnap.docs.map((d) => ({ ...(d.data() as Omit<PlatformTask, "id">), id: d.id })).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  };
});

/** Marks a platform task done (e.g. the payout account was verified on Paystack). */
export const POST = command<{ taskId: string }, { ok: true }>({ access: "platform" }, async (ctx, body) => {
  const ref = ctx.db.doc(`platformTasks/${String(body.taskId ?? "")}`);
  const snap = await ref.get();
  if (!snap.exists) throw new CommandError("That task is gone.", 404);
  await ref.update({ done: true, doneAt: new Date().toISOString(), doneBy: ctx.user!.email ?? ctx.user!.uid });
  return { ok: true };
});
