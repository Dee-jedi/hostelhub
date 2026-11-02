/*
 * The demo hostel (Sunrise Hostel at demo.hostelhub.africa). "View demo" on the marketing site
 * opens its dashboard for anyone, signed in as one shared login whose only access is
 * h[demo] = "viewer": it can read the demo hostel and change nothing. The database rules, the
 * server (command.ts) and the dashboard all refuse its writes; /api/demo hands out the login.
 */

export const DEMO_HOSTEL = "demo";

/** The shared login every demo visitor uses (made on first sign-in, no email or password). */
export const DEMO_VIEWER_UID = "demo-viewer";

export const DEMO_READ_ONLY = "This is a demo, so changes are switched off. Set up your own hostel to try it for real.";
