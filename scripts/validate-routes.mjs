#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  cleanPathFromLegacy,
  findHtmlFiles,
  legacyPathFromFile,
  normalizeCleanPath,
  toPosix
} from "./lib/route-utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT, "dist");
const PAGES_PATH = path.join(ROOT, "site", "_generated", "pages.json");
const REDIRECTS_PATH = path.join(ROOT, "deploy", "redirects", "legacy-map.json");

async function readJson(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function validateNoDuplicates(values, label) {
  const seen = new Set();
  const dupes = new Set();
  for (const value of values) {
    if (seen.has(value)) dupes.add(value);
    seen.add(value);
  }
  return dupes.size ? [`Duplicate ${label}: ${[...dupes].join(", ")}`] : [];
}

async function main() {
  const [pages, redirects, htmlFiles] = await Promise.all([
    readJson(PAGES_PATH),
    readJson(REDIRECTS_PATH),
    findHtmlFiles(DIST_DIR)
  ]);

  const problems = [];

  const cleanPaths = pages.map((page) => normalizeCleanPath(page.cleanPath));
  problems.push(...validateNoDuplicates(cleanPaths, "clean paths"));

  const redirectFrom = redirects.map((entry) => entry.from);
  problems.push(...validateNoDuplicates(redirectFrom, "legacy redirect source paths"));

  const cleanSet = new Set(cleanPaths);

  for (const page of pages) {
    if (!page.legacyPath || !page.cleanPath || !page.title) {
      problems.push(`Page record missing required fields for ${JSON.stringify(page)}`);
    }
  }

  for (const entry of redirects) {
    if (entry.status !== 308) {
      problems.push(`Redirect ${entry.from} has non-308 status ${entry.status}`);
    }

    const normalizedTo = normalizeCleanPath(entry.to);
    if (entry.from !== "/index.html" && !cleanSet.has(normalizedTo)) {
      problems.push(`Redirect target not generated as page: ${entry.from} -> ${entry.to}`);
    }
  }

  for (const htmlFile of htmlFiles) {
    const rel = toPosix(path.relative(DIST_DIR, htmlFile));
    if (rel.startsWith("_templates/")) continue;

    const legacyPath = legacyPathFromFile(DIST_DIR, htmlFile);
    const mapped = redirects.find((entry) => entry.from === legacyPath);
    if (!mapped) {
      problems.push(`Missing redirect for legacy route: ${legacyPath}`);
      continue;
    }

    const expectedClean = cleanPathFromLegacy(legacyPath);
    if (mapped.to !== expectedClean) {
      problems.push(`Unexpected mapping: ${legacyPath} -> ${mapped.to} (expected ${expectedClean})`);
    }
  }

  if (problems.length) {
    process.stderr.write(`Route validation failed with ${problems.length} issue(s):\n`);
    for (const problem of problems) {
      process.stderr.write(`- ${problem}\n`);
    }
    process.exit(1);
  }

  process.stdout.write(
    `Route validation passed. ${pages.length} clean pages and ${redirects.length} legacy redirects are consistent.\n`
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
