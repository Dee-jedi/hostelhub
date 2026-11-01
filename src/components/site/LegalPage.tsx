import Link from "next/link";
import type { ReactNode } from "react";
import { CONTACT } from "@/lib/platform";
import { Wordmark } from "./brand";

/*
 * The layout for HostelHub's legal pages (terms, privacy): plain, readable, one column.
 * The text lives in each page; this gives them a header, a date and the links between them.
 */

export const LEGAL = {
  /** The company that runs HostelHub and is party to these terms */
  operator: "DISPHERE LTD",
  updated: "1 November 2026",
};

export function LegalPage({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#f6f8f7]">
      <header className="border-b border-black/5 bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
          <Link href="/" aria-label="HostelHub home">
            <Wordmark />
          </Link>
          <nav className="flex gap-4 text-sm font-medium text-heading-5">
            <Link href="/terms" className="hover:text-brand-800">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-brand-800">
              Privacy
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <h1 className="text-[clamp(2rem,5vw,2.75rem)] leading-tight font-bold tracking-[-0.03em] text-brand-950">{title}</h1>
        <p className="mt-2 text-sm text-heading-6">Last updated {LEGAL.updated}</p>
        <div className="mt-6 text-[16px] leading-relaxed text-heading-4">{intro}</div>
        <div className="legal mt-10 space-y-10 text-[15px] leading-relaxed text-heading-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-grey-950 [&_h3]:mt-5 [&_h3]:font-semibold [&_h3]:text-grey-950 [&_li]:mt-1.5 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_a]:font-medium [&_a]:text-brand-800 [&_a]:underline-offset-4 hover:[&_a]:underline">
          {children}
        </div>
        <p className="mt-14 border-t border-black/5 pt-6 text-sm text-heading-6">
          Questions? Write to{" "}
          <a href={`mailto:${CONTACT.email}`} className="font-medium text-brand-800">
            {CONTACT.email}
          </a>
          .
        </p>
      </main>
    </div>
  );
}
