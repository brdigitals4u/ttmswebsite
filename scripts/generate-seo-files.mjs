#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyCleanPathAlias, cleanPathFromLegacy } from "./lib/route-utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const PAGES_PATH = path.join(ROOT, "site", "_generated", "pages.json");
const INDEX_HTML_PATH = path.join(ROOT, "_site", "index.html");
const OUT_DIR = path.join(ROOT, "_site");

const SITE_URL = (process.env.SITE_URL || "https://ttms.ai").replace(/\/+$/, "");
const BLOG_API_BASE_URL = process.env.BLOG_API_BASE_URL || "https://ttmkonnect.com/api/posts";
const BLOG_API_PROXY_BASE_URL = process.env.BLOG_API_PROXY_BASE_URL || "https://api.codetabs.com/v1/proxy/?quest=";
const BLOG_API_PER_PAGE = Number(process.env.BLOG_API_PER_PAGE || 10);
const BLOG_API_MAX_PAGES = Number(process.env.BLOG_API_MAX_PAGES || 50);
const BLOG_API_RETRY_COUNT = Number(process.env.BLOG_API_RETRY_COUNT || 5);
const BLOG_API_RETRY_INTERVAL_MS = Number(process.env.BLOG_API_RETRY_INTERVAL_MS || 3000);
const BLOG_API_REQUIRED = String(process.env.BLOG_API_REQUIRED || "false") === "true";
const EXCLUDED_SITEMAP_PATHS = new Set([
  "/apps/mobile/",
  "/auth/error-404-basic/",
  "/auth/error-404-illustration/",
  "/auth/reset-password-illustration/",
  "/auth/reset-password/",
  "/auth/signin-basic/",
  "/auth/signin-illustration/",
  "/auth/signin-left-cover/",
  "/auth/signin-popup-image/",
  "/auth/signin-popup/",
  "/auth/signin-right-cover/",
  "/auth/signup-basic/",
  "/auth/signup-illustration/",
  "/auth/signup-left-cover/",
  "/auth/signup-popup-image/",
  "/auth/signup-popup/",
  "/auth/signup-right-cover/",
  "/blog/blog-alt-1/",
  "/blog/blog-alt-2/"
]);

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isExternalUrl(url) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(String(url || ""));
}

function normalizeHrefToPath(rawHref) {
  const href = String(rawHref || "").trim();
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) {
    return "";
  }

  let url = href;
  if (isExternalUrl(url)) {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      try {
        const parsed = new URL(url);
        const siteParsed = new URL(SITE_URL);
        if (parsed.origin !== siteParsed.origin) {
          return "";
        }
        url = `${parsed.pathname}${parsed.search}${parsed.hash}`;
      } catch {
        return "";
      }
    } else {
      return "";
    }
  }

  const hashIndex = url.indexOf("#");
  const queryIndex = url.indexOf("?");
  let pathCut = url;
  let suffix = "";

  if (hashIndex >= 0 && queryIndex >= 0) {
    const cut = Math.min(hashIndex, queryIndex);
    pathCut = url.slice(0, cut);
    suffix = url.slice(cut);
  } else if (hashIndex >= 0) {
    pathCut = url.slice(0, hashIndex);
    suffix = url.slice(hashIndex);
  } else if (queryIndex >= 0) {
    pathCut = url.slice(0, queryIndex);
    suffix = url.slice(queryIndex);
  }

  let pathname = pathCut.startsWith("/") ? pathCut : `/${pathCut}`;
  pathname = applyCleanPathAlias(pathname);

  if (pathname.endsWith(".html")) {
    pathname = cleanPathFromLegacy(pathname);
  } else if (pathname !== "/" && !pathname.endsWith("/")) {
    pathname = `${pathname}/`;
  }

  return `${pathname}${suffix}`;
}

