import { FieldValue } from "firebase-admin/firestore";
import type { HostelMessage, HostelPayment, HostelRequest, HostelResident, HostelRoom, Listing, Tenancy } from "../model";
import { DEFAULT_TYPE_ID } from "../migrate/from-legacy";
import { paymentOf } from "../migrate/to-legacy";
import { buildRooms } from "../seed";
import { TEMPLATES } from "../templates";
import type { Channel, Message, Payment, PaymentMethod, Settings, StudentInfo, TicketCategory, TicketUpdate } from "../types";
import { addMonths, daysBetween, todayISO } from "../utils";
import { adminDb } from "./admin";
import { setTenantOf } from "./claims";
import { command, CommandError } from "./command";
import { activeTenancyIn, assertRoomFree, currentTenancyOf, getOrThrow, hostelRefs, listingStatus, newId, readReceiptCounter, readTerms } from "./hostel-data";

/*
 * Manager actions in the multi-hostel model, served at POST /api/manage/{action}. Each mirrors
 * a staff-app action that used to write from the browser, now checked, transactional and
 * audited on the server. Bodies use the single-hostel shapes the screens already work with.
 */

export interface PaymentInput {
  amount: number;
  method: PaymentMethod;
  reference: string;
  date?: string;
  note?: string;
}

/** The person's own details, as stored on the resident record (no lease or room fields). */
const PERSON_KEYS = [
  "isStudent", "fullName", "sex", "phone", "email", "matricNo", "department", "faculty", "level",
  "stateOfOrigin", "homeAddress", "nextOfKinName", "nextOfKinPhone", "nextOfKinRelationship", "photoUrl",
] as const;

function personPatch(patch: Partial<StudentInfo>) {
  const out: Record<string, unknown> = {};
  for (const k of PERSON_KEYS) if (k in patch) out[k] = patch[k] ?? FieldValue.delete();
  return out;
}

function validPayment(p: PaymentInput | undefined) {
  if (!p) return;
  if (!(p.amount > 0)) throw new CommandError("Enter an amount.");
  if (!["Transfer", "Cash", "POS", "Online"].includes(p.method)) throw new CommandError("Unknown payment method.");
}

// ------------------------------------------------------------------ tenants

/** Adds a tenant (optionally with their first payment), or places a paid online booking. */
export const addTenant = command<
  { info: StudentInfo; roomId: string | null; payment?: PaymentInput; leaseStart?: string; bookingId?: string },
  { residentId: string; receiptNo: string | null }
>({ access: "manager" }, async (ctx, body) => {
  const h = ctx.hostelId!;
  const r = hostelRefs(h);
  if (!body.info?.fullName?.trim()) throw new CommandError("Enter the tenant's name.");
  validPayment(body.payment);

  const result = await adminDb.runTransaction(async (tx) => {
    const booking = body.bookingId ? await getOrThrow<{ uid: string; amount: number; status: string; id: string }>(tx, r.doc("bookings", body.bookingId), "Booking not found.") : null;
    if (booking && booking.status !== "needs_attention") throw new CommandError("This booking has already been placed.", 409);
    const room = body.roomId ? await assertRoomFree(tx, h, body.roomId, { holdOwnerUid: booking?.uid }) : null;
    const { months } = await readTerms(tx, h, room);
    const payment: PaymentInput | undefined = booking ? { amount: booking.amount, method: "Online", reference: booking.id, note: "Paystack" } : body.payment;
    const receipt = payment ? await readReceiptCounter(tx, h) : null;

    const residentId = booking?.uid ?? newId("res_");
    const uid = booking?.uid ?? null;
    const leaseStart = booking ? todayISO() : (body.leaseStart ?? todayISO());
    const leaseEnd = addMonths(leaseStart, months);
    const now = new Date().toISOString();
    const tenancyId = newId("t_");

    const resident: HostelResident = { ...(personPatch(body.info) as unknown as StudentInfo), occupants: [], id: residentId, uid, createdAt: now };
    const tenancy: Tenancy = {
      id: tenancyId, residentId, uid, roomId: room?.id ?? null, spaceId: room?.id ?? null, periodId: "rolling",
      status: "active", checkInDate: leaseStart, leaseStart, leaseEnd, occupants: body.info.occupants ?? [], createdAt: now,
    };
    tx.set(r.doc("residents", residentId), resident);
    tx.set(r.doc("tenancies", tenancyId), tenancy);
    if (payment && receipt) {
      const pay: HostelPayment = {
        id: newId("pay_"), receiptNo: receipt.receiptNo, residentId, roomId: room?.id, amount: payment.amount, method: payment.method,
        reference: payment.reference ?? "", date: payment.date ?? todayISO(), periodStart: leaseStart, periodEnd: leaseEnd, note: payment.note,
        uid, tenancyId,
      };
      tx.set(r.doc("payments", pay.id), pay);
      receipt.claim();
    }
    if (room) tx.update(r.listing, { ...listingStatus(room.id, "occupied"), [`holds.${room.id}`]: FieldValue.delete() });
    if (booking) tx.update(r.doc("bookings", booking.id), { status: "resolved", residentId, roomId: room?.id ?? null });
    ctx.auditIn(tx, booking ? "booking.placed" : "tenant.added", { residentId, roomId: room?.id ?? null, receiptNo: receipt?.receiptNo ?? null });
    return { residentId, receiptNo: receipt?.receiptNo ?? null, uid };
  });
  if (result.uid) await setTenantOf(result.uid, h, true);
  return { residentId: result.residentId, receiptNo: result.receiptNo };
});

