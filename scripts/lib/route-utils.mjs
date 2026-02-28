import { readdir } from "node:fs/promises";
import path from "node:path";

export const DIST_DIRNAME = "dist";
const CLEAN_PATH_ALIASES = new Map([
  ["/company/contact", "/contact/"],
  ["/company/contact/", "/contact/"],
  ["/company/contact.html", "/contact/"],
  ["/contact", "/contact/"]
]);

export async function findHtmlFiles(rootDir) {
  const found = [];

  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".html")) {
        found.push(abs);
      }
    }
  }

  await walk(rootDir);
  return found.sort((a, b) => a.localeCompare(b));
}

export function toPosix(value) {
  return String(value).replaceAll(path.sep, "/");
}

export function legacyPathFromFile(distRoot, htmlFile) {
  const rel = toPosix(path.relative(distRoot, htmlFile));
  return `/${rel}`;
}

export function applyCleanPathAlias(pathValue) {
  const normalized = String(pathValue || "").startsWith("/") ? String(pathValue) : `/${String(pathValue || "")}`;
  return CLEAN_PATH_ALIASES.get(normalized) || normalized;
}

export function cleanPathFromLegacy(legacyPath) {
  const normalized = legacyPath.startsWith("/") ? legacyPath : `/${legacyPath}`;
  const aliased = applyCleanPathAlias(normalized);

  if (aliased === "/index.html" || aliased === "/apps/desktop.html") {
    return "/";
  }

  if (!aliased.endsWith(".html")) {
    return aliased.endsWith("/") ? aliased : `${aliased}/`;
  }

  if (aliased.endsWith("/index.html")) {
    return `${aliased.slice(0, -"index.html".length)}`;
  }

  return `${aliased.slice(0, -".html".length)}/`;
}

export function legacyToCleanMap(legacyPaths) {
  const map = new Map();
  for (const legacyPath of legacyPaths) {
    map.set(legacyPath, cleanPathFromLegacy(legacyPath));
  }
  return map;
}

export function splitUrlParts(rawUrl) {
  const url = String(rawUrl || "");
  const hashIndex = url.indexOf("#");
  const queryIndex = url.indexOf("?");

  let cutIndex = -1;
  if (hashIndex >= 0 && queryIndex >= 0) {
    cutIndex = Math.min(hashIndex, queryIndex);
  } else if (hashIndex >= 0) {
    cutIndex = hashIndex;
  } else if (queryIndex >= 0) {
    cutIndex = queryIndex;
  }

  if (cutIndex < 0) {
    return { pathname: url, suffix: "" };
  }

  return {
    pathname: url.slice(0, cutIndex),
    suffix: url.slice(cutIndex)
  };
}

export function isExternalUrl(url) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(String(url || ""));
}

export function normalizeCleanPath(value) {
  if (!value || value === "/") return "/";
  const aliased = applyCleanPathAlias(value);
  return aliased.endsWith("/") ? aliased : `${aliased}/`;
}
