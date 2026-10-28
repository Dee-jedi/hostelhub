import {
  BedDouble,
  Bell,
  CalendarClock,
  ClipboardList,
  DoorOpen,
  House,
  MessageSquareText,
  Plus,
  QrCode,
  ReceiptText,
  Search,
  TriangleAlert,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
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

/** A framed card like the app's Panel: grey frame with a title row, white body inside. */
function Frame({ title, note, icon: Icon, iconTone, link, children, className }: { title: string; note?: string; icon?: typeof Bell; iconTone?: string; link?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-[14px] border border-frame-border bg-frame p-1", className)}>
      <div className="flex items-start justify-between px-2.5 pt-1.5 pb-2">
        <div>
          <p className="text-[12px] font-medium text-heading-2">{title}</p>
          {note && <p className="text-[9.5px] text-heading-6">{note}</p>}
        </div>
        {Icon && (
          <span className={cn("flex size-[18px] items-center justify-center rounded-md", iconTone)}>
            <Icon className="size-3" />
          </span>
        )}
        {link && <span className="text-[11px] font-medium text-brand-700">{link}</span>}
      </div>
      <div className="rounded-[10px] bg-white ring-1 ring-frame-border">{children}</div>
    </div>
  );
}

const DUE = [
  ["KA", "Kelechi Anyanwu", "B8", "Expired 34 days ago", "bg-brand-50 text-brand-700"],
  ["AA", "Ayo Adeyemi", "F1", "Expired 31 days ago", "bg-emerald-50 text-emerald-700"],
  ["NA", "Ngozi Adebayo", "D9", "Expired 27 days ago", "bg-amber-50 text-amber-700"],
  ["EC", "Emeka Chukwu", "A8", "Expired 26 days ago", "bg-sky-50 text-sky-700"],
];

export const DASHBOARD_SIZE = { w: 980, h: 590 };

/** The manager's home screen as the app draws it (sidebar, stats, rent due, rent status), at 980×590. */
export function DashboardMock() {
  const nav: [typeof Bell, string, string?][] = [
    [House, "Home"],
    [BedDouble, "Rooms"],
    [Users, "Residents"],
    [CalendarClock, "Rent & Renewals", "26"],
    [Wallet, "Payments"],
  ];
  const manage: [typeof Bell, string, string?][] = [
    [MessageSquareText, "Messages"],
    [ClipboardList, "Bookings"],
    [Wrench, "Requests", "4"],
  ];
  const navRow = ([Icon, label, badge]: [typeof Bell, string, string?], i: number, active = false) => (
    <p key={label} className={cn("mb-1 flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[12px]", active ? "bg-brand-50 font-medium text-brand-800 ring-1 ring-brand-200" : "text-heading-4")}>
      <Icon className="size-3.5" strokeWidth={1.6} /> <span className="flex-1">{label}</span>
      {badge && <span className={cn("rounded-full px-1.5 text-[9px] font-semibold", i === 3 ? "bg-amber-100 text-amber-800" : "bg-grey-100 text-heading-5")}>{badge}</span>}
    </p>
  );
  return (
    <div className="flex h-[590px] w-[980px] overflow-hidden rounded-2xl bg-white shadow-[0_30px_80px_-20px_rgba(11,35,34,0.35)] ring-1 ring-black/10">
      <aside className="flex w-[190px] shrink-0 flex-col border-r border-grey-100">
        <p className="flex h-12 items-center border-b border-grey-100 px-4 text-[16px] font-semibold tracking-tight text-grey-950">
          hostel<span className="text-brand-600">hub</span>
        </p>
        <div className="border-b border-grey-100 p-3">{nav.map((n, i) => navRow(n, i, i === 0))}</div>
        <div className="p-3">
          <p className="mb-1.5 px-2.5 text-[9px] font-medium tracking-wide text-heading-6">MANAGE</p>
          {manage.map((n, i) => navRow(n, i))}
        </div>
        <div className="mt-auto p-3">
          <div className="flex items-center gap-2 rounded-xl p-2 ring-1 ring-grey-100">
            <span className="flex size-7 items-center justify-center rounded-full bg-grey-950 text-[10px] font-semibold text-white">A</span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-grey-950">Mrs. Adeyemi</p>
              <p className="text-[9px] text-heading-6">Profile & settings</p>
            </div>
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 items-center gap-4 border-b border-grey-100 px-5">
          <p className="w-24 text-[13px] text-heading-5">Home</p>
          <p className="flex h-7 flex-1 items-center gap-2 rounded-full bg-frame px-3 text-[10px] text-heading-6 ring-1 ring-frame-border">
            <Search className="size-3" /> Search residents, rooms, phone numbers…
          </p>
          <span className="relative">
            <Bell className="size-4 text-heading-5" />
            <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-rose-500" />
          </span>
        </div>
        <div className="min-h-0 flex-1 p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[16px] font-semibold text-grey-950">Welcome, Mrs. Adeyemi!</p>
              <p className="text-[11px] text-heading-6">Here&apos;s what&apos;s happening at {DEMO_HOSTEL} today.</p>
            </div>
            <div className="flex gap-2">
              <span className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11px] font-medium text-heading-2 ring-1 ring-grey-150">
                <Bell className="size-3" /> Run reminders
              </span>
              <span className="flex h-8 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-[11px] font-medium text-white">
                <Plus className="size-3" /> Add tenant
              </span>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2.5">
            {(
              [
                ["Room occupancy", "93%", "110 of 118 rooms let", BedDouble, "bg-brand-100 text-brand-700"],
                ["Vacant rooms", "8", "2 under maintenance", DoorOpen, "bg-sky-100 text-sky-700"],
                ["Expiring this month", "2", "12 due in the next 30 days", CalendarClock, "bg-amber-100 text-amber-700"],
                ["Expired rent", "14", "₦4,900,000 outstanding", TriangleAlert, "bg-rose-100 text-rose-600"],
              ] as const
            ).map(([title, value, note, icon, tone]) => (
              <Frame key={title} title={title} icon={icon} iconTone={tone}>
                <div className="px-3 pt-4 pb-3">
                  <p className="text-[22px] leading-none font-medium text-grey-950 tabular-nums">{value}</p>
                  <p className="mt-2 text-[9.5px] text-heading-5">{note}</p>
                </div>
              </Frame>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-[1.6fr_1fr] gap-2.5">
            <Frame title="Rent due & overdue" note="Expired first, then by expiry date" link="View all">
              {DUE.map(([initials, name, room, when, tone]) => (
                <div key={name} className="flex items-center gap-2.5 border-b border-grey-100 px-3 py-2 last:border-0">
                  <span className={cn("flex size-6 items-center justify-center rounded-full text-[8px] font-semibold", tone)}>{initials}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-grey-950">{name}</p>
                    <p className="text-[9px] text-heading-6">Room {room}</p>
                  </div>
                  <p className="text-[9.5px] text-heading-6">{when}</p>
                  <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[9px] font-medium text-rose-600 ring-1 ring-rose-200">Expired</span>
                </div>
              ))}
            </Frame>
            <div className="space-y-2.5">
              <Frame title="Rent status" note="110 rooms let">
                <div className="p-3">
                  <div className="flex h-2 overflow-hidden rounded-full">
                    <span className="w-[76%] bg-emerald-500" />
                    <span className="w-[11%] bg-amber-400" />
                    <span className="flex-1 bg-rose-500" />
                  </div>
                  {(
                    [
                      ["Paid up", "84", "bg-emerald-500"],
                      ["Expiring within 30 days", "12", "bg-amber-400"],
                      ["Expired", "14", "bg-rose-500"],
                    ] as const
                  ).map(([label, n, dot]) => (
                    <p key={label} className="mt-2 flex items-center gap-2 text-[10.5px] text-heading-4">
                      <i className={cn("size-1.5 rounded-full", dot)} /> <span className="flex-1">{label}</span> <b className="font-medium text-grey-950">{n}</b>
                    </p>
                  ))}
                </div>
              </Frame>
              <Frame title="Needs attention">
                {(
                  [
                    [ClipboardList, "New online bookings", "3", "bg-brand-50 text-brand-700 ring-brand-200"],
                    [Wrench, "Open tenant requests", "4", "bg-amber-50 text-amber-700 ring-amber-200"],
                  ] as const
                ).map(([Icon, label, n, tone]) => (
                  <p key={label} className="flex items-center gap-2 border-b border-grey-100 px-3 py-2 text-[10.5px] text-heading-2 last:border-0">
                    <Icon className="size-3 text-heading-5" /> <span className="flex-1">{label}</span>
                    <span className={cn("rounded-md px-1.5 text-[9px] font-medium ring-1", tone)}>{n}</span>
                  </p>
                ))}
              </Frame>
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