/** Edits a tenant: their details, co-occupants, or room (a room change). */
export const updateTenant = command<{ residentId: string; patch: Partial<StudentInfo> & { roomId?: string | null } }, { ok: true }>(
  { access: "manager" },
  async (ctx, body) => {
    const h = ctx.hostelId!;
    const r = hostelRefs(h);
    await adminDb.runTransaction(async (tx) => {
      await getOrThrow(tx, r.doc("residents", body.residentId), "Tenant not found.");
      const tenancy = await currentTenancyOf(tx, h, body.residentId);
      const moving = "roomId" in body.patch && body.patch.roomId !== (tenancy?.status === "active" ? tenancy.roomId : null);
      if (moving && body.patch.roomId) await assertRoomFree(tx, h, body.patch.roomId, { exceptResidentId: body.residentId });

      const person = personPatch(body.patch);
      if (Object.keys(person).length) tx.update(r.doc("residents", body.residentId), person);
      if (tenancy && ("occupants" in body.patch || moving)) {
        tx.update(r.doc("tenancies", tenancy.id), {
          ...("occupants" in body.patch ? { occupants: body.patch.occupants ?? [] } : {}),
          ...(moving ? { roomId: body.patch.roomId ?? null, spaceId: body.patch.roomId ?? null } : {}),
        });
      }
      if (moving && tenancy?.status === "active") {
        if (tenancy.roomId) tx.update(r.listing, listingStatus(tenancy.roomId, "vacant"));
        if (body.patch.roomId) tx.update(r.listing, listingStatus(body.patch.roomId, "occupied"));
      }
      ctx.auditIn(tx, moving ? "tenant.moved" : "tenant.edited", { residentId: body.residentId, ...(moving ? { from: tenancy?.roomId ?? null, to: body.patch.roomId ?? null } : { fields: Object.keys(body.patch) }) });
    });
    return { ok: true };
  },
);

export const moveOut = command<{ residentId: string }, { ok: true }>({ access: "manager" }, async (ctx, body) => {
  const h = ctx.hostelId!;
  const r = hostelRefs(h);
  await adminDb.runTransaction(async (tx) => {
    const tenancy = await currentTenancyOf(tx, h, body.residentId);
    if (!tenancy || tenancy.status !== "active") throw new CommandError("This tenant has already moved out.", 409);
    tx.update(r.doc("tenancies", tenancy.id), { status: "ended", movedOutDate: todayISO() });
    if (tenancy.roomId) tx.update(r.listing, listingStatus(tenancy.roomId, "vacant"));
    ctx.auditIn(tx, "tenant.moved_out", { residentId: body.residentId, roomId: tenancy.roomId });
  });
  return { ok: true };
});

