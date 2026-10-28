/*
 * Sign-up, part two: rooms and prices (docs/ARCHITECTURE-PLAN.md §10.8–10.14). What the wizard
 * collects, how it's checked, the totals it shows, and how it becomes the hostel's documents.
 * Pure and shared, so the wizard and the server agree, and it can be tested on its own.
 */
import type { Block, BlockOccupancy, ExtraCharge, HostelRoom, PricingMode, RentPeriod, RoomCapacity, RoomFeature, RoomType } from "./model";
import { MAX_CAPACITY } from "./spaces";

export interface SetupClass {
  key: string;
  name: string;
  capacity: number;
  pricing: PricingMode;
  features: RoomFeature[];
  /** Rent per space for each rent option, by option key (0 or missing = not set yet) */
  prices: Record<string, number>;
}

export interface SetupOption {
  key: string;
  name: string;
  kind: "session" | "rolling";
  /** session: fixed dates (yyyy-mm-dd) */
  start?: string;
  end?: string;
  /** rolling: months from move-in */
  months?: number;
  /** Students can choose it on the booking page */
  online: boolean;
}

export interface SetupRoom {
  label: string;
  classKey: string;
}

export interface SetupBlock {
  key: string;
  name: string;
  who: BlockOccupancy;
  /** Every room's class, unless "mixed" */
  classKey: string | "mixed";
  /** Room names: prefix + number, counting from `start` ("A" + 1 → A1; "" + 101 → 101; "Ruby " + 1 → Ruby 1) */
  prefix: string;
  start: number;
  rooms: SetupRoom[];
}

export interface SetupCharge {
  key: string;
  name: string;
  amount: number;
  when: "once" | "every";
  refundable: boolean;
}

export interface RoomsSetup {
  classes: SetupClass[];
  options: SetupOption[];
  /** The option new tenancies use unless another is picked */
  defaultOptionKey: string;
  blocks: SetupBlock[];
  charges: SetupCharge[];
}

export const FEATURES: { id: RoomFeature; label: string }[] = [
  { id: "own_toilet", label: "Own toilet & bathroom" },
  { id: "kitchen", label: "Kitchen" },
  { id: "ac", label: "Air conditioning" },
  { id: "furnished", label: "Furnished" },
];

/** The ready-made cards on the first rooms question. */
export const CLASS_PRESETS: { id: string; name: string; capacity: number; pricing: PricingMode; features: RoomFeature[]; hint: string }[] = [
  { id: "2", name: "2 in a room", capacity: 2, pricing: "per_bed", features: [], hint: "Shared, priced per bed space" },
  { id: "3", name: "3 in a room", capacity: 3, pricing: "per_bed", features: [], hint: "Shared, priced per bed space" },
  { id: "4", name: "4 in a room", capacity: 4, pricing: "per_bed", features: [], hint: "Shared, priced per bed space" },
  { id: "6", name: "6 in a room", capacity: 6, pricing: "per_bed", features: [], hint: "Shared, priced per bed space" },
  { id: "8", name: "8 in a room", capacity: 8, pricing: "per_bed", features: [], hint: "Shared, priced per bed space" },
  { id: "single", name: "Single room", capacity: 1, pricing: "per_room", features: [], hint: "One person, shared toilet" },
  { id: "selfcon", name: "Self-contained", capacity: 1, pricing: "per_room", features: ["own_toilet", "kitchen"], hint: "Own toilet and kitchen" },
];

