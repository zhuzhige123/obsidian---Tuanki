/**
 * Verify manifest.version has a matching published GitHub Release tag.
 * Obsidian community review bot blocks when manifest version lacks a release tag.
 *
 * Usage:
 *   node scripts/check-github-release-tag.cjs
 *   node scripts/check-github-release-tag.cjs --version 0.8.21
 *   node scripts/check-github-release-tag.cjs --skip-if-offline
 */
const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const GITHUB_REPO = process.env.WEAVE_GITHUB_REPO || "zhuzhige123/obsidian---Weave";

function fail(message) {
	console.error(`[check-github-release-tag] ${message}`);
	process.exit(1);
}

function parseArgs(argv) {
	const args = { version: null, skipIfOffline: false };
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (token === "--version") {
			args.version = argv[index + 1];
			index += 1;
		} else if (token === "--skip-if-offline") {
			args.skipIfOffline = true;
		} else if (token === "--help" || token === "-h") {
			console.log("Usage: node scripts/check-github-release-tag.cjs [--version x.y.z] [--skip-if-offline]");
			process.exit(0);
		} else {
			fail(`Unknown argument: ${token}`);
		}
	}
	return args;
}

function readManifestVersion() {
	const manifestPath = path.join(PROJECT_ROOT, "manifest.json");
	if (!fs.existsSync(manifestPath)) {
		fail("manifest.json not found");
	}
	const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
	if (!manifest.version) {
		fail("manifest.json is missing version");
	}
	return manifest.version;
}

async function releaseTagExists(version) {
	const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${encodeURIComponent(version)}`;
	const response = await fetch(url, {
		headers: {
			Accept: "application/vnd.github+json",
			"User-Agent": "weave-obsidian-release-check",
		},
	});

	if (response.status === 404) {
		return false;
	}

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`GitHub API ${response.status} for ${url}: ${body.slice(0, 200)}`);
	}

	const payload = await response.json();
	return payload.draft !== true && payload.tag_name === version;
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const version = args.version || readManifestVersion();

	let exists = false;
	try {
		exists = await releaseTagExists(version);
	} catch (error) {
		if (args.skipIfOffline) {
			console.warn(
				`[check-github-release-tag] Skipping offline/unreachable GitHub check for ${version}: ${error.message}`
			);
			return;
		}
		fail(`Unable to verify GitHub release tag for ${version}: ${error.message}`);
	}

	if (!exists) {
		fail(
			`No published GitHub release tag found for manifest version ${version}. ` +
				`Push tag ${version} and wait for release workflow before syncing community metadata. ` +
				`Repo: https://github.com/${GITHUB_REPO}/releases`
		);
	}

	console.log(`[check-github-release-tag] Published release tag ${version} exists on GitHub.`);
}

main().catch((error) => {
	fail(error instanceof Error ? error.message : String(error));
});
