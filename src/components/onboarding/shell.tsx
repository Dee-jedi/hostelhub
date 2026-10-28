"use client";

import { ArrowLeft, ArrowRight, CircleAlert, Loader2, Minus, Plus, Smartphone, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
 * The sign-up wizard's building blocks, shared by every part: one question per screen, large
 * controls that are easy to tap, and the same Back / Continue row everywhere.
 */

export const big =
  "block w-full rounded-2xl border border-grey-150 bg-white px-4 text-lg text-grey-950 placeholder:text-grey-400 outline-none transition-colors focus:border-brand-500 focus:ring-4 focus:ring-brand-100";

export function Question({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="motion-safe:animate-[rise_0.35s_ease-out]">
      <h1 className="text-[clamp(1.9rem,4vw,2.6rem)] leading-[1.08] font-bold tracking-[-0.03em] text-brand-950">{title}</h1>
      {hint && <p className="mt-3 text-lg leading-relaxed text-heading-5">{hint}</p>}
      <div className="mt-8 space-y-5">{children}</div>
    </div>
  );
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-[15px] font-medium text-heading-2">
      {children}
    </label>
  );
}

export function Problem({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-[15px] text-rose-700">
      <CircleAlert className="mt-0.5 size-4 shrink-0" /> {children}
    </p>
  );
}

/** Back (round) and the main button. The main button submits the screen's form. */
export function NavButtons({ onBack, busy, busyLabel = "Saving…", label = "Continue" }: { onBack: () => void; busy?: boolean; busyLabel?: string; label?: string }) {
  return (
    <>
      <div className="mt-10 flex items-center gap-3">
        <button type="button" onClick={onBack} aria-label="Back" className="flex size-14 shrink-0 items-center justify-center rounded-full text-brand-950 ring-1 ring-brand-200 hover:bg-white">
          <ArrowLeft className="size-5" />
        </button>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-brand-950 px-8 text-base font-semibold text-white shadow-[0_12px_30px_-12px_rgba(11,35,34,0.6)] hover:bg-brand-800 disabled:opacity-70 sm:flex-none"
        >
          {busy ? (
            <>
              <Loader2 className="size-5 animate-spin" /> {busyLabel}
            </>
          ) : (
            <>
              {label} <ArrowRight className="size-5 text-brand-300" />
            </>
          )}
        </button>
      </div>
      <p className="mt-4 hidden text-sm text-heading-6 sm:block">
        Press <kbd className="rounded-md bg-white px-1.5 py-0.5 font-sans text-xs ring-1 ring-grey-150">Enter</kbd> to continue
      </p>
    </>
  );
}

/** − 4 + : whole numbers between min and max, with large tap targets. */
export function Stepper({ value, onChange, min = 1, max = 99, label, suffix }: { value: number; onChange: (n: number) => void; min?: number; max?: number; label: string; suffix?: (n: number) => string }) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const btn = "flex size-11 items-center justify-center rounded-full text-brand-950 ring-1 ring-brand-200 transition-colors hover:bg-brand-50 disabled:opacity-35 disabled:hover:bg-transparent";
  return (
    <div className="flex items-center gap-3" role="group" aria-label={label}>
      <button type="button" className={btn} onClick={() => onChange(clamp(value - 1))} disabled={value <= min} aria-label={`Fewer: ${label}`}>
        <Minus className="size-4" />
      </button>
      <input
        inputMode="numeric"
        aria-label={label}
        className="h-11 w-16 rounded-xl border border-grey-150 bg-white text-center text-lg font-semibold tabular-nums outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
        value={value || ""}
        onChange={(e) => onChange(clamp(Number(e.target.value.replace(/\D/g, "")) || min))}
      />
      <button type="button" className={btn} onClick={() => onChange(clamp(value + 1))} disabled={value >= max} aria-label={`More: ${label}`}>
        <Plus className="size-4" />
      </button>
      {suffix && <span className="text-[15px] text-heading-5">{suffix(value)}</span>}
    </div>
  );
}

/** Two or three choices side by side, one picked. */
export function Choice<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-2xl bg-grey-50 p-1 ring-1 ring-grey-100">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("min-h-11 rounded-xl px-3 py-2 text-[15px] font-medium transition-all", value === o.value ? "bg-white text-brand-950 shadow-[0_2px_8px_-2px_rgba(11,35,34,0.2)]" : "text-heading-5 hover:text-heading-2")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** An on/off switch with its explanation beside it. */
export function Switch({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center gap-3 text-left">
      <span className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", checked ? "bg-brand-600" : "bg-grey-150")}>
        <span className={cn("absolute top-0.5 size-6 rounded-full bg-white shadow transition-all", checked ? "left-[22px]" : "left-0.5")} />
      </span>
      <span className="text-[15px] text-heading-2">{children}</span>
    </button>
  );
}

/** ₦ amount, digits only, shown with thousands separators. */
export function MoneyInput({ value, onChange, id, label, className }: { value: number; onChange: (n: number) => void; id?: string; label?: string; className?: string }) {
  return (
    <div className={cn("flex h-14 items-center rounded-2xl border border-grey-150 bg-white pl-4 transition-colors focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100", className)}>
      <span className="text-lg text-heading-6">₦</span>
      <input
        id={id}
        aria-label={label}
        inputMode="numeric"
        placeholder="0"
        className="h-full min-w-0 flex-1 rounded-r-2xl bg-transparent px-2 text-lg font-semibold tabular-nums text-grey-950 outline-none"
        value={value ? value.toLocaleString("en-NG") : ""}
        onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, "")) || 0)}
      />
    </div>
  );
}

/** Phones and tablets: a floating "Preview" button that slides the preview up. */
export function PreviewSheet({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = overflow;
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      {open && (
        <div className="fixed inset-0 z-30 flex flex-col bg-brand-950/40 backdrop-blur-sm motion-safe:animate-[fade-in_0.2s_ease-out]" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-label="Preview of your booking page"
            onClick={(e) => e.stopPropagation()}
            className="mt-auto max-h-[92dvh] overflow-y-auto rounded-t-[2rem] bg-[#f6f8f7] px-5 pt-3 pb-28 motion-safe:animate-[sheet-in_0.3s_ease-out]"
          >
            <span className="mx-auto mb-5 block h-1.5 w-12 rounded-full bg-grey-150" aria-hidden />
            {children}
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 inline-flex h-12 items-center gap-2 rounded-full bg-white pr-5 pl-2 text-[15px] font-semibold text-brand-950 shadow-[0_12px_30px_-10px_rgba(11,35,34,0.45)] ring-1 ring-black/5"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-brand-950 text-brand-300">{open ? <X className="size-4" /> : <Smartphone className="size-4" />}</span>
        {open ? "Close preview" : "Preview"}
      </button>
    </div>
  );
}
