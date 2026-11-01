import { joinIsOpen, joinOpenUntil } from "@/lib/join";
import type { Hostel, Listing } from "@/lib/model";
import { command, CommandError } from "@/lib/server/command";
import { placeExistingTenant, type ExistingTenant } from "@/lib/server/existing-tenants";
import { hostelRefs } from "@/lib/server/hostel-data";

/*
 * Importing tenants from a spreadsheet (Excel or CSV), for hostels moving their records over.
 * "rooms": the rooms to match the sheet against; "import": the checked rows, placed a few at a
 * time (each in its own transaction, so two can't take the same bed). Free on the same terms
 * as the join link: while setting up and for its window after going live.
 */

export interface ImportRoom {
  id: string;
  label: string;
  block: string;
  /** Spaces free now (beds, or 1 for a whole room) */
  free: number;
  /** Who the block takes */
  who: "male" | "female" | "any";
}

type Body = { hostelId: string; action: "rooms" } | { hostelId: string; action: "import"; rows: ExistingTenant[] };

/** Most rows in one request; the screen sends a long sheet in parts */
const MAX_ROWS = 100;
/** Rows placed at once: quick, without many transactions fighting over the same rooms */
const AT_ONCE = 4;

export const POST = command<Body, { rooms: ImportRoom[]; open: boolean; openUntil: string | null } | { results: { ok: boolean; error?: string }[] }>(
  { access: "manager", hostelFromBody: true },
  async (ctx, body) => {
    const h = ctx.hostelId!;
    const r = hostelRefs(h);

    if (body.action === "rooms") {
      const [hostelSnap, listingSnap] = await Promise.all([r.hostel.get(), r.listing.get()]);
      const hostel = hostelSnap.data() as Hostel | undefined;
      const listing = listingSnap.data() as Listing | undefined;
      if (!hostel || !listing) throw new CommandError("Set up your rooms first.", 409);
      const blockOf = (block: string) => listing.info.blockNames?.[block] ?? block;
      const rooms: ImportRoom[] = Object.entries(listing.rooms)
        .sort(([, a], [, b]) => blockOf(a.block).localeCompare(blockOf(b.block)) || a.number - b.number)
        .map(([id, room]) => ({
          id,
          label: room.label ?? id,
          block: blockOf(room.block),
          free: room.status === "maintenance" ? 0 : room.beds ? Object.values(room.beds).filter((s) => s === "vacant").length : room.status === "vacant" ? 1 : 0,
          who: listing.info.blockWho?.[room.block] ?? "any",
        }));
      return { rooms, open: joinIsOpen(hostel), openUntil: joinOpenUntil(hostel) };
    }

    if (body.action === "import") {
      const rows = Array.isArray(body.rows) ? body.rows.slice(0, MAX_ROWS) : [];
      if (!rows.length) throw new CommandError("No tenants to add.");
      const results: { ok: boolean; error?: string }[] = new Array(rows.length);
      let next = 0;
      const worker = async () => {
        while (next < rows.length) {
          const i = next++;
          try {
            await placeExistingTenant(ctx, h, rows[i], "tenant.imported_sheet");
            results[i] = { ok: true };
          } catch (err) {
            results[i] = { ok: false, error: err instanceof CommandError ? err.message : "Couldn't add this one. Try again." };
            if (!(err instanceof CommandError)) console.error("tenants/import", err);
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(AT_ONCE, rows.length) }, worker));
      return { results };
    }

    throw new CommandError("Unknown action.");
  },
);
