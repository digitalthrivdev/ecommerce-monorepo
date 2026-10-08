#!/bin/sh
# Deploys one commit for the GitHub Actions "deploy" job (.github/workflows/ci.yml). Runs through an
# SSH key that can run nothing else (docs/deployment.md, "Automatic deploys"), after that key's
# forced command has run `git pull`. The job sends "<commit> <github user>" as the SSH command and
# its short-lived registry token on stdin.
set -euf
cd "$(dirname "$0")"

# shellcheck disable=SC2086 # split on purpose; globbing is off (set -f)
set -- ${SSH_ORIGINAL_COMMAND:-}
commit=${1:-}
user=${2:-}
case "$commit" in *[!0-9a-f]* | "") commit= ;; esac
case "$user" in *[!A-Za-z0-9_.-]* | "") user= ;; esac
if [ ${#commit} -ne 40 ] || [ -z "$user" ]; then
  echo "Usage: <40-character commit> <github user>, registry token on stdin" >&2
  exit 2
fi

# One deploy at a time, including manual ./update.sh runs started through this script.
exec 9> "${TMPDIR:-/tmp}/grocery-deploy.lock"
flock 9

head=$(git rev-parse HEAD)
if [ "$head" != "$commit" ]; then
  if git merge-base --is-ancestor "$commit" "$head" 2> /dev/null; then
    echo "A newer commit ($head) is already on main; its own CI run deploys it."
    exit 0
  fi
  echo "Commit $commit is not on main here (HEAD is $head)." >&2
  exit 1
fi

# The registry login lives only in this temporary folder, never in ~/.docker.
DOCKER_CONFIG=$(mktemp -d)
export DOCKER_CONFIG
trap 'rm -rf "$DOCKER_CONFIG"' EXIT
docker login ghcr.io --username "$user" --password-stdin > /dev/null

echo "Backing up before the update"
docker compose exec -T backup sh /usr/local/bin/backup.sh

./update.sh

echo "Waiting for api, admin and web to report healthy"
healthy() {
  for service in api admin web; do
    id=$(docker compose ps -q "$service")
    [ -n "$id" ] && [ "$(docker inspect -f '{{.State.Health.Status}}' "$id")" = healthy ] || return 1
  done
}
deadline=$(($(date +%s) + 300))
until healthy; do
  if [ "$(date +%s)" -ge "$deadline" ]; then
    docker compose ps
    echo "Not healthy after 5 minutes. Logs: docker compose logs --tail 100 api admin web" >&2
    exit 1
  fi
  sleep 5
done

api_domain=$(sed -n 's/^[[:space:]]*API_DOMAIN=//p' .env | tail -n 1 | tr -d "\"' ")
curl -fsS --max-time 15 "https://$api_domain/health"
echo
echo "Deployed $commit"
