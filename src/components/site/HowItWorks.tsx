"use client";

import { Check, Link2, Plus, QrCode } from "lucide-react";
import { useState } from "react";
import { PLATFORM_HOST } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { BookingScreen, DashboardMock, DASHBOARD_SIZE, DEMO_HOSTEL, Phone, PHONE_SIZE, Scaled } from "./Mockups";

const STEPS = [
  {
    title: "Tell us about your hostel",
    body: "Your hostel's name, your rooms and what each one costs. Plain questions, one at a time. Most hostels finish in an afternoon.",
  },
  {
    title: "Share your booking link",
    body: "You get your own address and a QR poster for the gate. Send the link to agents, post it on WhatsApp, print the poster.",
  },
  {
    title: "Tenants book and pay",
    body: "They pick a free room on a live map, fill their form and pay online. The rent goes straight to your bank, and the room is theirs.",
  },
  {
    title: "Run it from your dashboard",
    body: "Every room, every tenant and every payment in one place, on your phone or laptop. You see who owes before they forget.",
  },
];

const cardShadow = "shadow-[0_24px_60px_-20px_rgba(11,35,34,0.3)] ring-1 ring-black/5";

function SetupCard() {
  return (
    <div className={cn("w-full max-w-sm rounded-3xl bg-white p-6", cardShadow)}>
      <p className="text-xs font-medium text-brand-700">Step 3 of 8</p>
      <p className="mt-1 text-lg font-semibold text-grey-950">How many people share a room?</p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[2, 3, 4].map((n) => (
          <span key={n} className={cn("flex h-16 flex-col items-center justify-center rounded-2xl border text-sm font-semibold", n === 2 ? "border-brand-600 bg-brand-50 text-brand-800" : "border-grey-100 text-heading-4")}>
            {n}
            <span className="text-[11px] font-normal text-heading-6">people</span>
          </span>
        ))}
      </div>
      <p className="mt-5 text-sm font-medium text-grey-950">Rent per room, per session</p>
      <div className="mt-2 flex h-12 items-center rounded-2xl bg-grey-50 px-4 text-lg font-semibold tabular-nums text-grey-950">₦350,000</div>
      <div className="mt-5 flex h-11 items-center justify-center rounded-2xl bg-brand-950 text-sm font-semibold text-white">Continue</div>
    </div>
  );
}

function ShareCard() {
  return (
    <div className="w-full max-w-sm space-y-3">
      <div className={cn("flex items-center gap-3 rounded-2xl bg-white p-4", cardShadow)}>
        <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <Link2 className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-heading-6">Your booking page</p>
          <p className="truncate text-[15px] font-semibold text-grey-950">sunrise.{PLATFORM_HOST}</p>
        </div>
      </div>
      <div className="rounded-3xl bg-brand-950 p-6 text-center text-white shadow-[0_24px_60px_-20px_rgba(11,35,34,0.5)]">
        <p className="text-xs tracking-[0.2em] text-brand-300 uppercase">Rooms available</p>
        <p className="mt-2 text-2xl font-semibold">{DEMO_HOSTEL}</p>
        <div className="mx-auto mt-4 flex size-28 items-center justify-center rounded-2xl bg-white">
          <QrCode className="size-20 text-brand-950" strokeWidth={1.25} />
        </div>
        <p className="mt-4 text-sm text-brand-100/80">Scan to pick your room and pay</p>
      </div>
    </div>
  );
}

/** What each step looks like; `wide` is the desktop panel, otherwise the phone timeline. */
function Visual({ step, wide }: { step: number; wide: boolean }) {
  if (step === 0) return <SetupCard />;
  if (step === 1) return <ShareCard />;
  if (step === 2)
    return (
      <Scaled {...PHONE_SIZE} className={wide ? "[--s:0.78]" : "[--s:0.7]"}>
        <Phone>
          <BookingScreen />
        </Phone>
      </Scaled>
    );
  return (
    <Scaled {...DASHBOARD_SIZE} className={wide ? "[--s:0.5] xl:[--s:0.56]" : "[--s:0.27] sm:[--s:0.55]"}>
      <DashboardMock />
    </Scaled>
  );
}

