"use client";

import { ChevronLeft, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { subPageOf } from "@/lib/nav";
import type { Resident } from "@/lib/types";
import { cn, daysLeft, describeDaysLeft, initials, rentStatus } from "@/lib/utils";

// ---------------------------------------------------------------- Button

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "success";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-btn-primary",
  secondary: "bg-white text-heading-4 border border-grey-150 hover:bg-grey-50",
  outline: "bg-white text-brand-700 border border-brand-600 hover:bg-brand-50",
  ghost: "text-heading-6 hover:bg-grey-50 hover:text-heading-2",
  danger: "bg-rose-600 text-white hover:bg-rose-700 shadow-btn-primary",
  success: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-btn-primary",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return (
    <button
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 [&_svg]:shrink-0",
        size === "sm" ? "h-8 rounded-lg px-2.5 text-xs" : "min-h-10 rounded-xl px-3.5 py-2 text-sm",
        buttonVariants[variant],
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------- Cards

/**
 * Two-layer card: a light grey frame holding a white inner panel.
 * `className` styles the frame, `bodyClassName` the white panel.
 */
export function Card({ className, bodyClassName, children }: { className?: string; bodyClassName?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-xl border-[0.6px] border-frame-border bg-frame p-1", className)}>
      <div className={cn("h-full overflow-hidden rounded-[10px] border-[0.5px] border-grey-100 bg-white shadow-panel", bodyClassName)}>{children}</div>
    </div>
  );
}

/** Card with a title row sitting on the grey frame, above the white panel. */
export function Panel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={cn("flex flex-col rounded-xl border-[0.6px] border-frame-border bg-frame", className)}>
      <div className="flex items-center gap-3 px-3.5 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-heading-2">{title}</h3>
          {description && <p className="mt-0.5 text-xs font-medium text-heading-6">{description}</p>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </div>
      <div className={cn("mx-1 mb-1 flex-1 overflow-hidden rounded-t-xl rounded-b-[10px] border-[0.5px] border-grey-100 bg-white shadow-panel", bodyClassName)}>
        {children}
      </div>
    </div>
  );
}

export function PanelLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-sm font-medium text-brand-700 hover:text-brand-800 hover:underline">
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------- Badge

export type Tone = "green" | "amber" | "red" | "slate" | "blue" | "violet" | "brand";

const tones: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
  red: "bg-rose-50 text-rose-700 border-rose-200",
  slate: "bg-grey-50 text-heading-4 border-grey-150",
  blue: "bg-sky-50 text-sky-700 border-sky-200",
  violet: "bg-violet-50 text-violet-700 border-violet-200",
  brand: "bg-brand-50 text-brand-700 border-brand-200",
};

export function Badge({ tone = "slate", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-lg border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone], className)}>
      {children}
    </span>
  );
}

export function RentBadge({ resident, showDays }: { resident: Resident; showDays?: boolean }) {
  if (resident.status === "moved_out") return <Badge tone="slate">Moved out</Badge>;
  const status = rentStatus(resident);
  const left = daysLeft(resident);
  const label = showDays ? describeDaysLeft(left) : status === "active" ? "Paid" : status === "expiring" ? "Expiring" : "Expired";
  return <Badge tone={status === "active" ? "green" : status === "expiring" ? "amber" : "red"}>{label}</Badge>;
}

// ---------------------------------------------------------------- Form controls

const inputBase =
  "block w-full rounded-lg border border-grey-150 bg-white px-3 py-2 text-sm text-heading-2 placeholder:text-grey-400 outline-none transition-colors focus:border-brand-500 focus:ring-3 focus:ring-brand-100 disabled:bg-grey-50";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputBase, className)} {...props} />;
}

export { Select } from "./Select";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputBase, className)} {...props} />;
}

export function Field({ label, hint, children, className, required }: { label: string; hint?: string; children: ReactNode; className?: string; required?: boolean }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-xs font-medium text-heading-4">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-heading-6">{hint}</span>}
    </label>
  );
}

// ---------------------------------------------------------------- Overlays

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
}

/** Plays the exit animation before telling the parent to close. */
function useAnimatedClose(onClose: () => void, ms: number) {
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const close = useCallback(() => {
    if (timer.current) return;
    setLeaving(true);
    timer.current = setTimeout(() => {
      timer.current = undefined;
      setLeaving(false);
      onClose();
    }, ms);
  }, [onClose, ms]);
  return { leaving, close };
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg" | "xl";
}) {
  const { leaving, close } = useAnimatedClose(onClose, 220);
  useEscape(open, close);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className={cn(
          "absolute inset-0 bg-black/30 backdrop-blur-[2px]",
          leaving ? "animate-[fade-out_160ms_ease-in_forwards]" : "animate-[fade-in_200ms_ease-out]",
        )}
        onClick={close}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-grey-100 bg-white shadow-[0_10px_40px_rgba(0,0,0,0.08)] sm:rounded-2xl",
          size === "md" ? "sm:max-w-lg" : size === "lg" ? "sm:max-w-2xl" : "sm:max-w-4xl",
          leaving
            ? "max-sm:animate-[sheet-out_220ms_cubic-bezier(0.4,0,1,1)_forwards] sm:animate-[modal-out_160ms_ease-in_forwards]"
            : "max-sm:animate-[sheet-in_340ms_cubic-bezier(0.32,0.72,0,1)] sm:animate-[modal-in_220ms_cubic-bezier(0.16,1,0.3,1)]",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-grey-100 px-5 py-4">
          <div>
            <h2 className="text-base font-medium text-grey-950">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-heading-6">{description}</p>}
          </div>
          <button onClick={close} className="rounded-lg p-1 text-heading-6 hover:bg-grey-50 hover:text-heading-2" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-grey-100 bg-grey-10 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/** Panel that slides in from the right. */
export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  const { leaving, close } = useAnimatedClose(onClose, 220);
  useEscape(open, close);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end overflow-hidden">
      <div
        className={cn("absolute inset-0 bg-black/30", leaving ? "animate-[fade-out_220ms_ease-in_forwards]" : "animate-[fade-in_300ms_ease-out]")}
        onClick={close}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative flex h-full w-full max-w-xl flex-col border-l border-grey-100 bg-white shadow-2xl will-change-transform",
          leaving ? "animate-[drawer-out_220ms_cubic-bezier(0.4,0,1,1)_forwards]" : "animate-[drawer-in_320ms_cubic-bezier(0.32,0.72,0,1)]",
        )}
      >
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-grey-100 px-3 sm:h-15.25 sm:justify-between sm:px-5">
          <button onClick={close} className="rounded-lg p-1.5 text-heading-4 hover:bg-grey-50 sm:hidden" aria-label="Back">
            <ChevronLeft className="size-5" />
          </button>
          <div className="text-base font-medium text-grey-950">{title}</div>
          <button onClick={close} className="rounded-lg p-1 text-heading-6 hover:bg-grey-50 hover:text-heading-2 max-sm:hidden" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Page chrome

