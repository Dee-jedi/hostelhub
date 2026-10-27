import { cn } from "@/lib/utils";

/** The marketing site's sections, for the top bar and the footer. */
export const SECTIONS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Pricing" },
  { href: "#questions", label: "Questions" },
];

export function Wordmark({ dark = false, className }: { dark?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-start text-[21px] leading-none font-semibold tracking-tight", dark ? "text-white" : "text-brand-950", className)}>
      hostel<span className={dark ? "text-brand-300" : "text-brand-600"}>hub</span>
    </span>
  );
}
