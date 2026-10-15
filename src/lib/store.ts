"use client";

import { arrayUnion, collection, deleteField, doc, onSnapshot, writeBatch, type WriteBatch } from "firebase/firestore";
import { useSyncExternalStore } from "react";
import { toast } from "@/components/toast";
import { auth, db } from "./firebase";
import { buildRooms, createEmptyState } from "./seed";
import { TEMPLATES } from "./templates";
import type {
  Booking,
  Channel,
  HostelState,
  Message,
  Payment,
  PaymentMethod,
  PublicBookingDoc,
  Resident,
  Room,
  Settings,
  StudentInfo,
  Ticket,
  TicketCategory,
  TicketUpdate,
} from "./types";
import { addMonths, daysBetween, publicInfo, publicRoom, tenantsByRoom, todayISO, toStudentInfo, uid } from "./utils";

/*
 * Staff data layer. Live Firestore listeners keep an in-memory copy of the hostel up to date
 * (see startHostelSync for what that costs). Actions update memory immediately and write to
 * Firestore in the background, so pages stay as fast as the localStorage demo was; the
 * listeners then confirm the write, or correct memory if it was rejected.
 */

type LoadStatus = "idle" | "loading" | "ready" | "error";

let state: HostelState = createEmptyState();
let status: LoadStatus = "idle";
let receiptSeq = 1000;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function getState(): HostelState {
  return state;
}

