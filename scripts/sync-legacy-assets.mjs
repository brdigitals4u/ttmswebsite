#!/usr/bin/env node

import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const ASSET_SYNC_PAIRS = [
  {
    source: path.join(ROOT, "dist", "assets"),
    target: path.join(ROOT, "site", "_public", "assets")
  },
  {
    source: path.join(ROOT, "dist", "video"),
    target: path.join(ROOT, "site", "_public", "video")
  }
];

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function syncDirectory(source, target) {
  await rm(target, { recursive: true, force: true });
  const sourceExists = await exists(source);
  if (!sourceExists) {
    await mkdir(target, { recursive: true });
    return false;
  }

  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, { recursive: true });
  return true;
}

async function main() {
  let syncedCount = 0;
  for (const pair of ASSET_SYNC_PAIRS) {
    const synced = await syncDirectory(pair.source, pair.target);
    if (synced) syncedCount += 1;
  }

  process.stdout.write(
    `Synced legacy assets to site/_public (${syncedCount}/${ASSET_SYNC_PAIRS.length} directories copied).\n`
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
