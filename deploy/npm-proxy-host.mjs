#!/usr/bin/env node

/**
 * Add a Proxy Host in Nginx Proxy Manager (NPM) for TTMS with SSL and HTTP/2.
 *
 * Run on the server (or from a machine that can reach NPM):
 *   NPM_URL=http://127.0.0.1:81 \
 *   NPM_EMAIL=admin@example.com \
 *   NPM_PASSWORD=your-password \
 *   DOMAIN=ttms.ai \
 *   node deploy/npm-proxy-host.mjs
 *
 * Optional: DOMAIN_WWW=www.ttms.ai to add www as well.
 * Optional: FORWARD_PORT=8456 (default 8456).
 */

const NPM_URL = (process.env.NPM_URL || "http://127.0.0.1:81").replace(/\/+$/, "");
const NPM_EMAIL = process.env.NPM_EMAIL;
const NPM_PASSWORD = process.env.NPM_PASSWORD;
const DOMAIN = process.env.DOMAIN || "ttms.ai";
const DOMAIN_WWW = process.env.DOMAIN_WWW;
const FORWARD_PORT = parseInt(process.env.FORWARD_PORT || "8456", 10);

async function request(path, options = {}) {
  const url = `${NPM_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`NPM API ${res.status} ${path}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function getToken() {
  if (!NPM_EMAIL || !NPM_PASSWORD) {
    throw new Error("Set NPM_EMAIL and NPM_PASSWORD (or run with env file).");
  }
  const data = await request("/api/tokens", {
    method: "POST",
    body: JSON.stringify({
      identity: NPM_EMAIL,
      secret: NPM_PASSWORD,
    }),
  });
  if (!data || !data.token) {
    throw new Error("Login failed: no token in response.");
  }
  return data.token;
}

async function main() {
  const token = await getToken();
  const domainNames = [DOMAIN];
  if (DOMAIN_WWW) domainNames.push(DOMAIN_WWW);

  const existing = await request("/api/nginx/proxy-hosts", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const found = Array.isArray(existing) && existing.find((h) => h.domain_names && h.domain_names.includes(DOMAIN));
  if (found) {
    console.log(`Proxy host for ${DOMAIN} already exists (id ${found.id}). Update SSL/hosting in NPM UI if needed.`);
    return;
  }

  const body = {
    domain_names: domainNames,
    forward_scheme: "http",
    forward_host: "127.0.0.1",
    forward_port: FORWARD_PORT,
    allow_websocket_upgrade: true,
    access_list_id: null,
    certificate_id: 0,
    ssl_forced: true,
    http2_support: true,
    hsts_enabled: true,
    hsts_subdomains: false,
    meta: {},
    advanced_config: "",
    enabled: true,
  };

  const created = await request("/api/nginx/proxy-hosts", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

  console.log("Proxy host created in NPM:");
  console.log("  Domain(s):", domainNames.join(", "));
  console.log("  Forward: http://127.0.0.1:" + FORWARD_PORT);
  console.log("  SSL forced: true, HTTP/2: true");
  console.log("");
  console.log("Next: In NPM UI open Hosts → this proxy → SSL tab → Request a new SSL Certificate (Let's Encrypt), set email, agree to terms, Save.");
  console.log("Or use NPM’s SSL tab to attach an existing cert.");
}

main().catch((err) => {
  process.stderr.write(String(err.message || err) + "\n");
  process.exit(1);
});