function setState(updater: (s: HostelState) => HostelState) {
  state = updater(state);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const serverSnapshot = createEmptyState();

export function useHostel(): HostelState {
  return useSyncExternalStore(subscribe, getState, () => serverSnapshot);
}

export function useHostelStatus() {
  return useSyncExternalStore(
    subscribe,
    () => status,
    () => "idle" as LoadStatus,
  );
}

const noopSubscribe = () => () => {};
/** False during SSR / hydration, true once running in the browser. */
export function useIsClient() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

// ---------------------------------------------------------------- live sync

const byNewest = <T,>(key: keyof T) => (a: T, b: T) => String(b[key]).localeCompare(String(a[key]));

const COLLECTIONS = {
  residents: "createdAt",
  payments: "date",
  messages: "sentAt",
  tickets: "createdAt",
  bookings: "createdAt",
} as const;
type CollectionKey = keyof typeof COLLECTIONS;

let settingsLoaded: Settings | null = null;
let pubLoaded: PublicBookingDoc | null = null;
let unsubscribers: (() => void)[] = [];

function roomsFrom(settings: Settings, pub: PublicBookingDoc | null): Room[] {
  return buildRooms(settings).map((r) => {
    const p = pub?.rooms[r.id];
    return p?.status === "maintenance" ? { ...r, underMaintenance: true, note: p.note } : r;
  });
}

/**
 * Starts live listeners for the staff app (idempotent). Firestore bills one read per document
 * when a listener first attaches, then one read per document that changes — so a new booking
 * costs a handful of reads, not a reload of the hostel. With the browser cache in firebase.ts,
 * reopening the app shortly after only bills what changed while it was closed.
 */
export function startHostelSync() {
  if (unsubscribers.length) return;
  status = "loading";
  emit();

  const pending = new Set<string>(["settings", "meta", "public", ...Object.keys(COLLECTIONS)]);
  const arrived = (key: string) => {
    pending.delete(key);
    if (!pending.size && status !== "ready") {
      status = "ready";
    }
    emit();
  };
  const failed = (err: unknown) => {
    console.error(err);
    if (status !== "ready") {
      status = "error";
      emit();
    }
  };

  unsubscribers.push(
    onSnapshot(
      doc(db, "config/settings"),
      (snap) => {
        settingsLoaded = (snap.data() as Settings | undefined) ?? createEmptyState().settings;
        state = { ...state, settings: settingsLoaded, rooms: roomsFrom(settingsLoaded, pubLoaded) };
        arrived("settings");
      },
      failed,
    ),
    onSnapshot(
      doc(db, "config/meta"),
      (snap) => {
        const meta = snap.data() ?? {};
        receiptSeq = Math.max(receiptSeq, (meta.receiptSeq as number | undefined) ?? 1000);
        state = { ...state, sentReminderKeys: (meta.sentReminderKeys as string[] | undefined) ?? [] };
        arrived("meta");
      },
      failed,
    ),
    onSnapshot(
      doc(db, "public/booking"),
      (snap) => {
        pubLoaded = (snap.data() as PublicBookingDoc | undefined) ?? null;
        if (settingsLoaded) state = { ...state, rooms: roomsFrom(settingsLoaded, pubLoaded) };
        arrived("public");
      },
      failed,
    ),
    ...(Object.keys(COLLECTIONS) as CollectionKey[]).map((name) =>
      onSnapshot(
        collection(db, name),
        (snap) => {
          const rows = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
          state = { ...state, [name]: rows.sort(byNewest(COLLECTIONS[name] as never)) };
          arrived(name);
        },
        failed,
      ),
    ),
  );
}

/** Stops listening and forgets the data, e.g. on sign-out. */
export function stopHostelSync() {
  unsubscribers.forEach((u) => u());
  unsubscribers = [];
  settingsLoaded = null;
  pubLoaded = null;
  state = createEmptyState();
  status = "idle";
  emit();
}

// ---------------------------------------------------------------- writing

/** Runs Firestore writes in one atomic batch; failures surface as a toast. */
function commit(build: (b: WriteBatch) => void) {
  const batch = writeBatch(db);
  build(batch);
  batch.commit().catch((err) => {
    console.error(err);
    toast("Couldn't save that change. Please try again.", "info");
  });
}

const PUBLIC = () => doc(db, "public/booking");

/** Mirrors the occupancy of the given rooms into the public booking document. */
function syncRooms(b: WriteBatch, s: HostelState, roomIds: (string | null | undefined)[]) {
  const ids = [...new Set(roomIds.filter((id): id is string => !!id))];
  if (!ids.length) return;
  const tenants = tenantsByRoom(s);
  const updates: Record<string, unknown> = {};
  for (const id of ids) {
    const room = s.rooms.find((r) => r.id === id);
    if (room) updates[`rooms.${id}`] = publicRoom(room, tenants.has(id));
  }
  if (Object.keys(updates).length) b.update(PUBLIC(), updates);
}

function nextReceiptNo(s: HostelState) {
  const max = s.payments.reduce((m, p) => Math.max(m, Number(p.receiptNo.replace(/\D/g, "")) || 0), receiptSeq);
  receiptSeq = max + 1;
  return `RCP-${receiptSeq}`;
}

const META = () => doc(db, "config/meta");

// ---------------------------------------------------------------- actions

export interface PaymentInput {
  amount: number;
  method: PaymentMethod;
  reference: string;
  date?: string;
  note?: string;
}

export function addResident(info: StudentInfo, roomId: string | null, payment?: PaymentInput, leaseStart = todayISO(), id = uid("res_")) {
  const s = state;
  const leaseEnd = addMonths(leaseStart, s.settings.leaseMonths);
  const resident: Resident = {
    ...info,
    id,
    roomId,
    status: "active",
    checkInDate: leaseStart,
    leaseStart,
    leaseEnd,
    createdAt: new Date().toISOString(),
  };
  const pay: Payment | null = payment
    ? {
        id: uid("pay_"),
        receiptNo: nextReceiptNo(s),
        residentId: id,
        roomId: roomId ?? undefined,
        amount: payment.amount,
        method: payment.method,
        reference: payment.reference,
        date: payment.date ?? todayISO(),
        periodStart: leaseStart,
        periodEnd: leaseEnd,
        note: payment.note,
      }
    : null;
  setState((s) => ({ ...s, residents: [resident, ...s.residents], payments: pay ? [pay, ...s.payments] : s.payments }));
  commit((b) => {
    b.set(doc(db, "residents", id), resident);
    if (pay) {
      b.set(doc(db, "payments", pay.id), pay);
      b.set(META(), { receiptSeq }, { merge: true });
    }
    syncRooms(b, state, [roomId]);
  });
  return id;
}

export function updateResident(id: string, patch: Partial<Resident>) {
  const before = state.residents.find((r) => r.id === id);
  if (!before) return;
  setState((s) => ({ ...s, residents: s.residents.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  commit((b) => {
    b.update(doc(db, "residents", id), patch);
    if ("roomId" in patch || "status" in patch) syncRooms(b, state, [before.roomId, patch.roomId]);
  });
}

export function moveOut(id: string) {
  updateResident(id, { status: "moved_out", roomId: null, movedOutDate: todayISO() });
}

export function deleteResident(id: string) {
  const before = state.residents.find((r) => r.id === id);
  const payIds = state.payments.filter((p) => p.residentId === id).map((p) => p.id);
  setState((s) => ({
    ...s,
    residents: s.residents.filter((r) => r.id !== id),
    payments: s.payments.filter((p) => p.residentId !== id),
  }));
  commit((b) => {
    b.delete(doc(db, "residents", id));
    payIds.forEach((p) => b.delete(doc(db, "payments", p)));
    syncRooms(b, state, [before?.roomId]);
  });
}

/** Records a rent payment and extends the lease by one rent period. */
export function recordPayment(residentId: string, input: PaymentInput, extendLease = true): Payment | null {
  const s = state;
  const resident = s.residents.find((r) => r.id === residentId);
  if (!resident) return null;
  const today = todayISO();
  const periodStart = extendLease ? (resident.leaseEnd >= today ? resident.leaseEnd : today) : resident.leaseStart;
  const periodEnd = extendLease ? addMonths(periodStart, s.settings.leaseMonths) : resident.leaseEnd;
  const created: Payment = {
    id: uid("pay_"),
    receiptNo: nextReceiptNo(s),
    residentId,
    roomId: resident.roomId ?? undefined,
    amount: input.amount,
    method: input.method,
    reference: input.reference,
    date: input.date ?? today,
    periodStart,
    periodEnd,
    note: input.note,
  };
  const lease = { leaseStart: periodStart, leaseEnd: periodEnd, status: "active" as const };
  setState((s) => ({
    ...s,
    payments: [created, ...s.payments],
    residents: extendLease ? s.residents.map((r) => (r.id === residentId ? { ...r, ...lease } : r)) : s.residents,
  }));
  commit((b) => {
    b.set(doc(db, "payments", created.id), created);
    b.set(META(), { receiptSeq }, { merge: true });
    if (extendLease) b.update(doc(db, "residents", residentId), lease);
  });
  return created;
}

export function sendMessage(msg: { kind: Message["kind"]; channel: Channel; recipientIds: string[]; body: string; automated?: boolean }) {
  const message: Message = { id: uid("msg_"), sentAt: new Date().toISOString(), automated: false, ...msg };
  setState((s) => ({ ...s, messages: [message, ...s.messages] }));
  commit((b) => b.set(doc(db, "messages", message.id), message));
}

/**
 * Sends reminders to residents who have crossed a reminder threshold (e.g. 30, 14, 7, 1 days
 * before expiry) or whose rent has expired. Each threshold is only sent once per lease.
 * In production this runs on a daily cron job.
 */
export function runAutomatedReminders(channel: Channel = "SMS") {
  const s = state;
  const today = todayISO();
  const thresholds = [...s.settings.reminderDays].sort((a, b) => a - b);
  const keys = new Set(s.sentReminderKeys);
  const renewIds: string[] = [];
  const expiredIds: string[] = [];

  for (const r of s.residents) {
    if (r.status !== "active") continue;
    const left = daysBetween(today, r.leaseEnd);
    if (left < 0) {
      const key = `${r.id}:${r.leaseEnd}:expired`;
      if (!keys.has(key)) {
        keys.add(key);
        expiredIds.push(r.id);
      }
      continue;
    }
    const threshold = thresholds.find((d) => left <= d);
    if (threshold === undefined) continue;
    const key = `${r.id}:${r.leaseEnd}:${threshold}`;
    if (!keys.has(key)) {
      keys.add(key);
      renewIds.push(r.id);
    }
  }

  const sent = renewIds.length + expiredIds.length;
  if (!sent) return 0;
  const now = new Date().toISOString();
  const newMessages: Message[] = [];
  if (renewIds.length)
    newMessages.push({ id: uid("msg_"), kind: "reminder", channel, recipientIds: renewIds, body: TEMPLATES[0].body, sentAt: now, automated: true });
  if (expiredIds.length)
    newMessages.push({ id: uid("msg_"), kind: "reminder", channel, recipientIds: expiredIds, body: TEMPLATES[1].body, sentAt: now, automated: true });
  const sentReminderKeys = [...keys];
  setState((s) => ({ ...s, messages: [...newMessages, ...s.messages], sentReminderKeys }));
  commit((b) => {
    newMessages.forEach((m) => b.set(doc(db, "messages", m.id), m));
    b.set(META(), { sentReminderKeys }, { merge: true });
  });
  return sent;
}

/**
 * For a booking that was paid but couldn't be placed automatically: puts the tenant in the room
 * staff chose, using their login id so their portal finds them, and records the online payment.
 */
export function resolveBooking(bookingId: string, roomId: string, info: StudentInfo) {
  const booking = state.bookings.find((b) => b.id === bookingId);
  if (!booking) return null;
  const residentId = addResident(info, roomId, { amount: booking.amount, method: "Online", reference: booking.id, note: "Paystack" }, todayISO(), booking.uid);
  const patch = { status: "resolved" as const, residentId, roomId };
  setState((s) => ({ ...s, bookings: s.bookings.map((b) => (b.id === bookingId ? { ...b, ...patch } : b)) }));
  commit((b) => b.update(doc(db, "bookings", bookingId), patch));
  return residentId;
}

export function bookingToStudent(b: Booking): StudentInfo {
  return toStudentInfo(b);
}

export function addTicket(t: { roomId: string; residentId: string | null; title: string; category: TicketCategory }) {
  const ticket: Ticket = { ...t, id: uid("tk_"), status: "open", createdAt: new Date().toISOString() };
  setState((s) => ({ ...s, tickets: [ticket, ...s.tickets] }));
  commit((b) => b.set(doc(db, "tickets", ticket.id), ticket));
}

export function setTicketStatus(id: string, status: Ticket["status"]) {
  updateTicket(id, { status });
}

/** First time staff open a request: the tenant sees it change from Submitted to Seen. */
export function markTicketSeen(id: string) {
  const t = state.tickets.find((x) => x.id === id);
  if (!t || t.seenAt || !t.residentId) return;
  const seenAt = new Date().toISOString();
  setState((s) => ({ ...s, tickets: s.tickets.map((x) => (x.id === id ? { ...x, seenAt } : x)) }));
  commit((b) => b.update(doc(db, "tickets", id), { seenAt }));
}

/** A staff reply and/or status change. Every one is kept on the request so the tenant sees the history. */
export function updateTicket(id: string, change: { status?: Ticket["status"]; text?: string }) {
  const t = state.tickets.find((x) => x.id === id);
  if (!t) return;
  const now = new Date().toISOString();
  const status = change.status && change.status !== t.status ? change.status : undefined;
  const text = change.text?.trim();
  if (!status && !text) return;
  const update: TicketUpdate = { at: now, by: "staff", ...(text ? { text } : {}), ...(status ? { status } : {}) };
  const closed = status === "resolved" || status === "declined";
  const local: Partial<Ticket> = {
    updates: [...(t.updates ?? []), update],
    seenAt: t.seenAt ?? now,
    ...(status ? { status, resolvedAt: closed ? now : undefined } : {}),
  };
  setState((s) => ({ ...s, tickets: s.tickets.map((x) => (x.id === id ? { ...x, ...local } : x)) }));
  commit((b) =>
    b.update(doc(db, "tickets", id), {
      updates: arrayUnion(update),
      seenAt: t.seenAt ?? now,
      ...(status ? { status, resolvedAt: closed ? now : deleteField() } : {}),
    }),
  );
}

/** Why a room can't take someone right now, or null if it can. */
export function roomUnavailableReason(roomId: string, exceptResidentId?: string) {
  const room = state.rooms.find((r) => r.id === roomId);
  if (!room) return "That room no longer exists";
  if (room.underMaintenance) return "That room is under maintenance";
  const tenant = tenantsByRoom(state).get(roomId);
  if (tenant && tenant.id !== exceptResidentId) return `Room ${roomId} is now occupied by ${tenant.fullName}`;
  const hold = pubLoaded?.holds?.[roomId];
  if (hold && hold.until > Date.now()) return `Someone is paying for room ${roomId} right now`;
  return null;
}

/** Approves a room change: moves the tenant and closes the request. Returns an error message if it can't. */
export function approveRoomChange(id: string, note?: string): string | null {
  const t = state.tickets.find((x) => x.id === id);
  const resident = t?.residentId ? state.residents.find((r) => r.id === t.residentId) : undefined;
  if (!t?.requestedRoomId || !resident) return "This request is missing its tenant or room";
  const reason = roomUnavailableReason(t.requestedRoomId, resident.id);
  if (reason) return reason;
  const from = resident.roomId;
  updateResident(resident.id, { roomId: t.requestedRoomId });
  updateTicket(id, { status: "resolved", text: note?.trim() || `Approved. You've been moved from room ${from} to room ${t.requestedRoomId}.` });
  return null;
}

export function setRoomMaintenance(roomId: string, underMaintenance: boolean, note?: string) {
  setState((s) => ({
    ...s,
    rooms: s.rooms.map((r) => (r.id === roomId ? { ...r, underMaintenance, note: underMaintenance ? note : undefined } : r)),
  }));
  commit((b) => syncRooms(b, state, [roomId]));
}

export function updateSettings(patch: Partial<Settings>) {
  const before = state.rooms;
  const settings = { ...state.settings, ...patch };
  const rooms = buildRooms(settings, before);
  setState((s) => ({ ...s, settings, rooms }));
  commit((b) => {
    b.set(doc(db, "config/settings"), settings);
    // Only touch rooms that were added or removed, so occupancy set by the server stays intact
    const updates: Record<string, unknown> = { info: publicInfo(settings) };
    const now = new Set(rooms.map((r) => r.id));
    const was = new Set(before.map((r) => r.id));
    for (const r of rooms) if (!was.has(r.id)) updates[`rooms.${r.id}`] = publicRoom(r, false);
    for (const r of before) if (!now.has(r.id)) updates[`rooms.${r.id}`] = deleteField();
    b.update(PUBLIC(), updates);
  });
}

async function reset(mode: "demo" | "empty") {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch("/api/admin/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ mode }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Reset failed");
}

/** Restores the demo hostel for everyone (server side), including tenant logins. */
export const resetDemoData = () => reset("demo");
export const startFresh = () => reset("empty");
