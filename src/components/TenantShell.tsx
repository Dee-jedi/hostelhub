"use client";

import { BedDouble, Bell, ClipboardList, House, LogOut, UserRound, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { signOut, useSession } from "@/lib/auth";
import { auth } from "@/lib/firebase";
import { restartTenantSync, roomName, startTenantSync, unreadCount, useTenant } from "@/lib/tenant-store";
import type { Booking } from "@/lib/types";
import { cn, isOpenTicket } from "@/lib/utils";
import { BookingWaiting } from "./BookingWaiting";
import { Avatar } from "./ui";

const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/portal", label: "Home", icon: House },
  { href: "/portal/requests", label: "Requests", icon: ClipboardList },
  { href: "/portal/payments", label: "Payments", icon: Wallet },
  { href: "/portal/profile", label: "Profile", icon: UserRound },
];

const isActive = (pathname: string, href: string) => (href === "/portal" ? pathname === "/portal" : pathname.startsWith(href));

function Wordmark() {
  return (
    <Link href="/portal" className="inline-flex items-start text-[17px] leading-none font-semibold tracking-tight text-grey-950">
      hostel<span className="text-brand-600">hub</span>
    </Link>
  );
}

function Header({ withTabs }: { withTabs: boolean }) {
  const t = useTenant();
  const pathname = usePathname();
  const unread = unreadCount(t);
  const r = t.resident;
  return (
    <header className="sticky top-0 z-30 border-b border-grey-100 bg-white/95 backdrop-blur print:hidden">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Wordmark />
          {t.info && <span className="hidden truncate border-l border-grey-100 pl-3 text-sm text-heading-6 sm:block">{t.info.hostelName}</span>}
        </div>

        {withTabs && (
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Portal">
            {TABS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                  isActive(pathname, href) ? "bg-brand-50 text-brand-800" : "text-heading-6 hover:bg-grey-50 hover:text-grey-950",
                )}
              >
                <Icon className="size-4.5" strokeWidth={1.7} /> {label}
              </Link>
            ))}
          </nav>
        )}

        <div className="flex flex-1 items-center justify-end gap-3">
          {withTabs && (
            <Link
              href="/portal/notifications"
              aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
              className={cn(
                "relative flex size-9 items-center justify-center rounded-full transition-colors hover:bg-grey-50",
                pathname === "/portal/notifications" ? "text-brand-600" : "text-heading-5",
              )}
            >
              <Bell className="size-5" strokeWidth={1.7} />
              {unread > 0 && (
                <span className="absolute top-0.5 right-0.5 flex min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] leading-4 font-semibold text-white ring-2 ring-white">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
          )}
          {r ? (
            <Link href="/portal/profile" aria-label="Your profile" className="rounded-full ring-offset-2 transition hover:ring-2 hover:ring-brand-200">
              <Avatar name={r.fullName} src={r.photoUrl} size="sm" />
            </Link>
          ) : (
            <button onClick={() => signOut()} className="inline-flex items-center gap-1.5 text-sm font-medium text-heading-5 hover:text-heading-2">
              <LogOut className="size-4" /> Sign out
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function BottomTabs() {
  const pathname = usePathname();
  const t = useTenant();
  const openRequests = t.requests.filter(isOpenTicket).length;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-grey-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden print:hidden" aria-label="Portal">
      <div className="mx-auto grid h-16 max-w-lg grid-cols-4">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          const badge = href === "/portal/requests" ? openRequests : 0;
          return (
            <Link key={href} href={href} className={cn("flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors", active ? "text-brand-700" : "text-heading-6")}>
              <span className={cn("relative flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-brand-50")}>
                <Icon className="size-5" strokeWidth={active ? 2 : 1.6} />
                {badge > 0 && (
                  <span className="absolute -top-1 right-0.5 min-w-4 rounded-full bg-brand-600 px-1 text-center text-[10px] leading-4 font-semibold text-white">{badge}</span>
                )}
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex min-h-[60dvh] items-center justify-center px-4 text-sm text-heading-6">{children}</div>;
}

type Check = "checking" | "processing" | "not_paid" | "received" | "error";

/** Bookings whose access was already refreshed; a paid booking that still shows no room (moved out) isn't re-checked. */
const refreshed = new Set<string>();

/**
 * Asks Paystack (through the server) what became of a booking that hasn't placed this person yet.
 * A paid one is completed on the spot, which also restores portal access if granting it failed.
 */
function useBookingCheck(booking: Booking | null) {
  const [check, setCheck] = useState<Check>("checking");
  const [attempt, setAttempt] = useState(0);
  const reference = booking && (booking.status === "pending" || booking.status === "paid") && !refreshed.has(booking.id) ? booking.id : null;

  useEffect(() => {
    if (!reference) return;
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- show the spinner for each new check
    setCheck("checking");
    (async () => {
      const res = await fetch("/api/bookings/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await auth.currentUser?.getIdToken()}` },
        body: JSON.stringify({ reference }),
      });
      const r = (await res.json()) as { status?: string; payment?: string };
      if (!live) return;
      if (!res.ok) return setCheck("error");
      if (r.status === "paid" || r.status === "resolved") {
        // Access was just granted: refresh the login so the portal can read the new records
        refreshed.add(reference);
        await auth.currentUser?.getIdToken(true);
        return restartTenantSync();
      }
      setCheck(r.status === "needs_attention" ? "received" : r.payment === "processing" ? "processing" : "not_paid");
    })().catch(() => live && setCheck("error"));
    return () => {
      live = false;
    };
  }, [reference, attempt]);

  return { check: reference ? check : null, again: () => setAttempt((n) => n + 1) };
}

function NoRoom({ booking, managerPhone }: { booking: Booking | null; managerPhone?: string }) {
  const t = useTenant();
  const { check, again } = useBookingCheck(booking);
  const status = booking?.status === "needs_attention" ? "received" : check;

  if (status === "checking") {
    return (
      <Centered>
        <span className="flex items-center gap-3">
          <span className="size-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" /> Checking your payment…
        </span>
      </Centered>
    );
  }
  if (status === "received" || status === "processing") {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <BookingWaiting kind={status} reference={booking?.id} managerPhone={managerPhone}>
          {status === "processing" && (
            <div>
              <button onClick={again} className="mt-6 text-sm font-medium text-brand-700 hover:underline">
                Check again
              </button>
            </div>
          )}
        </BookingWaiting>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        <BedDouble className="size-8" strokeWidth={1.5} />
      </span>
      <h1 className="mt-5 text-xl font-semibold text-grey-950">You don&apos;t have a room yet</h1>
      <p className="mt-2 text-sm text-heading-6">
        {status === "error"
          ? "We couldn't check your last payment just now. If you were debited, don't pay again: try again in a minute."
          : status === "not_paid"
            ? `You started booking room ${roomName(t, booking!.roomId)} but the payment wasn't completed. No money was taken.`
            : "Book a room and pay online. You'll be added automatically."}
      </p>
      {status === "error" ? (
        <button onClick={again} className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-brand-600 px-5 text-sm font-medium text-white hover:bg-brand-700">
          Try again
        </button>
      ) : (
        <Link href="/book" className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-brand-600 px-5 text-sm font-medium text-white hover:bg-brand-700">
          Book a room
        </Link>
      )}
    </div>
  );
}

/** Frame for every tenant portal page: login check, live data, header with bell, and tabs. */
export function TenantShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, role } = useSession();
  const t = useTenant();

  useEffect(() => {
    if (user === null) router.replace("/login?next=/portal");
    else if (role === "admin") router.replace("/");
    else if (user && role === "tenant") startTenantSync(user.uid);
  }, [user, role, router]);

  // If the login itself never comes back, the data watchdog never starts; report that too
  useEffect(() => {
    if (user !== undefined) return;
    const timer = setTimeout(() => console.error("[portal] login state still not restored after 15s"), 15_000);
    return () => clearTimeout(timer);
  }, [user]);

  const housed = t.status === "ready" && t.resident?.status === "active";

  return (
    <div className="min-h-dvh bg-grey-10 print:bg-white">
      <Header withTabs={housed} />
      {t.status === "error" ? (
        <Centered>
          <div className="text-center">
            <p>Couldn&apos;t load your portal. Check your connection.</p>
            <button onClick={restartTenantSync} className="mt-2 font-medium text-brand-700 hover:underline">
              Try again
            </button>
          </div>
        </Centered>
      ) : t.status !== "ready" ? (
        <Centered>
          <span className="flex items-center gap-3">
            <span className="size-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" /> Loading your portal…
          </span>
        </Centered>
      ) : !housed ? (
        <NoRoom booking={t.booking} managerPhone={t.info?.managerPhone} />
      ) : (
        <>
          <main className="mx-auto max-w-3xl px-4 pt-5 pb-28 sm:px-6 lg:pb-12">{children}</main>
          <BottomTabs />
        </>
      )}
    </div>
  );
}
