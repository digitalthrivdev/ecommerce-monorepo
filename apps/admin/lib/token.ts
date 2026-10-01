export const SESSION_COOKIE = "session";

export type TokenClaims = {
  sub: string;
  role: string;
  exp: number;
};

/**
 * Reads the API JWT payload without verifying the signature. Only use the result for
 * optimistic routing decisions; the API verifies the token on every request.
 */
export function decodeToken(token: string): TokenClaims | null {
  const payload = token.split(".")[1];
  if (!payload) {
    return null;
  }

  try {
    const claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    if (typeof claims?.sub !== "string" || typeof claims?.role !== "string" || typeof claims?.exp !== "number") {
      return null;
    }
    return { sub: claims.sub, role: claims.role, exp: claims.exp };
  } catch {
    return null;
  }
}

export function isTokenExpired(claims: TokenClaims) {
  return claims.exp * 1000 <= Date.now();
}