/**
 * Desktop: four steps, picking one shows what it looks like beside them.
 * Phones: a timeline of the same steps; tap one to open its text and picture under it.
 */
export function HowItWorks() {
  const [step, setStep] = useState(0);
  const [openOnPhone, setOpenOnPhone] = useState<Set<number>>(() => new Set([0]));
  const togglePhone = (i: number) =>
    setOpenOnPhone((open) => {
      const next = new Set(open);
      if (!next.delete(i)) next.add(i);
      return next;
    });

  return (
    <>
      <ol className="space-y-3 lg:hidden">
        {STEPS.map((s, i) => {
          const open = openOnPhone.has(i);
          const last = i === STEPS.length - 1;
          return (
            <li key={s.title} className="relative pl-14">
              {/* The line joins this step's number to the next one's, so it ends at the last step */}
              {!last && <span className="absolute top-10 -bottom-3 left-[17px] w-px bg-brand-200" aria-hidden />}
              <span
                className={cn(
                  "absolute top-0.5 left-0 flex size-9 items-center justify-center rounded-full text-sm font-semibold transition-colors",
                  open ? "bg-brand-950 text-white" : "bg-white text-brand-900 ring-1 ring-brand-200",
                )}
              >
                {i + 1}
              </span>
              <button
                type="button"
                onClick={() => togglePhone(i)}
                aria-expanded={open}
                className="flex w-full items-center gap-3 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              >
                <h3 className="flex-1 text-xl font-semibold tracking-tight text-grey-950">{s.title}</h3>
                <Plus className={cn("size-5 shrink-0 text-brand-700 transition-transform", open && "rotate-45")} />
              </button>
              {/* Shown, not slid open: a clipping animation would cut off the pictures' shadows */}
              {open && (
                <div className="motion-safe:animate-[pop-in_0.3s_ease-out]">
                  <p className="mt-1 text-base leading-relaxed text-heading-5">{s.body}</p>
                  <div className="mt-5 flex justify-center pb-8">
                    <Visual step={i} wide={false} />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="hidden items-center gap-16 lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <ol className="space-y-2">
          {STEPS.map((s, i) => {
            const active = i === step;
            return (
              <li key={s.title}>
                <button
                  type="button"
                  onClick={() => setStep(i)}
                  aria-pressed={active}
                  className={cn(
                    "flex w-full gap-4 rounded-3xl p-5 text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
                    active ? "bg-white shadow-[0_16px_40px_-20px_rgba(11,35,34,0.25)] ring-1 ring-black/5" : "hover:bg-white/60",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors",
                      active ? "bg-brand-950 text-white" : i < step ? "bg-brand-100 text-brand-800" : "bg-grey-100 text-heading-5",
                    )}
                  >
                    {i < step ? <Check className="size-4" /> : i + 1}
                  </span>
                  <span>
                    <span className={cn("block text-lg font-semibold tracking-tight", active ? "text-grey-950" : "text-heading-4")}>{s.title}</span>
                    <span className={cn("grid transition-all duration-300", active ? "mt-1.5 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                      <span className="overflow-hidden text-[15px] leading-relaxed text-heading-5">{s.body}</span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="flex min-h-[500px] items-center justify-center rounded-[2rem] bg-[radial-gradient(circle_at_30%_20%,var(--color-brand-100),transparent_60%),radial-gradient(circle_at_80%_90%,var(--color-brand-50),transparent_55%)] p-10">
          <div key={step} className="flex w-full justify-center motion-safe:animate-[pop-in_0.35s_ease-out]">
            <Visual step={step} wide />
          </div>
        </div>
      </div>
    </>
  );
}
