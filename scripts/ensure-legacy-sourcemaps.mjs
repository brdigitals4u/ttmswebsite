#!/usr/bin/env node

import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const ASSETS_DIR = path.join(ROOT, "dist", "assets");
const LOGO_DIR = path.join(ASSETS_DIR, "logo");
const LEGACY_LOGO = path.join(LOGO_DIR, "ttm-logo.png");
const MAIN_LOGO = path.join(LOGO_DIR, "ttms-logo.png");

function extractMapRefs(content) {
  const refs = [];
  const regex = /[#@]\s*sourceMappingURL=([^\s*]+)/g;
  let match = regex.exec(content);
  while (match) {
    refs.push(match[1].trim());
    match = regex.exec(content);
  }
  return refs;
}

function buildPlaceholderMap(sourceFileName) {
  return {
    version: 3,
    file: sourceFileName,
    names: [],
    sources: [sourceFileName],
    sourcesContent: [""],
    mappings: ""
  };
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureMainLogoAlias() {
  const hasMainLogo = await exists(MAIN_LOGO);
  if (hasMainLogo) return false;

  const hasLegacyLogo = await exists(LEGACY_LOGO);
  if (!hasLegacyLogo) return false;

  const legacyLogoContent = await readFile(LEGACY_LOGO);
  await mkdir(LOGO_DIR, { recursive: true });
  await writeFile(MAIN_LOGO, legacyLogoContent);
  return true;
}

async function walk(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(absPath)));
      continue;
    }

    if (entry.isFile() && /\.(?:js|css)$/i.test(entry.name)) {
      files.push(absPath);
    }
  }

  return files;
}

async function main() {
  const copiedMainLogo = await ensureMainLogoAlias();
  const sourceFiles = await walk(ASSETS_DIR);
  let created = 0;

  for (const sourceFile of sourceFiles) {
    const content = await readFile(sourceFile, "utf8");
    const mapRefs = extractMapRefs(content);

    for (const mapRef of mapRefs) {
      if (!mapRef || /^data:/i.test(mapRef) || /^https?:\/\//i.test(mapRef)) {
        continue;
      }

      const mapPath = path.resolve(path.dirname(sourceFile), mapRef);
      const hasMap = await exists(mapPath);
      if (hasMap) {
        continue;
      }

      const mapJson = buildPlaceholderMap(path.basename(sourceFile));
      await mkdir(path.dirname(mapPath), { recursive: true });
      await writeFile(mapPath, `${JSON.stringify(mapJson)}\n`, "utf8");
      created += 1;
    }
  }

  process.stdout.write(
    `Ensured legacy sourcemaps. Created ${created} missing map file(s). ` +
      `${copiedMainLogo ? "Created assets/logo/ttms-logo.png alias." : "Logo alias already present."}\n`
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
