"use client";

import { Check, ChevronLeft, ChevronRight, DoorOpen, Wrench } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { PublicBookingDoc } from "@/lib/types";
import { bookableSpaces } from "@/lib/spaces";
import { cn, isBookable } from "@/lib/utils";

type TileState = "vacant" | "selected" | "held" | "occupied" | "maintenance";
/** Which edge of the tile faces the corridor (where its door is drawn) */
type DoorSide = "top" | "bottom" | "left" | "right";

function tileState(doc: PublicBookingDoc, id: string, selected: string, now: number): TileState {
  if (id === selected) return "selected";
  const room = doc.rooms[id];
  if (room.status !== "vacant") return room.status;
  return isBookable(doc, id, now) ? "vacant" : "held";
}

const STRIPES = "bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgba(16,16,16,0.035)_6px_12px)]";

const tileClass: Record<TileState, string> = {
  vacant: "border-brand-200 bg-white text-heading-2 hover:border-brand-400 hover:bg-brand-50 cursor-pointer",
  selected: "border-brand-600 bg-brand-600 text-white shadow-btn-primary cursor-pointer",
  held: "border-amber-200 bg-amber-50 text-amber-800 cursor-not-allowed",
  occupied: cn("border-grey-100 bg-grey-50 text-heading-6/70 cursor-not-allowed", STRIPES),
  maintenance: cn("border-grey-100 bg-grey-50 text-heading-6/70 cursor-not-allowed", STRIPES),
};

const statusText: Record<TileState, string> = {
  vacant: "Free",
  selected: "Your pick",
  held: "On hold",
  occupied: "Taken",
  maintenance: "Repairs",
};

const doorClass: Record<DoorSide, string> = {
  top: "top-0 left-1/2 h-[3px] w-5 -translate-x-1/2 rounded-b",
  bottom: "bottom-0 left-1/2 h-[3px] w-5 -translate-x-1/2 rounded-t",
  left: "left-0 top-1/2 w-[3px] h-5 -translate-y-1/2 rounded-r",
  right: "right-0 top-1/2 w-[3px] h-5 -translate-y-1/2 rounded-l",
};

/**
 * Splits a block's rooms into the two sides of its corridor: walk down one side (1, 2, 3…) and
 * back along the other, so the last room sits opposite the first side's end. When the count is
 * odd, the spare spot opposite room 1 is where the stairs/entrance go.
 */
function corridorSides(rooms: string[]) {
  const half = Math.ceil(rooms.length / 2);
  const near = rooms.slice(0, half);
  const far = rooms.slice(half).reverse();
  const farPadded: (string | null)[] = [...Array(half - far.length).fill(null), ...far];
  return { near, far: farPadded, length: half };
}

/**
 * Availability as a floor plan of each block's corridor, fed by a live listener on the public
 * booking document. The server re-checks the room when payment starts anyway, so a tile that's
 * a second out of date can never lead to a double booking.
 */