/** Records a rent payment; by default it also extends the lease by one rent period. */
export const recordPayment = command<{ residentId: string; payment: PaymentInput; extendLease?: boolean }, { payment: Payment }>(
  { access: "manager" },
  async (ctx, body) => {
    const h = ctx.hostelId!;
    const r = hostelRefs(h);
    validPayment(body.payment);
    const extend = body.extendLease !== false;
    const payment = await adminDb.runTransaction(async (tx) => {
      const resident = await getOrThrow<HostelResident>(tx, r.doc("residents", body.residentId), "Tenant not found.");
      const tenancy = await currentTenancyOf(tx, h, body.residentId);
      if (!tenancy) throw new CommandError("This tenant has no stay on record.", 409);
      const roomSnap = tenancy.roomId ? await tx.get(r.doc("rooms", tenancy.roomId)) : null;
      const { months } = await readTerms(tx, h, (roomSnap?.data() as HostelRoom | undefined) ?? null);
      const receipt = await readReceiptCounter(tx, h);

      const today = todayISO();
      const periodStart = extend ? (tenancy.leaseEnd >= today ? tenancy.leaseEnd : today) : tenancy.leaseStart;
      const periodEnd = extend ? addMonths(periodStart, months) : tenancy.leaseEnd;
      const active = tenancy.status === "active";
      const pay: HostelPayment = {
        id: newId("pay_"), receiptNo: receipt.receiptNo, residentId: resident.id, roomId: active ? (tenancy.roomId ?? undefined) : undefined,
        amount: body.payment.amount, method: body.payment.method, reference: body.payment.reference ?? "", date: body.payment.date ?? today,
        periodStart, periodEnd, note: body.payment.note, uid: resident.uid, tenancyId: tenancy.id,
      };
      tx.set(r.doc("payments", pay.id), pay);
      receipt.claim();
      if (extend) {
        // Re-admitting someone who moved out: their old room may be someone else's now
        tx.update(r.doc("tenancies", tenancy.id), {
          leaseStart: periodStart, leaseEnd: periodEnd, status: "active",
          ...(active ? {} : { roomId: null, spaceId: null, movedOutDate: FieldValue.delete() }),
        });
      }
      ctx.auditIn(tx, "payment.recorded", { residentId: resident.id, receiptNo: pay.receiptNo, amount: pay.amount, method: pay.method });
      return pay;
    });
    return { payment: paymentOf(JSON.parse(JSON.stringify(payment))) };
  },
);

// ------------------------------------------------------------------ messages

async function messageDoc(h: string, msg: Pick<Message, "kind" | "channel" | "recipientIds" | "body" | "automated">): Promise<HostelMessage> {
  const r = hostelRefs(h);
  const snaps = msg.recipientIds.length ? await adminDb.getAll(...msg.recipientIds.map((id) => r.doc("residents", id))) : [];
  const recipientUids = snaps.map((s) => (s.data() as HostelResident | undefined)?.uid).filter((u): u is string => !!u);
  return { ...msg, id: newId("msg_"), sentAt: new Date().toISOString(), recipientUids };
}

export const sendMessage = command<{ kind: Message["kind"]; channel: Channel; recipientIds: string[]; body: string }, { id: string }>(
  { access: "manager" },
  async (ctx, body) => {
    if (!body.body?.trim()) throw new CommandError("Write a message first.");
    if (!Array.isArray(body.recipientIds) || !body.recipientIds.length) throw new CommandError("Pick who should receive it.");
    const msg = await messageDoc(ctx.hostelId!, { kind: body.kind, channel: body.channel, recipientIds: body.recipientIds, body: body.body, automated: false });
    await hostelRefs(ctx.hostelId!).doc("messages", msg.id).set(msg);
    await ctx.audit("message.sent", { id: msg.id, recipients: msg.recipientIds.length });
    return { id: msg.id };
  },
);

/**
 * Sends reminders to tenants who crossed a reminder threshold (e.g. 30, 14, 7, 1 days before
 * the end of their paid period) or whose rent has run out. Each threshold goes out once per lease.
 */
