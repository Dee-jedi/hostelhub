"use client";

import {
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  where,
  writeBatch,
  type Query,
  type Transaction,
  type WriteBatch,
} from "firebase/firestore";
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
import { addMonths, daysBetween, parseDate, publicInfo, publicRoom, tenantsByRoom, todayISO, toISODate, toStudentInfo, uid } from "./utils";

/*
 * Staff data layer. Live Firestore listeners keep an in-memory copy of the hostel up to date
 * (see startHostelSync for what that costs). Actions update memory immediately and write to
 * Firestore in the background, so pages stay as fast as the localStorage demo was; the
 * listeners then confirm the write, or correct memory if it was rejected. Payments are the
 * exception: they wait for the server so every receipt gets a unique number.
 */

type LoadStatus = "idle" | "loading" | "ready" | "error";

let state: HostelState = createEmptyState();
let status: LoadStatus = "idle";
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
/** Collections that only load recent records until staff ask for more. */
export type HistoryKey = Exclude<CollectionKey, "residents">;

const RECENT_DAYS = 90;

/** Where each collection's recent window starts, compared as ISO strings against its date field. */
function windowStarts(): Record<HistoryKey, string> {
  const today = parseDate(todayISO());
  const recent = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString();
  return {
    // The start of the month a year ago, so the 12-month charts and "this year" totals are complete
    payments: toISODate(new Date(today.getFullYear(), today.getMonth() - 12, 1)),
    messages: recent,
    tickets: recent,
    bookings: recent,
  };
}

export const HISTORY_WINDOW: Record<HistoryKey, string> = {
  payments: "the last 12 months",
  messages: `the last ${RECENT_DAYS} days`,
  tickets: `open requests and the last ${RECENT_DAYS} days`,
  bookings: `rooms still to allocate and the last ${RECENT_DAYS} days`,
};

let settingsLoaded: Settings | null = null;
let pubLoaded: PublicBookingDoc | null = null;
let unsubscribers: (() => void)[] = [];
let windowStart = windowStarts();
let historyLoaded = new Set<HistoryKey>();

/*
 * A collection in memory is the union of several live queries (recent, still open, older…),
 * each kept separately here and merged by document id whenever one of them changes.
 */
let sources = new Map<CollectionKey, Map<string, Map<string, unknown>>>();

function listen(name: CollectionKey, key: string, q: Query, arrived: (key: string) => void, failed: (err: unknown) => void) {
  return onSnapshot(
    q,
    (snap) => {
      const bySource = sources.get(name) ?? new Map<string, Map<string, unknown>>();
      sources.set(name, bySource);
      bySource.set(key, new Map(snap.docs.map((d) => [d.id, { ...d.data(), id: d.id }])));
      const merged = new Map<string, unknown>();
      for (const rows of bySource.values()) for (const [id, row] of rows) merged.set(id, row);
      state = { ...state, [name]: [...merged.values()].sort(byNewest(COLLECTIONS[name] as never)) };
      arrived(`${name}:${key}`);
    },
    failed,
  );
}

/** The queries the staff app opens with: everything still in play, but no old history. */
function baseQueries(): [CollectionKey, string, Query][] {
  const col = (name: CollectionKey) => collection(db, name);
  const since = (name: HistoryKey) => query(col(name), where(COLLECTIONS[name], ">=", windowStart[name]));
  return [
    // One document per tenant ever; small enough to keep whole, and names are needed everywhere
    ["residents", "all", col("residents")],
    ["payments", "recent", since("payments")],
    ["messages", "recent", since("messages")],
    ["tickets", "recent", since("tickets")],
    ["tickets", "open", query(col("tickets"), where("status", "in", ["open", "in_progress"]))],
    ["bookings", "recent", since("bookings")],
    ["bookings", "attention", query(col("bookings"), where("status", "==", "needs_attention"))],
  ];
}

let liveCallbacks: { arrived: (key: string) => void; failed: (err: unknown) => void } | null = null;

/** Loads everything older than the recent window for one collection, live for the rest of the session. */
export function loadHistory(name: HistoryKey) {
  if (!liveCallbacks || historyLoaded.has(name)) return;
  historyLoaded = new Set(historyLoaded).add(name);
  const older = query(collection(db, name), where(COLLECTIONS[name], "<", windowStart[name]));
  unsubscribers.push(listen(name, "older", older, liveCallbacks.arrived, liveCallbacks.failed));
  emit();
}

