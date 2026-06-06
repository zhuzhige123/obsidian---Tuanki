#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const result = spawnSync(
	"npx",
	["eslint", "-c", "eslint.community.config.mjs", "src", "--max-warnings", "99999", "-f", "json"],
	{ cwd: root, encoding: "utf8", shell: true, maxBuffer: 80 * 1024 * 1024 },
);

const start = (result.stdout || "").indexOf("[");
if (start < 0) {
	console.error("eslint failed");
	process.exit(1);
}

const reports = JSON.parse(result.stdout.slice(start));
const byFile = new Map();
const byRule = new Map();
const items = [];

for (const file of reports) {
	const rel = path.relative(root, file.filePath).replace(/\\/g, "/");
	for (const msg of file.messages) {
		if (msg.severity !== 1) continue;
		byFile.set(rel, (byFile.get(rel) || 0) + 1);
		byRule.set(msg.ruleId, (byRule.get(msg.ruleId) || 0) + 1);
		items.push({ file: rel, line: msg.line, rule: msg.ruleId, message: msg.message });
	}
}

console.log(`Warnings: ${items.length}`);
console.log("\nBy rule:");
[...byRule.entries()].sort((a, b) => b[1] - a[1]).forEach(([rule, count]) => {
	console.log(`  ${count}\t${rule}`);
});
console.log("\nBy file:");
[...byFile.entries()].sort((a, b) => b[1] - a[1]).forEach(([file, count]) => {
	console.log(`  ${count}\t${file}`);
});
console.log("\nAll items:");
for (const item of items.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
	console.log(`${item.file}:${item.line}\t[${item.rule}] ${item.message}`);
}
