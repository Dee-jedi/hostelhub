import { MessageSquareWarning, Repeat, Wrench, type LucideIcon } from "lucide-react";
import type { RequestKind, Ticket } from "@/lib/types";
import { cn } from "@/lib/utils";

export const KIND: Record<RequestKind, { label: string; icon: LucideIcon; tint: string }> = {
  repair: { label: "Repair", icon: Wrench, tint: "bg-sky-50 text-sky-700" },
  complaint: { label: "Complaint", icon: MessageSquareWarning, tint: "bg-violet-50 text-violet-700" },
  room_change: { label: "Room change", icon: Repeat, tint: "bg-amber-50 text-amber-700" },
};

export const kindOf = (t: Ticket): RequestKind => t.kind ?? "repair";

/** The four stages a tenant sees: Submitted → Seen → In progress → Resolved (or Declined). */
export function requestStage(t: Ticket): { label: string; tone: string; step: number } {
  if (t.status === "resolved") return { label: kindOf(t) === "room_change" ? "Approved" : "Resolved", tone: "bg-emerald-50 text-emerald-700", step: 3 };
  if (t.status === "declined") return { label: "Declined", tone: "bg-grey-50 text-heading-5", step: 3 };
  if (t.status === "in_progress") return { label: "In progress", tone: "bg-amber-50 text-amber-700", step: 2 };
  if (t.seenAt) return { label: "Seen", tone: "bg-sky-50 text-sky-700", step: 1 };
  return { label: "Submitted", tone: "bg-brand-50 text-brand-700", step: 0 };
}

export function RequestStatusBadge({ ticket, className }: { ticket: Ticket; className?: string }) {
  const s = requestStage(ticket);
  return <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", s.tone, className)}>{s.label}</span>;
}

export function KindIcon({ ticket, className }: { ticket: Ticket; className?: string }) {
  const k = KIND[kindOf(ticket)];
  const Icon = k.icon;
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", k.tint, className)}>
      <Icon className="size-4.5" strokeWidth={1.8} />
    </span>
  );
}
