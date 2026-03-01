#!/usr/bin/env node

import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const OG_IMAGE_DIR = path.join(ROOT, "dist", "assets", "ttm");
const OG_IMAGE_PATH = path.join(ROOT, "dist", "assets", "ttm", "og-image.jpeg");
const OG_IMAGE_FALLBACKS = [
  path.join(ROOT, "dist", "assets", "images", "ttms", "og-mage.jpeg"),
  path.join(ROOT, "dist", "assets", "images", "ttms", "og-image.jpeg")
];

async function statOrNull(filePath) {
  try {
    return await stat(filePath);
  } catch {
    return null;
  }
}

async function main() {
  let targetStat = await statOrNull(OG_IMAGE_PATH);
  if (!targetStat || targetStat.size <= 0) {
    for (const fallbackPath of OG_IMAGE_FALLBACKS) {
      if (fallbackPath === OG_IMAGE_PATH) continue;
      const fallbackStat = await statOrNull(fallbackPath);
      if (!fallbackStat || fallbackStat.size <= 0) continue;

      await mkdir(OG_IMAGE_DIR, { recursive: true });
      await copyFile(fallbackPath, OG_IMAGE_PATH);
      targetStat = await statOrNull(OG_IMAGE_PATH);
      process.stdout.write(
        `Restored OG image from ${path.relative(ROOT, fallbackPath)} -> dist/assets/ttm/og-image.jpeg\n`
      );
      break;
    }
  }

  if (!targetStat || targetStat.size <= 0) {
    process.stderr.write(
      "Build failed: dist/assets/ttm/og-image.jpeg is missing or empty.\n" +
        "Add a valid image (e.g. 1200x630 JPEG) to dist/assets/ttm/ before running prebuild.\n" +
        "See README or deploy/ftp/README.md for details.\n"
    );
    process.exit(1);
  }

  process.stdout.write(
    `OG image ready: dist/assets/ttm/og-image.jpeg (${Math.round(targetStat.size / 1024)} KB)\n`
  );
}

main().catch((err) => {
  process.stderr.write(String(err.stack || err.message) + "\n");
  process.exit(1);
});
