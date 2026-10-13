"use client";

import { Printer } from "lucide-react";
import { useState } from "react";
import { recordPayment, useHostel } from "@/lib/store";
import type { Payment, PaymentMethod } from "@/lib/types";
import { addMonths, formatDate, naira, todayISO } from "@/lib/utils";
import { toast } from "./toast";
import { Button, Field, Input, Modal, Select } from "./ui";

export function ReceiptView({ payment }: { payment: Payment }) {
  const s = useHostel();
  const resident = s.residents.find((r) => r.id === payment.residentId);
  const rows: [string, string][] = [
    ["Received from", resident?.fullName ?? "—"],
    ["Room", resident?.roomId ?? "—"],
    ["Department / Level", resident ? `${resident.department}, ${resident.level}L` : "—"],
    ["Payment method", payment.method + (payment.reference ? ` · ${payment.reference}` : "")],
    ["Rent period", `${formatDate(payment.periodStart)} – ${formatDate(payment.periodEnd)}`],
    ["Payment date", formatDate(payment.date)],
  ];
  return (
    <div className="print-area rounded-xl border border-dashed border-slate-300 bg-white p-6">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <p className="text-lg font-semibold text-slate-900">{s.settings.hostelName}</p>
          <p className="text-xs text-slate-500">{s.settings.address}</p>
          <p className="text-xs text-slate-500">{s.settings.managerPhone}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">Receipt</p>
          <p className="font-mono text-sm font-semibold text-slate-900">{payment.receiptNo}</p>
        </div>
      </div>
      <dl className="divide-y divide-slate-100 py-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-2">
            <dt className="text-slate-500">{k}</dt>
            <dd className="text-right font-medium text-slate-900">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-2 flex items-center justify-between rounded-lg bg-brand-50 px-4 py-3">
        <span className="text-sm font-medium text-brand-800">Amount paid</span>
        <span className="text-xl font-semibold text-brand-800 tabular-nums">{naira(payment.amount)}</span>
      </div>
      <p className="mt-4 text-center text-xs text-slate-400">Thank you. Keep this receipt for your records.</p>
    </div>
  );
}

export function ReceiptModal({ payment, onClose }: { payment: Payment | null; onClose: () => void }) {
  return (
    <Modal
      open={!!payment}
      onClose={onClose}
      title="Payment receipt"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="size-4" /> Print / Save PDF
          </Button>
        </>
      }
    >
      {payment && <ReceiptView payment={payment} />}
    </Modal>
  );
}

export function PaymentModal({ residentId, onClose }: { residentId: string | null; onClose: () => void }) {
  const s = useHostel();
  const resident = s.residents.find((r) => r.id === residentId);
  const [amount, setAmount] = useState(String(s.settings.rentAmount));
  const [method, setMethod] = useState<PaymentMethod>("Transfer");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState(todayISO());
  const [extend, setExtend] = useState(true);
  const [receipt, setReceipt] = useState<Payment | null>(null);

  if (receipt) return <ReceiptModal payment={receipt} onClose={() => { setReceipt(null); onClose(); }} />;
  if (!resident) return null;

  const today = todayISO();
  const newStart = resident.leaseEnd >= today ? resident.leaseEnd : today;
  const newEnd = addMonths(newStart, s.settings.leaseMonths);

  const submit = () => {
    const value = Number(amount.replace(/[^\d]/g, ""));
    if (!value) return toast("Enter an amount", "info");
    const p = recordPayment(resident.id, { amount: value, method, reference, date }, extend);
    toast(`Payment of ${naira(value)} recorded`);
    setReceipt(p);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Record payment"
      description={`${resident.fullName} · Room ${resident.roomId ?? "unassigned"}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>Record payment</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount (₦)" required>
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" />
        </Field>
        <Field label="Payment date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Method">
          <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {["Transfer", "Cash", "POS", "Online"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </Field>
        <Field label="Reference / teller no.">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
        </Field>
      </div>
      <label className="mt-5 flex items-start gap-3 rounded-lg border border-slate-200 p-3">
        <input type="checkbox" checked={extend} onChange={(e) => setExtend(e.target.checked)} className="mt-0.5 size-4 accent-brand-600" />
        <span className="text-sm">
          <span className="font-medium text-slate-900">Renew rent for {s.settings.leaseMonths} months</span>
          <span className="block text-slate-500">
            New period: {formatDate(newStart)} – {formatDate(newEnd)}. Untick for part payments.
          </span>
        </span>
      </label>
    </Modal>
  );
}
