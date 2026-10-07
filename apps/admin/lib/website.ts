/**
 * Address of the public website (apps/web): https://SITE_DOMAIN in production, or SITE_URL
 * (default http://localhost:3001) in development.
 */
export function getSiteUrl() {
  const domain = process.env.SITE_DOMAIN?.trim().toLowerCase();
  if (domain) return `https://${domain}`;
  return (process.env.SITE_URL ?? "http://localhost:3001").replace(/\/+$/, "");
}
