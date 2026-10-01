import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/token";

/**
 * Target for server-side redirects when the API rejects the session. Server Components
 * cannot delete cookies, so they redirect here instead of straight to /login.
 */
export function GET(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  if (request.nextUrl.searchParams.get("error") === "no-access") {
    loginUrl.searchParams.set("error", "no-access");
  }

  const response = NextResponse.redirect(loginUrl);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
