#!/bin/sh
# Updates this client to the latest pushed commit; migrations run automatically on start.
#
# With IMAGE_PREFIX in .env (e.g. ghcr.io/<github-owner>/grocery), pulls the images CI built for
# that commit (.github/workflows/ci.yml, "images" job). Without it, builds them on this server
# (about 5 minutes on 1 CPU and 1.5 GB of RAM).
set -eu
cd "$(dirname "$0")"

git pull --ff-only
commit=$(git rev-parse HEAD)
prefix=$(sed -n 's/^[[:space:]]*IMAGE_PREFIX=//p' .env | tail -n 1 | tr -d "\"' ")

if [ -z "$prefix" ]; then
  docker compose up -d --build
  exit 0
fi

for image in migrate api admin web; do
  if ! docker pull "$prefix-$image:$commit"; then
    echo "No $image image for commit $commit. Wait until CI has finished for it (or check that this server is signed in to the registry), then run this again." >&2
    exit 1
  fi
done
# Tagged without a version, so restarts and plain `docker compose up -d` keep using this commit.
for image in migrate api admin web; do
  docker tag "$prefix-$image:$commit" "$prefix-$image"
  docker rmi "$prefix-$image:$commit" > /dev/null
done

docker compose up -d --no-build
docker image prune -f > /dev/null
echo "Updated to $commit"
