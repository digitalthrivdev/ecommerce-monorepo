import "server-only";

import { headers } from "next/headers";
import { cache } from "react";

import { apiGet } from "./api";
import type { HomeFeed, PublicSettings, Website } from "./types";

export const getWebsite = cache(() => apiGet<Website>("/settings/website"));
export const getSettings = cache(() => apiGet<PublicSettings>("/settings"));
export const getHomeFeed = cache(() => apiGet<HomeFeed>("/home"));

/** This website's own address, e.g. "https://acme.com", from the request (Nginx sets the forwarded headers). */
export async function getSiteUrl() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3001";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

/** Policy and contact pages, for the footer and /policies. */
export function sitePages(pages: Website["pages"]) {
  return [...pages.map((page) => ({ path: `/${page.slug}`, title: page.title })), { path: "/contact", title: "Contact Us" }];
}
