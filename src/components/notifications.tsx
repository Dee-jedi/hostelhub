"use client";

import { AlertTriangle, CalendarClock, ChevronRight, ClipboardList, Wrench } from "lucide-react";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { roomLabel, useHostel } from "@/lib/store";
import { activeResidents, addDays, cn, daysLeft, formatDateTime, isOpenTicket, rentStatus, todayISO } from "@/lib/utils";

export interface Notice {
  id: string;
  icon: ReactNode;
  tone: string;
  title: string;
  detail: string;
  href: string;
}

/** Things the manager should act on, derived from the current hostel data. */
export function useNotifications(): Notice[] {
  const s = useHostel();
  return useMemo(() => {
    const list: Notice[] = [];
    const residents = activeResidents(s);
    const expired = residents.filter((r) => rentStatus(r) === "expired");
    const week = residents.filter((r) => {
      const d = daysLeft(r);
      return d >= 0 && d <= 7;
    });
    const weekAgo = addDays(todayISO(), -7);
    const attention = s.bookings.filter((b) => b.status === "needs_attention");
    const booked = s.bookings.filter((b) => b.status === "paid" && (b.paidAt ?? "") >= weekAgo);
    const tickets = s.tickets.filter(isOpenTicket);

    for (const b of attention)
      list.push({
        id: b.id,
        icon: <ClipboardList className="size-4" />,
        tone: "bg-rose-50 text-rose-600",
        title: `${b.fullName} paid but needs a room`,
        detail: b.issue ?? "Allocate a room from Bookings",
        href: "/bookings",
      });
    for (const b of booked.slice(0, 3))
      list.push({
        id: b.id,
        icon: <ClipboardList className="size-4" />,
        tone: "bg-brand-50 text-brand-600",
        title: `${b.fullName} booked room ${roomLabel(b.roomId)}`,
        detail: `Paid online · ${formatDateTime(b.paidAt!)}`,
        href: "/bookings",
      });
    if (week.length)
      list.push({
        id: "week",
        icon: <CalendarClock className="size-4" />,
        tone: "bg-amber-50 text-amber-600",
        title: `${week.length} rent${week.length === 1 ? "" : "s"} expire within 7 days`,
        detail: "Send a reminder before they lapse",
        href: "/renewals",
      });
    if (expired.length)
      list.push({
        id: "expired",
        icon: <AlertTriangle className="size-4" />,
        tone: "bg-rose-50 text-rose-600",
        title: `${expired.length} resident${expired.length === 1 ? " has" : "s have"} expired rent`,
        detail: "Renew or issue move-out notices",
        href: "/renewals",
      });
    // Requests tenants sent that nobody has opened yet, newest first
    for (const t of s.tickets.filter((x) => x.residentId && x.status === "open" && !x.seenAt).slice(0, 3)) {
      const who = s.residents.find((r) => r.id === t.residentId);
      list.unshift({
        id: `req-${t.id}`,
        icon: <Wrench className="size-4" />,
        tone: "bg-sky-50 text-sky-700",
        title: `${who?.fullName.split(" ")[0] ?? "A tenant"} sent a ${t.kind === "room_change" ? "room change request" : t.kind === "complaint" ? "complaint" : "repair request"}`,
        detail: `${t.title} · room ${roomLabel(t.roomId)}`,
        href: "/maintenance",
      });
    }
    if (tickets.length)
      list.push({
        id: "tickets",
        icon: <Wrench className="size-4" />,
        tone: "bg-grey-50 text-heading-4",
        title: `${tickets.length} open request${tickets.length === 1 ? "" : "s"}`,
        detail: tickets[0].title,
        href: "/maintenance",
      });
    return list;
  }, [s]);
}

export function NotificationList({ notices, onNavigate, className }: { notices: Notice[]; onNavigate?: () => void; className?: string }) {
  if (notices.length === 0) return <p className="px-4 py-10 text-center text-xs text-heading-6">You&apos;re all caught up.</p>;
  return (
    <ul className={cn("divide-y divide-grey-100", className)}>
      {notices.map((n) => (
        <li key={n.id}>
          <Link href={n.href} onClick={onNavigate} className="flex items-center gap-3 px-4 py-3 hover:bg-grey-10">
            <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", n.tone)}>{n.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-heading-2">{n.title}</span>
              <span className="block truncate text-xs text-heading-6">{n.detail}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-heading-6" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
