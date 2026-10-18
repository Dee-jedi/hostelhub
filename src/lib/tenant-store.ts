"use client";

import { collection, doc, getDoc, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { useSyncExternalStore } from "react";
import { accessFrom, isTenantOf } from "./access";
import { currentHostelId, hostelPath, listingPath } from "./current-hostel";
import { auth, db, storage } from "./firebase";
import { currentTenancy, messageOf, paymentOf, residentOf, ticketOf } from "./migrate/to-legacy";
import type { HostelMessage, HostelPayment, HostelRequest, HostelResident, Listing, Tenancy } from "./model";
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
  /** Each room's type (from the public listing), for the tenant's own rent */
  roomTypeIds: Record<string, string>;
}

const EMPTY: TenantData = { status: "idle", uid: null, resident: null, payments: [], notices: [], requests: [], booking: null, info: null, roomTypeIds: {} };

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

const LOAD_TIMEOUT_MS = 20_000;
let watchdog: ReturnType<typeof setTimeout> | undefined;
/** Ignores late answers from a previous login after a restart or sign-out */
let sessionId = 0;

export function startTenantSync(uid: string) {
  if (data.uid === uid && (unsubscribers.length || data.status === "loading")) return;
  stopTenantSync();
  set({ ...EMPTY, status: "loading", uid });
  const session = ++sessionId;

  const pending = new Set(["resident", "payments", "notices", "requests", "booking", "info"]);
  const arrived = (key: string, patch: Partial<TenantData>) => {
    if (session !== sessionId) return;
    pending.delete(key);
    set({ ...patch, ...(pending.size ? {} : { status: "ready" }) });
  };
  const failed = (err: unknown) => {
    console.error(err);
    if (session === sessionId && data.status !== "ready") set({ status: "error" });
  };
  // Never spin forever: after a while, say which data didn't arrive and offer a retry
  watchdog = setTimeout(() => {
    if (!pending.size || session !== sessionId) return;
    console.error(`[portal] still loading after ${LOAD_TIMEOUT_MS / 1000}s; waiting for: ${[...pending].join(", ")}`);
    set({ status: "error" });
  }, LOAD_TIMEOUT_MS);

  const hostelId = currentHostelId();
  if (!hostelId) return failed(new Error("This address isn't a hostel"));
  const col = (name: string) => collection(db, hostelPath(name));
  const mine = (name: string) => query(col(name), where("uid", "==", uid));

  getDoc(doc(db, listingPath()))
    .then((snap) => {
      const listing = snap.exists() ? (snap.data() as Listing) : null;
      arrived("info", {
        info: listing ? (listing.info as unknown as PublicBookingDoc["info"]) : null,
        roomTypeIds: listing ? Object.fromEntries(Object.entries(listing.rooms).map(([id, room]) => [id, room.typeId])) : {},
      });
    })
    .catch(failed);

  // Someone who paid but has no room yet isn't a tenant: they only see their booking
  const booking = onSnapshot(
    mine("bookings"),
    (snap) => arrived("booking", { booking: snap.docs.map((d) => d.data() as Booking).sort(newest("createdAt"))[0] ?? null }),
    failed,
  );
  unsubscribers = [booking];

  isTenantHere(hostelId).then((tenant) => {
    if (session !== sessionId) return;
    if (!tenant) {
      for (const key of ["resident", "payments", "notices", "requests"]) arrived(key, {});
      return;
    }
    // The person and their stays together make the portal's resident record
    let person: HostelResident | null | undefined;
    let stays: Tenancy[] | undefined;
    const residentReady = () => {
      if (person === undefined || stays === undefined) return;
      arrived("resident", { resident: person ? residentOf(person, currentTenancy(stays)) : null });
    };
    unsubscribers.push(
      onSnapshot(
        mine("residents"),
        (snap) => {
          const d = snap.docs[0];
          person = d ? ({ ...(d.data() as HostelResident), id: d.id }) : null;
          residentReady();
        },
        failed,
      ),
      onSnapshot(
        mine("tenancies"),
        (snap) => {
          stays = snap.docs.map((d) => ({ ...(d.data() as Tenancy), id: d.id }));
          residentReady();
        },
        failed,
      ),
      onSnapshot(
        mine("payments"),
        (snap) => arrived("payments", { payments: snap.docs.map((d) => paymentOf({ ...(d.data() as HostelPayment), id: d.id })).sort(newest("date")) }),
        failed,
      ),
      onSnapshot(
        query(col("messages"), where("recipientUids", "array-contains", uid)),
        (snap) => arrived("notices", { notices: snap.docs.map((d) => messageOf({ ...(d.data() as HostelMessage), id: d.id })).sort(newest("sentAt")) }),
        failed,
      ),
      onSnapshot(
        mine("requests"),
        (snap) => arrived("requests", { requests: snap.docs.map((d) => ticketOf({ ...(d.data() as HostelRequest), id: d.id })).sort(newest("createdAt")) }),
        failed,
      ),
    );
  }, failed);
}

/**
 * Whether this login is a tenant of the hostel. A tenant who just paid gets that access on the
 * server a moment earlier, so refresh the login once before deciding.
 */
async function isTenantHere(hostelId: string) {
  const user = auth.currentUser;
  if (!user) return false;
  if (isTenantOf(accessFrom((await user.getIdTokenResult()).claims), hostelId)) return true;
  return isTenantOf(accessFrom((await user.getIdTokenResult(true)).claims), hostelId);
}

/** Starts loading again from scratch, e.g. from the "Try again" button. */
export function restartTenantSync() {
  const uid = data.uid;
  stopTenantSync();
  if (uid) startTenantSync(uid);
}

export function stopTenantSync() {
  sessionId++;
  clearTimeout(watchdog);
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
  const ref = doc(collection(db, hostelPath("requests")));
  let photoUrl: string | undefined;
  if (input.photo) {
    const file = storageRef(storage, `requests/${r.id}/${ref.id}.jpg`);
    await uploadBytes(file, input.photo, { contentType: "image/jpeg" });
    photoUrl = await getDownloadURL(file);
  }
  const ticket: HostelRequest = {
    id: ref.id,
    uid: auth.currentUser?.uid ?? null,
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

/** What the tenant pays per rent period: their room's type, or the hostel's starting price. */
export function tenantRent(t: TenantData) {
  const typeId = t.resident?.roomId ? t.roomTypeIds[t.resident.roomId] : undefined;
  return t.info?.roomTypes?.find((x) => x.id === typeId)?.price ?? t.info?.rentAmount ?? 0;
}
