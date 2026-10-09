import { NextResponse } from "next/server";

import { APP_LINK_PATH, iosAppId } from "@/lib/app-links";

export const dynamic = "force-dynamic";

/** Lets iOS open this site's product links in the customer app (Universal Links). */
export function GET() {
  const appId = iosAppId();
  if (!appId) return NextResponse.json({}, { status: 404 });

  return NextResponse.json({
    applinks: { details: [{ appIDs: [appId], components: [{ "/": `${APP_LINK_PATH}*` }] }] },
  });
}
