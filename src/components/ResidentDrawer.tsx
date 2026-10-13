"use client";

import { ArrowRightLeft, CreditCard, LogOut, MessageCircle, Pencil, Phone, Receipt, Send } from "lucide-react";
import { useState } from "react";
import { moveOut, updateResident, useHostel } from "@/lib/store";
import type { Payment, StudentInfo } from "@/lib/types";
import { daysLeft, describeDaysLeft, formatDate, naira, rentStatus, whatsappLink, fillTemplate } from "@/lib/utils";
import { TEMPLATES } from "@/lib/templates";
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

  if (!resident) return null;
  const payments = s.payments.filter((p) => p.residentId === resident.id);
  const left = daysLeft(resident);
  const status = rentStatus(resident);
  const active = resident.status === "active";
  const msgCount = s.messages.filter((m) => m.recipientIds.includes(resident.id)).length;

  const saveEdit = () => {
    if (!editing) return;
    const err = validateStudent(editing);
    if (err) return toast(err, "info");
    updateResident(resident.id, editing);
    setEditing(null);
    toast("Resident details updated");
  };

  return (
    <>
      <Drawer open onClose={onClose} title="Tenant profile">
        {editing ? (
          <div className="p-5">
            <StudentForm value={editing} onChange={setEditing} />
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button onClick={saveEdit}>Save changes</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="border-b border-slate-100 p-5">
              <div className="flex items-start gap-4">
                <Avatar name={resident.fullName} size="lg" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-medium text-slate-900">{resident.fullName}</h2>
                  <p className="text-sm text-slate-500">
                    {resident.department} · {resident.level} Level
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {resident.roomId && <Badge tone="brand">Room {resident.roomId}</Badge>}
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

              <section>
                <h3 className="mb-3 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  Room occupants <span className="font-normal normal-case">({resident.occupants.length + 1} of {s.settings.maxOccupants})</span>
                </h3>
                <ul className="divide-y divide-grey-100 rounded-xl border border-grey-100">
                  <li className="flex items-center gap-3 px-3 py-2.5">
                    <Avatar name={resident.fullName} size="sm" />
                    <span className="flex-1 text-sm font-medium text-heading-2">{resident.fullName}</span>
                    <Badge tone="brand">Tenant</Badge>
                  </li>
                  {resident.occupants.map((o, i) => (
                    <li key={i} className="flex items-center gap-3 px-3 py-2.5">
                      <Avatar name={o.fullName} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-heading-2">{o.fullName}</p>
                        <p className="text-xs text-heading-6">{[o.department, o.level && `${o.level}L`].filter(Boolean).join(" · ")}</p>
                      </div>
                      <a href={`tel:${o.phone}`} className="text-xs text-brand-700 hover:underline">
                        {o.phone}
                      </a>
                    </li>
                  ))}
                </ul>
                {resident.occupants.length === 0 && <p className="mt-2 text-xs text-heading-6">Living alone. Use Edit to record anyone sharing the room.</p>}
              </section>

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
                <p className="mt-2 text-xs text-slate-500">{msgCount} message{msgCount === 1 ? "" : "s"} sent to this resident.</p>
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
              disabled={!newRoom}
              onClick={() => {
                updateResident(resident.id, { roomId: newRoom });
                toast(`${resident.fullName} moved to ${newRoom}`);
                setMoving(false);
                setNewRoom("");
              }}
            >
              Move resident
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
              onClick={() => {
                moveOut(resident.id);
                setConfirmMoveOut(false);
                toast(`${resident.fullName} marked as moved out`);
              }}
            >
              Confirm move-out
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">You can re-admit them later by recording a new payment.</p>
      </Modal>
    </>
  );
}