export function RoomPicker({
  doc,
  now,
  value,
  onChange,
}: {
  doc: PublicBookingDoc;
  /** Current time; holds that ended before this are treated as expired */
  now: number;
  value: string;
  onChange: (roomId: string) => void;
}) {
  const blocks = doc.info.blocks;
  const ids = Object.keys(doc.rooms);
  // Per-bed hostels count free beds; per-room hostels count free rooms
  const perBed = ids.some((id) => doc.rooms[id].beds);
  const freeIn = (id: string) => bookableSpaces(id, doc.rooms[id], doc.holds, now).length;
  const vacantIn = (block: string) => ids.filter((id) => doc.rooms[id].block === block).reduce((n, id) => n + (perBed ? freeIn(id) : isBookable(doc, id, now) ? 1 : 0), 0);
  const firstWithSpace = blocks.find((b) => vacantIn(b) > 0) ?? blocks[0];
  const [block, setBlock] = useState(() => (value ? doc.rooms[value]?.block : undefined) ?? firstWithSpace);
  const rooms = ids.filter((id) => doc.rooms[id].block === block).sort((a, b) => doc.rooms[a].number - doc.rooms[b].number);
  const totalVacant = blocks.reduce((n, b) => n + vacantIn(b), 0);
  const { near, far, length } = corridorSides(rooms);

  const tile = (id: string | null, door: DoorSide, style?: CSSProperties) => {
    if (!id) return <Stairs key={`stairs-${door}`} style={style} vertical={door === "left" || door === "right"} />;
    const st = tileState(doc, id, value, now);
    const clickable = st === "vacant" || st === "selected";
    return (
      <button
        key={id}
        type="button"
        style={style}
        disabled={!clickable}
        onClick={() => onChange(st === "selected" ? "" : id)}
        aria-pressed={st === "selected"}
        aria-label={`Room ${id}: ${statusText[st]}`}
        title={st === "maintenance" ? (doc.rooms[id].note ?? "Under maintenance") : st === "held" ? "Someone is paying for this room right now" : undefined}
        className={cn(
          "relative flex h-14 min-w-0 flex-col items-center justify-center rounded-lg border text-sm leading-tight font-semibold tabular-nums transition-all",
          st === "selected" && "scale-[1.03]",
          tileClass[st],
        )}
      >
        <span className={cn("absolute", doorClass[door], st === "selected" ? "bg-white/70" : st === "vacant" ? "bg-brand-300" : "bg-grey-150")} />
        <span className="flex items-center gap-1">
          {st === "selected" && <Check className="size-3.5" strokeWidth={3} />}
          {st === "maintenance" && <Wrench className="size-3" />}
          {id}
        </span>
        <span className={cn("mt-0.5 text-[10px] font-medium", st === "selected" ? "text-white/85" : st === "vacant" ? "text-brand-700" : "")}>
          {doc.rooms[id].beds && (st === "vacant" || st === "selected") ? `${freeIn(id)} bed${freeIn(id) === 1 ? "" : "s"} free` : statusText[st]}
        </span>
      </button>
    );
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-heading-5">
          <span className="font-semibold text-brand-700">{totalVacant}</span> {perBed ? "bed" : "room"}
          {totalVacant === 1 ? "" : "s"} available
        </p>
        <span className="inline-flex items-center gap-1.5 text-xs text-heading-6">
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" /> Live
        </span>
      </div>

      <BlockTabs blocks={blocks} block={block} onSelect={setBlock} vacantIn={vacantIn} />

      {/* Floor plan: when there's room the corridor runs across, otherwise (phones, narrow columns) down the middle */}
      <div className="@container rounded-2xl border border-grey-100 bg-grey-10 p-3">
        <p className="mb-2.5 text-[11px] font-semibold tracking-wider text-heading-6 uppercase">Block {block} · floor plan</p>

        <div className="hidden @lg:block">
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}>
            {near.map((id) => tile(id, "bottom"))}
          </div>
          <Corridor />
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}>
            {far.map((id) => tile(id, "top"))}
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_2.5rem_minmax(0,1fr)] gap-x-1.5 gap-y-1.5 @lg:hidden">
          <Corridor vertical style={{ gridColumn: 2, gridRow: `1 / span ${length}` }} />
          {near.map((id, r) => tile(id, "right", { gridColumn: 1, gridRow: r + 1 }))}
          {far.map((id, r) => tile(id, "left", { gridColumn: 3, gridRow: r + 1 }))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-heading-6">
        <Legend className="border-brand-200 bg-white">Free</Legend>
        <Legend className="border-brand-600 bg-brand-600">Your pick</Legend>
        <Legend className="border-amber-200 bg-amber-50">On hold</Legend>
        <Legend className={cn("border-grey-150 bg-grey-50", STRIPES)}>Taken / repairs</Legend>
      </div>
    </div>
  );
}

const FADE = "40px";

/**
 * The row of blocks. It scrolls sideways when there are more blocks than fit, so the edge with
 * more to see fades out and gets an arrow button; both disappear once you reach that end.
 */
