/**
 * The public website's domain (SITE_DOMAIN, e.g. "acme.com"). On it, the proxy serves only the pages
 * under app/site, at the root (/terms rather than /site/terms). Without it (development), those
 * pages are previewed at /site on the dashboard's address.
 */
export const SITE_DOMAIN = process.env.SITE_DOMAIN?.trim().toLowerCase() || null;

/** True when a Host header ("acme.com" or "acme.com:3000") names the website's domain. */
export function isSiteHost(host: string | null) {
  return SITE_DOMAIN !== null && host?.split(":")[0]?.toLowerCase() === SITE_DOMAIN;
}
