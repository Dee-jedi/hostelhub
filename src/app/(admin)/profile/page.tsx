"use client";

import { ChevronRight, ClipboardList, DoorOpen, ExternalLink, MessageSquareText, Phone, Settings, Wallet, Wrench, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Panel } from "@/components/ui";
import { useHostel } from "@/lib/store";
import { managerInitials } from "@/lib/utils";

function Row({
  href,
  icon: Icon,
  label,
  hint,
  count,
  external,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  hint?: string;
  count?: number;
  external?: boolean;
}) {
  return (
    <Link href={href} target={external ? "_blank" : undefined} className="flex items-center gap-3 px-4 py-3.5 hover:bg-grey-10">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-grey-100 bg-grey-10 text-heading-4">
        <Icon className="size-4.5" strokeWidth={1.6} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-heading-2">{label}</span>
        {hint && <span className="block truncate text-xs text-heading-6">{hint}</span>}
      </span>
      {!!count && <span className="rounded-md bg-brand-600 px-1.5 py-px text-[11px] font-semibold text-white tabular-nums">{count}</span>}
      {external ? <ExternalLink className="size-4 text-heading-6" /> : <ChevronRight className="size-4 text-heading-6" />}
    </Link>
  );
}

export default function ProfilePage() {
  const s = useHostel();
  const pending = s.applications.filter((a) => a.status === "pending").length;
  const openTickets = s.tickets.filter((t) => t.status !== "resolved").length;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <section className="px-1 pt-1 pb-2">
        <div className="flex items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-grey-950 text-lg font-semibold text-white">
            {managerInitials(s.settings.managerName)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-medium text-grey-950">{s.settings.managerName}</p>
            <p className="truncate text-sm text-heading-6">Manager · {s.settings.hostelName}</p>
            <a href={`tel:${s.settings.managerPhone}`} className="mt-0.5 inline-flex items-center gap-1 text-xs text-brand-700">
              <Phone className="size-3" /> {s.settings.managerPhone}
            </a>
          </div>
        </div>
        <Link
          href="/settings"
          className="mt-4 flex min-h-10 w-full items-center justify-center rounded-xl border border-grey-150 bg-white text-sm font-medium text-heading-4 hover:bg-grey-50"
        >
          Edit profile & hostel details
        </Link>
      </section>

      <Panel title="Manage" bodyClassName="divide-y divide-grey-100">
        <Row href="/payments" icon={Wallet} label="Payments" hint="Rent received and receipts" />
        <Row href="/messages" icon={MessageSquareText} label="Messages" hint="Broadcasts and reminder history" />
        <Row href="/applications" icon={ClipboardList} label="Applications" hint="Students who registered online" count={pending} />
        <Row href="/maintenance" icon={Wrench} label="Maintenance" hint="Repairs and complaints" count={openTickets} />
      </Panel>

      <Panel title="Hostel" bodyClassName="divide-y divide-grey-100">
        <Row href="/settings" icon={Settings} label="Settings" hint="Rent, rooms, reminders and bank details" />
        <Row href="/register" icon={DoorOpen} label="Registration form" hint="The page students fill to get a room" external />
      </Panel>
    </div>
  );
}
