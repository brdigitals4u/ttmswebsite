#!/usr/bin/env node

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyCleanPathAlias,
  cleanPathFromLegacy,
  findHtmlFiles,
  isExternalUrl,
  legacyPathFromFile,
  legacyToCleanMap,
  splitUrlParts,
  toPosix
} from "./lib/route-utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT, "dist");
const GENERATED_DIR = path.join(ROOT, "site", "_generated");
const PAGES_JSON = path.join(GENERATED_DIR, "pages.json");
const REPORT_JSON = path.join(GENERATED_DIR, "migration-report.json");
const SITE_URL = (process.env.SITE_URL || "https://ttms.ai").replace(/\/+$/, "");
const CRITICAL_CONTENT_IMAGE_COUNT = 1;
const PRIORITY_SECTION_COUNT = 2;
const LAZY_IMAGE_PLACEHOLDER =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
const TTMS_CONTACT_EMAILS = "support@ttmkonnect.com / support@ttm4u.com / info@ttm247.com";
const TTMS_PRIMARY_EMAIL = "support@ttmkonnect.com";
const TTMS_PHONE = "+1 (707) 761-7464";
const TTMS_ADDRESS_HTML =
  "2455 Mesquite St<br>Oak Hills, CA 92344<br>United States";
const TTMS_LAZY_LEGACY_SCRIPTS = new Set([
  "/assets/js/bootstrap-select.min.js",
  "/assets/js/owl.carousel.min.js",
  "/assets/js/masonry.pkgd.min.js",
  "/assets/js/isotope.pkgd.min.js",
  "/assets/js/wow.min.js",
  "/assets/js/index.js"
]);

function normalizeLeadingSlash(value) {
  const text = String(value || "");
  if (!text) return "/";
  return text.startsWith("/") ? text : `/${text}`;
}

