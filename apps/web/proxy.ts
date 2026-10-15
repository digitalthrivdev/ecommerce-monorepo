import { NextResponse, type NextRequest } from "next/server";

/** Pages and server actions. Other methods have no route on the website. */
export function proxy(request: NextRequest) {
  if (request.method !== "GET" && request.method !== "HEAD" && request.method !== "POST") {
    return new NextResponse(null, { status: 405, headers: { allow: "GET, HEAD, POST" } });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
