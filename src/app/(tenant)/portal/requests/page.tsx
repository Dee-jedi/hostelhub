"use client";

import { ChevronRight, ClipboardList, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { KIND, KindIcon, kindOf, RequestStatusBadge } from "@/components/RequestStatus";
import { useTenant } from "@/lib/tenant-store";
import type { RequestKind } from "@/lib/types";
import { cn, formatDateTime, isOpenTicket } from "@/lib/utils";

export default function RequestsPage() {
  const t = useTenant();
  const [tab, setTab] = useState<"open" | "closed">("open");
  const open = t.requests.filter(isOpenTicket);
  const closed = t.requests.filter((r) => !isOpenTicket(r));
  const list = tab === "open" ? open : closed;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-grey-950">Requests</h1>
          <p className="text-sm text-heading-6">Repairs, complaints and room changes</p>
        </div>
        <Link href="/portal/requests/new" className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 text-sm font-medium text-white shadow-btn-primary hover:bg-brand-700">
          <Plus className="size-4" /> New
        </Link>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-grey-100 bg-white p-1">
        {(
          [
            ["open", `Open (${open.length})`],
            ["closed", `Closed (${closed.length})`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={cn("rounded-lg py-2 text-sm font-medium transition-colors", tab === value ? "bg-brand-50 text-brand-800" : "text-heading-6 hover:text-heading-4")}
          >
            {label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-grey-100 bg-white px-5 py-10 text-center">
          <ClipboardList className="mx-auto size-8 text-grey-400" strokeWidth={1.5} />
          <p className="mt-3 text-sm font-medium text-heading-3">{tab === "open" ? "No open requests" : "Nothing closed yet"}</p>
          {tab === "open" && (
            <>
              <p className="mt-1 text-xs text-heading-6">Something broken or bothering you? Let management know.</p>
              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                {(Object.keys(KIND) as RequestKind[]).map((k) => {
                  const { label, icon: Icon, tint } = KIND[k];
                  return (
                    <Link key={k} href={`/portal/requests/new?kind=${k}`} className="flex items-center gap-2.5 rounded-xl border border-grey-100 p-3 text-left text-sm font-medium text-heading-3 hover:border-brand-200">
                      <span className={cn("flex size-8 items-center justify-center rounded-lg", tint)}>
                        <Icon className="size-4" strokeWidth={1.8} />
                      </span>
                      {label}
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </div>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-grey-100 bg-white">
          {list.map((q) => (
            <li key={q.id} className="border-b border-grey-100 last:border-0">
              <Link href={`/portal/requests/${q.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-grey-10">
                <KindIcon ticket={q} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-grey-950">{q.title}</span>
                  <span className="block text-xs text-heading-6">
                    {KIND[kindOf(q)].label} · {formatDateTime(q.createdAt)}
                    {(q.updates ?? []).some((u) => u.by === "staff" && u.text) ? " · has a reply" : ""}
                  </span>
                </span>
                <RequestStatusBadge ticket={q} />
                <ChevronRight className="size-4 shrink-0 text-heading-6" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
