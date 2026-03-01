# FTP Deployment Runbook (`_site` output)

## Site URL

**TTMS site:** http://31.97.9.33:8456 (set in deploy script via `DEPLOY_PORT=8456`). (Port must be ≤65535; 84567 is invalid.)

## DNS setup (for custom domain + HTTPS)

To use a domain (e.g. **ttms.ai**) with Nginx Proxy Manager and Let’s Encrypt, point the domain to your server IP at your DNS provider.

**Server IP:** `31.97.9.33` (override with `DEPLOY_HOST` if different.)

| Type  | Name | Value        | TTL (optional) |
|-------|------|--------------|----------------|
| **A** | `@`  | `31.97.9.33` | 300 or 3600    |
| **A** | `www` | `31.97.9.33` | 300 or 3600  |

- **A record `@`** = apex domain (e.g. `ttms.ai`).
- **A record `www`** = `www.ttms.ai`. Alternatively you can use a **CNAME** `www` → `ttms.ai` if your provider supports CNAME flattening at the apex.
- Lower TTL (e.g. 300) is useful before go-live; increase after DNS is stable.

**After saving:** Wait for propagation (minutes to a few hours). Check with:

```bash
dig ttms.ai +short
dig www.ttms.ai +short
```

Once both resolve to your server IP, add the Proxy Host in NPM and request the SSL certificate (see **NPM + HTTP/2** below).

## One-time server config (Nginx on port 8456)

To have the server serve TTMS on port **8456** (without NPM), copy the provided server config once and reload Nginx:

1. Ensure the legacy redirects snippet exists on the server (the deploy script writes it, or copy it once):
   - `deploy/nginx/legacy-redirects.conf` → `/etc/nginx/snippets/ttms-legacy-redirects.conf`
2. Copy the port-8456 server block to the server:
   - `scp deploy/nginx/ttms-8456.server.conf root@31.97.9.33:/etc/nginx/conf.d/ttms-8456.conf`
3. Reload: `ssh root@31.97.9.33 'nginx -t && systemctl reload nginx'`

**Or run the one-time setup script** (from repo root after `npm run build`):

```bash
./deploy/setup-nginx.sh
# Or for standalone Nginx (when NPM uses port 80): ./deploy/setup-nginx.sh --standalone
```
4. **Allow port in firewall** (one-time, on the server):
   - **ufw:** `ssh root@31.97.9.33 'ufw allow 8456/tcp && ufw status'` (then `ufw reload` if needed)
   - **firewalld:** `ssh root@31.97.9.33 'firewall-cmd --permanent --add-port=8456/tcp && firewall-cmd --reload'`

**If port 80 is already in use** (e.g. Nginx Proxy Manager), system `nginx` will not start. Use a **standalone Nginx** that only listens on 8456:

```bash
./deploy/setup-nginx.sh --standalone
```

Or manually: copy `deploy/nginx/ttms-8456.server.conf` to `/etc/nginx/ttms-8456-server.conf`, then the standalone config and systemd unit; enable the service. Reload after deploy when redirects change: `systemctl reload ttms-8456`.

After that, each deploy is just `./deploy/deploy.sh`; the script updates `/var/www/ttms` and the redirects snippet when needed.

## Nginx Proxy Manager (alternative)

If the server uses **Nginx Proxy Manager**, configure a host so that **port 8456** serves `/var/www/ttms` with the rules from `deploy/nginx/ttms.conf.snippet` (and include or paste `deploy/nginx/legacy-redirects.conf`). Then http://31.97.9.33:8456 will serve the TTMS site.

### NPM + HTTP/2 (TLS termination)

To serve the site over HTTPS with **HTTP/2** using Nginx Proxy Manager:

1. **DNS:** Point your domain (e.g. `ttms.ai`) to the server IP (e.g. `31.97.9.33`).
2. **Proxy Host:** In NPM, add a Proxy Host for that domain.
3. **Upstream:** Set the forward hostname to `127.0.0.1` and port to `8456` (the TTMS Nginx/standalone service).
4. **SSL:** Enable SSL and use Let’s Encrypt; enable “Force SSL”.
5. NPM will terminate TLS and speak **HTTP/2** to clients; it proxies to `http://127.0.0.1:8456` over HTTP/1.1. The TTMS app is still served by the process listening on 8456.

**Scripted proxy host:** Run `deploy/npm-proxy-host.mjs` to create the proxy host via the NPM API (then request the SSL certificate in the NPM UI):

```bash
NPM_URL=http://127.0.0.1:81 NPM_EMAIL=admin@example.com NPM_PASSWORD=your-password DOMAIN=ttms.ai DOMAIN_WWW=www.ttms.ai node deploy/npm-proxy-host.mjs
```

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

## Troubleshooting: “Default Nginx page” instead of TTMS on ttms.ai

If **ttms.ai** (or **www.ttms.ai**) shows the default “Welcome to nginx” page:

1. **Port 80 is served by system nginx, not NPM**  
   So the default server block is answering for your domain. NPM must be the process listening on 80/443 for the domain to hit the right proxy.

2. **No NPM Proxy Host for ttms.ai**  
   So NPM (or whatever is on 80) falls back to a default page.

**Fix (do in order):**

- **A. Ensure TTMS is running on port 8456** (site files + nginx on 8456):
  ```bash
  npm run build
  ./deploy/deploy.sh
  ssh root@31.97.9.33 'curl -sI http://127.0.0.1:8456/ | head -5'
  ```
  You should see `HTTP/1.1 200` and the TTMS response. If 8456 is not listening or returns an error, run:
  ```bash
  ./deploy/setup-nginx.sh --standalone
  ```
  then deploy again.

- **B. Make NPM handle ttms.ai on port 80/443**  
  If NPM runs in Docker, ensure **no other nginx** is binding 80/443 (stop system nginx if needed: `systemctl stop nginx`). Then in **NPM UI** (http://31.97.9.33:81):

  - **Hosts → Proxy Hosts → Add Proxy Host**
  - **Details:** Domain names = `ttms.ai` (and `www.ttms.ai` if you use www)
  - **Details:** Forward hostname = `127.0.0.1`, Forward port = `8456`
  - **SSL:** Request a Let’s Encrypt certificate and enable “Force SSL”
  - Save

  Or create the proxy host via script (then request the certificate in NPM UI):
  ```bash
  NPM_URL=http://31.97.9.33:81 NPM_EMAIL=your@email NPM_PASSWORD=yourpass DOMAIN=ttms.ai DOMAIN_WWW=www.ttms.ai node deploy/npm-proxy-host.mjs
  ```

- **C. Check what is listening on 80**
  ```bash
  ssh root@31.97.9.33 'ss -tlnp | grep -E ":80 |:443 "'
  ```
  You should see NPM (e.g. Docker) on 80/443, not the system `nginx` binary, if you want NPM to serve ttms.ai.

After B, open **https://ttms.ai** again; it should show the TTMS site.

## Rollback
- Re-upload previous static bundle (`dist.zip` or previous `_site.zip`).
- Restore previous Nginx config and reload Nginx.
