/*
 * Spaces: what is actually rented. In a per-room room type the room is one space (id = room id)
 * holding up to `capacity` people with one payer. In a per-bed type each bed is a space
 * (`${roomId}-A` … `-D`) with its own tenant. Shared by the screens, the server and the public
 * booking page, so everyone agrees on what "free" means.
 */
import type { HostelRoom, PricingMode, RoomType } from "./model";

export type SpaceStatus = "vacant" | "occupied";

/** A room's public status: per-bed rooms are "vacant" while any bed is free. */
export type RoomStatus = "vacant" | "occupied" | "maintenance";

/** One letter per bed; a room holds up to MAX_CAPACITY people (6- and 8-man rooms exist). */
export const BED_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;
export const MAX_CAPACITY = BED_LETTERS.length;

export function spaceIdsOf(roomId: string, type: Pick<RoomType, "capacity" | "pricingMode">): string[] {
  if (type.pricingMode === "per_room") return [roomId];
  return BED_LETTERS.slice(0, type.capacity).map((b) => `${roomId}-${b}`);
}

/** The bed letter of a per-bed space ("B7-C" → "C"), or null for a whole room. */
export function bedOf(spaceId: string | null | undefined, roomId: string | null | undefined): string | null {
  if (!spaceId || !roomId || spaceId === roomId) return null;
  return spaceId.startsWith(`${roomId}-`) ? spaceId.slice(roomId.length + 1) : null;
}

export function roomOfSpace(spaceId: string) {
  const m = spaceId.match(/^(.*)-([A-H])$/);
  return m ? m[1] : spaceId;
}

/** "Room B7" or "Room B7, bed C" */
export function spaceLabel(roomId: string | null | undefined, spaceId?: string | null) {
  if (!roomId) return "No room";
  const bed = bedOf(spaceId, roomId);
  return bed ? `Room ${roomId}, bed ${bed}` : `Room ${roomId}`;
}

export interface ListingRoom {
  block: string;
  number: number;
  label: string;
  typeId: string;
  status: RoomStatus;
  note?: string;
  /** Per-bed rooms only: each bed's status */
  beds?: Record<string, SpaceStatus>;
}

export interface Hold {
  until: number;
  bookingId: string;
  uid: string;
}

/**
 * The public listing entry for a room, from its type and which of its spaces are taken.
 * Recomputed whenever occupancy, maintenance or the room's type changes.
 */
export function listingRoomEntry(room: Pick<HostelRoom, "id" | "label" | "number" | "maintenance">, block: string, type: RoomType, occupied: Set<string>): ListingRoom {
  const spaces = spaceIdsOf(room.id, type);
  const free = spaces.filter((s) => !occupied.has(s)).length;
  const status: RoomStatus = room.maintenance ? "maintenance" : free > 0 ? "vacant" : "occupied";
  return {
    block,
    number: room.number,
    label: room.label,
    typeId: type.id,
    status,
    ...(room.maintenance?.note ? { note: room.maintenance.note } : {}),
    ...(type.pricingMode === "per_bed" ? { beds: Object.fromEntries(spaces.map((s) => [bedOf(s, room.id)!, occupied.has(s) ? "occupied" : "vacant"])) } : {}),
  };
}

/** Spaces in a room someone could book right now: free, and not mid-checkout by somebody else. */
export function bookableSpaces(roomId: string, room: Pick<ListingRoom, "status" | "beds"> | undefined, holds: Record<string, Hold> | undefined, now = Date.now(), uid?: string) {
  if (!room || room.status !== "vacant") return [];
  const free = room.beds ? Object.entries(room.beds).filter(([, s]) => s === "vacant").map(([bed]) => `${roomId}-${bed}`) : [roomId];
  return free.filter((spaceId) => {
    const hold = holds?.[spaceId];
    return !hold || hold.until <= now || (!!uid && hold.uid === uid);
  });
}

/** How full a room is, for the staff grid: taken and total spaces (people for per-room rooms). */
export function fill(type: Pick<RoomType, "capacity" | "pricingMode">, takenSpaces: number) {
  return { taken: takenSpaces, total: type.pricingMode === "per_bed" ? type.capacity : 1, perBed: type.pricingMode === "per_bed" };
}

export type { PricingMode };
