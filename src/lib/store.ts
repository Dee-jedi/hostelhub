"use client";

import { arrayUnion, collection, deleteField, doc, onSnapshot, query, updateDoc, where, type Query } from "firebase/firestore";
import { useSyncExternalStore } from "react";
import { toast } from "@/components/toast";
import { hostelPath, listingPath } from "./current-hostel";
import { auth, db } from "./firebase";
import { toLegacy, type HostelView } from "./migrate/to-legacy";
import type { Listing } from "./model";
import { createEmptyState } from "./seed";
import type { Booking, Channel, HostelState, Message, Payment, PaymentMethod, Resident, Settings, StudentInfo, Ticket, TicketCategory, TicketUpdate } from "./types";
import { parseDate, tenantsByRoom, todayISO, toISODate, toStudentInfo } from "./utils";

/*
 * Staff data layer. Live Firestore listeners keep an in-memory copy of this hostel
 * (hostels/{id}/… in the multi-hostel model) and rebuild the single-hostel view the screens
 * are written against (toLegacy). Every change that touches money, rooms or tenants goes to
 * the server (/api/manage/…), which checks it, applies it in a transaction and audits it; the
 * listeners then show the result. Replies on requests are written directly (rules allow it).
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

/** Collections under hostels/{id}, with the field each one is sorted and windowed by. */
const COLLECTIONS = {
  blocks: "order",
  roomTypes: "id",
  rooms: "id",
  rentPeriods: "id",
  residents: "createdAt",
  tenancies: "createdAt",
  payments: "date",
  messages: "sentAt",
  requests: "createdAt",
  bookings: "createdAt",
} as const;
type CollectionKey = keyof typeof COLLECTIONS;

/** Screens name the windowed lists as before ("tickets" are now requests). */
export type HistoryKey = "payments" | "messages" | "tickets" | "bookings";
const HISTORY_COLLECTION: Record<HistoryKey, CollectionKey> = { payments: "payments", messages: "messages", tickets: "requests", bookings: "bookings" };

const RECENT_DAYS = 90;

/** Where each windowed collection's recent window starts, compared as ISO strings against its date field. */
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

let unsubscribers: (() => void)[] = [];
let windowStart = windowStarts();
let historyLoaded = new Set<HistoryKey>();
let raw: Partial<HostelView> = {};
let listing: Listing | null = null;

/*
 * A collection in memory is the union of several live queries (recent, still open, older…),
 * each kept separately here and merged by document id whenever one of them changes.
 */
let sources = new Map<CollectionKey, Map<string, Map<string, unknown>>>();

const byNewest = (key: string) => (a: Record<string, unknown>, b: Record<string, unknown>) => String(b[key]).localeCompare(String(a[key]));

/** Rebuilds the screens' view once the hostel itself has loaded. */
function rebuild() {
  if (!raw.hostel) return;
  const view = toLegacy({
    hostel: raw.hostel,
    blocks: raw.blocks ?? [],
    roomTypes: raw.roomTypes ?? [],
    rooms: raw.rooms ?? [],
    rentPeriods: raw.rentPeriods ?? [],
    residents: raw.residents ?? [],
    tenancies: raw.tenancies ?? [],
    payments: raw.payments ?? [],
    messages: raw.messages ?? [],
    requests: raw.requests ?? [],
    bookings: raw.bookings ?? [],
    sentReminderKeys: raw.sentReminderKeys ?? [],
  });
  const sort = <T,>(xs: T[], key: string) => [...xs].sort(byNewest(key) as never) as T[];
  const order = (id: string) => [id.replace(/\d+$/, ""), Number(id.match(/\d+$/)?.[0] ?? 0)] as const;
  state = {
    ...view,
    rooms: [...view.rooms].sort((a, b) => {
      const [ab, an] = order(a.id);
      const [bb, bn] = order(b.id);
      return (view.settings.blocks.findIndex((x) => x.name === ab) - view.settings.blocks.findIndex((x) => x.name === bb)) || an - bn;
    }),
    residents: sort(view.residents, "createdAt"),
    payments: sort(view.payments, "date"),
    messages: sort(view.messages, "sentAt"),
    tickets: sort(view.tickets, "createdAt"),
    bookings: sort(view.bookings, "createdAt"),
  };
}

function listen(name: CollectionKey, key: string, q: Query, arrived: (key: string) => void, failed: (err: unknown) => void) {
  return onSnapshot(
    q,
    (snap) => {
      const bySource = sources.get(name) ?? new Map<string, Map<string, unknown>>();
      sources.set(name, bySource);
      bySource.set(key, new Map(snap.docs.map((d) => [d.id, { ...d.data(), id: d.id }])));
      const merged = new Map<string, unknown>();
      for (const rows of bySource.values()) for (const [id, row] of rows) merged.set(id, row);
      raw = { ...raw, [name]: [...merged.values()] };
      rebuild();
      arrived(`${name}:${key}`);
    },
    failed,
  );
}

