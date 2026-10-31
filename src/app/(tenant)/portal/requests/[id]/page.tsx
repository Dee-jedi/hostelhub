"use client";

import { ArrowLeft, ArrowRight, Check, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { KIND, KindIcon, kindOf, requestStage, RequestStatusBadge } from "@/components/RequestStatus";
import { roomName, useTenant } from "@/lib/tenant-store";
import type { Ticket } from "@/lib/types";
import { cn, formatDateTime, whatsappLink } from "@/lib/utils";

/** Submitted → Seen → In progress → Resolved (or Declined / Approved), filled up to where the request is. */
function Tracker({ ticket }: { ticket: Ticket }) {
  const stage = requestStage(ticket);
  const last = ticket.status === "declined" ? "Declined" : kindOf(ticket) === "room_change" ? "Approved" : "Resolved";
  const steps = ["Submitted", "Seen", "In progress", last];
  return (
    <ol className="flex items-start">
      {steps.map((label, i) => {
        const done = i <= stage.step;
        const declined = ticket.status === "declined" && i === 3;
        return (
          <li key={label} className={cn("flex items-start", i < steps.length - 1 && "flex-1")}>
            <div className="flex w-16 flex-col items-center text-center">
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-xs font-semibold",
                  declined ? "bg-grey-950 text-white" : done ? "bg-brand-600 text-white" : "border border-grey-150 bg-white text-heading-6",
                  i === stage.step && !declined && ticket.status !== "resolved" && "ring-4 ring-brand-100",
                )}
              >
                {done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <span className={cn("mt-1.5 text-[11px] leading-tight font-medium", done ? "text-grey-950" : "text-heading-6")}>{label}</span>
            </div>
            {i < steps.length - 1 && <span className={cn("mt-3.5 h-0.5 flex-1 rounded-full", i < stage.step ? "bg-brand-600" : "bg-grey-100")} />}
          </li>
        );
      })}
    </ol>
  );
}

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTenant();
  const r = t.resident!;
  const q = t.requests.find((x) => x.id === id);

  if (!q) {
    return (
      <div className="py-16 text-center text-sm text-heading-6">
        This request doesn&apos;t exist or isn&apos;t yours.{" "}
        <Link href="/portal/requests" className="font-medium text-brand-700 hover:underline">
          Back to requests
        </Link>
      </div>
    );
  }

  const events: { at: string; who: "you" | "staff"; text?: string; status?: Ticket["status"] }[] = [
    { at: q.createdAt, who: "you" as const, text: "Request sent" },
    ...(q.seenAt ? [{ at: q.seenAt, who: "staff" as const, text: "Seen by management" }] : []),
    ...(q.updates ?? []).map((u) => ({ at: u.at, who: u.by === "staff" ? ("staff" as const) : ("you" as const), text: u.text, status: u.status })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const statusWord: Record<Ticket["status"], string> = { open: "Reopened", in_progress: "Work started", resolved: kindOf(q) === "room_change" ? "Approved" : "Marked resolved", declined: "Declined" };

  return (
    <div className="space-y-4">
      <Link href="/portal/requests" className="inline-flex items-center gap-1.5 text-sm font-medium text-heading-5 hover:text-heading-2">
        <ArrowLeft className="size-4" /> Requests
      </Link>

      <section className="rounded-2xl border border-grey-100 bg-white p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <KindIcon ticket={q} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-heading-6">
              {KIND[kindOf(q)].label}
              {kindOf(q) === "repair" ? ` · ${q.category}` : ""} · Room {roomName(t, q.roomId)}
            </p>
            <h1 className="mt-0.5 text-lg leading-snug font-semibold text-grey-950">{q.title}</h1>
          </div>
          <RequestStatusBadge ticket={q} />
        </div>
        <div className="mt-5 overflow-x-auto pb-1">
          <Tracker ticket={q} />
        </div>
      </section>

      {(q.description || q.photoUrl || q.requestedRoomId) && (
        <section className="space-y-3 rounded-2xl border border-grey-100 bg-white p-4 sm:p-5">
          {q.requestedRoomId && (
            <div className="flex items-center gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              <span className="font-semibold">Room {roomName(t, q.roomId)}</span>
              <ArrowRight className="size-4" />
              <span className="font-semibold">Room {q.requestedRoomId}</span>
            </div>
          )}
          {q.description && <p className="text-sm whitespace-pre-line text-heading-3">{q.description}</p>}
          {q.photoUrl && (
            <a href={q.photoUrl} target="_blank" rel="noreferrer" className="inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element -- resized Storage image */}
              <img src={q.photoUrl} alt="Attached photo" className="max-h-60 rounded-xl border border-grey-100 object-cover" />
            </a>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-grey-100 bg-white p-4 sm:p-5">
        <h2 className="mb-3 text-sm font-semibold text-grey-950">Updates</h2>
        <ol className="space-y-4">
          {events.map((e, i) => (
            <li key={i} className="relative flex gap-3">
              {i < events.length - 1 && <span className="absolute top-6 bottom-[-1rem] left-[11px] w-px bg-grey-100" />}
              <span className={cn("relative mt-0.5 size-[23px] shrink-0 rounded-full border-4 border-white", e.who === "staff" ? "bg-brand-600" : "bg-grey-150")} />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-heading-6">
                  <span className="font-medium text-heading-4">{e.who === "staff" ? t.info?.managerName || "Management" : "You"}</span> · {formatDateTime(e.at)}
                </p>
                {e.status && <p className="mt-0.5 text-sm font-medium text-grey-950">{statusWord[e.status]}</p>}
                {e.text && (
                  <p className={cn("mt-1 text-sm whitespace-pre-line", e.who === "staff" && !["Seen by management"].includes(e.text) ? "rounded-xl rounded-tl-sm bg-brand-50 px-3 py-2 text-brand-950" : "text-heading-4")}>
                    {e.text}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {t.info?.managerPhone && (
        <a
          href={whatsappLink(t.info.managerPhone, `Hello, this is ${r.fullName} (room ${roomName(t, r.roomId)}) about my request: "${q.title}".`)}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 rounded-2xl border border-grey-100 bg-white py-3 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
        >
          <MessageCircle className="size-4" /> Need to add something? WhatsApp the manager
        </a>
      )}
    </div>
  );
}
