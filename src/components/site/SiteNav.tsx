"use client";

import { ArrowRight, ArrowUpRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { SECTIONS, Wordmark } from "./brand";

/**
 * Floating pill bar: transparent over the hero, frosted once the page scrolls.
 * Phones get the logo and a menu button; the menu opens full screen.
 */
export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // While the menu is open: Escape closes it, and the page behind doesn't scroll
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

  const close = () => setOpen(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-6 sm:pt-4">
      <nav
        aria-label="Main"
        className={cn(
          "relative z-10 mx-auto flex h-14 max-w-6xl items-center justify-between rounded-full pr-2 pl-5 transition-all duration-300 sm:h-16 sm:pl-6",
          scrolled && !open ? "bg-white/85 shadow-[0_8px_30px_rgba(11,35,34,0.08)] ring-1 ring-black/5 backdrop-blur-xl" : "bg-transparent",
        )}
      >
        <Link href="#top" aria-label="HostelHub, back to top" onClick={close}>
          <Wordmark />
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {SECTIONS.map((s) => (
            <li key={s.href}>
              <a href={s.href} className="rounded-full px-3.5 py-2 text-[15px] text-heading-4 transition-colors hover:bg-brand-50 hover:text-brand-900">
                {s.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-1.5">
          <Link href="/login" className="hidden rounded-full px-4 py-2 text-[15px] font-medium text-heading-4 hover:text-brand-900 md:block">
            Log in
          </Link>
          <Link
            href="/start"
            className="hidden h-12 items-center gap-1.5 rounded-full bg-brand-950 px-5 text-[15px] font-semibold text-white transition-colors hover:bg-brand-800 md:inline-flex"
          >
            Get started <ArrowUpRight className="size-4 text-brand-300" />
          </Link>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="flex size-11 items-center justify-center rounded-full text-brand-950 transition-colors hover:bg-brand-50 md:hidden"
          >
            {open ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
        </div>
      </nav>

      {open && (
        <div id="site-menu" className="fixed inset-0 flex flex-col bg-[#f6f8f7] px-6 pt-24 pb-[max(1.5rem,env(safe-area-inset-bottom))] motion-safe:animate-[fade-in_0.2s_ease-out] md:hidden">
          <nav aria-label="Sections" className="flex-1">
            <ul>
              {SECTIONS.map((s, i) => (
                <li key={s.href} className="border-b border-brand-100 motion-safe:animate-[rise_0.35s_ease-out_both]" style={{ animationDelay: `${60 + i * 50}ms` }}>
                  <a href={s.href} onClick={close} className="flex items-center justify-between py-5 text-[28px] font-semibold tracking-tight text-brand-950">
                    {s.label}
                    <ArrowRight className="size-5 text-brand-400" />
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="motion-safe:animate-[rise_0.4s_ease-out_both]" style={{ animationDelay: "280ms" }}>
            <Link
              href="/start"
              onClick={close}
              className="flex h-14 items-center justify-center gap-2 rounded-full bg-brand-950 text-base font-semibold text-white shadow-[0_12px_30px_-12px_rgba(11,35,34,0.6)]"
            >
              Get started free <ArrowUpRight className="size-5 text-brand-300" />
            </Link>
            <p className="mt-5 text-center text-[15px] text-heading-5">
              Already using HostelHub?{" "}
              <Link href="/login" onClick={close} className="font-semibold text-brand-800 underline-offset-4 hover:underline">
                Log in
              </Link>
            </p>
          </div>
        </div>
      )}
    </header>
  );
}
