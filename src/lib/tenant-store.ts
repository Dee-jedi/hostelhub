"use client";

import { collection, doc, getDoc, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { useSyncExternalStore } from "react";
import { db, storage } from "./firebase";
import type { Booking, Message, Payment, PublicBookingDoc, RequestKind, Resident, Ticket, TicketCategory } from "./types";

/*
 * Tenant portal data. Every listener is scoped to the signed-in tenant's own records, so after
 * the first load it only costs a read when one of *their* documents changes (a new receipt, a
 * notice, a reply on a request). Hostel details are read once.
 */

export interface TenantData {
  status: "idle" | "loading" | "ready" | "error";
  uid: string | null;
  resident: Resident | null;
  payments: Payment[];
  notices: Message[];
  requests: Ticket[];
  booking: Booking | null;
  info: PublicBookingDoc["info"] | null;
}

const EMPTY: TenantData = { status: "idle", uid: null, resident: null, payments: [], notices: [], requests: [], booking: null, info: null };

let data: TenantData = EMPTY;
let unsubscribers: (() => void)[] = [];
const listeners = new Set<() => void>();

function set(patch: Partial<TenantData>) {
  data = { ...data, ...patch };
  listeners.forEach((l) => l());
}

export function useTenant(): TenantData {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => data,
    () => EMPTY,
  );
}

const newest = <T,>(key: keyof T) => (a: T, b: T) => String(b[key]).localeCompare(String(a[key]));

export function startTenantSync(uid: string) {
  if (data.uid === uid && unsubscribers.length) return;
  stopTenantSync();
  set({ ...EMPTY, status: "loading", uid });

  const pending = new Set(["resident", "payments", "notices", "requests", "booking", "info"]);
  const arrived = (key: string, patch: Partial<TenantData>) => {
    pending.delete(key);
    set({ ...patch, ...(pending.size ? {} : { status: "ready" }) });
  };
  const failed = (err: unknown) => {
    console.error(err);
    if (data.status !== "ready") set({ status: "error" });
  };

  getDoc(doc(db, "public/booking"))
    .then((snap) => arrived("info", { info: snap.exists() ? (snap.data() as PublicBookingDoc).info : null }))
    .catch(failed);

  unsubscribers = [
    onSnapshot(doc(db, "residents", uid), (snap) => arrived("resident", { resident: snap.exists() ? ({ ...snap.data(), id: snap.id } as Resident) : null }), failed),
    onSnapshot(
      query(collection(db, "payments"), where("residentId", "==", uid)),
      (snap) => arrived("payments", { payments: snap.docs.map((d) => ({ ...(d.data() as Payment), id: d.id })).sort(newest("date")) }),
      failed,
    ),
    onSnapshot(
      query(collection(db, "messages"), where("recipientIds", "array-contains", uid)),
      (snap) => arrived("notices", { notices: snap.docs.map((d) => ({ ...(d.data() as Message), id: d.id })).sort(newest("sentAt")) }),
      failed,
    ),
    onSnapshot(
      query(collection(db, "tickets"), where("residentId", "==", uid)),
      (snap) => arrived("requests", { requests: snap.docs.map((d) => ({ ...(d.data() as Ticket), id: d.id })).sort(newest("createdAt")) }),
      failed,
    ),
    onSnapshot(
      query(collection(db, "bookings"), where("uid", "==", uid)),
      (snap) => arrived("booking", { booking: snap.docs.map((d) => d.data() as Booking).sort(newest("createdAt"))[0] ?? null }),
      failed,
    ),
  ];
}

export function stopTenantSync() {
  unsubscribers.forEach((u) => u());
  unsubscribers = [];
  data = EMPTY;
  listeners.forEach((l) => l());
}

// ---------------------------------------------------------------- requests

/** Sends a new request. The photo (already resized) goes to the tenant's own Storage folder. */
export async function createRequest(input: {
  kind: RequestKind;
  title: string;
  category: TicketCategory;
  description?: string;
  photo?: Blob | null;
  requestedRoomId?: string;
}) {
  const r = data.resident;
  if (!r?.roomId) throw new Error("You need a room to send requests");
  const ref = doc(collection(db, "tickets"));
  let photoUrl: string | undefined;
  if (input.photo) {
    const file = storageRef(storage, `requests/${r.id}/${ref.id}.jpg`);
    await uploadBytes(file, input.photo, { contentType: "image/jpeg" });
    photoUrl = await getDownloadURL(file);
  }
  const ticket: Ticket = {
    id: ref.id,
    kind: input.kind,
    roomId: r.roomId,
    residentId: r.id,
    title: input.title.trim(),
    category: input.category,
    status: "open",
    createdAt: new Date().toISOString(),
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    ...(photoUrl ? { photoUrl } : {}),
    ...(input.requestedRoomId ? { requestedRoomId: input.requestedRoomId } : {}),
  };
  await setDoc(ref, ticket);
  return ref.id;
}

// ---------------------------------------------------------------- notifications

export interface TenantNotification {
  id: string;
  at: string;
  kind: "notice" | "reminder" | "request";
  title: string;
  body: string;
  href?: string;
}

const REQUEST_STATUS_TEXT: Record<Ticket["status"], string> = {
  open: "is open",
  in_progress: "is in progress",
  resolved: "has been resolved",
  declined: "was declined",
};

/** Notices from management plus every staff reply or status change on the tenant's requests. */
export function tenantNotifications(t: TenantData): TenantNotification[] {
  const out: TenantNotification[] = t.notices.map((m) => ({
    id: m.id,
    at: m.sentAt,
    kind: m.kind === "reminder" ? "reminder" : "notice",
    title: m.kind === "reminder" ? "Rent reminder" : "Notice from management",
    body: m.body,
  }));
  for (const r of t.requests) {
    if (r.seenAt) out.push({ id: `${r.id}:seen`, at: r.seenAt, kind: "request", title: "Request seen", body: `Management has seen your request: "${r.title}"`, href: `/portal/requests/${r.id}` });
    (r.updates ?? []).forEach((u, i) => {
      if (u.by !== "staff") return;
      out.push({
        id: `${r.id}:${i}`,
        at: u.at,
        kind: "request",
        title: u.status ? `Request ${REQUEST_STATUS_TEXT[u.status]}` : "New reply on your request",
        body: u.text ? `"${r.title}": ${u.text}` : `"${r.title}"`,
        href: `/portal/requests/${r.id}`,
      });
    });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/** Fills reminder templates ({name}, {room}…) with the tenant's own details. */
export function personalise(body: string, r: Resident | null, info: TenantData["info"]) {
  if (!r) return body;
  const days = Math.max(0, Math.round((new Date(`${r.leaseEnd}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000));
  return body
    .replaceAll("{name}", r.fullName.split(" ")[0])
    .replaceAll("{fullName}", r.fullName)
    .replaceAll("{room}", r.roomId ?? "—")
    .replaceAll("{expiry}", new Date(`${r.leaseEnd}T00:00:00`).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }))
    .replaceAll("{days}", String(days))
    .replaceAll("{amount}", info ? `₦${info.rentAmount.toLocaleString("en-NG")}` : "")
    .replaceAll("{hostel}", info?.hostelName ?? "the hostel")
    .replaceAll("{manager}", info?.managerName ?? "the manager")
    .replaceAll("{managerPhone}", info?.managerPhone ?? "");
}

export function unreadCount(t: TenantData) {
  const seen = t.resident?.notificationsSeenAt ?? "";
  return tenantNotifications(t).filter((n) => n.at > seen).length;
}
