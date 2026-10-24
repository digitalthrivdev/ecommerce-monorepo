import { NextResponse, type NextRequest } from "next/server";
import { getWebsite } from "@/lib/website";

/**
 * Direct download route: /download
 * Redirects to the configured customer app download URL (or direct APK).
 */
export async function GET(request: NextRequest) {
  const website = await getWebsite().catch(() => null);
  const downloadUrl = website?.apps.customer?.download ?? "https://shop-api.moozy.in/uploads/moozy-shop.apk";
  return NextResponse.redirect(downloadUrl, 307);
}
