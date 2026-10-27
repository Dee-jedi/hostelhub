import { BedDouble, Bell, CalendarClock, LayoutDashboard, QrCode, ReceiptText, Users, Wallet, Wrench } from "lucide-react";
import { PLATFORM_HOST } from "@/lib/platform";
import { cn } from "@/lib/utils";

/*
 * Pictures of the product built from markup (sharp at any size, always in the real colours).
 * Everything shown belongs to a fictional hostel, "Sunrise Hostel".
 */

export const DEMO_HOSTEL = "Sunrise Hostel";

type Tile = "paid" | "due" | "late" | "free" | "repair";
const TILE: Record<Tile, string> = {
  paid: "bg-brand-500",
  due: "bg-amber-400",
  late: "bg-rose-400",
  free: "bg-white ring-1 ring-inset ring-grey-150",
  repair: "bg-grey-150",
};
// A believable mix: mostly paid, some due soon, a few late, a few free
const GRID: Tile[] = "ppppdppfpplpppdpprppfppppdpplpppppfpdpppprpppppfpp".split("").map((c) => ({ p: "paid", d: "due", l: "late", f: "free", r: "repair" })[c] as Tile);

function Stat({ label, value, note, tone = "text-grey-950" }: { label: string; value: string; note: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-white p-2.5 ring-1 ring-grey-100">
      <p className="truncate text-[10px] text-heading-6">{label}</p>
      <p className={cn("mt-1 text-base leading-none font-semibold tracking-tight tabular-nums", tone)}>{value}</p>
      <p className="mt-1.5 text-[9px] text-heading-6">{note}</p>
    </div>
  );
}

