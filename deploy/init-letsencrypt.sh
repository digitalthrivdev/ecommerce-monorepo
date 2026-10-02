#!/usr/bin/env bash
# First start on a new server: gets the HTTPS certificate for API_DOMAIN and ADMIN_DOMAIN from
# Let's Encrypt and starts the stack. Both domains must already point at this server (DNS A record)
# and ports 80 and 443 must be open. Renewal afterwards is automatic (certbot service).
#
#   ./init-letsencrypt.sh             real certificate
#   STAGING=1 ./init-letsencrypt.sh   Let's Encrypt test certificate (untrusted; for a dry run)
#   SELF_SIGNED=1 ./init-letsencrypt.sh  no Let's Encrypt at all (local testing only)
set -euo pipefail
cd "$(dirname "$0")"

[ -f .env ] || { echo "Create .env from .env.example first." >&2; exit 1; }
[ -f api.env ] || { echo "Create api.env from api.env.example first." >&2; exit 1; }
set -a
# shellcheck disable=SC1091
. ./.env
set +a
: "${API_DOMAIN:?Set API_DOMAIN in .env}" "${ADMIN_DOMAIN:?Set ADMIN_DOMAIN in .env}"
if [ -z "${SELF_SIGNED:-}" ]; then
  : "${LETSENCRYPT_EMAIL:?Set LETSENCRYPT_EMAIL in .env}"
fi

live=/etc/letsencrypt/live/grocery
certbot() { docker compose run --rm --entrypoint "$1" certbot "${@:2}"; }

echo "Creating a temporary certificate so Nginx can start"
certbot sh -c "mkdir -p $live && openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
  -keyout $live/privkey.pem -out $live/fullchain.pem -subj /CN=localhost >/dev/null 2>&1"

echo "Building and starting the stack (the first build takes a few minutes)"
docker compose up -d --build

if [ -n "${SELF_SIGNED:-}" ]; then
  echo "Done, with a self-signed certificate."
  exit 0
fi

echo "Requesting the Let's Encrypt certificate for $API_DOMAIN and $ADMIN_DOMAIN"
certbot sh -c "rm -rf /etc/letsencrypt/live/grocery /etc/letsencrypt/archive/grocery /etc/letsencrypt/renewal/grocery.conf"
certbot certbot certonly --webroot -w /var/www/certbot --cert-name grocery \
  -d "$API_DOMAIN" -d "$ADMIN_DOMAIN" --email "$LETSENCRYPT_EMAIL" --agree-tos --no-eff-email \
  --non-interactive ${STAGING:+--staging}

docker compose exec nginx nginx -s reload
echo "Done. Admin: https://$ADMIN_DOMAIN  API: https://$API_DOMAIN/health"
