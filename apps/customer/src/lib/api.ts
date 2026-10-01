import { API_URL } from "./config";

const TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

/** Called when the API rejects the stored token, so the session can end. */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

type RequestOptions = { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; query?: Record<string, string | number | boolean | undefined> };

export async function apiFetch<T>(path: string, { method = "GET", body, query }: RequestOptions = {}): Promise<T> {
  const search = Object.entries(query ?? {})
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
  const url = `${API_URL}${path}${search ? `?${search}` : ""}`;
  const token = accessToken;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        accept: "application/json",
        ...(body !== undefined && { "content-type": "application/json" }),
        ...(token && { authorization: `Bearer ${token}` }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Can't reach the server. Check your internet connection and try again.");
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 && token && token === accessToken) onUnauthorized?.();
    throw new ApiError(response.status, data?.error ?? "REQUEST_FAILED", data?.message ?? "Something went wrong. Please try again.", data?.issues);
  }
  return data as T;
}

export function errorMessage(error: unknown) {
  if (error instanceof ApiError || (error instanceof Error && error.name === "LocationError")) return error.message;
  return "Something went wrong. Please try again.";
}
