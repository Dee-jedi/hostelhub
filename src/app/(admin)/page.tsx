"use client";

import { AlertTriangle, BedDouble, BellRing, CalendarClock, ClipboardList, DoorOpen, Plus, Users, Wrench } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AddResidentModal } from "@/components/AddResidentModal";
import { BlockOccupancyChart, ExpiryForecastChart } from "@/components/charts";
import { toast } from "@/components/toast";
import { Avatar, Badge, BtnLabel, Button, headerBtn, PageHeader, Panel, PanelLink, RentBadge, StatCard } from "@/components/ui";
import { useDashboard } from "@/lib/dashboard";
import { runAutomatedReminders, useHostel } from "@/lib/store";
import { openResident } from "@/lib/ui-store";
import { addDays, cn, daysLeft, describeDaysLeft, formatDateTime, isOpenTicket, naira, nairaShort, todayISO } from "@/lib/utils";

export default function DashboardPage() {
  const s = useHostel();
  const d = useDashboard();
  const [adding, setAdding] = useState(false);
  const weekAgo = addDays(todayISO(), -7);
  const newBookings = s.bookings.filter((b) => (b.status === "paid" || b.status === "needs_attention") && (b.paidAt ?? "") >= weekAgo).length;
  const openTickets = s.tickets.filter(isOpenTicket).length;
  const occPct = d.usableRooms ? Math.round((d.occupiedRooms / d.usableRooms) * 100) : 0;
  const totalStatus = d.statusCounts.active + d.statusCounts.expiring + d.statusCounts.expired || 1;
  const lastAuto = s.messages.find((m) => m.automated);

  return (
    <>
      <PageHeader
        title={`Welcome, ${s.settings.managerName}!`}
        description={
          <>
            <span className="sm:hidden">Today at a glance</span>
            <span className="max-sm:hidden">Here&apos;s what&apos;s happening at {s.settings.hostelName} today.</span>
          </>
        }
        actions={
          <>
            <Button
              variant="secondary"
              className={headerBtn}
              onClick={async () => {
                const n = await runAutomatedReminders();
                toast(n ? `Sent ${n} automated reminder${n === 1 ? "" : "s"}` : "Everyone due has already been reminded", n ? "success" : "info");
              }}
            >
              <BellRing className="size-4.5" strokeWidth={1.6} />
              <BtnLabel>Run reminders</BtnLabel>
            </Button>
            <div className="hidden h-6 w-px bg-grey-100 sm:block" />
            <Button className={headerBtn} onClick={() => setAdding(true)}>
              <Plus className="size-4.5" />
              <BtnLabel>Add tenant</BtnLabel>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Room occupancy" value={`${occPct}%`} sub={`${d.occupiedRooms} of ${d.usableRooms} rooms let · ${d.people} people`} icon={<BedDouble />} />
        <StatCard label="Vacant rooms" value={d.vacantRooms} sub={`${d.maintenanceRooms} under maintenance`} icon={<DoorOpen />} tone="blue" />
        <StatCard label="Expiring this month" value={d.expiringThisMonth.length} sub={`${d.due30.length} due in the next 30 days`} icon={<CalendarClock />} tone="amber" />
        <StatCard label="Expired rent" value={d.expired.length} sub={`${naira(d.outstanding)} outstanding`} icon={<AlertTriangle />} tone="red" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="Rent due & overdue"
          description="Expired first, then by expiry date"
          action={<PanelLink href="/renewals">View all</PanelLink>}
        >
          <ul className="divide-y divide-grey-100">
            {d.upcoming.slice(0, 7).map((r) => (
              <li key={r.id}>
                <button onClick={() => openResident(r.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-grey-10">
                  <Avatar name={r.fullName} src={r.photoUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-heading-2">{r.fullName}</p>
                    <p className="text-xs text-heading-6">
                      Room {r.roomId} · {r.phone}
                    </p>
                  </div>
                  <span className="hidden text-xs text-heading-6 sm:block">{describeDaysLeft(daysLeft(r))}</span>
                  <RentBadge resident={r} />
                </button>
              </li>
            ))}
            {d.upcoming.length === 0 && <li className="px-5 py-10 text-center text-sm text-heading-6">No rent due in the next 30 days 🎉</li>}
          </ul>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="Rent status" description={`${d.residents.length} rooms let`}>
            <div className="p-4">
              <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
                <div className="bg-emerald-500" style={{ width: `${(d.statusCounts.active / totalStatus) * 100}%` }} />
                <div className="bg-amber-400" style={{ width: `${(d.statusCounts.expiring / totalStatus) * 100}%` }} />
                <div className="bg-rose-500" style={{ width: `${(d.statusCounts.expired / totalStatus) * 100}%` }} />
              </div>
              <dl className="mt-4 space-y-2.5 text-sm">
                {[
                  { label: "Paid up", value: d.statusCounts.active, dot: "bg-emerald-500" },
                  { label: "Expiring within 30 days", value: d.statusCounts.expiring, dot: "bg-amber-400" },
                  { label: "Expired", value: d.statusCounts.expired, dot: "bg-rose-500" },
                ].map((row) => (
                  <div key={row.label} className="flex items-center gap-2">
                    <span className={cn("size-2 rounded-full", row.dot)} />
                    <dt className="flex-1 text-heading-5">{row.label}</dt>
                    <dd className="font-medium text-heading-2 tabular-nums">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Panel>

          <Panel title="Needs attention">
            <div className="divide-y divide-grey-100">
              <Link href="/bookings" className="flex items-center gap-3 px-4 py-3 hover:bg-grey-10">
                <ClipboardList className="size-4.5 text-heading-6" strokeWidth={1.6} />
                <span className="flex-1 text-sm text-heading-4">New online bookings (7 days)</span>
                <Badge tone={newBookings ? "brand" : "slate"}>{newBookings}</Badge>
              </Link>
              <Link href="/maintenance" className="flex items-center gap-3 px-4 py-3 hover:bg-grey-10">
                <Wrench className="size-4.5 text-heading-6" strokeWidth={1.6} />
                <span className="flex-1 text-sm text-heading-4">Open tenant requests</span>
                <Badge tone={openTickets ? "amber" : "slate"}>{openTickets}</Badge>
              </Link>
              <div className="flex items-center gap-3 px-4 py-3">
                <BellRing className="size-4.5 text-heading-6" strokeWidth={1.6} />
                <span className="flex-1 text-sm text-heading-4">Last auto-reminder</span>
                <span className="text-xs text-heading-6">{lastAuto ? formatDateTime(lastAuto.sentAt) : "Never"}</span>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Rent expiry forecast" description="Rooms whose rent runs out each month" action={<PanelLink href="/renewals">Renewals</PanelLink>}>
          <div className="px-2 pt-4 pb-1">
            <ExpiryForecastChart data={d.forecast} />
          </div>
          <div className="flex items-center gap-2 border-t border-grey-100 px-4 py-3 text-xs text-heading-6">
            <CalendarClock className="size-3.5" />
            Expected from renewals in the next 30 days: <span className="font-medium text-heading-4">{nairaShort(d.due30.length * s.settings.rentAmount)}</span>
          </div>
        </Panel>

        <Panel title="Occupancy by block" description="Occupied and vacant rooms" action={<PanelLink href="/rooms">Room map</PanelLink>}>
          <div className="px-2 pt-4 pb-2">
            <BlockOccupancyChart data={d.blocks} />
          </div>
          <div className="flex items-center gap-2 border-t border-grey-100 px-4 py-3 text-xs text-heading-6">
            <Users className="size-3.5" />
            {d.sharedRooms} of {d.occupiedRooms} rooms are shared · {naira(s.settings.rentAmount)} per room
          </div>
        </Panel>
      </div>

      {adding && <AddResidentModal onClose={() => setAdding(false)} />}
    </>
  );
}
