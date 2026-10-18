/*
 * Which hostel a request is for, worked out from the address it came in on.
 *
 *   mowarid.<platform domain>   → hostel "mowarid"
 *   mowarid.localhost           → hostel "mowarid" (local development; browsers resolve *.localhost)
 *   <platform domain>, www.…    → the platform's own pages (sign-up, marketing)
 *   admin.<platform domain>     → the platform admin console
 *   anything else               → the default hostel, if one is configured. That covers the
 *                                 *.hosted.app addresses and plain localhost until the domain exists.
 *
 * Pure and shared: the browser passes window.location.host, the server passes the request's host.
 */
import { DEFAULT_HOSTEL, PLATFORM_DOMAIN } from "./env";

export type ResolvedHost =
  | { kind: "hostel"; slug: string; via: "subdomain" | "default" }
  | { kind: "platform"; area: "home" | "admin" }
  | { kind: "unknown" };

/** Subdomains that belong to the platform and can never be a hostel's slug. */
export const RESERVED_SLUGS = new Set(["www", "app", "admin", "api", "staging", "mail", "help", "support", "status", "docs", "blog"]);

/** 3–32 characters: lowercase letters, digits and inner hyphens. */
export function isValidSlug(slug: string) {
  return /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(slug) && !slug.includes("--") && !RESERVED_SLUGS.has(slug);
}

/** Lowercase host without port. Takes the first value of a comma-separated X-Forwarded-Host. */
export function normalizeHost(raw: string | null | undefined) {
  return (raw ?? "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

export function resolveHost(raw: string | null | undefined, cfg = { platformDomain: PLATFORM_DOMAIN, defaultHostel: DEFAULT_HOSTEL }): ResolvedHost {
  const host = normalizeHost(raw);
  const domain = cfg.platformDomain ? normalizeHost(cfg.platformDomain) : "";

  if (domain && (host === domain || host === `www.${domain}`)) return { kind: "platform", area: "home" };
  if (domain && host === `admin.${domain}`) return { kind: "platform", area: "admin" };

  const suffix = [domain, "localhost"].find((d) => d && host.endsWith(`.${d}`));
  if (suffix) {
    const sub = host.slice(0, -(suffix.length + 1));
    return isValidSlug(sub) ? { kind: "hostel", slug: sub, via: "subdomain" } : { kind: "unknown" };
  }

  return cfg.defaultHostel && isValidSlug(cfg.defaultHostel) ? { kind: "hostel", slug: cfg.defaultHostel, via: "default" } : { kind: "unknown" };
}

/** The host a server request was made to. App Hosting passes the public address in X-Forwarded-Host. */
export function requestHost(req: Request) {
  return req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
}
