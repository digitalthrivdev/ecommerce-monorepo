import { NextResponse, type NextRequest } from "next/server";

import { getWebsite } from "@/lib/website";

/**
 * One link for the customer app, used by the QR code: Android phones go to Google Play (or the direct
 * download), iPhones to the App Store, everything else to the download section of the home page.
 */
export async function GET(request: NextRequest) {
  const links = (await getWebsite()).apps.customer;
  const userAgent = request.headers.get("user-agent") ?? "";
  const target = /android/i.test(userAgent)
    ? (links?.playStore ?? links?.download)
    : /iphone|ipad|ipod/i.test(userAgent)
      ? links?.appStore
      : null;

  return NextResponse.redirect(target ?? links?.download ?? new URL(links ? "/#download" : "/", request.url), 302);
}
