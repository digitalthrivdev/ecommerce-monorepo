import "server-only";

import { redirect } from "next/navigation";

import { getSessionToken } from "./session";

const API_URL = (process.env.API_URL ?? "http://localhost:4000").replace(/\/+$/, "");

export type ApiIssue = { path: string; message: string };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues?: ApiIssue[],
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type QueryValue = string | number | boolean | null | undefined;

type ApiOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, QueryValue>;
  /** Send the session token. An expired or rejected session redirects to sign-out. */
  auth?: boolean;
};

/**
 * Server-side API client. With `auth` it calls `redirect()`, which throws, so callers that
 * catch errors must rethrow anything that is not an `ApiError`.
 */
export async function apiFetch<T>(path: string, { method = "GET", body, query, auth = true }: ApiOptions = {}): Promise<T> {
  const url = new URL(`${API_URL}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = { accept: "application/json" };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (auth) {
    const token = await getSessionToken();
    if (!token) {
      redirect("/auth/signout");
    }
    headers.authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(503, "API_UNAVAILABLE", "The server could not be reached. Try again in a moment.");
  }

  if (auth && response.status === 401) {
    redirect("/auth/signout");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error ?? "REQUEST_ERROR",
      data?.message ?? `Request failed with status ${response.status}`,
      data?.issues,
      data?.details,
    );
  }

  return data as T;
}
