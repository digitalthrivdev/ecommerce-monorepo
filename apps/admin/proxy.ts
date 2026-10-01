import { NextResponse, type NextRequest } from "next/server";

import { decodeToken, isTokenExpired, SESSION_COOKIE } from "./lib/token";

/** Optimistic routing only: pages still verify the session with the API. */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

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
