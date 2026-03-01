#!/usr/bin/env bash
#
# Create Nginx Proxy Manager proxy host for TTMS (domain → 127.0.0.1:8456)
# with SSL forced and HTTP/2. Then you request the Let's Encrypt cert in the NPM UI.
#
# Usage:
#   1. Copy env template and edit:
#        cp deploy/.env.npm.example deploy/.env.npm
#        # edit deploy/.env.npm with your NPM_URL, NPM_EMAIL, NPM_PASSWORD, DOMAIN
#   2. Run:
#        ./deploy/setup-npm.sh
#
# Or pass env inline:
#    NPM_EMAIL=admin@example.com NPM_PASSWORD=secret DOMAIN=ttms.ai ./deploy/setup-npm.sh
#
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -f "$SCRIPT_DIR/.env.npm" ]]; then
  set -a
  source "$SCRIPT_DIR/.env.npm"
  set +a
fi

export NPM_URL="${NPM_URL:-http://127.0.0.1:81}"
export DOMAIN="${DOMAIN:-ttms.ai}"
export FORWARD_PORT="${FORWARD_PORT:-8456}"

if [[ -z "$NPM_EMAIL" || -z "$NPM_PASSWORD" ]]; then
  echo "Error: NPM_EMAIL and NPM_PASSWORD are required." >&2
  echo "Set them in deploy/.env.npm or pass them in the environment." >&2
  echo "Example: NPM_EMAIL=admin@example.com NPM_PASSWORD=yourpass DOMAIN=ttms.ai $0" >&2
  exit 1
fi

exec node "$SCRIPT_DIR/npm-proxy-host.mjs"
