"use client";

import { ArrowRight, Bell, CalendarClock, ChevronRight, IdCard, MessageSquareWarning, Repeat, Users, Wallet, Wrench, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { KindIcon, RequestStatusBadge } from "@/components/RequestStatus";
import { Avatar } from "@/components/ui";
import { bedOf } from "@/lib/spaces";
import { personalise, tenantRent, useTenant } from "@/lib/tenant-store";
import { cn, daysBetween, daysLeft, describeDaysLeft, formatDate, formatDateTime, greeting, isOpenTicket, naira, todayISO } from "@/lib/utils";

const ACTIONS: { href: string; label: string; icon: LucideIcon; tint: string }[] = [
  { href: "/portal/requests/new?kind=repair", label: "Report a repair", icon: Wrench, tint: "bg-sky-50 text-sky-700" },
  { href: "/portal/requests/new?kind=complaint", label: "Make a complaint", icon: MessageSquareWarning, tint: "bg-violet-50 text-violet-700" },
  { href: "/portal/requests/new?kind=room_change", label: "Change room", icon: Repeat, tint: "bg-amber-50 text-amber-700" },
  { href: "/portal/payments", label: "Pay rent", icon: Wallet, tint: "bg-emerald-50 text-emerald-700" },
];

/** Circular progress of the rent period, with days left in the middle. */
function LeaseRing({ fraction, days }: { fraction: number; days: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const urgent = days <= 30;
  const remaining = Math.min(1, Math.max(0, 1 - fraction));
  return (
    <div className="relative size-28 shrink-0">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx={50} cy={50} r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={8} />
        <circle
          cx={50}
          cy={50}
          r={r}
          fill="none"
          stroke={urgent ? "#fbbf24" : "#7bbfba"}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - remaining)}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-2xl leading-none font-semibold tabular-nums">{Math.max(days, 0)}</span>
        <span className="mt-1 text-[10px] tracking-wide text-brand-100/80 uppercase">{days < 0 ? "expired" : "days left"}</span>
      </div>
    </div>
  );
}

export default function PortalHome() {
  const t = useTenant();
  const r = t.resident!;
  const left = daysLeft(r);
  const total = Math.max(1, daysBetween(r.leaseStart, r.leaseEnd));
  const used = daysBetween(r.leaseStart, todayISO()) / total;
  const open = t.requests.filter(isOpenTicket);
  const latest = t.notices[0];
  const block = r.roomId?.replace(/\d+$/, "");
  const bed = bedOf(r.spaceId, r.roomId);

  return (
    <div className="space-y-5">
      <section className="flex items-center gap-3">
        <Avatar name={r.fullName} src={r.photoUrl} size="lg" />
        <div className="min-w-0">
          <p className="text-sm text-heading-6">{greeting()},</p>
          <h1 className="truncate text-xl font-semibold tracking-tight text-grey-950">{r.fullName.split(" ")[0]}</h1>
        </div>
      </section>

      {/* Room and rent */}
      <section className="relative overflow-hidden rounded-3xl bg-brand-900 p-5 text-white sm:p-6">
        <div className="pointer-events-none absolute -top-16 -right-16 size-56 rounded-full bg-brand-500/25 blur-3xl" />
        <div className="relative flex items-center gap-5">
          <div className="min-w-0 flex-1">
            <p className="text-xs tracking-wide text-brand-100/70 uppercase">Your room</p>
            <p className="mt-1 text-4xl font-semibold tracking-tight">{r.roomId}</p>
            <p className="mt-1 text-sm text-brand-100/80">{bed ? `Bed ${bed} · Block ${block}` : `Block ${block}`}</p>
            <div className="mt-4 space-y-1.5 text-sm">
              <p className="flex items-center gap-2 text-brand-50">
                <CalendarClock className="size-4 shrink-0 text-brand-200" /> Paid until {formatDate(r.leaseEnd)}
              </p>
              <p className="flex items-center gap-2 text-brand-50">
                <Users className="size-4 shrink-0 text-brand-200" />
                {r.occupants.length ? `With ${r.occupants.map((o) => o.fullName.split(" ")[0]).join(", ")}` : "Just you"}
              </p>
            </div>
          </div>
          <LeaseRing fraction={used} days={left} />
        </div>

        {left <= 30 && (
          <Link href="/portal/payments" className="relative mt-5 flex items-center gap-3 rounded-2xl bg-amber-400 px-4 py-3 text-amber-950 transition-colors hover:bg-amber-300">
            <CalendarClock className="size-5 shrink-0" />
            <span className="min-w-0 flex-1 text-sm">
              <span className="font-semibold">{left < 0 ? "Your rent has expired" : describeDaysLeft(left)}</span>
              <span className="block text-xs text-amber-900/80">Renew for {t.info ? naira(tenantRent(t)) : "the next period"} to keep your {bed ? "bed" : "room"}</span>
            </span>
            <span className="flex items-center gap-1 text-sm font-semibold">
              Renew <ArrowRight className="size-4" />
            </span>
          </Link>
        )}
      </section>

      {/* Quick actions */}
      <section className="grid grid-cols-4 gap-2 sm:gap-3">
        {ACTIONS.map(({ href, label, icon: Icon, tint }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-2 rounded-2xl border border-grey-100 bg-white px-1 py-3.5 text-center transition-colors hover:border-brand-200 hover:bg-brand-50/40"
          >
            <span className={cn("flex size-10 items-center justify-center rounded-xl", tint)}>
              <Icon className="size-5" strokeWidth={1.8} />
            </span>
            <span className="text-[11px] leading-tight font-medium text-heading-3 sm:text-xs">{label}</span>
          </Link>
        ))}
      </section>

      {/* Digital ID */}
      <Link href="/portal/id" className="flex items-center gap-3 rounded-2xl border border-grey-100 bg-white p-4 transition-colors hover:border-brand-200">
        <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <IdCard className="size-5" strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-grey-950">Your tenant ID</span>
          <span className="block text-xs text-heading-6">Show it at the gate. Security can scan it to confirm you live here.</span>
        </span>
        <ChevronRight className="size-4 text-heading-6" />
      </Link>

      {/* Open requests */}
      {open.length > 0 && (
        <section className="rounded-2xl border border-grey-100 bg-white">
          <header className="flex items-center justify-between px-4 pt-4 pb-2">
            <h2 className="text-sm font-semibold text-grey-950">Your open requests</h2>
            <Link href="/portal/requests" className="text-xs font-medium text-brand-700 hover:underline">
              See all
            </Link>
          </header>
          <ul className="divide-y divide-grey-100">
            {open.slice(0, 3).map((q) => (
              <li key={q.id}>
                <Link href={`/portal/requests/${q.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-grey-10">
                  <KindIcon ticket={q} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-grey-950">{q.title}</span>
                    <span className="block text-xs text-heading-6">{formatDateTime(q.createdAt)}</span>
                  </span>
                  <RequestStatusBadge ticket={q} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Latest notice */}
      <section className="rounded-2xl border border-grey-100 bg-white p-4">
        <header className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-grey-950">Latest from management</h2>
          <Link href="/portal/notifications" className="text-xs font-medium text-brand-700 hover:underline">
            All notifications
          </Link>
        </header>
        {latest ? (
          <div className="flex gap-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Bell className="size-4" strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <p className="text-sm text-heading-3">{personalise(latest.body, r, t.info)}</p>
              <p className="mt-1 text-xs text-heading-6">{formatDateTime(latest.sentAt)}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-heading-6">No notices yet.</p>
        )}
      </section>
    </div>
  );
}
