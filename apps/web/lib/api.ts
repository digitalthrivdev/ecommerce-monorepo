import "server-only";

import { cookies } from "next/headers";

const API_URL = (process.env.API_URL ?? "http://localhost:4000").replace(/\/+$/, "");

/** Customer JWT. httpOnly, so browser scripts cannot read it. */
export const CUSTOMER_COOKIE = "customer_token";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function readToken() {
  return (await cookies()).get(CUSTOMER_COOKIE)?.value ?? null;
}

export async function writeToken(token: string) {
  (await cookies()).set(CUSTOMER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

export async function clearToken() {
  (await cookies()).delete(CUSTOMER_COOKIE);
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Send the customer cookie. Never cached. */
  auth?: boolean;
  /** Public responses may be reused for this many seconds. */
  revalidate?: number;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers({ accept: "application/json" });
  if (options.body !== undefined) headers.set("content-type", "application/json");
  if (options.auth) {
    const token = await readToken();
    if (!token) throw new ApiError(401, "Please sign in", "UNAUTHORIZED");
    headers.set("authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: options.auth || options.revalidate === undefined ? "no-store" : undefined,
      next: options.revalidate !== undefined && !options.auth ? { revalidate: options.revalidate } : undefined,
    });
  } catch {
    throw new ApiError(503, "The server could not be reached");
  }

  if (response.status === 204) return undefined as T;

  const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
  if (!response.ok) {
    throw new ApiError(response.status, payload?.message ?? `Request failed with ${response.status}`, payload?.error);
  }
  return payload as T;
}

/** Server-side GET of a public API endpoint. Cached briefly; stock and prices stay close to the API. */
export function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { revalidate: 60 });
}

export function apiAuth<T>(path: string, options: Omit<RequestOptions, "auth" | "revalidate"> = {}): Promise<T> {
  return apiRequest<T>(path, { ...options, auth: true });
}
