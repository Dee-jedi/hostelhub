import type { Hostel, Listing } from "@/lib/model";
import { adminDb } from "@/lib/server/admin";
import { hostelRefs } from "@/lib/server/hostel-data";

/*
 * The public hostel directory on the platform's login page: every live hostel's name, town and
 * starting price (all of it already public on their booking pages). Hostels still signing up
 * aren't listed. Cached in memory and at the CDN for a few minutes, so a busy page costs a
 * handful of database reads, not one per visitor.
 */

export interface DirectoryHostel {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  /** The cheapest rent, and whether it's per bed or per room */
  from: number | null;
  per: "bed" | "room";
}

const TTL_MS = 5 * 60_000;
let cache: { at: number; hostels: DirectoryHostel[] } | null = null;

async function load(): Promise<DirectoryHostel[]> {
  const live = await adminDb.collection("hostels").where("status", "==", "live").limit(1000).get();
  const hostels = live.docs.map((d) => ({ ...(d.data() as Hostel), id: d.id }));
  const listings = hostels.length ? await adminDb.getAll(...hostels.map((h) => hostelRefs(h.id).listing)) : [];
  const byId = new Map(listings.map((s) => [s.id, s.data() as Listing | undefined]));
  return hostels
    .map((h) => {
      const info = byId.get(h.id)?.info;
      const cheapest = info?.roomTypes?.length ? [...info.roomTypes].sort((a, b) => a.price - b.price)[0] : null;
      return {
        id: h.id,
        name: info?.hostelName ?? h.name,
        city: h.location?.city ?? null,
        state: h.location?.state ?? null,
        from: cheapest?.price ?? info?.rentAmount ?? null,
        per: cheapest?.pricingMode === "per_room" ? ("room" as const) : ("bed" as const),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function GET(req: Request) {
  // Reading the request keeps this route dynamic (it reads the database, so it can't be built ahead)
  void req.url;
  try {
    if (!cache || Date.now() - cache.at > TTL_MS) cache = { at: Date.now(), hostels: await load() };
    return Response.json({ hostels: cache.hostels }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" } });
  } catch (err) {
    console.error("directory", err);
    return Response.json({ error: "Couldn't load hostels just now." }, { status: 500 });
  }
}
