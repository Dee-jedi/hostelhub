import { NextResponse, type NextRequest } from "next/server";
import { resolveHost } from "./lib/hostel-host";

/*
 * The platform's home page and a hostel's dashboard both live at "/": on the platform domain
 * (hostelhub.africa, www.) "/" shows the marketing site, which the app keeps at /site. Hostel
 * addresses are untouched. Until the domain is set, the site can be previewed at /site.
 */
export function proxy(request: NextRequest) {
  const host = resolveHost(request.headers.get("x-forwarded-host") ?? request.headers.get("host"));
  if (host.kind === "platform" && host.area === "home") return NextResponse.rewrite(new URL("/site", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: "/",
};