export function useHistoryLoaded(name: HistoryKey) {
  return useSyncExternalStore(
    subscribe,
    () => historyLoaded.has(name),
    () => false,
  );
}

/** A tenant's whole payment history, for their profile when it goes back past the recent window. */
export function watchResidentPayments(resident: Resident) {
  const key = `resident:${resident.id}`;
  const since = resident.checkInDate < resident.createdAt ? resident.checkInDate : resident.createdAt;
  if (!liveCallbacks || historyLoaded.has("payments") || sources.get("payments")?.has(key) || since >= windowStart.payments) return;
  const q = query(collection(db, "payments"), where("residentId", "==", resident.id));
  unsubscribers.push(listen("payments", key, q, liveCallbacks.arrived, liveCallbacks.failed));
}

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
 * reopening the app within 30 minutes only bills what changed while it was closed; after that
 * it re-reads what's in the window, which is why old history stays out of it.
 */
export function startHostelSync() {
  if (unsubscribers.length) return;
  status = "loading";
  windowStart = windowStarts();
  emit();

  const queries = baseQueries();
  const pending = new Set<string>(["settings", "meta", "public", ...queries.map(([name, key]) => `${name}:${key}`)]);
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
    } else {
      toast("Couldn't load some records. Please refresh.", "info");
    }
  };
  liveCallbacks = { arrived, failed };

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
    ...queries.map(([name, key, q]) => listen(name, key, q, arrived, failed)),
  );
}

/** Stops listening and forgets the data, e.g. on sign-out. */
export function stopHostelSync() {
  unsubscribers.forEach((u) => u());
  unsubscribers = [];
  liveCallbacks = null;
  sources = new Map();
  historyLoaded = new Set();
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
  batch.commit().catch(saveFailed);
}

const PUBLIC = () => doc(db, "public/booking");

/** The public booking document's fields for the given rooms' occupancy, or null if none apply. */
function roomUpdates(s: HostelState, roomIds: (string | null | undefined)[]) {
  const ids = [...new Set(roomIds.filter((id): id is string => !!id))];
  const tenants = tenantsByRoom(s);
  const updates: Record<string, unknown> = {};
  for (const id of ids) {
    const room = s.rooms.find((r) => r.id === id);
    if (room) updates[`rooms.${id}`] = publicRoom(room, tenants.has(id));
  }
  return Object.keys(updates).length ? updates : null;
}

/** Mirrors the occupancy of the given rooms into the public booking document. */
function syncRooms(b: WriteBatch, s: HostelState, roomIds: (string | null | undefined)[]) {
  const updates = roomUpdates(s, roomIds);
  if (updates) b.update(PUBLIC(), updates);
}

const META = () => doc(db, "config/meta");

/**
 * Writes a payment under the next receipt number. The counter in config/meta is only ever
 * bumped inside a transaction, here and in the server's Paystack confirmations, so two receipts
 * can never share a number even when staff and an online payment land at the same moment.
 */
function commitWithReceipt(build: (tx: Transaction, receiptNo: string) => void) {
  return runTransaction(db, async (tx) => {
    const meta = await tx.get(META());
    const seq = ((meta.data()?.receiptSeq as number | undefined) ?? 1000) + 1;
    const receiptNo = `RCP-${seq}`;
    build(tx, receiptNo);
    tx.set(META(), { receiptSeq: seq }, { merge: true });
    return receiptNo;
  });
}

const saveFailed = (err: unknown) => {
  console.error(err);
  toast("Couldn't save that change. Please try again.", "info");
};

// ---------------------------------------------------------------- actions

export interface PaymentInput {
  amount: number;
  method: PaymentMethod;
  reference: string;
  date?: string;
  note?: string;
}

/** Resolves to the new tenant's id once saved, or null if it couldn't be (a toast says so). */
export async function addResident(info: StudentInfo, roomId: string | null, payment?: PaymentInput, leaseStart = todayISO(), id = uid("res_")) {
  return (await placeResident(info, roomId, payment, leaseStart, id)) ? id : null;
}