/** The manager's dashboard in a browser window. */
export function DashboardMock({ className }: { className?: string }) {
  const nav = [
    { icon: LayoutDashboard, label: "Home", active: true },
    { icon: BedDouble, label: "Rooms" },
    { icon: Users, label: "Tenants" },
    { icon: CalendarClock, label: "Rent & renewals" },
    { icon: Wallet, label: "Payments" },
    { icon: Wrench, label: "Requests" },
  ];
  return (
    <div className={cn("overflow-hidden rounded-2xl bg-white shadow-[0_30px_80px_-20px_rgba(11,35,34,0.35)] ring-1 ring-black/10", className)} aria-hidden>
      <div className="flex items-center gap-2 border-b border-grey-100 bg-grey-10 px-3 py-2">
        <span className="size-2.5 rounded-full bg-grey-150" />
        <span className="size-2.5 rounded-full bg-grey-150" />
        <span className="size-2.5 rounded-full bg-grey-150" />
        <span className="mx-auto rounded-full bg-white px-3 py-0.5 text-[10px] text-heading-6 ring-1 ring-grey-100">sunrise.{PLATFORM_HOST}</span>
      </div>
      <div className="flex">
        <aside className="hidden w-36 shrink-0 border-r border-grey-100 p-3 sm:block">
          <p className="mb-3 text-[13px] font-semibold tracking-tight text-brand-950">
            hostel<span className="text-brand-600">hub</span>
          </p>
          {nav.map(({ icon: Icon, label, active }) => (
            <p key={label} className={cn("mb-0.5 flex items-center gap-2 rounded-lg px-2 py-1.5 text-[10px]", active ? "bg-brand-50 font-medium text-brand-800" : "text-heading-5")}>
              <Icon className="size-3" /> {label}
            </p>
          ))}
        </aside>
        <div className="min-w-0 flex-1 bg-grey-10 p-3 sm:p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-heading-6">Good morning,</p>
              <p className="text-sm font-semibold text-grey-950">Mrs. Adeyemi</p>
            </div>
            <span className="relative flex size-7 items-center justify-center rounded-full bg-white ring-1 ring-grey-100">
              <Bell className="size-3.5 text-heading-5" />
              <span className="absolute top-1 right-1.5 size-1.5 rounded-full bg-rose-500" />
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Stat label="Occupied" value="92%" note="110 of 120" />
            <Stat label="Free rooms" value="10" note="Booking live" tone="text-brand-600" />
            <Stat label="Rent due" value="14" note="This month" tone="text-amber-600" />
            <Stat label="Collected" value="₦38.5m" note="This session" />
          </div>
          <div className="mt-3 rounded-xl bg-white p-3 ring-1 ring-grey-100">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold text-grey-950">Block A · rooms</p>
              <div className="flex gap-2 text-[8px] text-heading-6">
                <span className="flex items-center gap-1">
                  <i className="size-1.5 rounded-full bg-brand-500" /> Paid
                </span>
                <span className="flex items-center gap-1">
                  <i className="size-1.5 rounded-full bg-amber-400" /> Due soon
                </span>
                <span className="flex items-center gap-1">
                  <i className="size-1.5 rounded-full bg-rose-400" /> Late
                </span>
              </div>
            </div>
            <div className="grid grid-cols-10 gap-1">
              {GRID.map((t, i) => (
                <span key={i} className={cn("aspect-square rounded-[3px]", TILE[t])} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A phone with its screen; children are the screen. */
export function Phone({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-[2.4rem] bg-brand-950 p-2 shadow-[0_30px_70px_-15px_rgba(11,35,34,0.45)] ring-1 ring-white/10", className)} aria-hidden>
      <div className="relative overflow-hidden rounded-[1.9rem] bg-white">
        <span className="absolute top-2 left-1/2 z-10 h-4 w-16 -translate-x-1/2 rounded-full bg-brand-950" />
        {children}
      </div>
    </div>
  );
}

/** The student's booking page: pick a room, see the price, pay. */
export function BookingScreen() {
  const rooms: ("free" | "taken" | "pick" | "held")[] = ["taken", "free", "taken", "pick", "taken", "held", "taken", "free", "taken"];
  return (
    <div className="pb-4">
      <div className="bg-brand-900 px-4 pt-9 pb-5 text-white">
        <p className="text-[13px] font-semibold tracking-tight">
          hostel<span className="text-brand-300">hub</span>
        </p>
        <p className="mt-3 text-[15px] font-semibold">{DEMO_HOSTEL}</p>
        <p className="text-[10px] text-brand-100/80">₦350,000 per room · 2 people</p>
      </div>
      <div className="px-4 pt-4">
        <p className="text-[11px] font-semibold text-grey-950">Pick your room</p>
        <p className="text-[9px] text-heading-6">Block B · 3 free</p>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {rooms.map((r, i) => (
            <span
              key={i}
              className={cn(
                "flex h-9 flex-col items-center justify-center rounded-lg border text-[9px] font-semibold",
                r === "pick" && "border-brand-600 bg-brand-600 text-white",
                r === "free" && "border-brand-200 text-heading-2",
                r === "taken" && "border-grey-100 bg-grey-50 text-grey-400",
                r === "held" && "border-amber-200 bg-amber-50 text-amber-800",
              )}
            >
              B{i + 1}
              <span className="text-[7px] font-normal">{r === "pick" ? "Your pick" : r === "free" ? "Free" : r === "held" ? "On hold" : "Taken"}</span>
            </span>
          ))}
        </div>
        <div className="mt-3 rounded-xl bg-brand-50 px-3 py-2 text-[9px] text-brand-900">
          Room B4 · Standard (2 people) · <b>₦350,000</b>
        </div>
        <div className="mt-3 flex h-9 items-center justify-center rounded-xl bg-brand-600 text-[11px] font-semibold text-white">Pay securely</div>
        <p className="mt-2 text-center text-[8px] text-heading-6">Card, bank transfer or USSD</p>
      </div>
    </div>
  );
}

/** The tenant portal home: their room and how long is left. */
export function PortalScreen() {
  return (
    <div className="px-4 pt-9 pb-5">
      <p className="text-[10px] text-heading-6">Good evening,</p>
      <p className="text-[15px] font-semibold text-grey-950">Tolu</p>
      <div className="mt-3 rounded-2xl bg-brand-900 p-4 text-white">
        <p className="text-[8px] tracking-wider text-brand-200 uppercase">Your room</p>
        <p className="mt-1 text-2xl font-semibold">B4</p>
        <p className="text-[9px] text-brand-100/80">Paid until 30 Jun 2027</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15">
          <div className="h-full w-[72%] rounded-full bg-brand-300" />
        </div>
        <p className="mt-1.5 text-[8px] text-brand-100/80">243 days left</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[9px] font-medium text-heading-2">
        {[
          [Wrench, "Report a repair"],
          [ReceiptText, "My receipts"],
          [Wallet, "Renew rent"],
          [QrCode, "My tenant ID"],
        ].map(([Icon, label]) => {
          const I = Icon as typeof Wrench;
          return (
            <span key={label as string} className="flex items-center gap-1.5 rounded-xl bg-grey-50 px-2.5 py-2.5">
              <I className="size-3 text-brand-600" /> {label as string}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** The tenant ID card security scans at the gate. */
export function IdCardMock({ className }: { className?: string }) {
  return (
    <div className={cn("w-64 rounded-2xl bg-white p-4 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.5)]", className)} aria-hidden>
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-semibold tracking-tight text-brand-950">
          hostel<span className="text-brand-600">hub</span>
        </p>
        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[8px] font-semibold text-brand-800">TENANT</span>
      </div>
      <div className="mt-3 flex gap-3">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-lg font-semibold text-brand-800">TB</span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-grey-950">Tolu Bankole</p>
          <p className="text-[9px] text-heading-6">{DEMO_HOSTEL} · Room B4</p>
          <p className="text-[9px] text-heading-6">Valid to 30 Jun 2027</p>
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between">
        <p className="max-w-32 text-[8px] leading-snug text-heading-6">Security scans this to confirm the student lives here.</p>
        <QrCode className="size-14 text-brand-950" strokeWidth={1.25} />
      </div>
    </div>
  );
}
