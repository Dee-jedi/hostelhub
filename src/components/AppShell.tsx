"use client";

import {
  AlertTriangle,
  BedDouble,
  Bell,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  DoorOpen,
  ExternalLink,
  House,
  Menu,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useHostel, useIsClient } from "@/lib/store";
import { openResident, openRoom, setMobileNav, toggleSidebar, useUI } from "@/lib/ui-store";
import { activeResidents, cn, daysLeft, formatDateTime, initials, rentStatus, tenantsByRoom } from "@/lib/utils";
import { ResidentDrawer } from "./ResidentDrawer";

// ─── Nav config ──────────────────────────────────────────────────────────────

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  count?: number;
  countTone?: "amber" | "brand" | "grey";
}

function useNavGroups() {
  const s = useHostel();
  const pending = s.applications.filter((a) => a.status === "pending").length;
  const openTickets = s.tickets.filter((t) => t.status !== "resolved").length;
  const dueRent = activeResidents(s).filter((r) => rentStatus(r) !== "active").length;
  const main: NavItem[] = [
    { href: "/", label: "Home", icon: House },
    { href: "/rooms", label: "Rooms", icon: BedDouble },
    { href: "/residents", label: "Residents", icon: Users },
    { href: "/renewals", label: "Rent & Renewals", icon: CalendarClock, count: dueRent, countTone: "amber" },
    { href: "/payments", label: "Payments", icon: Wallet },
  ];
  const manage: NavItem[] = [
    { href: "/messages", label: "Messages", icon: MessageSquareText },
    { href: "/applications", label: "Applications", icon: ClipboardList, count: pending, countTone: "brand" },
    { href: "/maintenance", label: "Maintenance", icon: Wrench, count: openTickets, countTone: "grey" },
  ];
  return { main, manage };
}

const ALL_PAGES: Record<string, string> = {
  "/rooms": "Rooms",
  "/residents": "Residents",
  "/renewals": "Rent & Renewals",
  "/payments": "Payments",
  "/messages": "Messages",
  "/applications": "Applications",
  "/maintenance": "Maintenance",
  "/settings": "Settings",
};

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

const navRow = (active: boolean) =>
  cn(
    "flex min-h-10 w-full items-center gap-2 rounded-xl border p-2.5 text-sm font-medium transition-colors",
    active ? "border-brand-200 bg-brand-50 text-brand-800" : "border-transparent text-heading-6 hover:bg-grey-50 hover:text-grey-950",
  );

// ─── Brand ───────────────────────────────────────────────────────────────────

function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-start text-[19px] leading-none font-semibold tracking-tight text-grey-950", className)}>
      hostel<span className="text-brand-600">hub</span>
      <span className="ml-0.5 rounded-[3px] bg-brand-50 px-[3px] py-px text-[8px] font-semibold text-brand-600">NG</span>
    </span>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function CountPill({ item }: { item: NavItem }) {
  if (!item.count) return null;
  return (
    <span
      className={cn(
        "rounded-md px-1.5 py-px text-[11px] font-semibold tabular-nums",
        item.countTone === "amber" ? "bg-amber-100 text-amber-800" : item.countTone === "brand" ? "bg-brand-600 text-white" : "bg-grey-100 text-heading-5",
      )}
    >
      {item.count}
    </span>
  );
}

function NavBody({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { main, manage } = useNavGroups();
  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    return (
      <div key={item.href} className="px-4">
        <Link href={item.href} onClick={onNavigate} className={navRow(isActive(pathname, item.href))}>
          <Icon className={cn("size-5 shrink-0", isActive(pathname, item.href) && "text-brand-600")} strokeWidth={1.6} />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          <CountPill item={item} />
        </Link>
      </div>
    );
  };
  return (
    <div className="flex w-full flex-col gap-6 py-5">
      <div className="flex flex-col gap-1">{main.map(renderItem)}</div>
      <div className="flex flex-col gap-3 border-t border-grey-100 pt-4">
        <span className="px-6 text-[10px] font-medium tracking-wide text-heading-6">MANAGE</span>
        <div className="flex flex-col gap-1">{manage.map(renderItem)}</div>
      </div>
    </div>
  );
}

