#!/bin/sh
# Updates this client to the latest pushed commit; migrations run automatically on start.
# Builds the images on this server (about 5 minutes on 1 CPU and 1.5 GB of RAM).
set -eu
cd "$(dirname "$0")"

git pull --ff-only
commit=$(git rev-parse HEAD)

docker compose up -d --build

# Nginx keeps running across updates and reads its template only when it starts, so template
# changes are rendered and loaded here.
docker compose exec -T nginx sh -c \
  '/docker-entrypoint.d/20-envsubst-on-templates.sh > /dev/null && nginx -t -q && nginx -s reload'
docker image prune -f > /dev/null
echo "Updated to $commit"
