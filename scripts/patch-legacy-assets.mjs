#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readdir } from "node:fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const PUBLIC = path.join(ROOT, "site", "_public");

const HKGROTESK_CSS = path.join(PUBLIC, "assets", "fonts", "hkgrotesk", "stylesheet.css");
const FONTAWESOME_DIR = path.join(PUBLIC, "assets", "css", "fontawesome");
const MAIN_CSS = path.join(PUBLIC, "assets", "css", "main.css");

async function patchMainCssImports() {
  try {
    let css = await readFile(MAIN_CSS, "utf8");
    css = css.replace(/^@import\s+url\([^)]+\);\s*/gm, "");
    await writeFile(MAIN_CSS, css, "utf8");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}

async function patchHkgrotesk() {
  let css = await readFile(HKGROTESK_CSS, "utf8");
  css = css.replace(/@font-face\s*\{([^}]*)\}/g, (block) => {
    if (/font-display\s*:/i.test(block)) return block;
    return block.replace(/(font-style:\s*normal;)/i, "$1\n    font-display: swap;");
  });
  await writeFile(HKGROTESK_CSS, css, "utf8");
}

async function patchFontawesome() {
  const files = await readdir(FONTAWESOME_DIR);
  for (const name of files) {
    if (!name.endsWith(".css")) continue;
    const filePath = path.join(FONTAWESOME_DIR, name);
    let css = await readFile(filePath, "utf8");
    css = css.replace(/font-display:\s*auto/gi, "font-display:swap");
    // So inlined CSS (e.g. Critters) resolves fonts from site root, not document path
    css = css.replace(/url\s*\(\s*\.\.\/webfonts\//gi, "url(/assets/css/webfonts/");
    await writeFile(filePath, css, "utf8");
  }
}

async function patchCssRelativeUrls() {
  try {
    let css = await readFile(MAIN_CSS, "utf8");
    // From assets/css/main.css, ../images -> /assets/images, ../fonts -> /assets/fonts
    css = css.replace(/url\s*\(\s*\.\.\/images\//gi, "url(/assets/images/");
    css = css.replace(/url\s*\(\s*\.\.\/fonts\//gi, "url(/assets/fonts/");
    await writeFile(MAIN_CSS, css, "utf8");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}

async function main() {
  await patchMainCssImports();
  await patchHkgrotesk();
  await patchFontawesome();
  await patchCssRelativeUrls();
  process.stdout.write("Patched font-display, @imports, and relative URLs in legacy assets.\n");
}

main().catch((err) => {
  process.stderr.write(String(err.stack || err.message) + "\n");
  process.exit(1);
});