function extractInternalLinksFromIndex(indexHtml) {
  const links = new Set();
  const regex = /<a\b[^>]*\bhref=(['"])(.*?)\1/gi;

  let match = regex.exec(indexHtml);
  while (match) {
    const normalized = normalizeHrefToPath(match[2]);
    if (normalized) {
      links.add(normalized);
    }
    match = regex.exec(indexHtml);
  }

  return [...links];
}

async function fetchJsonWithRetries(targetUrl) {
  let lastError;

  for (let attempt = 1; attempt <= BLOG_API_RETRY_COUNT; attempt += 1) {
    try {
      const response = await fetch(targetUrl, {
        method: "GET",
        headers: { Accept: "application/json" }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < BLOG_API_RETRY_COUNT) {
        await sleep(BLOG_API_RETRY_INTERVAL_MS);
      }
    }
  }

  throw lastError || new Error("Unknown API error");
}

async function fetchBlogPage(page) {
  const targetUrl = `${BLOG_API_BASE_URL}?page=${page}&perPage=${BLOG_API_PER_PAGE}`;

  try {
    return await fetchJsonWithRetries(targetUrl);
  } catch {
    const proxyTarget = `${BLOG_API_PROXY_BASE_URL}${encodeURIComponent(targetUrl)}`;
    return await fetchJsonWithRetries(proxyTarget);
  }
}

function parsePosts(payload) {
  return Array.isArray(payload?.posts) ? payload.posts : [];
}

async function fetchAllBlogPosts() {
  const all = [];

  for (let page = 1; page <= BLOG_API_MAX_PAGES; page += 1) {
    const payload = await fetchBlogPage(page);
    const posts = parsePosts(payload);

    if (!posts.length) {
      break;
    }

    all.push(...posts);

    if (posts.length < BLOG_API_PER_PAGE) {
      break;
    }
  }

  return all;
}

function toIsoDate(value) {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

function normalizePathForLoc(pathOrUrl) {
  const input = String(pathOrUrl || "");
  if (!input) return "/";
  const withSlash = input.startsWith("/") ? input : `/${input}`;
  return applyCleanPathAlias(withSlash);
}

function isExcludedSitemapPath(pathValue) {
  const normalized = normalizePathForLoc(pathValue).split("?")[0].split("#")[0];
  return EXCLUDED_SITEMAP_PATHS.has(normalized);
}

async function main() {
  const pages = JSON.parse(await readFile(PAGES_PATH, "utf8"));

  const pageLastModByPath = new Map();
  for (const page of pages) {
    pageLastModByPath.set(page.cleanPath, page.lastModified || new Date().toISOString().slice(0, 10));
  }

  const urls = new Map();

  for (const page of pages) {
    if (isExcludedSitemapPath(page.cleanPath)) {
      continue;
    }
    const loc = `${SITE_URL}${normalizePathForLoc(page.cleanPath)}`;
    urls.set(loc, page.lastModified || new Date().toISOString().slice(0, 10));
  }

  try {
    const indexHtml = await readFile(INDEX_HTML_PATH, "utf8");
    const navLinks = extractInternalLinksFromIndex(indexHtml);

    for (const href of navLinks) {
      const pathValue = normalizePathForLoc(href);
      if (isExcludedSitemapPath(pathValue)) {
        continue;
      }
      const loc = `${SITE_URL}${pathValue}`;
      const cleanPathOnly = pathValue.split("?")[0].split("#")[0];
      const lastmod = pageLastModByPath.get(cleanPathOnly) || new Date().toISOString().slice(0, 10);
      if (!urls.has(loc)) {
        urls.set(loc, lastmod);
      }
    }
  } catch (error) {
    process.stderr.write(`Warning: unable to parse nav links from _site/index.html: ${error.message}\n`);
  }

  try {
    const posts = await fetchAllBlogPosts();
    for (const post of posts) {
      if (!post?.slug) continue;
      const loc = `${SITE_URL}/blog/blog-detail/?slug=${encodeURIComponent(String(post.slug))}`;
      urls.set(loc, toIsoDate(post.date));
    }
    process.stdout.write(`Fetched ${posts.length} blog post(s) from API for sitemap.\n`);
  } catch (error) {
    const message = `Warning: blog API fetch failed for sitemap: ${error.message}`;
    if (BLOG_API_REQUIRED) {
      throw new Error(message);
    }
    process.stderr.write(`${message}\n`);
  }

  const urlEntries = [...urls.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([loc, lastmod]) => {
      return `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${toIsoDate(lastmod)}</lastmod>\n  </url>`;
    })
    .join("\n");

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries}\n</urlset>\n`;
  const robots = `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, "sitemap.xml"), sitemap, "utf8");
  await writeFile(path.join(OUT_DIR, "robots.txt"), robots, "utf8");

  process.stdout.write(`Generated _site/sitemap.xml and _site/robots.txt with ${urls.size} URL(s).\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
