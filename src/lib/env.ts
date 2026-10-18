/*
 * Which Firestore database this deployment uses. Live uses "(default)"; the staging backend
 * sets NEXT_PUBLIC_FIRESTORE_DATABASE=staging (apphosting.staging.yaml). Both share one
 * Firebase project, so logins (Auth) and photos (Storage) are shared between them.
 */
export const FIRESTORE_DATABASE = process.env.NEXT_PUBLIC_FIRESTORE_DATABASE?.trim() || "(default)";

/** True on the live database; shared resources (logins, photos) are only ever cleaned up from here. */
export const IS_LIVE_DATABASE = FIRESTORE_DATABASE === "(default)";

/** The platform's own domain, e.g. "hostelhub.africa". Hostels live on its subdomains. Unset until bought. */
export const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN?.trim() || "";

/** The hostel served on addresses that aren't a hostel subdomain (*.hosted.app, plain localhost). */
export const DEFAULT_HOSTEL = process.env.NEXT_PUBLIC_DEFAULT_HOSTEL?.trim() || "";
