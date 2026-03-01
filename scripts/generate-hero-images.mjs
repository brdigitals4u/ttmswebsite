#!/usr/bin/env node

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const SOURCE_IMAGE = path.join(ROOT, "dist", "assets", "images", "covers", "cover-4@2x.png");
const OUTPUT_DIR = path.join(ROOT, "site", "_public", "assets", "images", "covers");

async function main() {
  const image = require("@11ty/eleventy-img");
  await mkdir(OUTPUT_DIR, { recursive: true });

  const options = {
    formats: ["avif", "webp"],
    widths: ["auto"],
    urlPath: "/assets/images/covers/",
    outputDir: OUTPUT_DIR,
    filenameFormat: (_id, _src, _width, format) => `cover-4@2x.${format}`,
  };

  await image(SOURCE_IMAGE, options);
  process.stdout.write("Generated cover-4@2x.avif and cover-4@2x.webp.\n");
}

main().catch((err) => {
  process.stderr.write(String(err.stack || err.message) + "\n");
  process.exit(1);
});
