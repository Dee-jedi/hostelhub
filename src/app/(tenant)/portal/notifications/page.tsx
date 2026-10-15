"use client";

import { doc, updateDoc } from "firebase/firestore";
import { Bell, BellOff, CalendarClock, ChevronRight, ClipboardList } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { personalise, tenantNotifications, useTenant, type TenantNotification } from "@/lib/tenant-store";
import { cn, formatDateTime } from "@/lib/utils";

const ICON: Record<TenantNotification["kind"], { icon: typeof Bell; tint: string }> = {
  notice: { icon: Bell, tint: "bg-brand-50 text-brand-600" },
  reminder: { icon: CalendarClock, tint: "bg-amber-50 text-amber-700" },
  request: { icon: ClipboardList, tint: "bg-sky-50 text-sky-700" },
};

export default function NotificationsPage() {
  const t = useTenant();
  const r = t.resident!;
  const list = tenantNotifications(t);
  // Remember what was unread when the page opened, so those stay highlighted while reading
  const [seenBefore] = useState(() => r.notificationsSeenAt ?? "");

  // Opening the page marks everything read: one small write, and only if something was unread
  const newest = list[0]?.at ?? "";
  useEffect(() => {
    if (newest && newest > (r.notificationsSeenAt ?? "")) {
      updateDoc(doc(db, "residents", r.id), { notificationsSeenAt: new Date().toISOString() }).catch(console.error);
    }
  }, [newest, r.id, r.notificationsSeenAt]);

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold tracking-tight text-grey-950">Notifications</h1>
      {list.length === 0 ? (
        <div className="rounded-2xl border border-grey-100 bg-white px-6 py-14 text-center">
          <BellOff className="mx-auto size-8 text-grey-400" strokeWidth={1.5} />
          <p className="mt-3 text-sm font-medium text-heading-3">You&apos;re all caught up</p>
          <p className="mt-1 text-xs text-heading-6">Notices from management and updates on your requests show up here.</p>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-grey-100 bg-white">
          {list.map((n) => {
            const { icon: Icon, tint } = ICON[n.kind];
            const unread = n.at > seenBefore;
            const body = (
              <>
                <span className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl", tint)}>
                  <Icon className="size-4.5" strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-grey-950">{n.title}</span>
                    {unread && <span className="size-2 shrink-0 rounded-full bg-rose-500" aria-label="Unread" />}
                  </span>
                  <span className="mt-0.5 block text-sm text-heading-4">{personalise(n.body, r, t.info)}</span>
                  <span className="mt-1 block text-xs text-heading-6">{formatDateTime(n.at)}</span>
                </span>
                {n.href && <ChevronRight className="mt-2 size-4 shrink-0 text-heading-6" />}
              </>
            );
            const cls = cn("flex gap-3 border-b border-grey-100 px-4 py-3.5 last:border-0", unread && "bg-brand-50/40");
            return (
              <li key={n.id}>
                {n.href ? (
                  <Link href={n.href} className={cn(cls, "hover:bg-grey-10")}>
                    {body}
                  </Link>
                ) : (
                  <div className={cls}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
