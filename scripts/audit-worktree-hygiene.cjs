const { execFileSync } = require("child_process");
const path = require("path");

function runGit(args) {
	return execFileSync("git", args, {
		cwd: process.cwd(),
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
}

function readLines(args) {
	return runGit(args)
		.split(/\r?\n/)
		.map((line) => line.trimEnd())
		.filter(Boolean);
}

function summarizeIgnored(entries) {
	const buckets = new Map();

	for (const entry of entries) {
		const normalized = entry.replace(/\\/g, "/");
		const topLevel = normalized.split("/")[0] || normalized;
		buckets.set(topLevel, (buckets.get(topLevel) || 0) + 1);
	}

	return Array.from(buckets.entries()).sort((a, b) => b[1] - a[1]);
}

function main() {
	const branchLine = readLines(["status", "--short", "--branch"])[0] || "## unknown";
	const shortStatus = readLines(["status", "--short"]);
	const ignoredStatus = readLines(["status", "--short", "--ignored"]);

	const trackedChanges = [];
	const untrackedChanges = [];
	const ignoredChanges = [];

	for (const line of ignoredStatus) {
		if (line.startsWith("!! ")) {
			ignoredChanges.push(line.slice(3));
			continue;
		}
	}

	for (const line of shortStatus) {
		if (line.startsWith("?? ")) {
			untrackedChanges.push(line.slice(3));
			continue;
		}
		if (line.startsWith("## ")) {
			continue;
		}
		trackedChanges.push(line);
	}

	const ignoredSummary = summarizeIgnored(ignoredChanges);
	const prototypeDeletes = trackedChanges.filter((line) => {
		const status = line.slice(0, 2);
		const file = line.slice(3).trim();
		return status.includes("D") && file.includes("prototypes/");
	});
	const onlyIgnoredNoise = trackedChanges.length === 0 && untrackedChanges.length === 0 && ignoredChanges.length > 0;
	const ciMode = process.argv.includes("--ci");

	console.log("Worktree Hygiene Audit");
	console.log("======================");
	console.log(branchLine);
	console.log("");

	console.log(`Tracked changes: ${trackedChanges.length}`);
	for (const line of trackedChanges) {
		console.log(`  ${line}`);
	}
	console.log("");

	console.log(`Untracked non-ignored files: ${untrackedChanges.length}`);
	for (const file of untrackedChanges) {
		console.log(`  ?? ${file}`);
	}
	console.log("");

	console.log(`Ignored local noise: ${ignoredChanges.length}`);
	for (const [name, count] of ignoredSummary.slice(0, 12)) {
		console.log(`  ${name}: ${count}`);
	}
	console.log("");

	if (prototypeDeletes.length > 0) {
		console.log("Tracked prototype deletions detected:");
		for (const line of prototypeDeletes) {
			console.log(`  ${line}`);
		}
		console.log("  These files are still tracked in Git history and need a real cleanup commit.");
		console.log("");
	}

	if (onlyIgnoredNoise) {
		console.log("Status: clean for real development work; only ignored local artifacts remain.");
	} else if (trackedChanges.length === 0 && untrackedChanges.length === 0) {
		console.log("Status: fully clean.");
	} else {
		console.log("Status: real worktree changes remain.");
	}

	if (ciMode && (trackedChanges.length > 0 || untrackedChanges.length > 0)) {
		process.exitCode = 1;
	}
}

main();
