/*
 * Which Firestore database this deployment uses. Live uses "(default)"; the staging backend
 * sets NEXT_PUBLIC_FIRESTORE_DATABASE=staging (apphosting.staging.yaml). Both share one
 * Firebase project, so logins (Auth) and photos (Storage) are shared between them.
 */
export const FIRESTORE_DATABASE = process.env.NEXT_PUBLIC_FIRESTORE_DATABASE?.trim() || "(default)";

/** True on the live database; shared resources (logins, photos) are only ever cleaned up from here. */
export const IS_LIVE_DATABASE = FIRESTORE_DATABASE === "(default)";