/**
 * Adds a tenant, with their first payment if there is one. `alsoWrite` joins the same transaction.
 * Without a payment it's a normal write, queued in the browser if offline, so it resolves at once.
 * With one it waits for the server: a transaction isn't queued, so the screen must not claim
 * success (or let staff close the tab) before it lands.
 */
function placeResident(
  info: StudentInfo,
  roomId: string | null,
  payment: PaymentInput | undefined,
  leaseStart: string,
  id: string,
  alsoWrite?: (tx: Transaction) => void,
): Promise<boolean> {
  const leaseEnd = addMonths(leaseStart, state.settings.leaseMonths);
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
  setState((s) => ({ ...s, residents: [resident, ...s.residents] }));
  const rooms = roomUpdates(state, [roomId]);
  if (!payment) {
    commit((b) => {
      b.set(doc(db, "residents", id), resident);
      if (rooms) b.update(PUBLIC(), rooms);
    });
    return Promise.resolve(true);
  }
  // The payment (and the listing) shows up once the transaction lands, with its real receipt number
  return commitWithReceipt((tx, receiptNo) => {
    const pay: Payment = {
      id: uid("pay_"),
      receiptNo,
      residentId: id,
      roomId: roomId ?? undefined,
      amount: payment.amount,
      method: payment.method,
      reference: payment.reference,
      date: payment.date ?? todayISO(),
      periodStart: leaseStart,
      periodEnd: leaseEnd,
      note: payment.note,
    };
    tx.set(doc(db, "residents", id), resident);
    tx.set(doc(db, "payments", pay.id), pay);
    if (rooms) tx.update(PUBLIC(), rooms);
    alsoWrite?.(tx);
  }).then(
    () => true,
    (err) => {
      // Transactions aren't applied locally first, so undo the optimistic tenant by hand
      setState((s) => ({ ...s, residents: s.residents.filter((r) => r.id !== id) }));
      saveFailed(err);
      return false;
    },
  );
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
  setState((s) => ({
    ...s,
    residents: s.residents.filter((r) => r.id !== id),
    payments: s.payments.filter((p) => p.residentId !== id),
  }));
  // Older payments may not be loaded, so ask Firestore for all of theirs
  getDocs(query(collection(db, "payments"), where("residentId", "==", id)))
    .then((snap) =>
      commit((b) => {
        b.delete(doc(db, "residents", id));
        snap.docs.forEach((p) => b.delete(p.ref));
        syncRooms(b, state, [before?.roomId]);
      }),
    )
    .catch(saveFailed);
}

/**
 * Records a rent payment and extends the lease by one rent period. Resolves once it's saved
 * with its receipt number, or null if it couldn't be (a toast says so).
 */
export async function recordPayment(residentId: string, input: PaymentInput, extendLease = true): Promise<Payment | null> {
  const resident = state.residents.find((r) => r.id === residentId);
  if (!resident) return null;
  const today = todayISO();
  const periodStart = extendLease ? (resident.leaseEnd >= today ? resident.leaseEnd : today) : resident.leaseStart;
  const periodEnd = extendLease ? addMonths(periodStart, state.settings.leaseMonths) : resident.leaseEnd;
  const draft: Omit<Payment, "receiptNo"> = {
    id: uid("pay_"),
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
  try {
    const receiptNo = await commitWithReceipt((tx, receiptNo) => {
      tx.set(doc(db, "payments", draft.id), { ...draft, receiptNo });
      if (extendLease) tx.update(doc(db, "residents", residentId), lease);
    });
    return { ...draft, receiptNo };
  } catch (err) {
    saveFailed(err);
    return null;
  }
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
export async function resolveBooking(bookingId: string, roomId: string, info: StudentInfo) {
  const booking = state.bookings.find((b) => b.id === bookingId);
  if (!booking) return null;
  const residentId = booking.uid;
  const patch = { status: "resolved" as const, residentId, roomId };
  const payment: PaymentInput = { amount: booking.amount, method: "Online", reference: booking.id, note: "Paystack" };
  // One transaction, so a booking is never marked resolved without its tenant and receipt
  const saved = await placeResident(info, roomId, payment, todayISO(), residentId, (tx) => tx.update(doc(db, "bookings", bookingId), patch));
  return saved ? residentId : null;
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
