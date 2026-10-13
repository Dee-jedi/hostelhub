/**
 * Screens opened from the Profile tab or the bell on phones. They show a back arrow
 * in the top bar; the value is where "back" goes when there is no browser history.
 */
export const SUB_PAGES: Record<string, string> = {
  "/settings": "/profile",
  "/payments": "/profile",
  "/messages": "/profile",
  "/applications": "/profile",
  "/maintenance": "/profile",
  "/notifications": "/",
};

export function subPageOf(pathname: string) {
  return Object.keys(SUB_PAGES).find((k) => pathname.startsWith(k));
}
