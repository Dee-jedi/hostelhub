"use client";

import { useSyncExternalStore } from "react";
import { buildRooms, createDemoState, createEmptyState, STATE_VERSION } from "./seed";
import { TEMPLATES } from "./templates";
import type {
  Application,
  Channel,
  HostelState,
  Message,
  Payment,
  PaymentMethod,
  Resident,
  Settings,
  StudentInfo,
  Ticket,
  TicketCategory,
} from "./types";
import { addMonths, daysBetween, todayISO, uid } from "./utils";

/*
 * Demo persistence layer: the whole hostel lives in localStorage so the app runs
 * with zero setup. Every mutation goes through the actions below, so swapping this
 * file for API calls to a real database later doesn't touch the UI.
 */

const STORAGE_KEY = "hostelhub:state";

let state: HostelState | null = null;
const listeners = new Set<() => void>();

function load(): HostelState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as HostelState;
      if (parsed.version === STATE_VERSION) return parsed;
    }
  } catch {
    // corrupted or blocked storage: fall through to fresh demo data
  }
  const fresh = createDemoState();
  persist(fresh);
  return fresh;
}

function persist(s: HostelState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // storage full or unavailable; app keeps working in memory
  }
}

function emit() {
  listeners.forEach((l) => l());
}

export function getState(): HostelState {
  if (!state) state = load();
  return state;
}

