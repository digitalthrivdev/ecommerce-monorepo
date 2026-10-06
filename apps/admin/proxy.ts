import { NextResponse, type NextRequest } from "next/server";

import { isSiteHost, SITE_DOMAIN } from "./lib/site-domain";
import { decodeToken, isTokenExpired, SESSION_COOKIE } from "./lib/token";

const SITE_PREFIX = "/site";

/** Optimistic routing only: pages still verify the session with the API. */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // The public website: only the pages under app/site, read-only, never the dashboard.
  if (isSiteHost(request.headers.get("host"))) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new NextResponse(null, { status: 405, headers: { allow: "GET, HEAD" } });
    }
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? SITE_PREFIX : `${SITE_PREFIX}${pathname}`;
    return NextResponse.rewrite(url);
  }

  if (pathname === SITE_PREFIX || pathname.startsWith(`${SITE_PREFIX}/`)) {
    if (SITE_DOMAIN) {
      return NextResponse.redirect(`https://${SITE_DOMAIN}${pathname.slice(SITE_PREFIX.length) || "/"}${search}`);
    }
    return NextResponse.next();
  }

  if (pathname === "/auth/signout") {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const claims = token ? decodeToken(token) : null;
  const signedIn = claims !== null && !isTokenExpired(claims);

  if (pathname === "/login") {
    return signedIn ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
  }

  if (!signedIn) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("next", `${pathname}${search}`);
    }
    const response = NextResponse.redirect(loginUrl);
    if (token) {
      response.cookies.delete(SESSION_COOKIE);
    }
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
