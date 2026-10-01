import "server-only";

import { cookies } from "next/headers";

import { decodeToken, isTokenExpired, SESSION_COOKIE } from "./token";

export async function getSessionToken() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  const claims = decodeToken(token);
  return claims && !isTokenExpired(claims) ? token : null;
}

/** Only callable from Server Functions and Route Handlers. */
export async function setSession(token: string) {
  const claims = decodeToken(token);
  if (!claims) {
    throw new Error("The API returned an unreadable access token");
  }

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(claims.exp * 1000),
  });
}

/** Only callable from Server Functions and Route Handlers. */
export async function clearSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
