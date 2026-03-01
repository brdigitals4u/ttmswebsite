#!/usr/bin/env node

import { readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const SITE_OUTPUT_DIR = path.join(ROOT, "_site");
const PRUNE_SCOPES = ["assets", "video"];
const ALWAYS_KEEP_RELATIVE = new Set(["assets/ttm/og-image.jpeg"]);
const TEXT_EXTENSIONS = new Set([
  ".html",
  ".css",
  ".js",
  ".json",
  ".xml",
  ".txt",
  ".map",
  ".svg",
  ".webmanifest"
]);

const ASSET_REFERENCE_PATTERN =
  /(?:^|[("'`\s])((?:\/|\.{1,2}\/)(?:assets|video)\/[a-zA-Z0-9@._\-\/]+(?:\?[^\s"'`)]+)?(?:#[^\s"'`)]+)?)/g;
const RELATIVE_ASSET_PATTERN =
  /(?:url|href|src)\s*\(\s*["']?(\.\.\/[a-zA-Z0-9@._\-\/]+)["']?\s*\)/g;
// Same-directory refs (e.g. url('hkgrotesk-bold-webfont.woff2') in stylesheet.css)
const SAME_DIR_REF_PATTERN =
  /(?:url|href|src)\s*\(\s*["']?(?!(?:\.\.|\/|https?:|data:))([a-zA-Z0-9@._\-]+\.(?:woff2?|ttf|eot|svg|png|jpg|jpeg|gif|webp|ico))["']?\s*\)/g;

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(absPath)));
      continue;
    }
    files.push(absPath);
  }

  return files;
}

function toPosix(value) {
  return String(value).replace(/\\/g, "/");
}

function isTextFile(filePath) {
  return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isPrunableFile(filePath) {
  const relative = toPosix(path.relative(SITE_OUTPUT_DIR, filePath));
  return PRUNE_SCOPES.some((scope) => relative.startsWith(`${scope}/`));
}

function isAlwaysKeepFile(filePath) {
  const relative = toPosix(path.relative(SITE_OUTPUT_DIR, filePath));
  return ALWAYS_KEEP_RELATIVE.has(relative);
}

function normalizeReference(rawRef) {
  return String(rawRef || "")
    .trim()
    .replace(/[?#].*$/, "")
    .replace(/[),.;]+$/, "");
}

function resolveAssetReference(rawRef, fromFile) {
  const ref = normalizeReference(rawRef);
  if (!ref) return null;
  if (/^(?:https?:)?\/\//i.test(ref)) return null;
  if (/^(?:data|mailto|tel|javascript):/i.test(ref)) return null;

  const resolved = ref.startsWith("/")
    ? path.resolve(SITE_OUTPUT_DIR, `.${ref}`)
    : path.resolve(path.dirname(fromFile), ref);
  const normalized = path.resolve(resolved);
  const relative = toPosix(path.relative(SITE_OUTPUT_DIR, normalized));

  if (relative.startsWith("..")) return null;
  if (!PRUNE_SCOPES.some((scope) => relative.startsWith(`${scope}/`))) return null;
  return normalized;
}

function extractReferences(content) {
  const refs = [];
  let match = ASSET_REFERENCE_PATTERN.exec(content);
  while (match) {
    refs.push(match[1]);
    match = ASSET_REFERENCE_PATTERN.exec(content);
  }
  ASSET_REFERENCE_PATTERN.lastIndex = 0;
  match = RELATIVE_ASSET_PATTERN.exec(content);
  while (match) {
    refs.push(match[1]);
    match = RELATIVE_ASSET_PATTERN.exec(content);
  }
  RELATIVE_ASSET_PATTERN.lastIndex = 0;
  match = SAME_DIR_REF_PATTERN.exec(content);
  while (match) {
    refs.push(match[1]);
    match = SAME_DIR_REF_PATTERN.exec(content);
  }
  SAME_DIR_REF_PATTERN.lastIndex = 0;
  return refs;
}

async function removeEmptyDirs(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const nestedPath = path.join(dirPath, entry.name);
    await removeEmptyDirs(nestedPath);
  }

  const afterEntries = await readdir(dirPath);
  if (!afterEntries.length) {
    await rm(dirPath, { recursive: true, force: true });
  }
}

async function main() {
  const outputExists = await exists(SITE_OUTPUT_DIR);
  if (!outputExists) {
    process.stdout.write("Skipped unused-asset pruning because _site does not exist.\n");
    return;
  }

  const allFiles = await walkFiles(SITE_OUTPUT_DIR);
  const prunableFiles = allFiles.filter((filePath) => isPrunableFile(filePath));
  const entryTextFiles = allFiles.filter((filePath) => !isPrunableFile(filePath) && isTextFile(filePath));

  const reachableTextFiles = new Set(entryTextFiles);
  const visitedTextFiles = new Set();
  const referencedAssetFiles = new Set();
  const queue = [...entryTextFiles];

  while (queue.length) {
    const filePath = queue.shift();
    if (visitedTextFiles.has(filePath)) {
      continue;
    }
    visitedTextFiles.add(filePath);

    let content = "";
    try {
      content = await readFile(filePath, "utf8");
    } catch {
      continue;
    }

    const refs = extractReferences(content);
    for (const ref of refs) {
      const resolvedRef = resolveAssetReference(ref, filePath);
      if (!resolvedRef) continue;
      if (!(await exists(resolvedRef))) continue;

      if (!referencedAssetFiles.has(resolvedRef)) {
        referencedAssetFiles.add(resolvedRef);
      }

      if (isTextFile(resolvedRef) && !reachableTextFiles.has(resolvedRef)) {
        reachableTextFiles.add(resolvedRef);
        queue.push(resolvedRef);
      }
    }
  }

  const removableFiles = prunableFiles.filter(
    (filePath) => !referencedAssetFiles.has(filePath) && !isAlwaysKeepFile(filePath)
  );

  let removedBytes = 0;
  for (const filePath of removableFiles) {
    try {
      const fileStat = await stat(filePath);
      removedBytes += fileStat.size;
    } catch {
      // Ignore missing files.
    }
    await rm(filePath, { force: true });
  }

  for (const scope of PRUNE_SCOPES) {
    const scopeDir = path.join(SITE_OUTPUT_DIR, scope);
    if (await exists(scopeDir)) {
      await removeEmptyDirs(scopeDir);
    }
  }

  const removedMb = (removedBytes / 1024 / 1024).toFixed(2);
  process.stdout.write(
    `Pruned ${removableFiles.length} unused asset files from _site (${removedMb} MB removed).\n`
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