function BlockTabs({
  blocks,
  block,
  onSelect,
  vacantIn,
}: {
  blocks: string[];
  block: string;
  onSelect: (block: string) => void;
  vacantIn: (block: string) => number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 4;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setMore((m) => (m.left === left && m.right === right ? m : { left, right }));
  }, []);

  // Re-measure whenever the row changes size (also fires once when it first appears)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  // Keep the selected block in view, e.g. when coming back to this step
  useEffect(() => {
    const el = ref.current;
    const chip = el?.querySelector<HTMLElement>(`[data-block="${CSS.escape(block)}"]`);
    if (!el || !chip) return;
    const start = chip.offsetLeft - 48;
    const end = chip.offsetLeft + chip.offsetWidth - el.clientWidth + 48;
    if (el.scrollLeft > start) el.scrollTo({ left: start, behavior: "smooth" });
    else if (el.scrollLeft < end) el.scrollTo({ left: end, behavior: "smooth" });
  }, [block]);

  const nudge = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.7, behavior: "smooth" });
  const mask = `linear-gradient(to right, ${more.left ? "transparent" : "black"}, black ${FADE}, black calc(100% - ${FADE}), ${more.right ? "transparent" : "black"})`;

  return (
    <div className="relative -mx-1 mb-4">
      <div
        ref={ref}
        onScroll={measure}
        style={{ maskImage: mask, WebkitMaskImage: mask }}
        className="relative flex gap-1.5 overflow-x-auto scroll-smooth px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {blocks.map((b) => {
          const n = vacantIn(b);
          return (
            <button
              key={b}
              data-block={b}
              type="button"
              onClick={() => onSelect(b)}
              className={cn(
                "flex shrink-0 flex-col items-center rounded-xl border px-3.5 py-1.5 text-sm font-medium transition-colors",
                b === block ? "border-brand-200 bg-brand-50 text-brand-800" : "border-grey-100 bg-white text-heading-4 hover:bg-grey-50",
              )}
            >
              Block {b}
              <span className={cn("text-[11px] font-normal", n ? "text-brand-700" : "text-heading-6")}>{n ? `${n} free` : "Full"}</span>
            </button>
          );
        })}
      </div>
      {(["left", "right"] as const).map((side) => (
        <button
          key={side}
          type="button"
          onClick={() => nudge(side === "left" ? -1 : 1)}
          aria-label={side === "left" ? "Show earlier blocks" : "Show more blocks"}
          tabIndex={more[side] ? 0 : -1}
          className={cn(
            "absolute top-[calc(50%-2px)] flex size-7 -translate-y-1/2 items-center justify-center rounded-full border border-grey-100 bg-white text-heading-4 shadow-[0_2px_8px_rgba(16,16,16,0.1)] transition-opacity hover:text-brand-700",
            side === "left" ? "left-0" : "right-0",
            more[side] ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          {side === "left" ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
      ))}
    </div>
  );
}

function Corridor({ vertical, style }: { vertical?: boolean; style?: CSSProperties }) {
  return (
    <div
      style={style}
      className={cn(
        "relative flex items-center justify-center rounded-md bg-white/70",
        vertical ? "flex-col py-2" : "my-1.5 h-9 px-3",
      )}
    >
      {/* dashed centre line */}
      <span className={cn("absolute border-grey-150", vertical ? "inset-y-8 left-1/2 border-l border-dashed" : "inset-x-24 top-1/2 border-t border-dashed")} />
      <span
        className={cn(
          "absolute flex items-center gap-1 text-[10px] font-semibold tracking-wide text-heading-6 uppercase",
          vertical ? "top-1.5 flex-col" : "left-2.5",
        )}
      >
        <DoorOpen className="size-3.5 text-brand-600" strokeWidth={1.8} />
        {!vertical && "Entrance"}
      </span>
      <span
        className={cn(
          "relative bg-grey-10/0 px-2 text-[10px] font-semibold tracking-[0.2em] text-grey-400 uppercase",
          vertical && "[writing-mode:vertical-rl] rotate-180",
        )}
      >
        Corridor
      </span>
    </div>
  );
}

function Stairs({ vertical, style }: { vertical?: boolean; style?: CSSProperties }) {
  return (
    <div
      style={style}
      aria-hidden
      className={cn("flex h-14 items-center justify-center rounded-lg border border-dashed border-grey-150 text-[10px] font-medium text-grey-400", vertical && "flex-col")}
    >
      <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round">
        <path d="M3 16h4v-4h4V8h4V4h2" />
      </svg>
      <span className={vertical ? "mt-0.5" : "ml-1"}>Stairs</span>
    </div>
  );
}

function Legend({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-3 rounded border", className)} />
      {children}
    </span>
  );
}
