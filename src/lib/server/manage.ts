import { FieldValue } from "firebase-admin/firestore";
import type { Hostel, HostelMessage, HostelPayment, HostelRequest, HostelResident, HostelRoom, PricingMode, RoomType, Tenancy } from "../model";
import { spaceIdsOf } from "../spaces";
import { DEFAULT_TYPE_ID } from "../migrate/from-legacy";
import { paymentOf } from "../migrate/to-legacy";
import { buildRooms } from "../seed";
import { TEMPLATES } from "../templates";
import type { Channel, Message, Payment, PaymentMethod, Settings, StudentInfo, TicketCategory, TicketUpdate } from "../types";
import { addMonths, daysBetween, todayISO } from "../utils";
import { adminDb } from "./admin";
import { setTenantOf } from "./claims";
import { command, CommandError } from "./command";
import { claimSpace, currentTenancyOf, getOrThrow, hostelRefs, listingUpdate, minus, newId, plus, readOccupancy, readReceiptCounter, readTerms } from "./hostel-data";

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
    const booking = body.bookingId ? await getOrThrow<{ uid: string; amount: number; status: string; id: string; spaceId?: string }>(tx, r.doc("bookings", body.bookingId), "Booking not found.") : null;
    if (booking && booking.status !== "needs_attention") throw new CommandError("This booking has already been placed.", 409);
    const claim = body.roomId ? await claimSpace(tx, h, body.roomId, { holdOwnerUid: booking?.uid, preferSpaceId: booking?.spaceId }) : null;
    const room = claim?.room ?? null;
    const { hostel, months } = await readTerms(tx, h, room);
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
      id: tenancyId, residentId, uid, roomId: room?.id ?? null, spaceId: claim?.spaceId ?? null, periodId: hostel.defaultPeriodId,
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
    if (claim) {
      tx.update(r.listing, {
        ...listingUpdate(claim.room, claim.type, plus(claim.occupied, claim.spaceId)),
        [`holds.${claim.spaceId}`]: FieldValue.delete(),
        ...(booking?.spaceId ? { [`holds.${booking.spaceId}`]: FieldValue.delete() } : {}),
      });
    }
    if (booking) tx.update(r.doc("bookings", booking.id), { status: "resolved", residentId, roomId: room?.id ?? null, spaceId: claim?.spaceId ?? null });
    ctx.auditIn(tx, booking ? "booking.placed" : "tenant.added", { residentId, roomId: room?.id ?? null, spaceId: claim?.spaceId ?? null, receiptNo: receipt?.receiptNo ?? null });
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
      const target = moving && body.patch.roomId ? await claimSpace(tx, h, body.patch.roomId, { exceptResidentId: body.residentId }) : null;
      const from = moving && tenancy?.status === "active" && tenancy.roomId ? await readOccupancy(tx, h, tenancy.roomId) : null;

      const person = personPatch(body.patch);
      if (Object.keys(person).length) tx.update(r.doc("residents", body.residentId), person);
      if (tenancy && ("occupants" in body.patch || moving)) {
        tx.update(r.doc("tenancies", tenancy.id), {
          ...("occupants" in body.patch ? { occupants: body.patch.occupants ?? [] } : {}),
          ...(moving ? { roomId: target?.room.id ?? null, spaceId: target?.spaceId ?? null } : {}),
        });
      }
      if (tenancy?.status === "active" && (from || target)) {
        tx.update(r.listing, {
          ...(from ? listingUpdate(from.room, from.type, minus(from.occupied, tenancy.spaceId)) : {}),
          ...(target ? listingUpdate(target.room, target.type, plus(target.occupied, target.spaceId)) : {}),
        });
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
    const occ = tenancy.roomId ? await readOccupancy(tx, h, tenancy.roomId) : null;
    tx.update(r.doc("tenancies", tenancy.id), { status: "ended", movedOutDate: todayISO() });
    if (occ) tx.update(r.listing, listingUpdate(occ.room, occ.type, minus(occ.occupied, tenancy.spaceId)));
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
    const target = await claimSpace(tx, h, req.requestedRoomId, { exceptResidentId: req.residentId });
    const from = tenancy.roomId && tenancy.roomId !== req.requestedRoomId ? await readOccupancy(tx, h, tenancy.roomId) : null;
    const now = new Date().toISOString();
    const update: TicketUpdate = {
      at: now, by: "staff", status: "resolved",
      text: body.note?.trim() || `Approved. You've been moved from room ${tenancy.roomId} to room ${req.requestedRoomId}.`,
    };
    tx.update(r.doc("tenancies", tenancy.id), { roomId: target.room.id, spaceId: target.spaceId });
    tx.update(r.listing, {
      ...(from ? listingUpdate(from.room, from.type, minus(from.occupied, tenancy.spaceId)) : {}),
      ...listingUpdate(target.room, target.type, plus(target.occupied, target.spaceId)),
    });
    tx.update(r.doc("requests", req.id), { status: "resolved", resolvedAt: now, seenAt: req.seenAt ?? now, updates: FieldValue.arrayUnion(update) });
    ctx.auditIn(tx, "tenant.moved", { residentId: req.residentId, from: tenancy.roomId, to: req.requestedRoomId, requestId: req.id });
  });
  return { ok: true };
});

