# FTP Deployment Runbook (`_site` output)

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
