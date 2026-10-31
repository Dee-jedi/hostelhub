import { PLATFORM_DOMAIN } from "./env";

/*
 * The platform's own details, shown on the marketing site and in onboarding. One place, so a
 * new number, email or domain is a one-line change.
 */

/** Shown in examples like "yourhostel.hostelhub.africa" until the domain is configured. */
export const PLATFORM_HOST = PLATFORM_DOMAIN || "hostelhub.africa";

export const CONTACT = {
  whatsapp: "07079723612",
  /** International form for wa.me links */
  whatsappIntl: "2347079723612",
  email: "support@hostelhub.africa",
};

export const whatsappHref = (text = "Hi HostelHub, I'd like to know more about using it for my hostel.") =>
  `https://wa.me/${CONTACT.whatsappIntl}?text=${encodeURIComponent(text)}`;