export const setMaintenance = command<{ roomId: string; on: boolean; note?: string }, { ok: true }>({ access: "manager" }, async (ctx, body) => {
  const h = ctx.hostelId!;
  const r = hostelRefs(h);
  await adminDb.runTransaction(async (tx) => {
    const occ = await readOccupancy(tx, h, body.roomId);
    const maintenance = body.on ? (body.note ? { note: body.note } : {}) : null;
    tx.update(r.doc("rooms", body.roomId), { maintenance });
    tx.update(r.listing, listingUpdate({ ...occ.room, maintenance }, occ.type, occ.occupied));
    ctx.auditIn(tx, body.on ? "room.maintenance_on" : "room.maintenance_off", { roomId: body.roomId });
  });
  return { ok: true };
});

/**
 * Saves the hostel settings form: details, rent period length, and the block/room layout
 * (rooms added with the hostel's default room type, or removed, to match). Room sizes and
 * prices are managed separately (saveRoomType and friends).
 */
export const updateSettings = command<{ settings: Settings }, { ok: true }>({ access: "manager" }, async (ctx, body) => {
  const h = ctx.hostelId!;
  const r = hostelRefs(h);
  const s = body.settings;
  if (!s?.hostelName?.trim()) throw new CommandError("Enter the hostel's name.");
  const [hostelSnap, roomDocs, active, types] = await Promise.all([r.hostel.get(), r.col("rooms").get(), r.col("tenancies").where("status", "==", "active").get(), r.col("roomTypes").get()]);
  const hostel = hostelSnap.data() as Hostel;
  const defaultType = (types.docs.find((d) => d.id === (hostel.defaultTypeId ?? DEFAULT_TYPE_ID)) ?? types.docs[0])?.data() as RoomType | undefined;
  if (!defaultType) throw new CommandError("Add a room type first.", 409);
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
  batch.set(r.doc("rentPeriods", hostel.defaultPeriodId), { id: hostel.defaultPeriodId, kind: "rolling", name: `${s.leaseMonths} months from move-in`, months: s.leaseMonths });
  s.blocks.forEach((b, order) => batch.set(r.doc("blocks", b.name), { id: b.name, name: b.name, order }));
  const listing: Record<string, unknown> = {
    "info.hostelName": s.hostelName.trim(), "info.address": s.address, "info.managerName": s.managerName, "info.managerPhone": s.managerPhone,
    "info.whatsappGroupLink": s.whatsappGroupLink, "info.blocks": s.blocks.map((b) => b.name), "info.leaseMonths": s.leaseMonths,
  };
  for (const room of wanted) {
    if (existing.has(room.id)) continue;
    const doc: HostelRoom = { id: room.id, label: room.id, blockId: room.block, number: room.number, typeId: defaultType.id, maintenance: null };
    batch.set(r.doc("rooms", room.id), doc);
    Object.assign(listing, listingUpdate(doc, defaultType, new Set()));
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

// ------------------------------------------------------------------ room types

/** The booking page's summary of sizes and prices: every type, the lowest rent, the largest room. */
function listingTypesInfo(types: RoomType[]) {
  const sorted = [...types].sort((a, b) => a.capacity - b.capacity || a.price - b.price);
  return {
    "info.roomTypes": sorted.map((t) => ({ id: t.id, name: t.name, capacity: t.capacity, pricingMode: t.pricingMode, price: t.price })),
    "info.rentAmount": Math.min(...sorted.map((t) => t.price)),
    "info.maxOccupants": Math.max(...sorted.map((t) => t.capacity)),
  };
}

/** Everything needed to recompute listing entries: rooms, types and who occupies which space. */
async function layout(h: string) {
  const r = hostelRefs(h);
  const [hostelSnap, rooms, types, active] = await Promise.all([r.hostel.get(), r.col("rooms").get(), r.col("roomTypes").get(), r.col("tenancies").where("status", "==", "active").get()]);
  const byRoom = new Map<string, Tenancy[]>();
  for (const d of active.docs) {
    const t = d.data() as Tenancy;
    if (t.roomId) byRoom.set(t.roomId, [...(byRoom.get(t.roomId) ?? []), t]);
  }
  return {
    hostel: hostelSnap.data() as Hostel,
    rooms: rooms.docs.map((d) => ({ ...(d.data() as HostelRoom), id: d.id })),
    types: new Map(types.docs.map((d) => [d.id, { ...(d.data() as RoomType), id: d.id }])),
    stays: (roomId: string) => byRoom.get(roomId) ?? [],
  };
}

function occupiedSpaces(roomId: string, type: RoomType, stays: Tenancy[]) {
  return new Set(type.pricingMode === "per_room" ? (stays.length ? [roomId] : []) : stays.map((t) => t.spaceId).filter((x): x is string => !!x));
}

/** Tenants in beds beyond `capacity` (per-bed rooms), whom a smaller size would leave without a bed. */
function bedsOutside(stays: Tenancy[], roomId: string, capacity: number) {
  const allowed = new Set(spaceIdsOf(roomId, { capacity: capacity as RoomType["capacity"], pricingMode: "per_bed" }));
  return stays.filter((t) => t.spaceId && t.spaceId !== roomId && !allowed.has(t.spaceId));
}

function validType(body: { name?: string; capacity?: number; price?: number }) {
  if (!body.name?.trim()) throw new CommandError("Give the room type a name, e.g. “2-person room”.");
  if (!Number.isInteger(body.capacity) || body.capacity! < 1 || body.capacity! > 4) throw new CommandError("Rooms hold 1 to 4 people.");
  if (!(Number(body.price) > 0)) throw new CommandError("Enter the rent.");
}

/** Creates a room type, or edits one (name, size, rent). Rooms of that type update everywhere. */
export const saveRoomType = command<{ id?: string; name: string; capacity: number; price: number }, { id: string }>({ access: "manager" }, async (ctx, body) => {
  const h = ctx.hostelId!;
  const r = hostelRefs(h);
  validType(body);
  const l = await layout(h);
  const mode = l.hostel.rentalModel ?? "per_room";
  const existing = body.id ? l.types.get(body.id) : undefined;
  if (body.id && !existing) throw new CommandError("That room type doesn't exist.", 404);
  const type: RoomType = { id: existing?.id ?? newId("type_"), name: body.name.trim(), capacity: body.capacity as RoomType["capacity"], pricingMode: mode, price: Math.round(body.price) };
  const rooms = l.rooms.filter((room) => room.typeId === type.id);
  if (mode === "per_bed") {
    const evicted = rooms.flatMap((room) => bedsOutside(l.stays(room.id), room.id, type.capacity));
    if (evicted.length) throw new CommandError(`${evicted.length} tenant${evicted.length === 1 ? " is" : "s are"} in beds a ${type.capacity}-person room wouldn't have. Move them first.`, 409);
  }
  const batch = adminDb.batch();
  batch.set(r.doc("roomTypes", type.id), type);
  const listing: Record<string, unknown> = listingTypesInfo([...l.types.values()].filter((t) => t.id !== type.id).concat(type));
  for (const room of rooms) Object.assign(listing, listingUpdate(room, type, occupiedSpaces(room.id, type, l.stays(room.id))));
  batch.update(r.listing, listing);
  if (!l.hostel.defaultTypeId) batch.update(r.hostel, { defaultTypeId: type.id });
  await batch.commit();
  await ctx.audit(existing ? "roomType.updated" : "roomType.created", { id: type.id, name: type.name, capacity: type.capacity, price: type.price });
  return { id: type.id };
});

/** Deletes a room type no room uses. */
export const deleteRoomType = command<{ id: string }, { ok: true }>({ access: "manager" }, async (ctx, body) => {
  const h = ctx.hostelId!;
  const r = hostelRefs(h);
  const l = await layout(h);
  if (!l.types.has(body.id)) throw new CommandError("That room type doesn't exist.", 404);
  const using = l.rooms.filter((room) => room.typeId === body.id).length;
  if (using) throw new CommandError(`${using} room${using === 1 ? " uses" : "s use"} this size. Give ${using === 1 ? "it" : "them"} another size first.`, 409);
  if (l.types.size === 1) throw new CommandError("A hostel needs at least one room type.", 409);
  const rest = [...l.types.values()].filter((t) => t.id !== body.id);
  const batch = adminDb.batch();
  batch.delete(r.doc("roomTypes", body.id));
  batch.update(r.listing, listingTypesInfo(rest));
  if ((l.hostel.defaultTypeId ?? DEFAULT_TYPE_ID) === body.id) batch.update(r.hostel, { defaultTypeId: rest[0].id });
  await batch.commit();
  await ctx.audit("roomType.deleted", { id: body.id });
  return { ok: true };
});

/** Gives rooms a room type ("Set size" on the Rooms page). */
export const setRoomsType = command<{ roomIds: string[]; typeId: string }, { changed: number }>({ access: "manager" }, async (ctx, body) => {
  const h = ctx.hostelId!;
  const r = hostelRefs(h);
  if (!Array.isArray(body.roomIds) || !body.roomIds.length) throw new CommandError("Select some rooms first.");
  const l = await layout(h);
  const type = l.types.get(body.typeId);
  if (!type) throw new CommandError("That room type doesn't exist.", 404);
  const rooms = l.rooms.filter((room) => body.roomIds.includes(room.id) && room.typeId !== type.id);
  if (type.pricingMode === "per_bed") {
    const clash = rooms.filter((room) => bedsOutside(l.stays(room.id), room.id, type.capacity).length);
    if (clash.length) throw new CommandError(`${clash.map((x) => x.id).slice(0, 3).join(", ")} ${clash.length === 1 ? "has" : "have"} tenants in beds a ${type.capacity}-person room wouldn't have.`, 409);
  }
  const batch = adminDb.batch();
  const listing: Record<string, unknown> = {};
  for (const room of rooms) {
    batch.update(r.doc("rooms", room.id), { typeId: type.id });
    Object.assign(listing, listingUpdate({ ...room, typeId: type.id }, type, occupiedSpaces(room.id, type, l.stays(room.id))));
  }
  if (rooms.length) batch.update(r.listing, listing);
  await batch.commit();
  if (rooms.length) await ctx.audit("rooms.typeChanged", { typeId: type.id, rooms: rooms.map((x) => x.id) });
  return { changed: rooms.length };
});

/** Switches the whole hostel between renting rooms and renting beds. Only while nobody lives there. */
export const setRentalModel = command<{ model: PricingMode }, { ok: true }>({ access: "manager" }, async (ctx, body) => {
  const h = ctx.hostelId!;
  const r = hostelRefs(h);
  if (body.model !== "per_room" && body.model !== "per_bed") throw new CommandError("Choose per room or per bed.");
  const l = await layout(h);
  if ((l.hostel.rentalModel ?? "per_room") === body.model) return { ok: true };
  const anyone = l.rooms.some((room) => l.stays(room.id).length);
  if (anyone) throw new CommandError("Switching between per room and per bed is only possible before tenants move in.", 409);
  const types = [...l.types.values()].map((t) => ({ ...t, pricingMode: body.model }));
  const byId = new Map(types.map((t) => [t.id, t]));
  const batch = adminDb.batch();
  batch.update(r.hostel, { rentalModel: body.model });
  for (const t of types) batch.update(r.doc("roomTypes", t.id), { pricingMode: body.model });
  const listing: Record<string, unknown> = listingTypesInfo(types);
  for (const room of l.rooms) {
    const t = byId.get(room.typeId);
    if (t) Object.assign(listing, listingUpdate(room, t, new Set()));
  }
  batch.update(r.listing, listing);
  await batch.commit();
  await ctx.audit("hostel.rentalModel", { model: body.model });
  return { ok: true };
});

/** Every manager action by name, for the /api/manage/[action] route. */
export const MANAGE = {
  addTenant, updateTenant, moveOut, recordPayment, sendMessage, runReminders, logRepair, approveRoomChange, setMaintenance, updateSettings,
  saveRoomType, deleteRoomType, setRoomsType, setRentalModel,
} as const;
export type ManageAction = keyof typeof MANAGE;
