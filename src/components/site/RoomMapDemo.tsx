"use client";

import { Check, Clock } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type State = "free" | "taken" | "repair";
// Block C of the demo hostel: a corridor of 12 rooms
const ROOMS: { id: string; state: State }[] = ["taken", "free", "taken", "taken", "free", "repair", "taken", "free", "taken", "taken", "taken", "free"].map((state, i) => ({
  id: `C${i + 1}`,
  state: state as State,
}));

/** "Try it here": the room map students use, working, with nothing saved. */
export function RoomMapDemo() {
  const [picked, setPicked] = useState<string | null>(null);
  const free = ROOMS.filter((r) => r.state === "free").length;

  return (
    <div className="rounded-[2rem] bg-white p-5 shadow-[0_24px_60px_-24px_rgba(11,35,34,0.35)] ring-1 ring-black/5 sm:p-7">
      <div className="flex items-baseline justify-between">
        <p className="text-base font-semibold text-grey-950">Block C</p>
        <p className="flex items-center gap-1.5 text-sm text-brand-700">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-400 opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-brand-500" />
          </span>
          {free} free · live
        </p>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6">
        {ROOMS.map((r) => {
          const mine = picked === r.id;
          const clickable = r.state === "free";
          return (
            <button
              key={r.id}
              type="button"
              disabled={!clickable}
              onClick={() => setPicked(mine ? null : r.id)}
              aria-pressed={mine}
              aria-label={`Room ${r.id}: ${mine ? "your pick" : r.state === "free" ? "free" : r.state === "taken" ? "taken" : "under repair"}`}
              className={cn(
                "flex h-16 flex-col items-center justify-center rounded-2xl border text-sm font-semibold tabular-nums transition-all",
                mine && "scale-[1.04] border-brand-600 bg-brand-600 text-white shadow-[0_10px_24px_-10px_rgba(35,107,103,0.7)]",
                !mine && r.state === "free" && "border-brand-200 text-heading-2 hover:border-brand-400 hover:bg-brand-50",
                r.state === "taken" && "cursor-not-allowed border-grey-100 bg-grey-50 text-grey-400",
                r.state === "repair" && "cursor-not-allowed border-grey-100 bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgba(16,16,16,0.05)_6px_12px)] text-grey-400",
              )}
            >
              {r.id}
              <span className="text-[11px] font-normal">{mine ? "Yours" : r.state === "free" ? "Free" : r.state === "taken" ? "Taken" : "Repairs"}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-5 min-h-[76px] rounded-2xl bg-grey-50 p-4" aria-live="polite">
        {picked ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-[15px] font-semibold text-grey-950">
                <Check className="size-4 text-brand-600" /> Room {picked} · ₦350,000
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-heading-5">
                <Clock className="size-3.5" /> Held for this student for 15 minutes while they pay
              </p>
            </div>
            <span className="rounded-full bg-brand-950 px-4 py-2 text-sm font-semibold text-white">Pay securely</span>
          </div>
        ) : (
          <p className="text-[15px] text-heading-5">Tap a free room. Two students can never pay for the same one.</p>
        )}
      </div>
    </div>
  );
}
