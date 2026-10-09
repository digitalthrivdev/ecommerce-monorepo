import { NextResponse } from "next/server";

import { androidApp } from "@/lib/app-links";

export const dynamic = "force-dynamic";

/** Lets Android open this site's product links in the customer app (App Links). */
export function GET() {
  const app = androidApp();
  if (!app) return NextResponse.json([], { status: 404 });

  return NextResponse.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: app.packageName, sha256_cert_fingerprints: app.fingerprints },
    },
  ]);
}
