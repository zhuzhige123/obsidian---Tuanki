const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const reportPath = path.join(process.cwd(), ".tmp-vitest-health.json");

function runVitestJson() {
	try {
		execFileSync(
			process.platform === "win32" ? "cmd" : "npm",
			process.platform === "win32"
				? ["/c", "npm", "run", "test", "--", "--reporter=json", "--outputFile", reportPath]
				: ["run", "test", "--", "--reporter=json", "--outputFile", reportPath],
			{
				cwd: process.cwd(),
				encoding: "utf8",
				stdio: ["ignore", "pipe", "pipe"],
			}
		);
	} catch (_error) {
		// Failing tests are expected here; Vitest still writes the JSON report.
	}
}

function normalizeMessage(message) {
	return String(message || "").replace(/\s+/g, " ").trim();
}

function classifyFailure(message) {
	const normalized = normalizeMessage(message);
	if (!normalized) {
		return "unknown";
	}
	if (normalized.includes("No test suite found in file")) {
		return "no_suite";
	}
	if (normalized.includes("Test timed out")) {
		return "timeout";
	}
	if (normalized.includes("Cannot read properties of undefined")) {
		return "top_level_type_error";
	}
	return "other_failure";
}

function main() {
	runVitestJson();

	if (!fs.existsSync(reportPath)) {
		console.error("Vitest JSON report was not produced.");
		process.exit(1);
	}

	const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
	const results = Array.isArray(report.testResults) ? report.testResults : [];
	const grouped = new Map();

	for (const result of results) {
		if (result.status !== "failed") {
			continue;
		}
		const category = classifyFailure(result.message);
		const current = grouped.get(category) || [];
		current.push({
			name: result.name,
			message: normalizeMessage(result.message),
		});
		grouped.set(category, current);
	}

	console.log("Test Health Audit");
	console.log("=================");
	console.log(`Total suites: ${report.numTotalTestSuites}`);
	console.log(`Passed suites: ${report.numPassedTestSuites}`);
	console.log(`Failed suites: ${report.numFailedTestSuites}`);
	console.log(`Passed tests: ${report.numPassedTests}`);
	console.log(`Failed tests: ${report.numFailedTests}`);
	console.log("");

	if (grouped.size === 0) {
		console.log("No failing suites detected.");
		fs.rmSync(reportPath, { force: true });
		return;
	}

	for (const [category, entries] of Array.from(grouped.entries()).sort((a, b) => b[1].length - a[1].length)) {
		console.log(`${category}: ${entries.length}`);
		for (const entry of entries.slice(0, 12)) {
			console.log(`  ${entry.name}`);
			if (entry.message) {
				console.log(`    ${entry.message}`);
			}
		}
		if (entries.length > 12) {
			console.log(`  ... ${entries.length - 12} more`);
		}
		console.log("");
	}

	fs.rmSync(reportPath, { force: true });
	process.exitCode = report.success ? 0 : 1;
}

main();
