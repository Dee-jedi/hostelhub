"use client";

import { BellRing, CalendarCheck, CreditCard, MessageCircle, Send, Zap } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ComposeModal } from "@/components/ComposeModal";
import { PaymentModal } from "@/components/PaymentModal";
import { toast } from "@/components/toast";
import { Avatar, Badge, BtnLabel, Button, headerBtn, Card, EmptyState, PageHeader, Tabs } from "@/components/ui";
import { runAutomatedReminders, useHostel } from "@/lib/store";
import { openResident } from "@/lib/ui-store";
import { TEMPLATES } from "@/lib/templates";
import { activeResidents, daysLeft, describeDaysLeft, fillTemplate, formatDate, formatDateTime, isSameMonth, naira, todayISO, whatsappLink } from "@/lib/utils";

type View = "expired" | "month" | "30" | "60";

export default function RenewalsPage() {
  const s = useHostel();
  const [view, setView] = useState<View>("month");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [compose, setCompose] = useState(false);
  const [paying, setPaying] = useState<string | null>(null);

  const today = todayISO();
  const groups = useMemo(() => {
    const residents = activeResidents(s).sort((a, b) => a.leaseEnd.localeCompare(b.leaseEnd));
    return {
      expired: residents.filter((r) => daysLeft(r, today) < 0),
      month: residents.filter((r) => daysLeft(r, today) >= 0 && isSameMonth(r.leaseEnd, today)),
      "30": residents.filter((r) => daysLeft(r, today) >= 0 && daysLeft(r, today) <= 30),
      "60": residents.filter((r) => daysLeft(r, today) > 30 && daysLeft(r, today) <= 60),
    };
  }, [s, today]);

  const lastReminded = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of s.messages) {
      if (m.kind !== "reminder") continue;
      for (const id of m.recipientIds) if (!map.has(id)) map.set(id, m.sentAt);
    }
    return map;
  }, [s.messages]);

  const list = groups[view];
  const selectedResidents = list.filter((r) => selected.has(r.id));
  const allChecked = list.length > 0 && selectedResidents.length === list.length;
  const changeView = (v: View) => {
    setView(v);
    setSelected(new Set());
  };
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <PageHeader
        title="Rent & Renewals"
        description="Know who is due, remind them in one click, and record renewals."
        actions={
          <Button
            className={headerBtn}
            onClick={() => {
              const n = runAutomatedReminders();
              toast(n ? `Sent ${n} automated reminder${n === 1 ? "" : "s"}` : "Everyone due has already been reminded", n ? "success" : "info");
            }}
          >
            <BellRing className="size-4" />
            <BtnLabel>Run automatic reminders</BtnLabel>
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2" bodyClassName="p-5">
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-brand-50 p-2.5 text-brand-600">
              <Zap className="size-5" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-slate-900">Automatic reminders are on</p>
              <p className="mt-1 text-sm text-slate-600">
                Residents get a message{" "}
                {s.settings.reminderDays
                  .slice()
                  .sort((a, b) => b - a)
                  .map((d) => `${d} day${d === 1 ? "" : "s"}`)
                  .join(", ")}{" "}
                before their rent expires, and a move-out notice once it has expired. Each reminder is sent only once.
              </p>
              <Link href="/settings" className="mt-2 inline-block text-sm font-medium text-brand-700 hover:underline">
                Change schedule →
              </Link>
            </div>
          </div>
        </Card>
        <Card bodyClassName="p-5">
          <p className="text-sm font-medium text-slate-500">Expected renewals (next 30 days)</p>
          <p className="mt-2 text-[29px] leading-tight font-medium text-slate-900 tabular-nums">{naira(groups["30"].length * s.settings.rentAmount)}</p>
          <p className="mt-1 text-xs text-slate-500">
            {groups["30"].length} residents · plus {naira(groups.expired.length * s.settings.rentAmount)} overdue
          </p>
        </Card>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={view}
          onChange={changeView}
          tabs={[
            { value: "expired", label: "Expired", count: groups.expired.length },
            { value: "month", label: "Expiring this month", count: groups.month.length },
            { value: "30", label: "Next 30 days", count: groups["30"].length },
            { value: "60", label: "31–60 days", count: groups["60"].length },
          ]}
        />
        <Button variant="secondary" disabled={!selectedResidents.length} onClick={() => setCompose(true)}>
          <Send className="size-4" /> Remind selected ({selectedResidents.length})
        </Button>
      </div>

      <Card>
        {list.length === 0 ? (
          <EmptyState icon={<CalendarCheck className="size-6" />} title="Nothing here" description="No residents fall in this period." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-grey-100 bg-grey-10 text-left text-xs font-medium text-heading-6">
                  <th className="w-10 px-2.5 py-3 sm:px-4">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      className="size-4 accent-brand-600"
                      checked={allChecked}
                      onChange={() => setSelected(allChecked ? new Set() : new Set(list.map((r) => r.id)))}
                    />
                  </th>
                  <th className="px-2.5 py-3 sm:px-4">Resident</th>
                  <th className="hidden px-2.5 py-3 sm:px-4 sm:table-cell">Room</th>
                  <th className="hidden px-2.5 py-3 sm:table-cell sm:px-4">Expiry</th>
                  <th className="hidden px-2.5 py-3 sm:px-4 md:table-cell">Last reminded</th>
                  <th className="px-2.5 py-3 text-right sm:px-4">
                    <span className="max-sm:sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((r) => {
                  const reminded = lastReminded.get(r.id);
                  const left = daysLeft(r, today);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-2.5 py-3 sm:px-4">
                        <input type="checkbox" aria-label={`Select ${r.fullName}`} className="size-4 accent-brand-600" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                      </td>
                      <td className="px-2.5 py-3 sm:px-4">
                        <button onClick={() => openResident(r.id)} className="flex items-center gap-3 text-left">
                          <Avatar name={r.fullName} src={r.photoUrl} size="sm" />
                          <div>
                            <p className="font-medium text-slate-900 hover:underline">{r.fullName}</p>
                            <p className="text-xs text-slate-500">
                              <span className="sm:hidden">Room {r.roomId} · </span>
                              {r.phone}
                            </p>
                            <p className={`text-xs sm:hidden ${left < 0 ? "text-rose-600" : "text-amber-700"}`}>
                              {formatDate(r.leaseEnd)} · {describeDaysLeft(left)}
                            </p>
                          </div>
                        </button>
                      </td>
                      <td className="hidden px-2.5 py-3 sm:px-4 font-medium text-slate-700 sm:table-cell">{r.roomId}</td>
                      <td className="hidden px-2.5 py-3 sm:table-cell sm:px-4">
                        <p className="whitespace-nowrap text-slate-700">{formatDate(r.leaseEnd)}</p>
                        <p className={`text-xs whitespace-nowrap ${left < 0 ? "text-rose-600" : "text-amber-700"}`}>{describeDaysLeft(left)}</p>
                      </td>
                      <td className="hidden px-2.5 py-3 sm:px-4 md:table-cell">
                        {reminded ? <span className="text-xs text-slate-500">{formatDateTime(reminded)}</span> : <Badge tone="slate">Not yet</Badge>}
                      </td>
                      <td className="px-2.5 py-3 sm:px-4">
                        <div className="flex justify-end gap-1.5">
                          <a
                            href={whatsappLink(r.phone, fillTemplate(TEMPLATES[left < 0 ? 1 : 0].body, r, s))}
                            target="_blank"
                            rel="noreferrer"
                            title="Send on WhatsApp"
                            className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50"
                          >
                            <MessageCircle className="size-4" />
                          </a>
                          <Button size="sm" variant="secondary" className="max-sm:size-8 max-sm:px-0" onClick={() => setPaying(r.id)}>
                            <CreditCard className="size-3.5" />
                            <BtnLabel>Renew</BtnLabel>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {list.length > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
            <span>
              {list.length} resident{list.length === 1 ? "" : "s"}
            </span>
            <span>
              Rent value: <span className="font-semibold text-slate-700">{naira(list.length * s.settings.rentAmount)}</span>
            </span>
          </div>
        )}
      </Card>

      {compose && (
        <ComposeModal
          recipients={selectedResidents}
          defaultTemplate={view === "expired" ? "expired" : "renew"}
          onClose={() => {
            setCompose(false);
            setSelected(new Set());
          }}
        />
      )}
      {paying && <PaymentModal residentId={paying} onClose={() => setPaying(null)} />}
    </>
  );
}
