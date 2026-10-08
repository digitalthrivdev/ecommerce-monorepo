import "server-only";

import { apiFetch } from "./api";

const PASSED_HEADERS = ["content-type", "content-disposition", "cache-control"];

/** Streams a file from the API (a PDF or CSV) to the browser with its name and type. */
export async function proxyDownload(path: string, query?: Record<string, string | undefined>) {
  const response = await apiFetch<Response>(path, { as: "response", query });
  const headers = new Headers();
  for (const name of PASSED_HEADERS) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(response.body, { headers });
}
