#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readdir } from "node:fs/promises";
import Critters from "critters";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const SITE_DIR = path.join(ROOT, "_site");
const SKIP_PREFIXES = ["blog/"];

async function findHtmlFiles(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...(await findHtmlFiles(full, base)));
    } else if (e.isFile() && e.name.endsWith(".html")) {
      files.push(path.relative(base, full));
    }
  }
  return files;
}

async function main() {
  const critters = new Critters({
    path: SITE_DIR,
    preload: "body",
    noscriptFallback: true,
    preloadFonts: true,
    logLevel: "warn",
  });

  const relFiles = await findHtmlFiles(SITE_DIR);
  let processed = 0;
  let skipped = 0;
  for (const rel of relFiles) {
    if (SKIP_PREFIXES.some((prefix) => rel.startsWith(prefix))) {
      skipped++;
      continue;
    }

    const abs = path.join(SITE_DIR, rel);
    const html = await readFile(abs, "utf8");
    const out = await critters.process(html);
    await writeFile(abs, out, "utf8");
    processed++;
  }
  process.stdout.write(
    `Critters: processed ${processed} HTML file(s), skipped ${skipped} HTML file(s).\n`
  );
}

main().catch((err) => {
  process.stderr.write(String(err.stack || err.message) + "\n");
  process.exit(1);
});
