#!/usr/bin/env bash
# Gets or updates the Let's Encrypt certificate for API_DOMAIN, ADMIN_DOMAIN, SITE_DOMAIN and
# www.SITE_DOMAIN while the stack is running, then reloads Nginx. All four names must already point
# at this server (DNS A records). init-letsencrypt.sh runs it on a new server. On a running server,
# after adding SITE_DOMAIN to .env: docker compose up -d, then run this.
#
#   ./request-certificate.sh             real certificate
#   STAGING=1 ./request-certificate.sh   Let's Encrypt test certificate (untrusted; for a dry run)
set -euo pipefail
cd "$(dirname "$0")"

[ -f .env ] || { echo "Create .env from .env.example first." >&2; exit 1; }
set -a
# shellcheck disable=SC1091
. ./.env
set +a
: "${API_DOMAIN:?Set API_DOMAIN in .env}" "${ADMIN_DOMAIN:?Set ADMIN_DOMAIN in .env}" "${SITE_DOMAIN:?Set SITE_DOMAIN in .env}"
: "${LETSENCRYPT_EMAIL:?Set LETSENCRYPT_EMAIL in .env}"

echo "Requesting the Let's Encrypt certificate for $API_DOMAIN, $ADMIN_DOMAIN, $SITE_DOMAIN and www.$SITE_DOMAIN"
docker compose run --rm --entrypoint certbot certbot certonly --webroot -w /var/www/certbot --cert-name shop \
  -d "$API_DOMAIN" -d "$ADMIN_DOMAIN" -d "$SITE_DOMAIN" -d "www.$SITE_DOMAIN" \
  --email "$LETSENCRYPT_EMAIL" --agree-tos --no-eff-email --non-interactive --expand ${STAGING:+--staging}

# Re-render the template too: Nginx only reads it when its container starts.
docker compose exec nginx sh -c "/docker-entrypoint.d/20-envsubst-on-templates.sh >/dev/null && nginx -t && nginx -s reload"
echo "Done. Website: https://$SITE_DOMAIN  Admin: https://$ADMIN_DOMAIN  API: https://$API_DOMAIN/health"