function extractBlock(html, tagName) {
  const match = html.match(new RegExp(`<${tagName}([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  if (!match) {
    return { attrs: "", inner: "" };
  }
  return {
    attrs: match[1] || "",
    inner: match[2] || ""
  };
}

function extractHtmlAttrs(html) {
  const match = html.match(/<html([^>]*)>/i);
  return match ? (match[1] || "") : "";
}

function getMetaContent(headHtml, key, type = "name") {
  const pattern =
    type === "property"
      ? new RegExp(`<meta[^>]*property=["']${key}["'][^>]*content=["']([^"']*)["'][^>]*>`, "i")
      : new RegExp(`<meta[^>]*name=["']${key}["'][^>]*content=["']([^"']*)["'][^>]*>`, "i");
  const match = headHtml.match(pattern);
  return match ? match[1] : "";
}

function getTitle(headHtml) {
  const match = headHtml.match(/<title>([\s\S]*?)<\/title>/i);
  return match ? match[1].trim() : "TTMS";
}

function shouldKeepUrlAsIs(pathname) {
  const value = String(pathname || "").trim();
  return (
    !value ||
    value.startsWith("#") ||
    value.startsWith("mailto:") ||
    value.startsWith("tel:") ||
    value.startsWith("data:") ||
    value.startsWith("javascript:")
  );
}

function resolveRelativePath(currentLegacyPath, pathname) {
  if (pathname.startsWith("/")) {
    return normalizeLeadingSlash(pathname);
  }

  const baseDir = path.posix.dirname(currentLegacyPath);
  const resolved = path.posix.resolve(baseDir, pathname);
  return normalizeLeadingSlash(toPosix(resolved));
}

function rewriteUrl(rawUrl, currentLegacyPath, legacyCleanMap) {
  if (isExternalUrl(rawUrl) || shouldKeepUrlAsIs(rawUrl)) {
    return rawUrl;
  }

  const { pathname, suffix } = splitUrlParts(rawUrl);

  if (!pathname || shouldKeepUrlAsIs(pathname)) {
    return rawUrl;
  }

  const absolutePath = resolveRelativePath(currentLegacyPath, pathname);
  const aliasedPath = applyCleanPathAlias(absolutePath);

  if (aliasedPath.endsWith(".html")) {
    const cleanTarget = legacyCleanMap.get(aliasedPath) || cleanPathFromLegacy(aliasedPath);
    return `${cleanTarget}${suffix}`;
  }

  if (aliasedPath !== absolutePath) {
    return `${cleanPathFromLegacy(aliasedPath)}${suffix}`;
  }

  return `${aliasedPath}${suffix}`;
}

function rewriteHtmlUrls(fragment, currentLegacyPath, legacyCleanMap) {
  return fragment
    .replace(/(\s(?:href|src|poster)=)(["'])([^"']+)(\2)/gi, (full, prefix, quoteA, url, quoteB) => {
      const nextUrl = rewriteUrl(url, currentLegacyPath, legacyCleanMap);
      return `${prefix}${quoteA}${nextUrl}${quoteB}`;
    })
    .replace(/(\ssrcset=)(["'])([^"']+)(\2)/gi, (full, prefix, quoteA, srcsetValue, quoteB) => {
      const rewritten = srcsetValue
        .split(",")
        .map((entry) => {
          const [url, descriptor] = entry.trim().split(/\s+/, 2);
          const nextUrl = rewriteUrl(url, currentLegacyPath, legacyCleanMap);
          return descriptor ? `${nextUrl} ${descriptor}` : nextUrl;
        })
        .join(", ");

      return `${prefix}${quoteA}${rewritten}${quoteB}`;
    })
    .replace(/url\((["'])([^"']+)\1\)/gi, (full, quote, url) => {
      const nextUrl = rewriteUrl(url.trim(), currentLegacyPath, legacyCleanMap);
      return `url(${quote}${nextUrl}${quote})`;
    });
}

function addScriptDefer(fragment) {
  return fragment.replace(/<script\b([^>]*\bsrc=["'][^"']+["'][^>]*)>\s*<\/script>/gi, (match, attrs) => {
    const isModuleScript = /type=["']module["']/i.test(attrs);
    const srcMatch = attrs.match(/\bsrc=(["'])([^"']+)\1/i);
    const scriptSrc = srcMatch ? srcMatch[2] : "";
    const { pathname: scriptPathname } = splitUrlParts(scriptSrc);

    if (!isModuleScript && TTMS_LAZY_LEGACY_SCRIPTS.has(scriptPathname)) {
      let nextAttrs = removeAttr(attrs, "src");
      nextAttrs = removeAttr(nextAttrs, "defer");
      nextAttrs = removeAttr(nextAttrs, "async");
      nextAttrs = `${nextAttrs} data-ttms-src="${scriptSrc}" data-ttms-lazy-script="true"`;
      return `<script${nextAttrs}></script>`;
    }

    if (/\b(defer|async)\b/i.test(attrs) || isModuleScript) {
      return match;
    }
    return `<script${attrs} defer></script>`;
  });
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasAttr(tag, attrName) {
  const escaped = escapeRegex(attrName);
  const regex = new RegExp(`(?:^|\\s)${escaped}\\s*=`, "i");
  return regex.test(tag);
}

function getAttr(tag, attrName) {
  const escaped = escapeRegex(attrName);
  const regex = new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*(['"])([\\s\\S]*?)\\1`, "i");
  const match = tag.match(regex);
  return match ? match[2] : "";
}

function removeAttr(tag, attrName) {
  const escaped = escapeRegex(attrName);
  const regex = new RegExp(`\\s+${escaped}\\s*=\\s*(['"])([\\s\\S]*?)\\1`, "gi");
  return tag.replace(regex, "");
}

function setAttr(tag, attrName, value) {
  const nextValue = String(value ?? "");
  const cleanedTag = removeAttr(tag, attrName);
  return cleanedTag.replace(/<([a-z][a-z0-9:-]*)\b/i, `<$1 ${attrName}="${nextValue}"`);
}

function addClass(tag, className) {
  if (!className) return tag;
  const existing = getAttr(tag, "class");
  if (!existing) {
    return setAttr(tag, "class", className);
  }

  const classSet = new Set(
    existing
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
  classSet.add(className);
  return setAttr(tag, "class", [...classSet].join(" "));
}

function transformOutsideScriptAndStyle(html, transform) {
  const segments = [];
  let cursor = 0;
  const blockRegex = /<(script|style)\b[\s\S]*?<\/\1>/gi;
  let match = blockRegex.exec(html);

  while (match) {
    const start = match.index;
    const end = start + match[0].length;

    if (start > cursor) {
      segments.push(transform(html.slice(cursor, start)));
    }

    segments.push(match[0]);
    cursor = end;
    match = blockRegex.exec(html);
  }

  if (cursor < html.length) {
    segments.push(transform(html.slice(cursor)));
  }

  return segments.join("");
}

function isContentImage(src) {
  const value = String(src || "").trim();
  if (!value || value.startsWith("data:")) return false;
  if (/\/icons?\//i.test(value)) return false;
  if (/logo/i.test(value)) return false;
  if (/\/favicon/i.test(value)) return false;
  return true;
}

function optimizeImageTags(bodyHtml) {
  return transformOutsideScriptAndStyle(bodyHtml, (fragment) =>
    fragment.replace(/<img\b[^>]*>/gi, (imgTag) => {
      let nextTag = imgTag;
      const src = getAttr(nextTag, "src");
      const shouldDeferImage = Boolean(src && !/^data:/i.test(src));

      if (!/\bdecoding=/i.test(nextTag)) {
        nextTag = nextTag.replace(/<img/i, '<img decoding="async"');
      }

      if (shouldDeferImage) {
        nextTag = setAttr(nextTag, "loading", "lazy");
        nextTag = setAttr(nextTag, "fetchpriority", "low");
        nextTag = addClass(nextTag, "ttms-lazy-image");
        nextTag = addClass(nextTag, "lazy");

        const currentSrc = getAttr(nextTag, "src");
        if (currentSrc && !/^data:/i.test(currentSrc)) {
          nextTag = setAttr(nextTag, "data-src", currentSrc);
          nextTag = setAttr(nextTag, "src", LAZY_IMAGE_PLACEHOLDER);
        }

        const currentSrcset = getAttr(nextTag, "srcset");
        if (currentSrcset) {
          nextTag = setAttr(nextTag, "data-srcset", currentSrcset);
          nextTag = removeAttr(nextTag, "srcset");
        }

        const currentSizes = getAttr(nextTag, "sizes");
        if (currentSizes) {
          nextTag = setAttr(nextTag, "data-sizes", currentSizes);
          nextTag = removeAttr(nextTag, "sizes");
        }
      } else {
        nextTag = setAttr(nextTag, "loading", "eager");
      }

      return nextTag;
    })
  );
}

function optimizePictureTags(bodyHtml) {
  return transformOutsideScriptAndStyle(bodyHtml, (fragment) =>
    fragment.replace(/<picture\b[\s\S]*?<\/picture>/gi, (pictureTag) => {
      if (!/\b(?:ttms-lazy-image|lazy)\b/i.test(pictureTag)) {
        return pictureTag;
      }

      return pictureTag.replace(/<source\b[^>]*>/gi, (sourceTag) => {
        let nextTag = sourceTag;
        nextTag = addClass(nextTag, "lazy");

        const currentSrcset = getAttr(nextTag, "srcset");
        if (currentSrcset) {
          nextTag = setAttr(nextTag, "data-srcset", currentSrcset);
          nextTag = removeAttr(nextTag, "srcset");
        }

        const currentSizes = getAttr(nextTag, "sizes");
        if (currentSizes) {
          nextTag = setAttr(nextTag, "data-sizes", currentSizes);
          nextTag = removeAttr(nextTag, "sizes");
        }

        return nextTag;
      });
    })
  );
}

function replaceBrandTextWithLogo(bodyHtml) {
  return bodyHtml.replace(
    /<span\b([^>]*)class=(['"])([^"']*\bttms-brand\b[^"']*)\2([^>]*)>([\s\S]*?)<\/span>/gi,
    (full, preAttrs = "", quote, classValue = "", postAttrs = "") => {
      const classes = String(classValue)
        .split(/\s+/)
        .map((item) => item.trim())
        .filter(Boolean);
      const isLight = classes.includes("ttms-brand-light");
      const toneClass = isLight ? "ttms-main-logo-light" : "ttms-main-logo-dark";
      return `<img src="/assets/logo/ttms-logo.png" alt="TTMS" class="ttms-main-logo ${toneClass}">`;
    }
  );
}

function convertHeaderBrandLogoToText(bodyHtml) {
  return bodyHtml.replace(/<header\b[\s\S]*?<\/header>/gi, (headerBlock) =>
    headerBlock.replace(
      /(<a\b[^>]*class=(['"])[^"']*\bnavbar-brand\b[^"']*\2[^>]*>)([\s\S]*?)(<\/a>)/gi,
      (full, openTag = "", quote = '"', innerHtml = "", closeTag = "") => {
        if (!/(ttms-main-logo|\/assets\/logo\/ttms-logo\.png|<img\b)/i.test(String(innerHtml))) {
          return full;
        }

        return `${openTag}<span class="ttms-header-brand">TTMS</span>${closeTag}`;
      }
    )
  );
}

function enforceGetQuoteLinks(bodyHtml) {
  const withAnchors = bodyHtml.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, (anchorTag) => {
    const textContent = anchorTag
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    if (!textContent.includes("get a quote")) {
      return anchorTag;
    }

    return setAttr(anchorTag, "href", "/contact/");
  });

  return withAnchors.replace(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi, (full, attrs = "", inner = "") => {
    const textContent = String(inner)
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    if (!textContent.includes("get a quote")) {
      return full;
    }

    const sanitizedAttrs = String(attrs)
      .replace(/\s+type=(['"])[\s\S]*?\1/gi, "")
      .trim();
    const attrsPart = sanitizedAttrs ? ` ${sanitizedAttrs}` : "";
    return `<a href="/contact/"${attrsPart}>${inner}</a>`;
  });
}

function normalizeContactInfo(bodyHtml, cleanPath) {
  let next = bodyHtml;

  next = next.replace(/mailto:(?:hello@helpcenter\.com|support@helpcenter\.com)/gi, `mailto:${TTMS_PRIMARY_EMAIL}`);
  next = next.replace(/hello@helpcenter\.com/gi, TTMS_CONTACT_EMAILS);
  next = next.replace(/support@helpcenter\.com/gi, TTMS_CONTACT_EMAILS);
  next = next.replace(/\+1\s*\(646\)\s*786-5060/g, TTMS_PHONE);

  if (cleanPath === "/contact/") {
    next = next.replace(
      /(<h4 class="text-black mb-24">Email us<\/h4>[\s\S]*?<a class="font-bold" href="mailto:)[^"]+(">)[\s\S]*?(<\/a>)/i,
      `$1${TTMS_PRIMARY_EMAIL}$2${TTMS_CONTACT_EMAILS}$3`
    );

    next = next.replace(
      /(<h4 class="mb-24 text-black">Support<\/h4>[\s\S]*?<p class="text-gray mb-12">)[\s\S]*?(<\/p>)[\s\S]*?<button[\s\S]*?<\/button>/i,
      `$1Office Address$2<a class="font-bold" href="https://maps.google.com/?q=2455+Mesquite+St,+Oak+Hills,+CA+92344" target="_blank" rel="noopener">${TTMS_ADDRESS_HTML}</a>`
    );
  }

  return next;
}

function optimizeSectionLoading(bodyHtml) {
  let sectionIndex = 0;
  return bodyHtml.replace(/<section\b([^>]*)>/gi, (fullTag, attrs = "") => {
    sectionIndex += 1;
    if (sectionIndex <= PRIORITY_SECTION_COUNT) {
      return fullTag;
    }

    if (/\bttms-defer-section\b/i.test(attrs)) {
      return fullTag;
    }

    if (/\bclass\s*=/.test(attrs)) {
      return fullTag.replace(/class=(['"])([\s\S]*?)\1/i, (match, quote, classValue) => {
        const classSet = new Set(
          String(classValue)
            .split(/\s+/)
            .map((item) => item.trim())
            .filter(Boolean)
        );
        classSet.add("ttms-defer-section");
        return `class=${quote}${[...classSet].join(" ")}${quote}`;
      });
    }

    return `<section${attrs} class="ttms-defer-section">`;
  });
}

function normalizeBlogInlineRoutes(bodyHtml) {
  let next = bodyHtml;

  // Keep blog detail links absolute so they resolve correctly from nested clean routes.
  next = next.replace(/(["'])blog-detail\.html\?/gi, '$1/blog/blog-detail/?');
  next = next.replace(/(["'])blog-detail\.html(["'])/gi, '$1/blog/blog-detail/$2');

  // Normalize hard-coded legacy canonical/meta script URLs to clean routes.
  next = next.replace(/(["'])\/blog\/blog-alt-1\.html(["'])/gi, '$1/blog/blog-alt-1/$2');
  next = next.replace(/(["'])\/blog\/blog-alt-2\.html(["'])/gi, '$1/blog/blog-alt-2/$2');
  next = next.replace(/(["'])\/blog\/blog-detail\.html\?/gi, '$1/blog/blog-detail/?');
  next = next.replace(/(["'])\/blog\/blog-detail\.html(["'])/gi, '$1/blog/blog-detail/$2');
  next = next.replace(/(["'])\.\.\/assets\//gi, '$1/assets/');
  next = next.replace(
    /url\((['"]?)\.\.\/assets\/images\/covers\/cover-blog@2x\.png\1\)/gi,
    "url(/assets/images/covers/cover-blog@2x.png)"
  );

  return next;
}

function deriveSection(cleanPath) {
  const trimmed = cleanPath.replace(/^\//, "").replace(/\/$/, "");
  if (!trimmed) return "root";
  const [section] = trimmed.split("/");
  return section || "root";
}

const OG_IMAGE_URL = "/assets/ttm/og-image.jpeg";
const OG_IMAGE_WIDTH = "1200";
const OG_IMAGE_HEIGHT = "630";
const OG_IMAGE_ALT = "TTMS";

function updateOgAndTwitterImage(headHtml) {
  let next = headHtml
    .replace(
      /<meta[^>]*property=["']og:image["'][^>]*>/gi,
      `<meta property="og:image" content="${OG_IMAGE_URL}">`
    )
    .replace(
      /<meta[^>]*name=["']twitter:image["'][^>]*>/gi,
      `<meta name="twitter:image" content="${OG_IMAGE_URL}">`
    );

  if (!/<meta[^>]*property=["']og:image:width["']/i.test(next)) {
    next = next.replace(
      /(<meta\s+property=["']og:image["'][^>]*>)/i,
      `$1\n    <meta property="og:image:width" content="${OG_IMAGE_WIDTH}">`
    );
  } else {
    next = next.replace(
      /(<meta[^>]*property=["']og:image:width["'][^>]*content=)["'][^"']*["']/i,
      `$1"${OG_IMAGE_WIDTH}"`
    );
  }
  if (!/<meta[^>]*property=["']og:image:height["']/i.test(next)) {
    next = next.replace(
      /(<meta\s+property=["']og:image["'][^>]*>)/i,
      `$1\n    <meta property="og:image:height" content="${OG_IMAGE_HEIGHT}">`
    );
  } else {
    next = next.replace(
      /(<meta[^>]*property=["']og:image:height["'][^>]*content=)["'][^"']*["']/i,
      `$1"${OG_IMAGE_HEIGHT}"`
    );
  }
  if (!/<meta[^>]*property=["']og:image:alt["']/i.test(next)) {
    next = next.replace(
      /(<meta\s+property=["']og:image["'][^>]*>)/i,
      `$1\n    <meta property="og:image:alt" content="${OG_IMAGE_ALT}">`
    );
  } else {
    next = next.replace(
      /(<meta[^>]*property=["']og:image:alt["'][^>]*content=)["'][^"']*["']/i,
      `$1"${OG_IMAGE_ALT}"`
    );
  }
  return next;
}

const HERO_PRELOAD_AND_IMAGESET_PAGES = ["/blog/blog-alt-1/"];

function injectHeroPreloadAndImageSet(headHtml, cleanPath) {
  const isHeroPage = HERO_PRELOAD_AND_IMAGESET_PAGES.some((p) => cleanPath.startsWith(p) || cleanPath === p.replace(/\/$/, ""));
  if (!isHeroPage) return headHtml;
  const preloads = [
    `<link rel="preload" as="image" href="/assets/images/covers/cover-4@2x.avif" type="image/avif">`,
    `<link rel="preload" as="image" href="/assets/images/covers/cover-4@2x.webp" type="image/webp">`
  ].join("\n    ");
  const imageSetStyle =
    "<style>.blog-alt-1 .hero{background-image:image-set(url('/assets/images/covers/cover-4@2x.avif') type('image/avif'),url('/assets/images/covers/cover-4@2x.webp') type('image/webp'),url('/assets/images/covers/cover-4@2x.png') type('image/png'))}</style>";
  return headHtml + "\n    " + preloads + "\n    " + imageSetStyle;
}

function updateCanonicalSignals(headHtml, cleanPath) {
  const canonicalAbs = `${SITE_URL}${cleanPath}`;
  let next = headHtml.replace(/<link[^>]*rel=["']canonical["'][^>]*>\s*/gi, "");

  if (/<meta[^>]*property=["']og:url["'][^>]*>/i.test(next)) {
    next = next.replace(
      /<meta[^>]*property=["']og:url["'][^>]*>/i,
      `<meta property="og:url" content="${canonicalAbs}">`
    );
  }

  return next;
}

function collectPreloadStyles(headHtml) {
  const styles = [];
  const regex = /<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
  let match = regex.exec(headHtml);
  while (match) {
    const href = match[1];
    if (href && href.startsWith("/assets/")) {
      styles.push(href);
    }
    match = regex.exec(headHtml);
  }
  return [...new Set(styles)].slice(0, 4);
}

function hasTtmkonnectExternal(headHtml) {
  return /https:\/\/ttmkonnect\.com/i.test(headHtml);
}

async function main() {
  const htmlFiles = await findHtmlFiles(DIST_DIR);

  const filteredHtmlFiles = htmlFiles.filter((absPath) => {
    const rel = toPosix(path.relative(DIST_DIR, absPath));
    return !rel.startsWith("_templates/");
  });

  const legacyPaths = filteredHtmlFiles.map((absPath) => legacyPathFromFile(DIST_DIR, absPath));
  const legacyCleanMap = legacyToCleanMap(legacyPaths);

  const pages = [];

  for (const htmlFile of filteredHtmlFiles) {
    const legacyPath = legacyPathFromFile(DIST_DIR, htmlFile);
    const cleanPath = cleanPathFromLegacy(legacyPath);

    if (legacyPath === "/index.html") {
      continue;
    }

    const rawHtml = await readFile(htmlFile, "utf8");
    const htmlAttrs = extractHtmlAttrs(rawHtml);
    const headBlock = extractBlock(rawHtml, "head");
    const bodyBlock = extractBlock(rawHtml, "body");

    let headHtml = rewriteHtmlUrls(headBlock.inner, legacyPath, legacyCleanMap);
    headHtml = updateCanonicalSignals(headHtml, cleanPath);
    headHtml = updateOgAndTwitterImage(headHtml);
    headHtml = injectHeroPreloadAndImageSet(headHtml, cleanPath);
    headHtml = addScriptDefer(headHtml);

    let bodyHtml = rewriteHtmlUrls(bodyBlock.inner, legacyPath, legacyCleanMap);
    bodyHtml = replaceBrandTextWithLogo(bodyHtml);
    bodyHtml = convertHeaderBrandLogoToText(bodyHtml);
    bodyHtml = enforceGetQuoteLinks(bodyHtml);
    bodyHtml = normalizeContactInfo(bodyHtml, cleanPath);
    bodyHtml = optimizeImageTags(bodyHtml);
    bodyHtml = optimizePictureTags(bodyHtml);
    bodyHtml = optimizeSectionLoading(bodyHtml);
    bodyHtml = normalizeBlogInlineRoutes(bodyHtml);
    bodyHtml = addScriptDefer(bodyHtml);

    const fileStat = await stat(htmlFile);

    const page = {
      sourceFile: `dist${legacyPath}`,
      section: deriveSection(cleanPath),
      legacyPath,
      cleanPath,
      layout: "layouts/page.njk",
      title: getTitle(headHtml),
      description: getMetaContent(headHtml, "description", "name"),
      canonical: `${SITE_URL}${cleanPath}`,
      ogImage: getMetaContent(headHtml, "og:image", "property"),
      robots: getMetaContent(headHtml, "robots", "name") || "index, follow",
      htmlAttrs,
      bodyAttrs: bodyBlock.attrs || "",
      headHtml,
      bodyHtml,
      preloadStyles: collectPreloadStyles(headHtml),
      preconnectOrigin: hasTtmkonnectExternal(headHtml) ? "https://ttmkonnect.com" : "",
      lastModified: fileStat.mtime.toISOString().slice(0, 10)
    };

    pages.push(page);
  }

  pages.sort((a, b) => a.cleanPath.localeCompare(b.cleanPath));

  const duplicatePaths = pages
    .map((page) => page.cleanPath)
    .filter((value, index, arr) => arr.indexOf(value) !== index);
  if (duplicatePaths.length) {
    throw new Error(`Duplicate clean paths found: ${[...new Set(duplicatePaths)].join(", ")}`);
  }

  await mkdir(GENERATED_DIR, { recursive: true });
  await writeFile(PAGES_JSON, `${JSON.stringify(pages, null, 2)}\n`, "utf8");

  const report = {
    generatedAt: new Date().toISOString(),
    totalSourceHtmlFiles: filteredHtmlFiles.length,
    totalPagesGenerated: pages.length,
    skipped: ["/index.html"],
    sections: pages.reduce((acc, page) => {
      acc[page.section] = (acc[page.section] || 0) + 1;
      return acc;
    }, {})
  };

  await writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  process.stdout.write(
    `Generated ${pages.length} clean-route pages into ${path.relative(ROOT, PAGES_JSON)}\n`
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
