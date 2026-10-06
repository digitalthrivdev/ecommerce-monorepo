import "server-only";

import { headers } from "next/headers";
import { cache } from "react";

import { apiFetch } from "./api";
import { isSiteHost, SITE_DOMAIN } from "./site-domain";
import type { Website } from "./types";

export const getWebsite = cache(() => apiFetch<Website>("/settings/website", { auth: false }));

/** Path prefix of the website pages for this request: none on the website's domain, /site elsewhere. */
export const getSiteBase = cache(async () => (isSiteHost((await headers()).get("host")) ? "" : "/site"));

/** Where admins find the website: its domain, or the /site preview on this dashboard. */
export async function getSiteUrl() {
  if (SITE_DOMAIN) return `https://${SITE_DOMAIN}`;
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}/site`;
}

/** Pages in the footer and on /policies, as paths relative to the website's root. */
export function sitePages(pages: Website["pages"]) {
  return [...pages.map((page) => ({ path: `/${page.slug}`, title: page.title })), { path: "/contact", title: "Contact Us" }];
}
