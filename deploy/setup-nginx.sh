#!/usr/bin/env bash
# One-time Nginx config setup on the deploy server.
# Run from repo root after: npm run build
#
# Usage:
#   ./deploy/setup-nginx.sh              # system nginx on port 8456
#   ./deploy/setup-nginx.sh --standalone  # standalone nginx (when port 80 is in use, e.g. NPM)
#
# Env: DEPLOY_HOST, DEPLOY_USER, DEPLOY_WEB_ROOT (defaults: 31.97.9.33, root, /var/www/ttms)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_HOST="${DEPLOY_HOST:-31.97.9.33}"
DEPLOY_WEB_ROOT="${DEPLOY_WEB_ROOT:-/var/www/ttms}"
REMOTE="${DEPLOY_USER}@${DEPLOY_HOST}"

STANDALONE=
[[ "${1:-}" == "--standalone" ]] && STANDALONE=1

REDIRECTS_PATH="deploy/nginx/legacy-redirects.conf"
SERVER_CONF="deploy/nginx/ttms-8456.server.conf"
SNIPPET_PATH="/etc/nginx/snippets/ttms-legacy-redirects.conf"

if [[ ! -f "$REDIRECTS_PATH" ]]; then
  echo "Error: $REDIRECTS_PATH not found. Run 'npm run build' first." >&2
  exit 1
fi
if [[ ! -f "$SERVER_CONF" ]]; then
  echo "Error: $SERVER_CONF not found." >&2
  exit 1
fi

echo "Setting up Nginx for TTMS on $REMOTE (standalone=$STANDALONE)..."

if [[ -n "$STANDALONE" ]]; then
  # Standalone nginx: only listens on 8456 (for use with NPM on 80).
  ssh "$REMOTE" "mkdir -p /etc/nginx/snippets $DEPLOY_WEB_ROOT"
  scp "$REDIRECTS_PATH" "$REMOTE:/etc/nginx/snippets/ttms-legacy-redirects.conf"
  scp "$SERVER_CONF" "$REMOTE:/etc/nginx/ttms-8456-server.conf"
  scp "$SCRIPT_DIR/nginx/ttms-8456-standalone.conf" "$REMOTE:/etc/nginx/ttms-8456-standalone.conf"
  scp "$SCRIPT_DIR/nginx/ttms-8456.service" "$REMOTE:/etc/systemd/system/"
  ssh "$REMOTE" "systemctl daemon-reload && systemctl enable --now ttms-8456"
  echo "Standalone Nginx (ttms-8456) enabled. Reload after redirect changes: systemctl reload ttms-8456"
else
  # System nginx: add server block to conf.d and snippets.
  ssh "$REMOTE" "mkdir -p /etc/nginx/snippets $DEPLOY_WEB_ROOT"
  scp "$REDIRECTS_PATH" "$REMOTE:$SNIPPET_PATH"
  scp "$SERVER_CONF" "$REMOTE:/etc/nginx/conf.d/ttms-8456.conf"
  ssh "$REMOTE" "nginx -t && systemctl reload nginx"
  echo "System Nginx updated. Reload after redirect changes: systemctl reload nginx"
fi

echo "Done. Site will be served on port 8456 (ensure firewall allows it)."