/** The queries the staff app opens with: layout, people and stays, and recent or still-open records. */
function baseQueries(): [CollectionKey, string, Query][] {
  const col = (name: CollectionKey) => collection(db, hostelPath(name));
  const since = (name: HistoryKey) => query(col(HISTORY_COLLECTION[name]), where(COLLECTIONS[HISTORY_COLLECTION[name]], ">=", windowStart[name]));
  return [
    ["blocks", "all", col("blocks")],
    ["roomTypes", "all", col("roomTypes")],
    ["rooms", "all", col("rooms")],
    ["rentPeriods", "all", col("rentPeriods")],
    // One record per person and per stay; small enough to keep whole, and names are needed everywhere
    ["residents", "all", col("residents")],
    ["tenancies", "all", col("tenancies")],
    ["payments", "recent", since("payments")],
    ["messages", "recent", since("messages")],
    ["requests", "recent", since("tickets")],
    ["requests", "open", query(col("requests"), where("status", "in", ["open", "in_progress"]))],
    ["bookings", "recent", since("bookings")],
    ["bookings", "attention", query(col("bookings"), where("status", "==", "needs_attention"))],
  ];
}

let liveCallbacks: { arrived: (key: string) => void; failed: (err: unknown) => void } | null = null;

/** Loads everything older than the recent window for one collection, live for the rest of the session. */
export function loadHistory(name: HistoryKey) {
  if (!liveCallbacks || historyLoaded.has(name)) return;
  historyLoaded = new Set(historyLoaded).add(name);
  const coll = HISTORY_COLLECTION[name];
  const older = query(collection(db, hostelPath(coll)), where(COLLECTIONS[coll], "<", windowStart[name]));
  unsubscribers.push(listen(coll, "older", older, liveCallbacks.arrived, liveCallbacks.failed));
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
  const q = query(collection(db, hostelPath("payments")), where("residentId", "==", resident.id));
  unsubscribers.push(listen("payments", key, q, liveCallbacks.arrived, liveCallbacks.failed));
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
  const pending = new Set<string>(["hostel", "reminders", "listing", ...queries.map(([name, key]) => `${name}:${key}`)]);
  const arrived = (key: string) => {
    pending.delete(key);
    if (!pending.size && status !== "ready" && raw.hostel) status = "ready";
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
      doc(db, hostelPath()),
      (snap) => {
        if (!snap.exists()) return failed(new Error("This hostel doesn't exist"));
        raw = { ...raw, hostel: { ...(snap.data() as HostelView["hostel"]), id: snap.id } };
        rebuild();
        arrived("hostel");
      },
      failed,
    ),
    onSnapshot(
      doc(db, hostelPath("counters/reminders")),
      (snap) => {
        raw = { ...raw, sentReminderKeys: (snap.data()?.sentKeys as string[] | undefined) ?? [] };
        rebuild();
        arrived("reminders");
      },
      failed,
    ),
    onSnapshot(
      doc(db, listingPath()),
      (snap) => {
        listing = (snap.data() as Listing | undefined) ?? null;
        arrived("listing");
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
  raw = {};
  listing = null;
  state = createEmptyState();
  status = "idle";
  emit();
}

// ---------------------------------------------------------------- server actions

/** Calls a manager action on the server; throws its message (safe to show) on failure. */
async function manage<T>(action: string, body: unknown): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(`/api/manage/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Couldn't save that change. Please try again.");
  return data as T;
}

/** For actions whose screen has already confirmed: report a refusal instead of failing silently. */
function inBackground(p: Promise<unknown>) {
  p.catch((err) => {
    console.error(err);
    toast(err instanceof Error ? err.message : "Couldn't save that change. Please try again.", "info");
  });
}

function failedWith(err: unknown) {
  console.error(err);
  toast(err instanceof Error ? err.message : "Couldn't save that change. Please try again.", "info");
}

// ---------------------------------------------------------------- actions

export interface PaymentInput {
  amount: number;
  method: PaymentMethod;
  reference: string;
  date?: string;
  note?: string;
}

/** Resolves to the new tenant's id once saved, or null if it couldn't be (a toast says so). */
export async function addResident(info: StudentInfo, roomId: string | null, payment?: PaymentInput, leaseStart = todayISO()) {
  try {
    return (await manage<{ residentId: string }>("addTenant", { info, roomId, payment, leaseStart })).residentId;
  } catch (err) {
    failedWith(err);
    return null;
  }
}

export function updateResident(id: string, patch: Partial<Resident>) {
  inBackground(manage("updateTenant", { residentId: id, patch }));
}

export function moveOut(id: string) {
  inBackground(manage("moveOut", { residentId: id }));
}

/**
 * Records a rent payment and extends the lease by one rent period. Resolves once it's saved
 * with its receipt number, or null if it couldn't be (a toast says so).
 */
export async function recordPayment(residentId: string, input: PaymentInput, extendLease = true): Promise<Payment | null> {
  try {
    return (await manage<{ payment: Payment }>("recordPayment", { residentId, payment: input, extendLease })).payment;
  } catch (err) {
    failedWith(err);
    return null;
  }
}

export function sendMessage(msg: { kind: Message["kind"]; channel: Channel; recipientIds: string[]; body: string }) {
  inBackground(manage("sendMessage", msg));
}

/**
 * Sends reminders to residents who have crossed a reminder threshold (e.g. 30, 14, 7, 1 days
 * before expiry) or whose rent has expired. Each threshold is only sent once per lease.
 * Resolves to how many were sent. In production this runs on a daily schedule.
 */
export async function runAutomatedReminders(channel: Channel = "SMS") {
  try {
    return (await manage<{ sent: number }>("runReminders", { channel })).sent;
  } catch (err) {
    failedWith(err);
    return 0;
  }
}

/**
 * For a booking that was paid but couldn't be placed automatically: puts the tenant in the room
 * staff chose, using their login id so their portal finds them, and records the online payment.
 */
export async function resolveBooking(bookingId: string, roomId: string, info: StudentInfo) {
  try {
    return (await manage<{ residentId: string }>("addTenant", { info, roomId, bookingId })).residentId;
  } catch (err) {
    failedWith(err);
    return null;
  }
}

export function bookingToStudent(b: Booking): StudentInfo {
  return toStudentInfo(b);
}

export function addTicket(t: { roomId: string; residentId: string | null; title: string; category: TicketCategory }) {
  inBackground(manage("logRepair", { roomId: t.roomId, title: t.title, category: t.category }));
}

export function setTicketStatus(id: string, status: Ticket["status"]) {
  updateTicket(id, { status });
}

const requestDoc = (id: string) => doc(db, hostelPath(`requests/${id}`));

/** First time staff open a request: the tenant sees it change from Submitted to Seen. */
export function markTicketSeen(id: string) {
  const t = state.tickets.find((x) => x.id === id);
  if (!t || t.seenAt || !t.residentId) return;
  inBackground(updateDoc(requestDoc(id), { seenAt: new Date().toISOString() }));
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
  inBackground(
    updateDoc(requestDoc(id), {
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
  const hold = listing?.holds?.[roomId];
  if (hold && hold.until > Date.now()) return `Someone is paying for room ${roomId} right now`;
  return null;
}

/** Approves a room change: moves the tenant and closes the request. Resolves to an error message if it can't. */
export async function approveRoomChange(id: string, note?: string): Promise<string | null> {
  const t = state.tickets.find((x) => x.id === id);
  if (!t?.requestedRoomId || !t.residentId) return "This request is missing its tenant or room";
  const reason = roomUnavailableReason(t.requestedRoomId, t.residentId);
  if (reason) return reason;
  try {
    await manage("approveRoomChange", { requestId: id, note });
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Couldn't move the tenant. Please try again.";
  }
}

export function setRoomMaintenance(roomId: string, underMaintenance: boolean, note?: string) {
  inBackground(manage("setMaintenance", { roomId, on: underMaintenance, note }));
}

export function updateSettings(patch: Partial<Settings>) {
  inBackground(manage("updateSettings", { settings: { ...state.settings, ...patch } }));
}

/** Runs an action and resolves to its error message, or null on success (for forms that stay open). */
async function attempt(action: string, body: unknown): Promise<string | null> {
  try {
    await manage(action, body);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Couldn't save that change. Please try again.";
  }
}

/** Creates a room type (no id) or edits one: name, how many people, rent per room or bed. */
export const saveRoomType = (t: { id?: string; name: string; capacity: number; price: number }) => attempt("saveRoomType", t);
export const deleteRoomType = (id: string) => attempt("deleteRoomType", { id });
/** "Set size" on the Rooms page: gives the selected rooms a room type. */
export const setRoomsType = (roomIds: string[], typeId: string) => attempt("setRoomsType", { roomIds, typeId });
export const setRentalModel = (model: "per_room" | "per_bed") => attempt("setRentalModel", { model });

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