export const newKey = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 8)}`;

/**
 * The first rent option: a session from October to July. Oct–Dec: the one that started this
 * October; Jan–May: the one running since last October; Jun–Sep: the one starting this October.
 * Only a suggestion: schools set their own dates, and the manager changes them.
 */
export function defaultOptions(today = new Date()): SetupOption[] {
  const month = today.getMonth(); // 0 = January
  const startYear = month <= 4 ? today.getFullYear() - 1 : today.getFullYear();
  return [{ key: "session", name: "Per session", kind: "session", start: `${startYear}-10-01`, end: `${startYear + 1}-07-31`, online: true }];
}

export function emptySetup(): RoomsSetup {
  return { classes: [], options: defaultOptions(), defaultOptionKey: "session", blocks: [], charges: [] };
}

// --------------------------------------------------------------------------- dates

/** Whole months between two dates, rounded to the nearest half month ("Oct 1 – Jul 31" = 10). */
export function monthsBetween(start: string, end: string) {
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  if (Number.isNaN(+a) || Number.isNaN(+b) || b <= a) return 0;
  const days = (b.getTime() - a.getTime()) / 86_400_000 + 1;
  return Math.round((days / 30.44) * 2) / 2;
}

export function optionLength(o: SetupOption) {
  if (o.kind === "rolling") return o.months ?? 0;
  return o.start && o.end ? monthsBetween(o.start, o.end) : 0;
}

/** "10 months" / "1 month" / "9½ months" */
export function monthsText(m: number) {
  const whole = Math.floor(m);
  const half = m - whole >= 0.5 ? "½" : "";
  return `${whole}${half} month${m === 1 ? "" : "s"}`;
}

// --------------------------------------------------------------------------- rooms

/** "A" + 1 → "A1"; "Ruby " + 1 → "Ruby 1"; "" + 101 → "101" */
export const roomLabel = (prefix: string, n: number) => `${prefix}${n}`;

/** A good default prefix for a block's name: "Block A" → "A", "Ruby" → "Ruby ", "Annex B" → "Annex B ". */
export function defaultPrefix(blockName: string) {
  const name = blockName.trim();
  const m = name.match(/^block\s+([a-z0-9]{1,3})$/i);
  if (m) return m[1].toUpperCase();
  if (/^[a-z0-9]{1,2}$/i.test(name)) return name.toUpperCase();
  return name ? `${name} ` : "";
}

/** The block's rooms after its count, naming or class changed; rooms keep a class chosen one by one. */
export function regenerateRooms(block: SetupBlock, count: number, fallbackClassKey: string): SetupRoom[] {
  return Array.from({ length: Math.max(0, Math.min(500, count)) }, (_, i) => ({
    label: roomLabel(block.prefix, block.start + i),
    classKey: block.classKey === "mixed" ? (block.rooms[i]?.classKey ?? fallbackClassKey) : block.classKey,
  }));
}

/**
 * A room's permanent id from its label: letters and digits only (no hyphens, so an id can never
 * look like a bed: "Room-A" would read as bed A of room "Room"), unique within the hostel.
 */
export function roomIdFor(label: string, taken: Set<string>) {
  const base = label.replace(/[^A-Za-z0-9]/g, "").slice(0, 24) || "Room";
  let id = base;
  for (let n = 2; taken.has(id.toLowerCase()); n++) id = `${base}x${n}`;
  taken.add(id.toLowerCase());
  return id;
}

// --------------------------------------------------------------------------- checks

export function classProblem(c: SetupClass): string | null {
  if (!c.name.trim()) return "Give each kind of room a name.";
  if (!Number.isInteger(c.capacity) || c.capacity < 1 || c.capacity > MAX_CAPACITY) return `"${c.name}": rooms hold 1 to ${MAX_CAPACITY} people.`;
  return null;
}

export function optionProblem(o: SetupOption): string | null {
  if (!o.name.trim()) return "Give each way of paying a name.";
  if (o.kind === "session") {
    if (!o.start || !o.end) return `"${o.name}": enter when it starts and ends.`;
    if (monthsBetween(o.start, o.end) < 1) return `"${o.name}": the end date must be at least a month after the start.`;
  } else if (!Number.isInteger(o.months) || o.months! < 1 || o.months! > 24) return `"${o.name}": choose 1 to 24 months.`;
  return null;
}

/** The first thing to fix, worded for the manager, or null when the setup can be saved. */
export function setupProblem(s: RoomsSetup): string | null {
  if (!s.classes.length) return "Add at least one kind of room.";
  for (const c of s.classes) {
    const p = classProblem(c);
    if (p) return p;
  }
  if (new Set(s.classes.map((c) => c.name.trim().toLowerCase())).size !== s.classes.length) return "Two kinds of room have the same name. Rename one.";
  if (!s.options.length) return "Add at least one way for tenants to pay.";
  for (const o of s.options) {
    const p = optionProblem(o);
    if (p) return p;
  }
  if (!s.options.some((o) => o.key === s.defaultOptionKey)) return "Choose which way of paying is the usual one.";
  if (!s.options.some((o) => o.online)) return "Let students pick at least one way of paying online.";
  for (const c of s.classes)
    for (const o of s.options) if (!(c.prices[o.key] > 0)) return `Enter the price of "${c.name}" ${o.name.toLowerCase()}.`;
  if (!s.blocks.length) return "Add at least one block.";
  const labels = new Set<string>();
  const classKeys = new Set(s.classes.map((c) => c.key));
  for (const b of s.blocks) {
    if (!b.name.trim()) return "Give each block a name.";
    if (!b.rooms.length) return `"${b.name}" has no rooms.`;
    for (const r of b.rooms) {
      if (!r.label.trim()) return `A room in "${b.name}" has no name.`;
      if (!classKeys.has(r.classKey)) return `Room ${r.label} in "${b.name}" needs a kind of room.`;
      const key = r.label.trim().toLowerCase();
      if (labels.has(key)) return `Two rooms are called "${r.label.trim()}". Room names must be different.`;
      labels.add(key);
    }
  }
  if (new Set(s.blocks.map((b) => b.name.trim().toLowerCase())).size !== s.blocks.length) return "Two blocks have the same name. Rename one.";
  for (const ch of s.charges) {
    if (!ch.name.trim()) return "Give each extra charge a name.";
    if (!(ch.amount > 0)) return `Enter how much "${ch.name}" is.`;
  }
  return null;
}

// --------------------------------------------------------------------------- totals

export interface SetupSummary {
  rooms: number;
  /** Bed spaces in per-bed rooms, plus whole rooms: everything that can be let */
  spaces: number;
  people: number;
  /** Most rent per default option if every space is let */
  fullRent: number;
}

export function summarize(s: RoomsSetup): SetupSummary {
  const byKey = new Map(s.classes.map((c) => [c.key, c]));
  let rooms = 0;
  let spaces = 0;
  let people = 0;
  let fullRent = 0;
  for (const b of s.blocks)
    for (const r of b.rooms) {
      const c = byKey.get(r.classKey);
      if (!c) continue;
      rooms++;
      people += c.capacity;
      const n = c.pricing === "per_bed" ? c.capacity : 1;
      spaces += n;
      fullRent += n * (c.prices[s.defaultOptionKey] ?? 0);
    }
  return { rooms, spaces, people, fullRent };
}

// --------------------------------------------------------------------------- to documents

export interface SetupDocs {
  types: RoomType[];
  periods: RentPeriod[];
  blocks: Block[];
  rooms: HostelRoom[];
  defaultPeriodId: string;
  defaultTypeId: string;
  charges: ExtraCharge[];
}

const idFrom = (prefix: string, text: string, taken: Set<string>) => {
  const base = `${prefix}${text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "x"}`;
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
};

/** The hostel's documents for a checked setup (call setupProblem first). */
export function setupToDocs(s: RoomsSetup): SetupDocs {
  const taken = new Set<string>();
  const periodId = new Map(s.options.map((o) => [o.key, idFrom("p_", o.name, taken)]));
  const typeId = new Map(s.classes.map((c) => [c.key, idFrom("t_", c.name, taken)]));
  const blockId = new Map(s.blocks.map((b) => [b.key, idFrom("b_", b.name, taken)]));

  const periods: RentPeriod[] = s.options.map((o, order) =>
    o.kind === "session"
      ? { id: periodId.get(o.key)!, kind: "session", name: o.name.trim(), start: o.start!, end: o.end!, online: o.online, order }
      : { id: periodId.get(o.key)!, kind: "rolling", name: o.name.trim(), months: o.months!, online: o.online, order },
  );
  const types: RoomType[] = s.classes.map((c) => ({
    id: typeId.get(c.key)!,
    name: c.name.trim(),
    capacity: c.capacity as RoomCapacity,
    pricingMode: c.pricing,
    price: c.prices[s.defaultOptionKey],
    prices: Object.fromEntries(s.options.map((o) => [periodId.get(o.key)!, c.prices[o.key]])),
    ...(c.features.length ? { features: c.features } : {}),
  }));
  const blocks: Block[] = s.blocks.map((b, order) => ({
    id: blockId.get(b.key)!,
    name: b.name.trim(),
    order,
    who: b.who,
    ...(b.classKey !== "mixed" ? { defaultTypeId: typeId.get(b.classKey)! } : {}),
  }));
  const roomIds = new Set<string>();
  const rooms: HostelRoom[] = s.blocks.flatMap((b) =>
    b.rooms.map((r, i) => ({
      id: roomIdFor(r.label.trim(), roomIds),
      label: r.label.trim(),
      blockId: blockId.get(b.key)!,
      number: i + 1,
      typeId: typeId.get(r.classKey)!,
      maintenance: null,
    })),
  );
  const charges: ExtraCharge[] = s.charges.map((ch) => ({ id: idFrom("c_", ch.name, taken), name: ch.name.trim(), amount: ch.amount, when: ch.when, refundable: ch.refundable }));
  return { types, periods, blocks, rooms, defaultPeriodId: periodId.get(s.defaultOptionKey)!, defaultTypeId: types[0].id, charges };
}
