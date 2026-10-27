"use client";

import { ArrowRightLeft, CreditCard, LogOut, MessageCircle, Pencil, Phone, Receipt, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { HISTORY_WINDOW, moveOut, updateResident, useHistoryLoaded, useHostel, watchResidentPayments } from "@/lib/store";
import type { Payment, StudentInfo } from "@/lib/types";
import { academicLine, daysLeft, describeDaysLeft, formatDate, naira, rentStatus, whatsappLink, fillTemplate, occupantsByRoom, roomTypeOf } from "@/lib/utils";
import { bedOf, spaceLabel } from "@/lib/spaces";
import { TEMPLATES } from "@/lib/templates";
import { openResident } from "@/lib/ui-store";
import { RoomSelect } from "./AddResidentModal";
import { ComposeModal } from "./ComposeModal";
import { PaymentModal, ReceiptModal } from "./PaymentModal";
import { StudentForm, validateStudent } from "./StudentForm";
import { toast } from "./toast";
import { Avatar, Badge, Button, Drawer, Field, Modal, RentBadge } from "./ui";

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-900">{value || "—"}</dd>
    </div>
  );
}

export function ResidentDrawer({ residentId, onClose }: { residentId: string | null; onClose: () => void }) {
  const s = useHostel();
  const resident = s.residents.find((r) => r.id === residentId);
  const [editing, setEditing] = useState<StudentInfo | null>(null);
  const [paying, setPaying] = useState(false);
  const [composing, setComposing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [newRoom, setNewRoom] = useState("");
  const [confirmMoveOut, setConfirmMoveOut] = useState(false);
  const [receipt, setReceipt] = useState<Payment | null>(null);
  /** An edit, room move or move-out waiting for the server */
  const [busy, setBusy] = useState(false);
  const allMessages = useHistoryLoaded("messages");

  // Long-standing tenants have receipts older than the staff app loads by default
  useEffect(() => {
    if (resident) watchResidentPayments(resident);
  }, [resident]);

  if (!resident) return null;
  const payments = s.payments.filter((p) => p.residentId === resident.id);
  const roomType = roomTypeOf(s, s.rooms.find((r) => r.id === resident.roomId));
  const perBedRoom = roomType.pricingMode === "per_bed";
  const roommates = perBedRoom && resident.roomId ? (occupantsByRoom(s).get(resident.roomId) ?? []).filter((r) => r.id !== resident.id) : [];
  const left = daysLeft(resident);
  const status = rentStatus(resident);
  const active = resident.status === "active";
  const msgCount = s.messages.filter((m) => m.recipientIds.includes(resident.id)).length;

  /** Runs a change, then reports it; the form or dialog stays open if the server refuses. */
  const run = async (change: Promise<string | null>, done: string, close: () => void) => {
    setBusy(true);
    const error = await change;
    setBusy(false);
    if (error) return toast(error, "info");
    close();
    toast(done);
  };

  const saveEdit = () => {
    if (!editing) return;
    const err = validateStudent(editing);
    if (err) return toast(err, "info");
    run(updateResident(resident.id, editing), "Resident details updated", () => setEditing(null));
  };

  return (
    <>
      <Drawer open onClose={onClose} title="Tenant profile">
        {editing ? (
          <div className="p-5">
            <StudentForm value={editing} onChange={setEditing} maxOccupants={perBedRoom ? 1 : roomType.capacity} />
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button onClick={saveEdit} disabled={busy}>
                {busy ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="border-b border-slate-100 p-5">
              <div className="flex items-start gap-4">
                <Avatar name={resident.fullName} src={resident.photoUrl} size="lg" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-medium text-slate-900">{resident.fullName}</h2>
                  <p className="text-sm text-slate-500">
                    {academicLine(resident)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {resident.roomId && <Badge tone="brand">{spaceLabel(resident.roomId, resident.spaceId).replace(", bed", " · bed")}</Badge>}
                    <RentBadge resident={resident} />
                    <Badge>{resident.sex}</Badge>
                  </div>
                </div>
              </div>

              {active && (
                <div
                  className={`mt-5 rounded-xl p-4 ${status === "expired" ? "bg-rose-50" : status === "expiring" ? "bg-amber-50" : "bg-emerald-50"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-slate-600">Rent period</p>
                      <p className="text-sm font-medium text-slate-900">
                        {formatDate(resident.leaseStart)} – {formatDate(resident.leaseEnd)}
                      </p>
                    </div>
                    <p
                      className={`text-sm font-semibold ${status === "expired" ? "text-rose-700" : status === "expiring" ? "text-amber-800" : "text-emerald-700"}`}
                    >
                      {describeDaysLeft(left)}
                    </p>
                  </div>
                </div>
              )}

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Button onClick={() => setPaying(true)}>
                  <CreditCard className="size-4" /> {active ? "Renew / Pay" : "Re-admit"}
                </Button>
                <Button variant="secondary" onClick={() => setComposing(true)} disabled={!active}>
                  <Send className="size-4" /> Message
                </Button>
                <a
                  href={whatsappLink(resident.phone, fillTemplate(TEMPLATES[0].body, resident, s))}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-grey-150 bg-white px-3.5 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                >
                  <MessageCircle className="size-4" /> WhatsApp
                </a>
                <a
                  href={`tel:${resident.phone}`}
                  className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-grey-150 bg-white px-3.5 py-2 text-sm font-medium text-heading-4 hover:bg-grey-50"
                >
                  <Phone className="size-4" /> Call
                </a>
                <Button variant="secondary" onClick={() => setMoving(true)} disabled={!active}>
                  <ArrowRightLeft className="size-4" /> Change room
                </Button>
                <Button variant="secondary" onClick={() => setEditing({ ...resident })}>
                  <Pencil className="size-4" /> Edit
                </Button>
              </div>
            </div>

            <div className="space-y-6 p-5">
              <section>
                <h3 className="mb-3 text-xs font-semibold tracking-wider text-slate-500 uppercase">Contact & academic</h3>
                <dl className="grid grid-cols-2 gap-4">
                  <Detail label="Phone" value={resident.phone} />
                  <Detail label="Email" value={<span className="break-all">{resident.email}</span>} />
                  <Detail label="Matric no." value={resident.matricNo} />
                  <Detail label="Faculty" value={resident.faculty} />
                  <Detail label="State of origin" value={resident.stateOfOrigin} />
                  <Detail label="Checked in" value={formatDate(resident.checkInDate)} />
                  <Detail label="Home address" value={resident.homeAddress} />
                  {resident.movedOutDate && <Detail label="Moved out" value={formatDate(resident.movedOutDate)} />}
                </dl>
              </section>

              {perBedRoom ? (
                <section>
                  <h3 className="mb-3 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                    Roommates <span className="font-normal normal-case">({roommates.length + 1} of {roomType.capacity} beds taken)</span>
                  </h3>
                  {roommates.length === 0 ? (
                    <p className="text-xs text-heading-6">Nobody else in this room yet.</p>
                  ) : (
                    <ul className="divide-y divide-grey-100 rounded-xl border border-grey-100">
                      {roommates.map((m) => (
                        <li key={m.id}>
                          <button onClick={() => openResident(m.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-grey-10">
                            <Avatar name={m.fullName} src={m.photoUrl} size="sm" />
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-heading-2">{m.fullName}</span>
                            <Badge tone="slate">Bed {bedOf(m.spaceId, m.roomId) ?? "?"}</Badge>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ) : (
                <section>
                  <h3 className="mb-3 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                    Room occupants <span className="font-normal normal-case">({resident.occupants.length + 1} of {roomType.capacity})</span>
                  </h3>
                  <ul className="divide-y divide-grey-100 rounded-xl border border-grey-100">
                    <li className="flex items-center gap-3 px-3 py-2.5">
                      <Avatar name={resident.fullName} src={resident.photoUrl} size="sm" />
                      <span className="flex-1 text-sm font-medium text-heading-2">{resident.fullName}</span>
                      <Badge tone="brand">Tenant</Badge>
                    </li>
                    {resident.occupants.map((o, i) => (
                      <li key={i} className="flex items-center gap-3 px-3 py-2.5">
                        <Avatar name={o.fullName} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-heading-2">{o.fullName}</p>
                          <p className="text-xs text-heading-6">{academicLine(o, true)}</p>
                        </div>
                        <a href={`tel:${o.phone}`} className="text-xs text-brand-700 hover:underline">
                          {o.phone}
                        </a>
                      </li>
                    ))}
                  </ul>
                  {resident.occupants.length === 0 && <p className="mt-2 text-xs text-heading-6">Living alone. Use Edit to record anyone sharing the room.</p>}
                </section>
              )}

              <section>
                <h3 className="mb-3 text-xs font-semibold tracking-wider text-slate-500 uppercase">Next of kin</h3>
                <dl className="grid grid-cols-2 gap-4">
                  <Detail label="Name" value={resident.nextOfKinName} />
                  <Detail label="Relationship" value={resident.nextOfKinRelationship} />
                  <Detail
                    label="Phone"
                    value={
                      <a href={`tel:${resident.nextOfKinPhone}`} className="text-brand-700 hover:underline">
                        {resident.nextOfKinPhone}
                      </a>
                    }
                  />
                </dl>
              </section>

              <section>
                <h3 className="mb-3 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  Payment history <span className="font-normal normal-case">({payments.length})</span>
                </h3>
                {payments.length === 0 ? (
                  <p className="text-sm text-slate-500">No payments recorded.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {payments.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                        <div>
                          <p className="text-sm font-medium text-slate-900 tabular-nums">{naira(p.amount)}</p>
                          <p className="text-xs text-slate-500">
                            {formatDate(p.date)} · {p.method} · {p.receiptNo}
                          </p>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => setReceipt(p)}>
                          <Receipt className="size-3.5" /> Receipt
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-xs text-slate-500">
                  {msgCount} message{msgCount === 1 ? "" : "s"} sent to this resident{allMessages ? "" : ` in ${HISTORY_WINDOW.messages}`}.
                </p>
              </section>

              {active && (
                <section className="border-t border-slate-100 pt-5">
                  <Button variant="ghost" className="text-rose-600 hover:bg-rose-50" onClick={() => setConfirmMoveOut(true)}>
                    <LogOut className="size-4" /> Mark as moved out
                  </Button>
                </section>
              )}
            </div>
          </>
        )}
      </Drawer>

      {paying && <PaymentModal residentId={resident.id} onClose={() => setPaying(false)} />}
      {composing && <ComposeModal recipients={[resident]} onClose={() => setComposing(false)} defaultTemplate={status === "expired" ? "expired" : "renew"} />}
      <ReceiptModal payment={receipt} onClose={() => setReceipt(null)} />

      <Modal
        open={moving}
        onClose={() => setMoving(false)}
        title="Change room"
        description={`Currently in ${resident.roomId ?? "no room"}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setMoving(false)}>
              Cancel
            </Button>
            <Button
              disabled={!newRoom || busy}
              onClick={() =>
                run(updateResident(resident.id, { roomId: newRoom }), `${resident.fullName} moved to ${newRoom}`, () => {
                  setMoving(false);
                  setNewRoom("");
                })
              }
            >
              {busy ? "Moving…" : "Move resident"}
            </Button>
          </>
        }
      >
        <Field label="New room">
          <RoomSelect value={newRoom} onChange={setNewRoom} excludeRoomId={resident.roomId} />
        </Field>
      </Modal>

      <Modal
        open={confirmMoveOut}
        onClose={() => setConfirmMoveOut(false)}
        title="Mark as moved out?"
        description={`Room ${resident.roomId} will become vacant. ${resident.fullName}'s records and payment history are kept.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmMoveOut(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => run(moveOut(resident.id), `${resident.fullName} marked as moved out`, () => setConfirmMoveOut(false))}
            >
              {busy ? "Saving…" : "Confirm move-out"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">You can re-admit them later by recording a new payment.</p>
      </Modal>
    </>
  );
}
