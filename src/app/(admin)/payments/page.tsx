"use client";

import { Download, Plus, Receipt, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { PaymentModal, ReceiptModal } from "@/components/PaymentModal";
import { Avatar, Badge, Button, Card, EmptyState, Modal, PageHeader, SearchInput, Select, StatCard } from "@/components/ui";
import { useHostel } from "@/lib/store";
import type { Payment } from "@/lib/types";
import { downloadCSV, formatDate, isSameMonth, naira, todayISO } from "@/lib/utils";

export default function PaymentsPage() {
  const s = useHostel();
  const [q, setQ] = useState("");
  const [month, setMonth] = useState("");
  const [method, setMethod] = useState("");
  const [receipt, setReceipt] = useState<Payment | null>(null);
  const [picking, setPicking] = useState(false);
  const [pickQ, setPickQ] = useState("");
  const [payFor, setPayFor] = useState<string | null>(null);

  const residentsById = useMemo(() => new Map(s.residents.map((r) => [r.id, r])), [s.residents]);
  const today = todayISO();

  const months = useMemo(() => [...new Set(s.payments.map((p) => p.date.slice(0, 7)))].sort().reverse(), [s.payments]);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return s.payments.filter((p) => {
      if (month && !p.date.startsWith(month)) return false;
      if (method && p.method !== method) return false;
      if (!term) return true;
      const r = residentsById.get(p.residentId);
      return [r?.fullName ?? "", r?.roomId ?? "", p.receiptNo, p.reference].some((v) => v.toLowerCase().includes(term));
    });
  }, [s.payments, q, month, method, residentsById]);

  const thisMonth = s.payments.filter((p) => isSameMonth(p.date, today));
  const year = today.slice(0, 4);
  const thisYear = s.payments.filter((p) => p.date.startsWith(year));
  const sum = (ps: Payment[]) => ps.reduce((n, p) => n + p.amount, 0);

  const pickList = s.residents
    .filter((r) => {
      const t = pickQ.toLowerCase();
      return !t || r.fullName.toLowerCase().includes(t) || (r.roomId ?? "").toLowerCase().includes(t) || r.phone.includes(t);
    })
    .slice(0, 30);

  return (
    <>
      <PageHeader
        title="Payments"
        description="Every rent payment with a printable receipt."
        actions={
          <>
            <Button
              variant="secondary"
              disabled={!filtered.length}
              onClick={() =>
                downloadCSV(
                  "payments.csv",
                  filtered.map((p) => {
                    const r = residentsById.get(p.residentId);
                    return {
                      Receipt: p.receiptNo,
                      Date: p.date,
                      Resident: r?.fullName ?? "",
                      Room: r?.roomId ?? "",
                      Amount: p.amount,
                      Method: p.method,
                      Reference: p.reference,
                      "Period Start": p.periodStart,
                      "Period End": p.periodEnd,
                    };
                  }),
                )
              }
            >
              <Download className="size-4" /> Export
            </Button>
            <Button onClick={() => setPicking(true)}>
              <Plus className="size-4" /> Record payment
            </Button>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Collected this month" value={naira(sum(thisMonth))} sub={`${thisMonth.length} payments`} icon={<Wallet className="size-5" />} />
        <StatCard label={`Collected in ${year}`} value={naira(sum(thisYear))} sub={`${thisYear.length} payments`} icon={<Wallet className="size-5" />} tone="green" />
        <StatCard
          label="Showing"
          value={naira(sum(filtered))}
          sub={`${filtered.length} payments match your filters`}
          icon={<Receipt className="size-5" />}
          tone="blue"
        />
      </div>

      <Card>
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <SearchInput value={q} onChange={setQ} placeholder="Search resident, room, receipt no…" />
          </div>
          <Select value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">All months</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {new Date(`${m}-01T00:00`).toLocaleDateString("en-NG", { month: "long", year: "numeric" })}
              </option>
            ))}
          </Select>
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">All methods</option>
            {["Transfer", "Cash", "POS", "Online"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </div>
        {filtered.length === 0 ? (
          <EmptyState icon={<Wallet className="size-6" />} title="No payments found" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-grey-100 bg-grey-10 text-left text-xs font-medium text-heading-6">
                  <th className="px-4 py-3">Receipt</th>
                  <th className="px-4 py-3">Resident</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="hidden px-4 py-3 md:table-cell">Method</th>
                  <th className="hidden px-4 py-3 lg:table-cell">Rent period</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.slice(0, 100).map((p) => {
                  const r = residentsById.get(p.residentId);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs font-medium text-slate-900">{p.receiptNo}</p>
                        <p className="text-xs text-slate-500">{formatDate(p.date)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{r?.fullName ?? "Deleted resident"}</p>
                        <p className="text-xs text-slate-500">Room {r?.roomId ?? "—"}</p>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900 tabular-nums">{naira(p.amount)}</td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        <Badge tone={p.method === "Cash" ? "amber" : p.method === "Transfer" ? "blue" : "violet"}>{p.method}</Badge>
                      </td>
                      <td className="hidden px-4 py-3 text-xs text-slate-600 lg:table-cell">
                        {formatDate(p.periodStart)} – {formatDate(p.periodEnd)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="ghost" onClick={() => setReceipt(p)}>
                          <Receipt className="size-3.5" /> Receipt
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length > 100 && <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">Showing latest 100 — narrow the filters or export to see all.</p>}
          </div>
        )}
      </Card>

      <ReceiptModal payment={receipt} onClose={() => setReceipt(null)} />
      <Modal open={picking} onClose={() => setPicking(false)} title="Who is paying?">
        <SearchInput value={pickQ} onChange={setPickQ} placeholder="Search name, room or phone" />
        <ul className="mt-3 max-h-80 divide-y divide-slate-100 overflow-y-auto">
          {pickList.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => {
                  setPicking(false);
                  setPayFor(r.id);
                }}
                className="flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-slate-50"
              >
                <Avatar name={r.fullName} size="sm" />
                <span className="flex-1 text-sm font-medium text-slate-900">{r.fullName}</span>
                <span className="text-xs text-slate-500">{r.roomId ?? "Moved out"}</span>
              </button>
            </li>
          ))}
        </ul>
      </Modal>
      {payFor && <PaymentModal residentId={payFor} onClose={() => setPayFor(null)} />}
    </>
  );
}
