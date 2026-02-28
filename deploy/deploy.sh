#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_HOST="${DEPLOY_HOST:-31.97.9.33}"
DEPLOY_PORT="${DEPLOY_PORT:-8456}"
DEPLOY_WEB_ROOT="${DEPLOY_WEB_ROOT:-/var/www/ttms}"
REMOTE="${DEPLOY_USER}@${DEPLOY_HOST}"
SITE_URL="http://${DEPLOY_HOST}:${DEPLOY_PORT}"

ZIP_PATH="_site.zip"
REDIRECTS_PATH="deploy/nginx/legacy-redirects.conf"
REMOTE_ZIP="/tmp/_site.zip"
REMOTE_REDIRECTS_NEW="/tmp/ttms-legacy-redirects.conf.new"
NGINX_SNIPPET="/etc/nginx/snippets/ttms-legacy-redirects.conf"

if [[ ! -f "$ZIP_PATH" ]]; then
  echo "Error: $ZIP_PATH not found. Run 'npm run build' first." >&2
  exit 1
fi

if [[ ! -f "$REDIRECTS_PATH" ]]; then
  echo "Error: $REDIRECTS_PATH not found. Run 'npm run build' first." >&2
  exit 1
fi

echo "Uploading _site.zip and legacy-redirects.conf to $REMOTE..."
scp "$ZIP_PATH" "$REMOTE:$REMOTE_ZIP"
scp "$REDIRECTS_PATH" "$REMOTE:$REMOTE_REDIRECTS_NEW"

echo "Extracting site and updating Nginx (if redirects changed)..."
ssh "$REMOTE" bash -s -- "$REMOTE_ZIP" "$REMOTE_REDIRECTS_NEW" "$NGINX_SNIPPET" "$DEPLOY_WEB_ROOT" << 'REMOTE_SCRIPT'
set -e
REMOTE_ZIP="$1"
REMOTE_REDIRECTS_NEW="$2"
NGINX_SNIPPET="$3"
WEB_ROOT="$4"

need_reload=0
cmp -s "$REMOTE_REDIRECTS_NEW" "$NGINX_SNIPPET" 2>/dev/null || need_reload=1
if [[ "$need_reload" -eq 1 ]]; then
  echo "Redirects config changed; updating snippet and reloading Nginx."
  cp "$REMOTE_REDIRECTS_NEW" "$NGINX_SNIPPET"
  nginx -t
  systemctl reload nginx
else
  echo "Redirects unchanged; skipping Nginx reload."
fi

echo "Extracting _site.zip into $WEB_ROOT..."
unzip -o "$REMOTE_ZIP" -d "$WEB_ROOT"

echo "Cleaning up /tmp artifacts..."
rm -f "$REMOTE_ZIP" "$REMOTE_REDIRECTS_NEW"
REMOTE_SCRIPT

echo "Deploy complete. Site: $SITE_URL"