export const runReminders = command<{ channel?: Channel }, { sent: number }>({ access: "manager" }, async (ctx, body) => {
  const h = ctx.hostelId!;
  const r = hostelRefs(h);
  const [hostelSnap, logSnap, tenancies] = await Promise.all([r.hostel.get(), r.reminders.get(), r.col("tenancies").where("status", "==", "active").get()]);
  const thresholds = [...((hostelSnap.data()?.reminderDays as number[] | undefined) ?? [])].sort((a, b) => a - b);
  const keys = new Set<string>((logSnap.data()?.sentKeys as string[] | undefined) ?? []);
  const today = todayISO();
  const renew: string[] = [];
  const expired: string[] = [];
  for (const d of tenancies.docs) {
    const t = d.data() as Tenancy;
    const left = daysBetween(today, t.leaseEnd);
    if (left < 0) {
      const key = `${t.residentId}:${t.leaseEnd}:expired`;
      if (!keys.has(key)) {
        keys.add(key);
        expired.push(t.residentId);
      }
      continue;
    }
    const threshold = thresholds.find((n) => left <= n);
    if (threshold === undefined) continue;
    const key = `${t.residentId}:${t.leaseEnd}:${threshold}`;
    if (!keys.has(key)) {
      keys.add(key);
      renew.push(t.residentId);
    }
  }
  const sent = renew.length + expired.length;
  if (!sent) return { sent: 0 };
  const channel = body.channel ?? "SMS";
  const messages = await Promise.all([
    ...(renew.length ? [messageDoc(h, { kind: "reminder", channel, recipientIds: renew, body: TEMPLATES[0].body, automated: true })] : []),
    ...(expired.length ? [messageDoc(h, { kind: "reminder", channel, recipientIds: expired, body: TEMPLATES[1].body, automated: true })] : []),
  ]);
  const batch = adminDb.batch();
  for (const m of messages) batch.set(r.doc("messages", m.id), m);
  batch.set(r.reminders, { sentKeys: [...keys] }, { merge: true });
  await batch.commit();
  await ctx.audit("reminders.sent", { sent });
  return { sent };
});

// ------------------------------------------------------------------ requests and rooms

export const logRepair = command<{ roomId: string; title: string; category: TicketCategory }, { id: string }>({ access: "manager" }, async (ctx, body) => {
  if (!body.title?.trim() || !body.roomId) throw new CommandError("Pick a room and describe the issue.");
  const req: HostelRequest = {
    id: newId("tk_"), roomId: body.roomId, residentId: null, uid: null, title: body.title.trim(), category: body.category, status: "open", createdAt: new Date().toISOString(),
  };
  await hostelRefs(ctx.hostelId!).doc("requests", req.id).set(req);
  return { id: req.id };
});

/** Approves a room change: moves the tenant and closes the request with a note they see. */
export const approveRoomChange = command<{ requestId: string; note?: string }, { ok: true }>({ access: "manager" }, async (ctx, body) => {
  const h = ctx.hostelId!;
  const r = hostelRefs(h);
  await adminDb.runTransaction(async (tx) => {
    const req = await getOrThrow<HostelRequest>(tx, r.doc("requests", body.requestId), "Request not found.");
    if (!req.requestedRoomId || !req.residentId) throw new CommandError("This request is missing its tenant or room.");
    const tenancy = await currentTenancyOf(tx, h, req.residentId);
    if (!tenancy || tenancy.status !== "active") throw new CommandError("This tenant no longer lives here.", 409);
    await assertRoomFree(tx, h, req.requestedRoomId, { exceptResidentId: req.residentId });
    const now = new Date().toISOString();
    const update: TicketUpdate = {
      at: now, by: "staff", status: "resolved",
      text: body.note?.trim() || `Approved. You've been moved from room ${tenancy.roomId} to room ${req.requestedRoomId}.`,
    };
    tx.update(r.doc("tenancies", tenancy.id), { roomId: req.requestedRoomId, spaceId: req.requestedRoomId });
    if (tenancy.roomId) tx.update(r.listing, listingStatus(tenancy.roomId, "vacant"));
    tx.update(r.listing, listingStatus(req.requestedRoomId, "occupied"));
    tx.update(r.doc("requests", req.id), { status: "resolved", resolvedAt: now, seenAt: req.seenAt ?? now, updates: FieldValue.arrayUnion(update) });
    ctx.auditIn(tx, "tenant.moved", { residentId: req.residentId, from: tenancy.roomId, to: req.requestedRoomId, requestId: req.id });
  });
  return { ok: true };
});

export const setMaintenance = command<{ roomId: string; on: boolean; note?: string }, { ok: true }>({ access: "manager" }, async (ctx, body) => {
  const h = ctx.hostelId!;
  const r = hostelRefs(h);
  await adminDb.runTransaction(async (tx) => {
    await getOrThrow(tx, r.doc("rooms", body.roomId), "Room not found.");
    const occupied = !!(await activeTenancyIn(tx, h, body.roomId));
    tx.update(r.doc("rooms", body.roomId), { maintenance: body.on ? (body.note ? { note: body.note } : {}) : null });
    tx.update(r.listing, body.on ? listingStatus(body.roomId, "maintenance", body.note) : listingStatus(body.roomId, occupied ? "occupied" : "vacant"));
    ctx.auditIn(tx, body.on ? "room.maintenance_on" : "room.maintenance_off", { roomId: body.roomId });
  });
  return { ok: true };
});

