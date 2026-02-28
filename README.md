# TTMS (Eleventy + Vite Migration)

This repository now builds TTMS as a clean-url static site using Eleventy and Vite, while preserving legacy `.html` URLs through generated redirects.

## Stack
- `@11ty/eleventy`
- `@11ty/eleventy-plugin-vite`
- `@11ty/eleventy-img` (installed for image optimization phase)
- `@11ty/eleventy-navigation`

## Key Paths
- Legacy source HTML: `dist/`
- Eleventy source: `site/`
- Generated page dataset: `site/_generated/pages.json`
- Build output: `_site/`
- Deployment zip: `_site.zip`
- Redirect map: `deploy/redirects/legacy-map.json`
- Nginx configs: `deploy/nginx/`

## Commands
- `npm run ensure:sourcemaps` Create placeholder sourcemap files for legacy vendor assets that reference missing `.map` files.
- `npm run migrate:html` Generate clean-route page dataset from legacy HTML.
- `npm run generate:redirects` Generate redirect JSON + Nginx include file.
- `npm run generate:seo` Generate `_site/sitemap.xml` and `_site/robots.txt` from clean routes, homepage nav links, and blog API posts.
- `npm run validate:routes` Ensure all legacy routes map to valid clean routes.
- `npm run build` Full production build (includes migration, redirects, and validation).
- `npm run dev` Build generated datasets and run Eleventy dev server.

## URL Strategy
- Canonical URLs are clean (for example `/services/fleet-management/`).
- Contact page canonical URL is `/contact/`.
- Legacy URLs (for example `/services/fleet-management.html`) redirect with `308`.
- Root `/` serves desktop homepage content directly.

## Deployment
Use FTP to upload `_site/` output. Follow `deploy/ftp/README.md` and apply `deploy/nginx/ttms.conf.snippet` plus generated `deploy/nginx/legacy-redirects.conf` on the server.

## Blog Sitemap API Settings
The sitemap generator fetches blog posts from API during build and retries on interval before failing/continuing.

- `BLOG_API_BASE_URL` default: `https://ttmkonnect.com/api/posts`
- `BLOG_API_PROXY_BASE_URL` default: `https://api.codetabs.com/v1/proxy/?quest=`
- `BLOG_API_PER_PAGE` default: `10`
- `BLOG_API_MAX_PAGES` default: `50`
- `BLOG_API_RETRY_COUNT` default: `5`
- `BLOG_API_RETRY_INTERVAL_MS` default: `3000`
- `BLOG_API_REQUIRED` default: `false` (`true` makes build fail if blog API cannot be fetched)
