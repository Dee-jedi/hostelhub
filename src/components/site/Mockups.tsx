import { BedDouble, Bell, CalendarClock, LayoutDashboard, QrCode, ReceiptText, Users, Wallet, Wrench } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { PLATFORM_HOST } from "@/lib/platform";
import { cn } from "@/lib/utils";

/*
 * Pictures of the product built from markup, for a fictional hostel ("Sunrise Hostel").
 * Each one is drawn at a real device size and shrunk as a whole with <Scaled>, like a
 * screenshot: text never re-wraps, so a phone always looks like a phone at any screen width.
 */

export const DEMO_HOSTEL = "Sunrise Hostel";

/**
 * Draws its child at w×h px and scales it by the CSS variable --s, taking up only the scaled
 * size in the layout. Set --s per breakpoint, e.g. className="[--s:0.5] sm:[--s:0.8]".
 */
export function Scaled({ w, h, className, style, children }: { w: number; h: number; className?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: `calc(${w}px * var(--s, 1))`, height: `calc(${h}px * var(--s, 1))`, ...style }} aria-hidden>
      <div className="absolute top-0 left-0 origin-top-left" style={{ width: w, height: h, transform: "scale(var(--s, 1))" }}>
        {children}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- dashboard

type Tile = "paid" | "due" | "late" | "free" | "repair";
const TILE: Record<Tile, string> = {
  paid: "bg-brand-500",
  due: "bg-amber-400",
  late: "bg-rose-400",
  free: "bg-white ring-1 ring-inset ring-grey-150",
  repair: "bg-grey-150",
};
// A believable mix for 45 rooms: mostly paid, some due soon, a few late, a few free
const GRID: Tile[] = "pppdppfpplpppdpprppfpppdpplpppppfpdpppprppfpp".split("").map((c) => ({ p: "paid", d: "due", l: "late", f: "free", r: "repair" })[c] as Tile);

function Stat({ label, value, note, tone = "text-grey-950" }: { label: string; value: string; note: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-white px-3.5 py-3 ring-1 ring-grey-100">
      <p className="text-[11px] text-heading-6">{label}</p>
      <p className={cn("mt-1.5 text-[22px] leading-none font-semibold tracking-tight tabular-nums", tone)}>{value}</p>
      <p className="mt-1.5 text-[10px] text-heading-6">{note}</p>
    </div>
  );
}

export const DASHBOARD_SIZE = { w: 760, h: 400 };