/**
 * Saves the single-hostel settings form: hostel details, the standard room type's rent and
 * size, the rent period length, and the block/room layout (rooms added or removed to match).
 */
export const updateSettings = command<{ settings: Settings }, { ok: true }>({ access: "manager" }, async (ctx, body) => {
  const h = ctx.hostelId!;
  const r = hostelRefs(h);
  const s = body.settings;
  if (!s?.hostelName?.trim()) throw new CommandError("Enter the hostel's name.");
  const capacity = Math.min(4, Math.max(1, Math.round(s.maxOccupants)));
  const [roomDocs, active] = await Promise.all([r.col("rooms").get(), r.col("tenancies").where("status", "==", "active").get()]);
  const occupied = new Set(active.docs.map((d) => (d.data() as Tenancy).roomId).filter(Boolean));
  const existing = new Map(roomDocs.docs.map((d) => [d.id, d.data() as HostelRoom]));
  const wanted = buildRooms(s);
  const wantedIds = new Set(wanted.map((x) => x.id));
  const removing = [...existing.keys()].filter((id) => !wantedIds.has(id));
  const blocked = removing.filter((id) => occupied.has(id));
  if (blocked.length) throw new CommandError(`Move the tenants out of ${blocked.slice(0, 3).join(", ")}${blocked.length > 3 ? "…" : ""} before removing those rooms.`, 409);

  const batch = adminDb.batch();
  batch.update(r.hostel, {
    name: s.hostelName.trim(), address: s.address, manager: { name: s.managerName, phone: s.managerPhone },
    bank: { bankName: s.bankName, accountName: s.accountName, accountNumber: s.accountNumber },
    whatsappGroupLink: s.whatsappGroupLink, reminderDays: s.reminderDays,
  });
  batch.set(r.doc("roomTypes", DEFAULT_TYPE_ID), { id: DEFAULT_TYPE_ID, name: `Standard (${capacity} ${capacity === 1 ? "person" : "people"})`, capacity, pricingMode: "per_room", price: s.rentAmount });
  batch.set(r.doc("rentPeriods", "rolling"), { id: "rolling", kind: "rolling", name: `${s.leaseMonths} months from move-in`, months: s.leaseMonths });
  s.blocks.forEach((b, order) => batch.set(r.doc("blocks", b.name), { id: b.name, name: b.name, order }));
  const listing: Record<string, unknown> = {
    "info.hostelName": s.hostelName.trim(), "info.address": s.address, "info.managerName": s.managerName, "info.managerPhone": s.managerPhone,
    "info.whatsappGroupLink": s.whatsappGroupLink, "info.blocks": s.blocks.map((b) => b.name), "info.rentAmount": s.rentAmount,
    "info.leaseMonths": s.leaseMonths, "info.maxOccupants": capacity,
    "info.roomTypes": [{ id: DEFAULT_TYPE_ID, name: `Standard (${capacity} ${capacity === 1 ? "person" : "people"})`, capacity, pricingMode: "per_room", price: s.rentAmount }],
  };
  for (const room of wanted) {
    if (existing.has(room.id)) continue;
    batch.set(r.doc("rooms", room.id), { id: room.id, label: room.id, blockId: room.block, number: room.number, typeId: DEFAULT_TYPE_ID, maintenance: null } satisfies HostelRoom);
    listing[`rooms.${room.id}`] = { block: room.block, number: room.number, label: room.id, typeId: DEFAULT_TYPE_ID, status: "vacant" } satisfies Listing["rooms"][string];
  }
  for (const id of removing) {
    batch.delete(r.doc("rooms", id));
    listing[`rooms.${id}`] = FieldValue.delete();
  }
  const blockNames = new Set(s.blocks.map((b) => b.name));
  for (const d of (await r.col("blocks").get()).docs) if (!blockNames.has(d.id)) batch.delete(d.ref);
  batch.update(r.listing, listing);
  await batch.commit();
  await ctx.audit("settings.updated", { rooms: { added: wanted.filter((x) => !existing.has(x.id)).length, removed: removing.length } });
  return { ok: true };
});

/** Every manager action by name, for the /api/manage/[action] route. */
export const MANAGE = { addTenant, updateTenant, moveOut, recordPayment, sendMessage, runReminders, logRepair, approveRoomChange, setMaintenance, updateSettings } as const;
export type ManageAction = keyof typeof MANAGE;
