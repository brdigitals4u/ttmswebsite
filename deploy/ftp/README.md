# FTP Deployment Runbook (`_site` output)

## Site URL

**TTMS site:** http://31.97.9.33:8456 (set in deploy script via `DEPLOY_PORT=8456`). (Port must be ≤65535; 84567 is invalid.)

## One-time server config (Nginx on port 8456)

To have the server serve TTMS on port **8456** (without NPM), copy the provided server config once and reload Nginx:

1. Ensure the legacy redirects snippet exists on the server (the deploy script writes it, or copy it once):
   - `deploy/nginx/legacy-redirects.conf` → `/etc/nginx/snippets/ttms-legacy-redirects.conf`
2. Copy the port-8456 server block to the server:
   - `scp deploy/nginx/ttms-84567.server.conf root@31.97.9.33:/etc/nginx/conf.d/ttms-84567.conf`
3. Reload: `ssh root@31.97.9.33 'nginx -t && systemctl reload nginx'`
4. **Allow port in firewall** (one-time, on the server):
   - **ufw:** `ssh root@31.97.9.33 'ufw allow 8456/tcp && ufw status'` (then `ufw reload` if needed)
   - **firewalld:** `ssh root@31.97.9.33 'firewall-cmd --permanent --add-port=8456/tcp && firewall-cmd --reload'`

**If port 80 is already in use** (e.g. Nginx Proxy Manager), system `nginx` will not start. Use a **standalone Nginx** that only listens on 8456:

1. Copy the standalone config and systemd unit, then enable the service:
   - `scp deploy/nginx/ttms-8456-standalone.conf root@31.97.9.33:/etc/nginx/ttms-8456-standalone.conf`
   - `scp deploy/nginx/ttms-8456.service root@31.97.9.33:/etc/systemd/system/`
   - `ssh root@31.97.9.33 'systemctl daemon-reload && systemctl enable --now ttms-8456'`
2. Reload after deploy when redirects change: `ssh root@31.97.9.33 'systemctl reload ttms-8456'`

After that, each deploy is just `./deploy/deploy.sh`; the script updates `/var/www/ttms` and the redirects snippet when needed.

## Nginx Proxy Manager (alternative)

If the server uses **Nginx Proxy Manager**, configure a host so that **port 8456** serves `/var/www/ttms` with the rules from `deploy/nginx/ttms.conf.snippet` (and include or paste `deploy/nginx/legacy-redirects.conf`). Then http://31.97.9.33:8456 will serve the TTMS site.

## SSH deploy (recommended for KVM)

If Nginx (or NPM with the config above) is already configured once with `deploy/nginx/ttms.conf.snippet` and `deploy/nginx/legacy-redirects.conf`, you can deploy each release with:

```bash
./deploy/deploy.sh
```

Or `npm run deploy` after `npm run build`. The script uploads `_site.zip`, extracts into the web root (default `/var/www/ttms`), and reloads Nginx only when `legacy-redirects.conf` has changed. Override via env: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_WEB_ROOT` (default host `31.97.9.33`, user `root`).

---

## Prerequisites
- Build locally: `npm run build`
- Ensure artifacts exist:
  - `_site/`
  - `_site.zip`
  - `deploy/nginx/legacy-redirects.conf`

## Upload order (cache-safe)
1. Upload all hashed assets first:
   - `_site/assets/*`
2. Upload remaining static directories:
   - `_site/apps`, `_site/services`, `_site/company`, `_site/landing`, `_site/blog`, `_site/auth`
3. Upload root docs last:
   - `_site/index.html`, `_site/robots.txt`, `_site/sitemap.xml`

## Nginx update
1. Copy `deploy/nginx/ttms.conf.snippet` rules into server config.
2. Copy generated redirects file:
   - `deploy/nginx/legacy-redirects.conf` -> `/etc/nginx/snippets/ttms-legacy-redirects.conf`
3. Validate and reload:
   - `nginx -t`
   - `nginx -s reload`

## Post-deploy verification
- `curl -I https://ttms.ai/` should return `200` and serve desktop homepage.
- `curl -I https://ttms.ai/apps/desktop/` should return `308` to `/`.
- `curl -I https://ttms.ai/services/fleet-management.html` should return `308` to `/services/fleet-management/`
- `curl -I https://ttms.ai/company/contact/` should return `308` to `/contact/`
- Open top pages and verify CSS/JS and media assets load without 404.

## Rollback
- Re-upload previous static bundle (`dist.zip` or previous `_site.zip`).
- Restore previous Nginx config and reload Nginx.
