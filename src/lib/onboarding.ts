/*
 * The owner sign-up wizard (/start): its answers, how they're checked and how a web address is
 * suggested. Shared by the wizard screen and the server, so both apply the same rules.
 */
import { STATES } from "./academics";
import { isValidSlug, RESERVED_SLUGS } from "./hostel-host";

/** What the first part of the wizard collects before the hostel is saved as a draft. */
export interface HostelBasics {
  name: string;
  slug: string;
  street: string;
  city: string;
  state: string;
  managerName: string;
  managerPhone: string;
}

export const EMPTY_BASICS: HostelBasics = { name: "", slug: "", street: "", city: "", state: "", managerName: "", managerPhone: "" };

/** Words that make an address longer without making it clearer ("Sunrise Hostel" → "sunrise"). */
const FILLER = /\b(hostels?|lodges?|apartments?|suites?|residences?|homes?|the|ltd|limited)\b/g;

export function toSlug(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32)
    .replace(/-$/, "");
}

/** Web addresses to offer for a hostel name: the short form first, then longer ones. */
export function suggestSlugs(name: string, city = "") {
  const short = toSlug(name.toLowerCase().replace(FILLER, " "));
  const full = toSlug(name);
  const withCity = city ? toSlug(`${short || full} ${city}`) : "";
  return [...new Set([short, full, withCity, short && `${short}-hostel`].filter((s): s is string => !!s && isValidSlug(s)))];
}

/** Why a web address can't be used, or null if its form is fine (availability is checked separately). */
export function slugProblem(slug: string): string | null {
  if (slug.length < 3) return "Use at least 3 letters or numbers.";
  if (slug.length > 32) return "Keep it to 32 characters or fewer.";
  if (RESERVED_SLUGS.has(slug)) return "That address is reserved. Try another.";
  if (!isValidSlug(slug)) return "Use only lowercase letters, numbers and single hyphens (not at the start or end).";
  return null;
}

/** Nigerian phone numbers: 080…, 070…, 090…, 081… (11 digits) or +234 followed by 10 digits. */
export function normalizePhone(raw: string) {
  const digits = raw.replace(/[^\d+]/g, "");
  if (/^\+234\d{10}$/.test(digits)) return `0${digits.slice(4)}`;
  if (/^234\d{10}$/.test(digits)) return `0${digits.slice(3)}`;
  return digits;
}
export const isNigerianPhone = (raw: string) => /^0[789][01]\d{8}$/.test(normalizePhone(raw));

/** Each wizard question's check, in order. Returns the first problem, worded for the person filling it in. */
export const BASICS_CHECKS: Record<keyof HostelBasics, (b: HostelBasics) => string | null> = {
  name: (b) => (b.name.trim().length < 3 ? "Enter your hostel's name." : b.name.trim().length > 60 ? "Keep the name under 60 characters." : null),
  slug: (b) => slugProblem(b.slug),
  street: (b) => (b.street.trim().length < 4 ? "Enter the street address." : null),
  city: (b) => (b.city.trim().length < 2 ? "Enter the town or city." : null),
  state: (b) => ((STATES as readonly string[]).includes(b.state) ? null : "Pick the state."),
  managerName: (b) => (b.managerName.trim().split(/\s+/).length < 2 ? "Enter your first and last name." : null),
  managerPhone: (b) => (isNigerianPhone(b.managerPhone) ? null : "Enter a Nigerian phone number, like 08031234567."),
};

export function basicsProblem(b: HostelBasics): string | null {
  for (const check of Object.values(BASICS_CHECKS)) {
    const problem = check(b);
    if (problem) return problem;
  }
  return null;
}

/** One line for the dashboard, receipts and booking page. */
export const fullAddress = (b: Pick<HostelBasics, "street" | "city" | "state">) => [b.street.trim(), b.city.trim(), b.state].filter(Boolean).join(", ");
