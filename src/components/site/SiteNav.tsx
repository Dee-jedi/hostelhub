"use client";

import { ArrowUpRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { SECTIONS, Wordmark } from "./brand";

/** Floating pill bar: transparent over the hero, frosted once the page scrolls. */
export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-6 sm:pt-4">
      <nav
        aria-label="Main"
        className={cn(
          "mx-auto flex h-14 max-w-6xl items-center justify-between rounded-full pr-2 pl-5 transition-all duration-300 sm:h-16 sm:pl-6",
          scrolled || open ? "bg-white/85 shadow-[0_8px_30px_rgba(11,35,34,0.08)] ring-1 ring-black/5 backdrop-blur-xl" : "bg-transparent",
        )}
      >
        <Link href="#top" aria-label="HostelHub, back to top" onClick={() => setOpen(false)}>
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
          <Link href="/login" className="hidden rounded-full px-4 py-2 text-[15px] font-medium text-heading-4 hover:text-brand-900 sm:block">
            Log in
          </Link>
          <Link
            href="/start"
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-brand-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-800 sm:h-12 sm:px-5 sm:text-[15px]"
          >
            Get started <ArrowUpRight className="size-4 text-brand-300" />
          </Link>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="flex size-10 items-center justify-center rounded-full text-brand-950 hover:bg-brand-50 md:hidden"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </nav>

      {open && (
        <div id="site-menu" className="mx-auto mt-2 max-w-6xl rounded-3xl bg-white p-3 shadow-[0_16px_40px_rgba(11,35,34,0.12)] ring-1 ring-black/5 md:hidden">
          {SECTIONS.map((s) => (
            <a key={s.href} href={s.href} onClick={() => setOpen(false)} className="block rounded-2xl px-4 py-3.5 text-base font-medium text-heading-2 hover:bg-brand-50">
              {s.label}
            </a>
          ))}
          <Link href="/login" onClick={() => setOpen(false)} className="block rounded-2xl px-4 py-3.5 text-base font-medium text-heading-2 hover:bg-brand-50">
            Log in
          </Link>
        </div>
      )}
    </header>
  );
}
