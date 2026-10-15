import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { HostelIllustration } from "./HostelIllustration";

function Wordmark() {
  return (
    <Link href="/book" className="inline-flex items-start text-[19px] leading-none font-semibold tracking-tight text-white">
      hostel<span className="text-brand-300">hub</span>
    </Link>
  );
}

/** Soft glows behind the illustration on the dark panel. */
function Glow() {
  return (
    <>
      <div className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-brand-500/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-20 size-96 rounded-full bg-brand-400/15 blur-3xl" />
    </>
  );
}

/**
 * Layout for the public screens (login, booking).
 * Desktop: a dark illustration panel on the left that stays put (one screen tall) while the
 * content on the right scrolls. Phones: a dark header whose rounded bottom edge curves down
 * into the white page.
 */
export function BrandLayout({
  title,
  subtitle,
  action,
  phoneIllustration = true,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** A small link shown top-right: in the dark header on phones, above the content on desktop */
  action?: { href: string; label: string; phoneOnly?: boolean };
  /** Long forms skip the illustration on phones so the form starts near the top */
  phoneIllustration?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-white lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden h-dvh overflow-hidden bg-brand-900 p-10 text-white lg:sticky lg:top-0 lg:flex lg:flex-col lg:self-start xl:p-12">
        <Glow />
        <div className="relative">
          <Wordmark />
        </div>
        <div className="relative flex min-h-0 flex-1 items-center justify-center py-8">
          <HostelIllustration className="h-full max-h-[440px] w-full max-w-lg" />
        </div>
        <div className="relative">
          <h2 className="max-w-md text-2xl leading-tight font-semibold tracking-tight text-balance xl:text-3xl">{title}</h2>
          {subtitle && <p className="mt-2 text-sm text-brand-100/75">{subtitle}</p>}
        </div>
      </aside>

      <div className={cn("relative overflow-hidden rounded-b-[28px] bg-brand-900 px-5 pt-5 lg:hidden", phoneIllustration ? "pb-7" : "pb-5")}>
        <Glow />
        <div className="relative flex items-center justify-between">
          <Wordmark />
          {action && (
            <Link href={action.href} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white ring-1 ring-white/15">
              {action.label}
            </Link>
          )}
        </div>
        {phoneIllustration && <HostelIllustration className="relative mx-auto mt-6 h-40 w-auto sm:h-52" />}
      </div>

      <main className="relative flex flex-1 flex-col bg-white px-5 pt-7 pb-10 sm:px-8 lg:min-h-dvh lg:px-12 lg:py-10">
        {action && !action.phoneOnly && (
          <div className="mb-6 hidden justify-end lg:flex">
            <Link href={action.href} className="text-sm font-medium text-brand-700 hover:underline">
              {action.label}
            </Link>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
