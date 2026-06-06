#!/usr/bin/env node
/**
 * Mirror Obsidian Community review bot: certain Required rules cannot be
 * silenced with eslint-disable / eslint-disable-next-line in source.
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

/** Rules the community scanner rejects when disabled inline. */
const DISALLOWED_RULES = [
	"obsidianmd/ui/sentence-case",
	"obsidianmd/no-static-styles-assignment",
	"@typescript-eslint/no-explicit-any",
	"@typescript-eslint/no-deprecated",
];

const SOURCE_EXTENSIONS = new Set([".ts", ".svelte", ".js", ".mjs", ".cjs"]);

function walkFiles(dir, acc = []) {
	if (!fs.existsSync(dir)) return acc;

	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "vendor") {
				continue;
			}
			walkFiles(fullPath, acc);
			continue;
		}

		const ext = path.extname(entry.name);
		if (!SOURCE_EXTENSIONS.has(ext)) continue;
		acc.push(fullPath);
	}

	return acc;
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lineDisablesRule(line, rule) {
	if (!/eslint-disable(?:-next-line|-line)?/.test(line)) return false;
	const pattern = new RegExp(`(?:^|[,\\s])${escapeRegExp(rule)}(?:[,\\s]|$)`);
	return pattern.test(line);
}

const files = walkFiles(path.join(root, "src"));
const violations = [];

for (const fullPath of files) {
	const relPath = path.relative(root, fullPath).replace(/\\/g, "/");
	const lines = fs.readFileSync(fullPath, "utf8").split(/\r?\n/);

	lines.forEach((line, index) => {
		for (const rule of DISALLOWED_RULES) {
			if (!lineDisablesRule(line, rule)) continue;
			violations.push({
				file: relPath,
				line: index + 1,
				rule,
				content: line.trim(),
			});
		}
	});
}

if (violations.length > 0) {
	console.error(`Disallowed eslint-disable directives (${violations.length}):\n`);
	for (const item of violations) {
		console.error(`- ${item.file}:${item.line} [${item.rule}]`);
		console.error(`    ${item.content}`);
	}
	console.error(
		"\nFix the underlying issue instead of disabling Required community rules.",
	);
	process.exit(1);
}

console.log("No disallowed eslint-disable directives found.");
process.exit(0);
