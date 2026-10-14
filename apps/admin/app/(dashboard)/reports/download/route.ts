import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { ApiError } from "@/lib/api";
import { proxyDownload } from "@/lib/downloads";

/** A CSV report from the Reports page form. On an error, goes back to the page with the message. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const report = params.get("report") ?? "";
  const query = {
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
  };

  let message: string;
  try {
    return await proxyDownload(`/admin/reports/${encodeURIComponent(report)}`, query);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    message = error.issues?.[0]?.message ?? error.message;
  }

  const back = new URLSearchParams({ error: message });
  for (const [key, value] of Object.entries(query)) {
    if (value) back.set(key, value);
  }
  redirect(`/reports?${back}`);
}
