const fs = require("fs");
const path = require("path");
const { spawnSync } = require("node:child_process");

const mainPath = path.join(__dirname, "..", "dist", "main.js");
if (!fs.existsSync(mainPath)) {
  console.error("dist/main.js not found; run npm run build first.");
  process.exit(1);
}

const content = fs.readFileSync(mainPath, "utf8");
const hits = content.match(/createElement\(["']script["']\)/g) ?? [];

console.log(`dynamic script patterns: ${hits.length}`);
process.exit(hits.length === 0 ? 0 : 1);