/** The manager's dashboard in a browser window, drawn at 760×400. */
export function DashboardMock() {
  const nav = [
    { icon: LayoutDashboard, label: "Home", active: true },
    { icon: BedDouble, label: "Rooms" },
    { icon: Users, label: "Tenants" },
    { icon: CalendarClock, label: "Rent & renewals" },
    { icon: Wallet, label: "Payments" },
    { icon: Wrench, label: "Requests" },
  ];
  return (
    <div className="flex h-[400px] w-[760px] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_30px_80px_-20px_rgba(11,35,34,0.35)] ring-1 ring-black/10">
      <div className="flex items-center gap-2 border-b border-grey-100 bg-grey-10 px-4 py-2.5">
        <span className="size-3 rounded-full bg-grey-150" />
        <span className="size-3 rounded-full bg-grey-150" />
        <span className="size-3 rounded-full bg-grey-150" />
        <span className="mx-auto rounded-full bg-white px-4 py-1 text-[11px] text-heading-6 ring-1 ring-grey-100">sunrise.{PLATFORM_HOST}</span>
      </div>
      <div className="flex min-h-0 flex-1">
        <aside className="w-44 shrink-0 border-r border-grey-100 p-4">
          <p className="mb-4 text-[15px] font-semibold tracking-tight text-brand-950">
            hostel<span className="text-brand-600">hub</span>
          </p>
          {nav.map(({ icon: Icon, label, active }) => (
            <p key={label} className={cn("mb-1 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px]", active ? "bg-brand-50 font-medium text-brand-800" : "text-heading-5")}>
              <Icon className="size-3.5" /> {label}
            </p>
          ))}
        </aside>
        <div className="min-w-0 flex-1 bg-grey-10 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] text-heading-6">Good morning,</p>
              <p className="text-[17px] font-semibold text-grey-950">Mrs. Adeyemi</p>
            </div>
            <span className="relative flex size-8 items-center justify-center rounded-full bg-white ring-1 ring-grey-100">
              <Bell className="size-4 text-heading-5" />
              <span className="absolute top-1.5 right-2 size-1.5 rounded-full bg-rose-500" />
            </span>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2.5">
            <Stat label="Occupied" value="92%" note="110 of 120 rooms" />
            <Stat label="Free rooms" value="10" note="Booking page live" tone="text-brand-600" />
            <Stat label="Rent due" value="14" note="This month" tone="text-amber-600" />
            <Stat label="Collected" value="₦38.5m" note="This session" />
          </div>
          <div className="mt-3 rounded-xl bg-white p-4 ring-1 ring-grey-100">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[13px] font-semibold text-grey-950">Block A · rooms</p>
              <div className="flex gap-3 text-[10px] text-heading-6">
                <span className="flex items-center gap-1.5">
                  <i className="size-2 rounded-full bg-brand-500" /> Paid
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="size-2 rounded-full bg-amber-400" /> Due soon
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="size-2 rounded-full bg-rose-400" /> Late
                </span>
              </div>
            </div>
            <div className="grid grid-cols-15 gap-1.5">
              {GRID.map((t, i) => (
                <span key={i} className={cn("aspect-square rounded-[4px]", TILE[t])} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- phone

export const PHONE_SIZE = { w: 290, h: 600 };

/** A phone drawn at 290×600 (a real phone's shape); children are the screen. */
export function Phone({ children }: { children: ReactNode }) {
  return (
    <div className="h-[600px] w-[290px] rounded-[44px] bg-brand-950 p-2.5 shadow-[0_30px_70px_-15px_rgba(11,35,34,0.45)] ring-1 ring-white/10">
      <div className="relative h-full overflow-hidden rounded-[36px] bg-white">
        <span className="absolute top-2.5 left-1/2 z-10 h-6 w-24 -translate-x-1/2 rounded-full bg-brand-950" />
        {children}
      </div>
    </div>
  );
}

/** The student's booking page: pick a room, see the price, pay. */
export function BookingScreen() {
  const rooms: ("free" | "taken" | "pick" | "held")[] = ["taken", "free", "taken", "pick", "taken", "held", "taken", "free", "taken"];
  return (
    <div>
      <div className="rounded-b-[28px] bg-brand-900 px-5 pt-12 pb-6 text-white">
        <p className="text-[15px] font-semibold tracking-tight">
          hostel<span className="text-brand-300">hub</span>
        </p>
        <p className="mt-4 text-[20px] font-semibold">{DEMO_HOSTEL}</p>
        <p className="mt-0.5 text-[12px] text-brand-100/80">₦350,000 per room · 2 people</p>
      </div>
      <div className="px-5 pt-5">
        <p className="text-[14px] font-semibold text-grey-950">Pick your room</p>
        <p className="text-[11px] text-heading-6">Block B · 3 free</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {rooms.map((r, i) => (
            <span
              key={i}
              className={cn(
                "flex h-12 flex-col items-center justify-center rounded-xl border text-[12px] font-semibold",
                r === "pick" && "border-brand-600 bg-brand-600 text-white",
                r === "free" && "border-brand-200 text-heading-2",
                r === "taken" && "border-grey-100 bg-grey-50 text-grey-400",
                r === "held" && "border-amber-200 bg-amber-50 text-amber-800",
              )}
            >
              B{i + 1}
              <span className="text-[9px] font-normal">{r === "pick" ? "Your pick" : r === "free" ? "Free" : r === "held" ? "On hold" : "Taken"}</span>
            </span>
          ))}
        </div>
        <div className="mt-4 rounded-xl bg-brand-50 px-3.5 py-2.5 text-[11px] text-brand-900">
          Room B4 · 2 people · <b>₦350,000</b>
        </div>
        <div className="mt-4 flex h-12 items-center justify-center rounded-2xl bg-brand-600 text-[14px] font-semibold text-white">Pay securely</div>
        <p className="mt-2.5 text-center text-[10px] text-heading-6">Card, bank transfer or USSD</p>
      </div>
    </div>
  );
}

/** The tenant portal home: their room and how long is left. */
export function PortalScreen() {
  const actions: [typeof Wrench, string][] = [
    [Wrench, "Report a repair"],
    [ReceiptText, "My receipts"],
    [Wallet, "Renew rent"],
    [QrCode, "My tenant ID"],
  ];
  return (
    <div className="px-5 pt-14 pb-6">
      <p className="text-[12px] text-heading-6">Good evening,</p>
      <p className="text-[20px] font-semibold text-grey-950">Tolu</p>
      <div className="mt-4 rounded-3xl bg-brand-900 p-5 text-white">
        <p className="text-[10px] tracking-wider text-brand-200 uppercase">Your room</p>
        <p className="mt-1 text-[34px] leading-none font-semibold">B4</p>
        <p className="mt-1.5 text-[11px] text-brand-100/80">Paid until 30 Jun 2027</p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/15">
          <div className="h-full w-[72%] rounded-full bg-brand-300" />
        </div>
        <p className="mt-2 text-[10px] text-brand-100/80">243 days left</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2.5 text-[12px] font-medium text-heading-2">
        {actions.map(([Icon, label]) => (
          <span key={label} className="flex items-center gap-2 rounded-2xl bg-grey-50 px-3 py-3.5">
            <Icon className="size-4 text-brand-600" /> {label}
          </span>
        ))}
      </div>
      <div className="mt-4 rounded-2xl bg-brand-50 px-4 py-3">
        <p className="text-[11px] font-semibold text-brand-900">From management</p>
        <p className="mt-0.5 text-[11px] text-brand-900/75">Water will be off on Saturday from 10am to 2pm.</p>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- ID card

export const ID_CARD_SIZE = { w: 340, h: 214 };

/** The tenant ID card security scans at the gate, drawn at 340×214 (a bank card's shape). */
export function IdCardMock() {
  return (
    <div className="flex h-[214px] w-[340px] flex-col rounded-2xl bg-white p-5 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.5)]">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-semibold tracking-tight text-brand-950">
          hostel<span className="text-brand-600">hub</span>
        </p>
        <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[9px] font-semibold tracking-wide text-brand-800">TENANT</span>
      </div>
      <div className="mt-3 flex flex-1 items-center gap-3.5">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-xl font-semibold text-brand-800">TB</span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-grey-950">Tolu Bankole</p>
          <p className="text-[11px] text-heading-6">{DEMO_HOSTEL} · Room B4</p>
          <p className="text-[11px] text-heading-6">Valid to 30 Jun 2027</p>
        </div>
        <QrCode className="size-16 shrink-0 text-brand-950" strokeWidth={1.25} />
      </div>
    </div>
  );
}
