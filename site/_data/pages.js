const fs = require("node:fs");
const path = require("node:path");

const GENERATED_PATH = path.resolve(process.cwd(), "site", "_generated", "pages.json");

module.exports = function () {
  if (!fs.existsSync(GENERATED_PATH)) {
    throw new Error(
      `Missing generated pages dataset at ${GENERATED_PATH}. Run: npm run migrate:html`
    );
  }

  const raw = fs.readFileSync(GENERATED_PATH, "utf8");
  return JSON.parse(raw);
};