function setState(updater: (s: HostelState) => HostelState) {
  state = updater(getState());
  persist(state);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      state = null;
      emit();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const serverSnapshot = createEmptyState();

export function useHostel(): HostelState {
  return useSyncExternalStore(subscribe, getState, () => serverSnapshot);
}

const noopSubscribe = () => () => {};
/** False during SSR / hydration, true once running in the browser. */
export function useIsClient() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

// ---------------------------------------------------------------- actions

export interface PaymentInput {
  amount: number;
  method: PaymentMethod;
  reference: string;
  date?: string;
  note?: string;
}

function nextReceiptNo(s: HostelState) {
  const max = s.payments.reduce((m, p) => Math.max(m, Number(p.receiptNo.replace(/\D/g, "")) || 0), 1000);
  return `RCP-${max + 1}`;
}

export function addResident(info: StudentInfo, roomId: string | null, payment?: PaymentInput, leaseStart = todayISO()) {
  const id = uid("res_");
  setState((s) => {
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
    const payments = payment
      ? [
          {
            id: uid("pay_"),
            receiptNo: nextReceiptNo(s),
            residentId: id,
            amount: payment.amount,
            method: payment.method,
            reference: payment.reference,
            date: payment.date ?? todayISO(),
            periodStart: leaseStart,
            periodEnd: leaseEnd,
            note: payment.note,
          } satisfies Payment,
          ...s.payments,
        ]
      : s.payments;
    return { ...s, residents: [resident, ...s.residents], payments };
  });
  return id;
}

export function updateResident(id: string, patch: Partial<Resident>) {
  setState((s) => ({ ...s, residents: s.residents.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
}

export function moveOut(id: string) {
  updateResident(id, { status: "moved_out", roomId: null, movedOutDate: todayISO() });
}

export function deleteResident(id: string) {
  setState((s) => ({
    ...s,
    residents: s.residents.filter((r) => r.id !== id),
    payments: s.payments.filter((p) => p.residentId !== id),
  }));
}

/** Records a rent payment and extends the lease by one rent period. */
export function recordPayment(residentId: string, input: PaymentInput, extendLease = true): Payment | null {
  let created: Payment | null = null;
  setState((s) => {
    const resident = s.residents.find((r) => r.id === residentId);
    if (!resident) return s;
    const today = todayISO();
    const periodStart = extendLease ? (resident.leaseEnd >= today ? resident.leaseEnd : today) : resident.leaseStart;
    const periodEnd = extendLease ? addMonths(periodStart, s.settings.leaseMonths) : resident.leaseEnd;
    created = {
      id: uid("pay_"),
      receiptNo: nextReceiptNo(s),
      residentId,
      amount: input.amount,
      method: input.method,
      reference: input.reference,
      date: input.date ?? today,
      periodStart,
      periodEnd,
      note: input.note,
    };
    return {
      ...s,
      payments: [created, ...s.payments],
      residents: extendLease
        ? s.residents.map((r) =>
            r.id === residentId
              ? { ...r, leaseStart: periodStart, leaseEnd: periodEnd, status: "active" as const }
              : r,
          )
        : s.residents,
    };
  });
  return created;
}

export function sendMessage(msg: { kind: Message["kind"]; channel: Channel; recipientIds: string[]; body: string; automated?: boolean }) {
  setState((s) => ({
    ...s,
    messages: [
      { id: uid("msg_"), sentAt: new Date().toISOString(), automated: false, ...msg },
      ...s.messages,
    ],
  }));
}

/**
 * Sends reminders to residents who have crossed a reminder threshold (e.g. 30, 14, 7, 1 days
 * before expiry) or whose rent has expired. Each threshold is only sent once per lease.
 * In production this runs on a daily cron job.
 */
export function runAutomatedReminders(channel: Channel = "SMS") {
  let sent = 0;
  setState((s) => {
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

    const now = new Date().toISOString();
    const newMessages: Message[] = [];
    if (renewIds.length)
      newMessages.push({ id: uid("msg_"), kind: "reminder", channel, recipientIds: renewIds, body: TEMPLATES[0].body, sentAt: now, automated: true });
    if (expiredIds.length)
      newMessages.push({ id: uid("msg_"), kind: "reminder", channel, recipientIds: expiredIds, body: TEMPLATES[1].body, sentAt: now, automated: true });
    sent = renewIds.length + expiredIds.length;
    if (!sent) return s;
    return { ...s, messages: [...newMessages, ...s.messages], sentReminderKeys: [...keys] };
  });
  return sent;
}

export function submitApplication(info: StudentInfo, preferredBlock: string, paymentReference: string) {
  const id = uid("app_");
  setState((s) => ({
    ...s,
    applications: [
      { ...info, id, preferredBlock, paymentReference, status: "pending", submittedAt: new Date().toISOString() },
      ...s.applications,
    ],
  }));
  return id;
}

export function applicationToStudent(a: Application): StudentInfo {
  return {
    fullName: a.fullName,
    sex: a.sex,
    phone: a.phone,
    email: a.email,
    matricNo: a.matricNo,
    department: a.department,
    faculty: a.faculty,
    level: a.level,
    stateOfOrigin: a.stateOfOrigin,
    homeAddress: a.homeAddress,
    nextOfKinName: a.nextOfKinName,
    nextOfKinPhone: a.nextOfKinPhone,
    nextOfKinRelationship: a.nextOfKinRelationship,
    occupants: a.occupants ?? [],
  };
}

export function approveApplication(appId: string, roomId: string, payment?: PaymentInput) {
  const app = getState().applications.find((a) => a.id === appId);
  if (!app) return null;
  const residentId = addResident(applicationToStudent(app), roomId, payment);
  setApplicationStatus(appId, "approved");
  return residentId;
}

export function setApplicationStatus(appId: string, status: Application["status"]) {
  setState((s) => ({ ...s, applications: s.applications.map((a) => (a.id === appId ? { ...a, status } : a)) }));
}

export function addTicket(t: { roomId: string; residentId: string | null; title: string; category: TicketCategory }) {
  setState((s) => ({
    ...s,
    tickets: [{ ...t, id: uid("tk_"), status: "open", createdAt: new Date().toISOString() }, ...s.tickets],
  }));
}

export function setTicketStatus(id: string, status: Ticket["status"]) {
  setState((s) => ({
    ...s,
    tickets: s.tickets.map((t) =>
      t.id === id ? { ...t, status, resolvedAt: status === "resolved" ? new Date().toISOString() : undefined } : t,
    ),
  }));
}

export function setRoomMaintenance(roomId: string, underMaintenance: boolean, note?: string) {
  setState((s) => ({
    ...s,
    rooms: s.rooms.map((r) => (r.id === roomId ? { ...r, underMaintenance, note: underMaintenance ? note : undefined } : r)),
  }));
}

export function updateSettings(patch: Partial<Settings>) {
  setState((s) => {
    const settings = { ...s.settings, ...patch };
    return { ...s, settings, rooms: buildRooms(settings, s.rooms) };
  });
}

export function resetDemoData() {
  setState(() => createDemoState());
}

export function startFresh() {
  setState(() => createEmptyState());
}
