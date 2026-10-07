import { NextResponse, type NextRequest } from "next/server";

/** The website only serves pages for now: refuse anything but GET and HEAD. */
export function proxy(request: NextRequest) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new NextResponse(null, { status: 405, headers: { allow: "GET, HEAD" } });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
