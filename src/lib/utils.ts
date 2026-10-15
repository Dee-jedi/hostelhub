import type { HostelState, PublicBookingDoc, PublicRoom, PublicRoomStatus, RentStatus, Resident, Room, Settings, StudentInfo } from "./types";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function uid(prefix = "") {
  return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/** Just the form fields of a resident or booking, e.g. to copy one into the other. */
export function toStudentInfo(x: StudentInfo): StudentInfo {
  return {
    isStudent: x.isStudent ?? true,
    fullName: x.fullName,
    sex: x.sex,
    phone: x.phone,
    email: x.email,
    matricNo: x.matricNo,
    department: x.department,
    faculty: x.faculty,
    level: x.level,
    stateOfOrigin: x.stateOfOrigin,
    homeAddress: x.homeAddress,
    nextOfKinName: x.nextOfKinName,
    nextOfKinPhone: x.nextOfKinPhone,
    nextOfKinRelationship: x.nextOfKinRelationship,
    occupants: x.occupants ?? [],
    photoUrl: x.photoUrl,
  };
}

// ---------- Dates (stored as YYYY-MM-DD, interpreted in local time) ----------

export function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO() {
  return toISODate(new Date());
}

export function addDays(iso: string, days: number) {
  const d = parseDate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function addMonths(iso: string, months: number) {
  const d = parseDate(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return toISODate(d);
}

export function daysBetween(fromISO: string, toISO: string) {
  const ms = parseDate(toISO).getTime() - parseDate(fromISO).getTime();
  return Math.round(ms / 86_400_000);
}

export function formatDate(iso: string | undefined) {
  if (!iso) return "—";
  return parseDate(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isSameMonth(iso: string, ref: string) {
  return iso.slice(0, 7) === ref.slice(0, 7);
}

// ---------- Money ----------

export function naira(amount: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(amount);
}

export function nairaShort(amount: number) {
  if (amount >= 1_000_000) return `₦${(amount / 1_000_000).toFixed(amount >= 10_000_000 ? 0 : 1)}m`;
  if (amount >= 1_000) return `₦${Math.round(amount / 1_000)}k`;
  return `₦${amount}`;
}

// ---------- Rent ----------

export const EXPIRING_WINDOW_DAYS = 30;

export function daysLeft(resident: Resident, today = todayISO()) {
  return daysBetween(today, resident.leaseEnd);
}

export function rentStatus(resident: Resident, today = todayISO()): RentStatus {
  const left = daysLeft(resident, today);
  if (left < 0) return "expired";
  if (left <= EXPIRING_WINDOW_DAYS) return "expiring";
  return "active";
}

export function describeDaysLeft(days: number) {
  if (days < 0) return `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`;
  if (days === 0) return "Expires today";
  return `${days} day${days === 1 ? "" : "s"} left`;
}

// ---------- Rooms ----------

export function activeResidents(state: HostelState) {
  return state.residents.filter((r) => r.status === "active");
}

/** Current tenant of each occupied room. */
export function tenantsByRoom(state: HostelState) {
  const map = new Map<string, Resident>();
  for (const r of state.residents) {
    if (r.status === "active" && r.roomId) map.set(r.roomId, r);
  }
  return map;
}

/** Everyone living in the room: the tenant plus co-occupants. */
export function peopleInRoom(tenant: Resident | undefined) {
  return tenant ? 1 + tenant.occupants.length : 0;
}

/** Rooms with no tenant that aren't under maintenance. */
export function availableRooms(state: HostelState, excludeRoomId?: string | null) {
  const tenants = tenantsByRoom(state);
  return state.rooms.filter((room: Room) => !room.underMaintenance && room.id !== excludeRoomId && !tenants.has(room.id));
}

// ---------- Messaging ----------

export function fillTemplate(template: string, resident: Resident, state: HostelState) {
  const left = daysBetween(todayISO(), resident.leaseEnd);
  const firstName = resident.fullName.split(" ")[0];
  return template
    .replaceAll("{name}", firstName)
    .replaceAll("{fullName}", resident.fullName)
    .replaceAll("{room}", resident.roomId ?? "—")
    .replaceAll("{expiry}", formatDate(resident.leaseEnd))
    .replaceAll("{days}", String(Math.max(left, 0)))
    .replaceAll("{amount}", naira(state.settings.rentAmount))
    .replaceAll("{hostel}", state.settings.hostelName)
    .replaceAll("{bank}", `${state.settings.bankName} ${state.settings.accountNumber} (${state.settings.accountName})`)
    .replaceAll("{manager}", state.settings.managerName)
    .replaceAll("{managerPhone}", state.settings.managerPhone);
}

/** Converts Nigerian local numbers (0803...) to international format for wa.me links. */
export function toInternational(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("234")) return digits;
  if (digits.startsWith("0")) return "234" + digits.slice(1);
  return digits;
}

export function whatsappLink(phone: string, text: string) {
  return `https://wa.me/${toInternational(phone)}?text=${encodeURIComponent(text)}`;
}

// ---------- Export ----------

export function downloadCSV(filename: string, rows: Record<string, string | number>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: string | number) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const csv = [headers.map(escape).join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Initials without a title prefix, e.g. "Mrs. Adeyemi" -> "A". */
export function managerInitials(name: string) {
  return initials(name.replace(/^(Mr|Mrs|Ms|Miss|Dr)\.?\s+/i, ""));
}

/** "Computer Science · 200 Level", or "Not a student" for working tenants and occupants. */
export function academicLine(p: { isStudent?: boolean; department: string; level: string }, short = false) {
  if (p.isStudent === false) return "Not a student";
  return [p.department, p.level && (short ? `${p.level}L` : `${p.level} Level`)].filter(Boolean).join(" · ") || "—";
}

/** A ticket is closed once it's resolved or declined. */
export function isOpenTicket(t: { status: string }) {
  return t.status !== "resolved" && t.status !== "declined";
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

// ---------- Public booking document ----------

/** Availability as the public booking form sees it: no tenant details, just a status per room. */
export function publicRooms(state: Pick<HostelState, "rooms" | "residents">): Record<string, PublicRoom> {
  const tenants = tenantsByRoom(state as HostelState);
  const out: Record<string, PublicRoom> = {};
  for (const room of state.rooms) out[room.id] = publicRoom(room, tenants.has(room.id));
  return out;
}

export function publicRoom(room: Room, occupied: boolean): PublicRoom {
  const status: PublicRoomStatus = room.underMaintenance ? "maintenance" : occupied ? "occupied" : "vacant";
  return room.note && room.underMaintenance
    ? { block: room.block, number: room.number, status, note: room.note }
    : { block: room.block, number: room.number, status };
}

export function publicInfo(settings: Settings): PublicBookingDoc["info"] {
  return {
    hostelName: settings.hostelName,
    address: settings.address,
    rentAmount: settings.rentAmount,
    leaseMonths: settings.leaseMonths,
    maxOccupants: settings.maxOccupants,
    blocks: settings.blocks.map((b) => b.name),
    whatsappGroupLink: settings.whatsappGroupLink,
    managerName: settings.managerName,
    managerPhone: settings.managerPhone,
  };
}

/** A room can be booked if it's vacant and nobody else is mid-checkout on it. */
export function isBookable(doc: PublicBookingDoc, roomId: string, now = Date.now(), uid?: string) {
  const room = doc.rooms[roomId];
  if (!room || room.status !== "vacant") return false;
  const hold = doc.holds?.[roomId];
  return !hold || hold.until <= now || (!!uid && hold.uid === uid);
}