function SidebarBottom({ onNavigate }: { onNavigate?: () => void }) {
  const s = useHostel();
  const pathname = usePathname();
  return (
    <div className="mt-auto flex w-full flex-col py-4">
      <div className="w-full border-t border-grey-100 px-4 py-5">
        <Link
          href="/settings"
          onClick={onNavigate}
          className="flex w-full items-center gap-2.5 rounded-xl border border-grey-100 bg-white p-3 transition-colors hover:bg-grey-50"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-grey-950 text-xs font-semibold text-white">
            {initials(s.settings.managerName.replace(/^(Mr|Mrs|Ms|Miss|Dr)\.?\s+/i, ""))}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium text-grey-950">{s.settings.managerName}</span>
            <span className="truncate text-xs text-heading-6">{s.settings.hostelName}</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-heading-6" strokeWidth={1.6} />
        </Link>
      </div>
      <div className="w-full border-t border-grey-100 px-4 py-2">
        <Link href="/settings" onClick={onNavigate} className={navRow(pathname === "/settings")}>
          <Settings className="size-5 shrink-0" strokeWidth={1.6} />
          Settings
        </Link>
      </div>
      <div className="w-full border-t border-grey-100 px-4 py-2">
        <Link href="/register" target="_blank" onClick={onNavigate} className={navRow(false)}>
          <DoorOpen className="size-5 shrink-0" strokeWidth={1.6} />
          <span className="flex-1">Registration form</span>
          <ExternalLink className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}

function CollapsedStrip() {
  const pathname = usePathname();
  const { main, manage } = useNavGroups();
  const s = useHostel();
  const icon = (item: NavItem) => {
    const Icon = item.icon;
    const active = isActive(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        title={item.label}
        className={cn(
          "relative flex h-10 items-center justify-center rounded-xl border transition-colors",
          active ? "border-brand-200 bg-brand-50 text-brand-600" : "border-transparent text-heading-6 hover:bg-grey-50 hover:text-grey-950",
        )}
      >
        <Icon className="size-5" strokeWidth={1.6} />
        {!!item.count && <span className={cn("absolute top-1.5 right-2 size-2 rounded-full border-[1.5px] border-white", item.countTone === "amber" ? "bg-amber-400" : "bg-brand-600")} />}
      </Link>
    );
  };
  return (
    <div className="flex flex-1 flex-col justify-between overflow-hidden">
      <div className="flex flex-col gap-1 px-2 py-5">
        {main.map(icon)}
        <div className="my-2 border-t border-grey-100" />
        {manage.map(icon)}
      </div>
      <div className="flex flex-col items-center">
        <div className="flex w-full justify-center border-t border-grey-100 py-5">
          <Link href="/settings" title={s.settings.managerName} className="flex size-9 items-center justify-center rounded-full bg-grey-950 text-xs font-semibold text-white">
            {initials(s.settings.managerName.replace(/^(Mr|Mrs|Ms|Miss|Dr)\.?\s+/i, ""))}
          </Link>
        </div>
        <div className="flex w-full justify-center border-t border-grey-100 py-2 pb-4">
          {icon({ href: "/settings", label: "Settings", icon: Settings })}
        </div>
      </div>
    </div>
  );
}

function Sidebar() {
  const { sidebarCollapsed: collapsed, mobileNavOpen } = useUI();
  return (
    <>
      <aside
        className={cn(
          "hidden h-full shrink-0 flex-col overflow-hidden border-r border-grey-100 transition-[width] duration-200 lg:flex print:hidden",
          collapsed ? "w-15 bg-grey-10" : "w-64 bg-white",
        )}
      >
        <div className={cn("group flex h-15.25 shrink-0 items-center border-b border-grey-100 bg-white", collapsed ? "justify-center" : "justify-between pr-3 pl-6")}>
          {!collapsed && (
            <Link href="/" aria-label="HostelHub home">
              <Wordmark />
            </Link>
          )}
          <button
            onClick={toggleSidebar}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn("rounded-lg p-1.5 text-heading-4 transition-all hover:bg-grey-50", !collapsed && "opacity-0 group-hover:opacity-100 focus:opacity-100")}
          >
            {collapsed ? <PanelLeftOpen className="size-4.5" strokeWidth={1.6} /> : <PanelLeftClose className="size-4.5" strokeWidth={1.6} />}
          </button>
        </div>
        {collapsed ? (
          <CollapsedStrip />
        ) : (
          <div className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto">
            <NavBody />
            <SidebarBottom />
          </div>
        )}
      </aside>

      {/* Mobile drawer */}
      <div className="lg:hidden">
        {mobileNavOpen && <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs" onClick={() => setMobileNav(false)} />}
        <div
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-72 flex-col overflow-hidden border-r border-grey-100 bg-white shadow-2xl transition-transform duration-300 ease-out",
            mobileNavOpen ? "translate-x-0" : "pointer-events-none -translate-x-full",
          )}
        >
          <div className="flex h-14 shrink-0 items-center border-b border-grey-100 px-6">
            <Link href="/" onClick={() => setMobileNav(false)}>
              <Wordmark />
            </Link>
          </div>
          <div className="flex flex-1 flex-col overflow-y-auto">
            <NavBody onNavigate={() => setMobileNav(false)} />
            <SidebarBottom onNavigate={() => setMobileNav(false)} />
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Top bar ─────────────────────────────────────────────────────────────────

function Breadcrumbs() {
  const pathname = usePathname();
  if (pathname === "/") return <span className="text-base font-medium whitespace-nowrap text-heading-6">Home</span>;
  const label = ALL_PAGES[Object.keys(ALL_PAGES).find((k) => pathname.startsWith(k)) ?? ""] ?? "Page";
  return (
    <div className="flex items-center gap-0.5">
      <Link href="/" className="text-sm whitespace-nowrap text-heading-6 transition-colors hover:text-heading-4">
        Home
      </Link>
      <ChevronRight className="size-3 text-heading-6" />
      <span className="text-sm whitespace-nowrap text-heading-2">{label}</span>
    </div>
  );
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, open, close]);
}