/** White heading band that spans the full width under the top bar. Stays on one row at every size. */
export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  // On phones these screens show "← Title" in the top bar, so the heading would repeat it
  const titleInTopBar = !!subPageOf(usePathname());
  return (
    <div className="-mx-4 -mt-4 mb-5 flex items-center gap-3 border-b border-grey-100 bg-white px-4 py-3.5 sm:py-4 lg:-mx-5 lg:-mt-5 lg:px-5 lg:py-5">
      <div className="min-w-0 flex-1">
        <h1 className={cn("truncate text-base font-medium text-grey-950 sm:text-lg", titleInTopBar && "max-lg:sr-only")}>{title}</h1>
        {description && <p className={cn("text-xs text-heading-6 sm:truncate sm:text-sm", titleInTopBar && "max-lg:text-sm")}>{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2 sm:gap-3">{actions}</div>}
    </div>
  );
}

/** Header buttons collapse to a square icon on phones. Pair with <BtnLabel>. */
export const headerBtn = "max-sm:size-10 max-sm:min-h-0 max-sm:px-0";

/** Button text that is visually hidden on phones but still read by screen readers. */
export function BtnLabel({ children }: { children: ReactNode }) {
  return <span className="max-sm:sr-only">{children}</span>;
}

const iconChip = {
  brand: "bg-brand-100 text-brand-700",
  green: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-700",
  red: "bg-rose-100 text-rose-700",
  blue: "bg-sky-100 text-sky-700",
  violet: "bg-violet-100 text-violet-700",
};

export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = "brand",
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: ReactNode;
  tone?: keyof typeof iconChip;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col overflow-hidden rounded-xl border-[0.8px] border-frame-border bg-frame", className)}>
      <div className="flex items-center gap-1.5 px-3 py-2.5">
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-heading-2 sm:text-sm">{label}</p>
        <span className={cn("flex size-5 items-center justify-center rounded-md [&_svg]:size-3", iconChip[tone])}>{icon}</span>
      </div>
      <div className="px-1 pb-1">
        <div className="flex h-27.5 flex-col justify-end gap-2.5 rounded-t-xl rounded-b-md border-[0.5px] border-grey-100 bg-white px-2.5 py-4 shadow-panel">
          <p className="text-[22px] leading-tight font-medium text-heading-2 tabular-nums sm:text-[29px]">{value}</p>
          {sub && <p className="line-clamp-2 text-[11px] font-medium text-heading-5 sm:truncate sm:text-xs">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 rounded-xl border border-grey-100 bg-grey-50 p-3 text-heading-6">{icon}</div>
      <p className="text-sm font-medium text-heading-2">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-heading-6">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const avatarColors = ["bg-sky-100 text-sky-700", "bg-violet-100 text-violet-700", "bg-amber-100 text-amber-800", "bg-emerald-100 text-emerald-700", "bg-rose-100 text-rose-700", "bg-brand-100 text-brand-700"];

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const color = avatarColors[name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % avatarColors.length];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-medium",
        size === "sm" ? "size-7 text-[11px]" : size === "md" ? "size-9 text-xs" : "size-14 text-lg",
        color,
      )}
    >
      {initials(name)}
    </span>
  );
}

/** Pill-shaped segmented control. */
export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="flex w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-3xl border border-frame-border bg-frame p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[20px] px-3.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
            value === t.value ? "bg-white text-heading-2 shadow-soft" : "text-heading-6 hover:text-heading-2",
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className={cn("rounded-md px-1.5 py-px text-[11px] tabular-nums", value === t.value ? "bg-brand-50 text-brand-700" : "bg-grey-100 text-heading-6")}>{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/** Small toggle chips used as filters. */
export function FilterChips<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-7 cursor-pointer rounded-lg border px-2.5 text-xs font-medium whitespace-nowrap transition-colors",
            value === o.value ? "border-brand-200 bg-brand-50 text-brand-700" : "border-grey-100 bg-white text-heading-2 hover:bg-grey-50",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <svg className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-heading-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="rounded-full border-frame-border bg-frame pl-9" />
    </div>
  );
}

/** Table header cell / row helpers to keep tables consistent */
export const th = "px-4 py-2.5 text-left text-xs font-medium text-heading-6";
