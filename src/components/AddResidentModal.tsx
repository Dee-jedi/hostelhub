"use client";

import { useMemo, useState } from "react";
import { addResident, resolveBooking, useHostel } from "@/lib/store";
import type { PaymentMethod, StudentInfo } from "@/lib/types";
import { addMonths, availableRooms, formatDate, naira, todayISO } from "@/lib/utils";
import { EMPTY_STUDENT, StudentForm, validateStudent } from "./StudentForm";
import { toast } from "./toast";
import { Button, Field, Input, Modal, Select } from "./ui";

export function RoomSelect({
  value,
  onChange,
  excludeRoomId,
  preferredBlock,
}: {
  value: string;
  onChange: (v: string) => void;
  excludeRoomId?: string | null;
  preferredBlock?: string;
}) {
  const s = useHostel();
  const rooms = useMemo(() => availableRooms(s, excludeRoomId), [s, excludeRoomId]);
  const blocks = [...new Set(rooms.map((r) => r.block))].sort((a, b) =>
    a === preferredBlock ? -1 : b === preferredBlock ? 1 : a.localeCompare(b),
  );
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select a vacant room</option>
      {blocks.map((b) => (
        <optgroup key={b} label={`Block ${b}${b === preferredBlock ? " (preferred)" : ""}`}>
          {rooms
            .filter((r) => r.block === b)
            .map((r) => (
              <option key={r.id} value={r.id}>
                Room {r.id}
              </option>
            ))}
        </optgroup>
      ))}
    </Select>
  );
}

export function AddResidentModal({
  onClose,
  initial,
  presetRoomId = "",
  bookingId,
  preferredBlock,
}: {
  onClose: () => void;
  initial?: StudentInfo;
  presetRoomId?: string;
  /** Allocating a room to someone who already paid online */
  bookingId?: string;
  preferredBlock?: string;
}) {
  const s = useHostel();
  const booking = bookingId ? s.bookings.find((b) => b.id === bookingId) : undefined;
  const [info, setInfo] = useState<StudentInfo>(initial ?? EMPTY_STUDENT);
  const [roomId, setRoomId] = useState(presetRoomId);
  const [paid, setPaid] = useState(true);
  const [amount, setAmount] = useState(String(s.settings.rentAmount));
  const [method, setMethod] = useState<PaymentMethod>("Transfer");
  const [reference, setReference] = useState("");
  const [start, setStart] = useState(todayISO());
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const err = validateStudent(info);
    if (err) return toast(err, "info");
    if (!roomId) return toast("Select a room", "info");
    setSaving(true);
    const payment = paid ? { amount: Number(amount.replace(/[^\d]/g, "")) || 0, method, reference } : undefined;
    const saved = bookingId ? await resolveBooking(bookingId, roomId, info) : await addResident(info, roomId, payment, start);
    setSaving(false);
    if (!saved) return;
    toast(`${info.fullName} added to room ${roomId}`);
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={bookingId ? "Allocate a room" : "Add tenant"}
      description={bookingId ? "This tenant has already paid online. Pick a vacant room for them." : "Digital version of the hostel registration form. Rent is per room."}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : bookingId ? "Allocate room" : "Save tenant"}
          </Button>
        </>
      }
    >
      <StudentForm value={info} onChange={setInfo} maxOccupants={s.settings.maxOccupants} />

      <fieldset className="mt-7">
        <legend className="mb-3 text-xs font-semibold tracking-wider text-slate-500 uppercase">Room & rent</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Room" required hint="Only vacant rooms are listed">
            <RoomSelect value={roomId} onChange={setRoomId} preferredBlock={preferredBlock} />
          </Field>
          {!bookingId && (
            <Field label="Rent start date" hint={`Ends ${formatDate(addMonths(start, s.settings.leaseMonths))}`}>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
          )}
        </div>
        {booking ? (
          <p className="mt-4 rounded-lg bg-brand-50 p-3 text-sm text-brand-900">
            Paid {naira(booking.amount)} online · ref <span className="font-mono">{booking.id}</span>. The receipt is issued when you allocate the room.
          </p>
        ) : (
          <label className="mt-4 flex items-center gap-3">
            <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="size-4 accent-brand-600" />
            <span className="text-sm font-medium text-slate-900">Rent has been paid</span>
          </label>
        )}
        {paid && !booking && (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Amount (₦)">
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" />
            </Field>
            <Field label="Method">
              <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                {["Transfer", "Cash", "POS", "Online"].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Select>
            </Field>
            <Field label="Reference">
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
            </Field>
          </div>
        )}
      </fieldset>
    </Modal>
  );
}