function GlobalSearch() {
  const s = useHostel();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  useClickOutside(wrapRef, open, () => setOpen(false));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return { residents: [], rooms: [] };
    const tenants = tenantsByRoom(s);
    return {
      residents: s.residents
        .filter((r) => [r.fullName, r.phone, r.matricNo, r.roomId ?? ""].some((v) => v.toLowerCase().includes(term)))
        .slice(0, 6),
      rooms: s.rooms
        .filter((r) => r.id.toLowerCase().startsWith(term))
        .slice(0, 4)
        .map((r) => ({ room: r, tenant: tenants.get(r.id) })),
    };
  }, [q, s]);

  const close = () => {
    setOpen(false);
    setQ("");
    inputRef.current?.blur();
  };
  const hasResults = results.residents.length + results.rooms.length > 0;

  return (
    <div ref={wrapRef} className="relative w-full">
      <div className="flex w-full items-center gap-2 rounded-full border border-frame-border bg-frame px-3.5 py-2 transition-colors focus-within:border-brand-400 focus-within:bg-white focus-within:ring-3 focus-within:ring-brand-100">
        <Search className="size-4 shrink-0 text-heading-6" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => e.key === "Escape" && close()}
          placeholder="Search residents, rooms, phone numbers…"
          className="min-w-0 flex-1 bg-transparent text-xs text-heading-2 outline-none placeholder:text-heading-6"
        />
      </div>
      {open && q.trim() && (
        <div className="absolute inset-x-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-2xl border border-grey-100 bg-white p-1.5 shadow-[0_10px_40px_rgba(0,0,0,0.08)] animate-[pop-in_.12s_ease-out]">
          {!hasResults && <p className="px-3 py-6 text-center text-xs text-heading-6">No matches for “{q}”</p>}
          {results.rooms.length > 0 && (
            <>
              <p className="px-2.5 pt-1.5 pb-1 text-[10px] font-medium tracking-wide text-heading-6">ROOMS</p>
              {results.rooms.map(({ room, tenant }) => (
                <button
                  key={room.id}
                  onClick={() => {
                    router.push("/rooms");
                    openRoom(room.id);
                    close();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-grey-50"
                >
                  <BedDouble className="size-4 text-heading-6" />
                  <span className="flex-1 text-sm font-medium text-heading-2">Room {room.id}</span>
                  <span className="text-xs text-heading-6">
                    {room.underMaintenance ? "Maintenance" : tenant ? tenant.fullName : "Vacant"}
                  </span>
                </button>
              ))}
            </>
          )}
          {results.residents.length > 0 && (
            <>
              <p className="px-2.5 pt-1.5 pb-1 text-[10px] font-medium tracking-wide text-heading-6">RESIDENTS</p>
              {results.residents.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    openResident(r.id);
                    close();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-grey-50"
                >
                  <span className="flex size-7 items-center justify-center rounded-full bg-grey-100 text-[10px] font-medium text-heading-4">{initials(r.fullName)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-heading-2">{r.fullName}</span>
                    <span className="block truncate text-xs text-heading-6">
                      {r.roomId ? `Room ${r.roomId}` : "Moved out"} · {r.phone}
                    </span>
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface Notice {
  id: string;
  icon: ReactNode;
  tone: string;
  title: string;
  detail: string;
  href: string;
}

function useNotifications(): Notice[] {
  const s = useHostel();
  return useMemo(() => {
    const list: Notice[] = [];
    const residents = activeResidents(s);
    const expired = residents.filter((r) => rentStatus(r) === "expired");
    const week = residents.filter((r) => {
      const d = daysLeft(r);
      return d >= 0 && d <= 7;
    });
    const pending = s.applications.filter((a) => a.status === "pending");
    const tickets = s.tickets.filter((t) => t.status === "open");

    for (const a of pending.slice(0, 3))
      list.push({
        id: a.id,
        icon: <ClipboardList className="size-4" />,
        tone: "bg-brand-50 text-brand-600",
        title: `${a.fullName} applied for a room`,
        detail: `${a.department} · ${formatDateTime(a.submittedAt)}`,
        href: "/applications",
      });
    if (week.length)
      list.push({
        id: "week",
        icon: <CalendarClock className="size-4" />,
        tone: "bg-amber-50 text-amber-600",
        title: `${week.length} rent${week.length === 1 ? "" : "s"} expire within 7 days`,
        detail: "Send a reminder before they lapse",
        href: "/renewals",
      });
    if (expired.length)
      list.push({
        id: "expired",
        icon: <AlertTriangle className="size-4" />,
        tone: "bg-rose-50 text-rose-600",
        title: `${expired.length} resident${expired.length === 1 ? " has" : "s have"} expired rent`,
        detail: "Renew or issue move-out notices",
        href: "/renewals",
      });
    if (tickets.length)
      list.push({
        id: "tickets",
        icon: <Wrench className="size-4" />,
        tone: "bg-grey-50 text-heading-4",
        title: `${tickets.length} open maintenance request${tickets.length === 1 ? "" : "s"}`,
        detail: tickets[0].title,
        href: "/maintenance",
      });
    return list;
  }, [s]);
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const notices = useNotifications();
  useClickOutside(ref, open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} aria-label="Notifications" className="relative flex items-center text-heading-6 transition-colors hover:text-heading-4">
        <Bell className="size-5" strokeWidth={1.6} />
        {notices.length > 0 && <span className="pointer-events-none absolute -top-0.5 right-0 size-2 rounded-full border-[1.5px] border-white bg-red-500" />}
      </button>
      {open && (
        <div className="absolute top-[calc(100%+14px)] right-0 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-grey-100 bg-white shadow-[0_10px_40px_rgba(0,0,0,0.08)] animate-[pop-in_.12s_ease-out]">
          <div className="flex items-center justify-between border-b border-grey-100 px-4 py-3">
            <span className="text-sm font-medium text-heading-2">Notifications</span>
            <span className="rounded-md bg-grey-50 px-1.5 text-[11px] font-medium text-heading-6">{notices.length}</span>
          </div>
          {notices.length === 0 ? (
            <p className="px-4 py-10 text-center text-xs text-heading-6">You&apos;re all caught up.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-grey-100 overflow-y-auto">
              {notices.map((n) => (
                <li key={n.id}>
                  <Link href={n.href} onClick={() => setOpen(false)} className="flex gap-3 px-4 py-3 hover:bg-grey-10">
                    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", n.tone)}>{n.icon}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-heading-2">{n.title}</span>
                      <span className="block truncate text-xs text-heading-6">{n.detail}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-grey-100 bg-white px-4 lg:h-15.25 lg:px-5 print:hidden">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="flex items-center gap-4 lg:hidden">
          <button onClick={() => setMobileNav(true)} className="text-grey-950 hover:text-heading-4" aria-label="Open navigation menu">
            <Menu className="size-5" />
          </button>
          <Link href="/">
            <Wordmark className="text-[17px]" />
          </Link>
        </div>
        <div className="hidden min-w-0 flex-1 items-center lg:flex">
          <Breadcrumbs />
        </div>
      </div>
      <div className="hidden max-w-90 flex-1 items-center md:flex">
        <GlobalSearch />
      </div>
      <div className="flex flex-1 items-center justify-end gap-4 px-2">
        <NotificationBell />
        <div className="h-6 w-px shrink-0 bg-grey-100" />
        <Link href="/messages" aria-label="Messages" className="text-heading-6 transition-colors hover:text-heading-4">
          <MessageSquareText className="size-5" strokeWidth={1.6} />
        </Link>
      </div>
    </header>
  );
}

// ─── Shell ───────────────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-grey-10">
      <div className="flex items-center gap-3 text-sm text-heading-6">
        <span className="size-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        Loading hostel data…
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const isClient = useIsClient();
  const { residentId } = useUI();

  // All data lives in the browser for the demo, so render pages only on the client.
  if (!isClient) return <LoadingScreen />;

  return (
    <div className="flex h-screen overflow-hidden bg-grey-10">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-4 lg:p-5">{children}</main>
      </div>
      {residentId && <ResidentDrawer residentId={residentId} onClose={() => openResident(null)} />}
    </div>
  );
}
