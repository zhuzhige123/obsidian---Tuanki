/**
 * Push only Obsidian community version metadata to origin/main without other code changes.
 * Weave-specific: also syncs public/versions.json (must match versions.json byte-for-byte in CI).
 *
 * Usage:
 *   node scripts/sync-obsidian-community-version.cjs
 *   node scripts/sync-obsidian-community-version.cjs --version 0.8.10
 *   node scripts/sync-obsidian-community-version.cjs --dry-run
 *   node scripts/sync-obsidian-community-version.cjs --push-ref wip-main-sync:main
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const SYNC_BRANCH = "obsidian-version-sync";
const REMOTE = "origin";
const DEFAULT_BRANCH = "main";
const GITHUB_REPO = "zhuzhige123/obsidian---Weave";
const VERSION_FILES = [
	"manifest.json",
	"package.json",
	"versions.json",
	"public/versions.json",
];

function fail(message) {
	console.error(`[sync-obsidian-community-version] ${message}`);
	process.exit(1);
}

function run(command, args, options = {}) {
	const result = execFileSync(command, args, {
		cwd: PROJECT_ROOT,
		encoding: "utf8",
		stdio: options.dryRun ? "pipe" : "inherit",
		...options,
	});
	return typeof result === "string" ? result.trim() : "";
}

function runCapture(command, args) {
	return run(command, args, { stdio: "pipe" });
}

function parseArgs(argv) {
	const args = { dryRun: false, version: null, pushRef: null };
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (token === "--dry-run") {
			args.dryRun = true;
		} else if (token === "--version") {
			args.version = argv[index + 1];
			index += 1;
		} else if (token === "--push-ref") {
			args.pushRef = argv[index + 1];
			index += 1;
		} else if (token === "--help" || token === "-h") {
			console.log(
				"Usage: node scripts/sync-obsidian-community-version.cjs [--version x.y.z] [--push-ref branch:main] [--dry-run]"
			);
			process.exit(0);
		} else {
			fail(`Unknown argument: ${token}`);
		}
	}
	return args;
}

function readJson(relativePath) {
	return JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, relativePath), "utf8"));
}

function writeJson(relativePath, value) {
	const absolutePath = path.join(PROJECT_ROOT, relativePath);
	fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
	fs.writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
}

function resolveMinAppVersion() {
	const manifest = readJson("manifest.json");
	return manifest.minAppVersion || "1.7.0";
}

function resolveTargetVersion(explicitVersion) {
	if (explicitVersion) {
		if (!/^\d+\.\d+\.\d+$/.test(explicitVersion)) {
			fail(`Invalid version format: ${explicitVersion}`);
		}
		return explicitVersion;
	}

	const manifest = readJson("manifest.json");
	if (!manifest.version) {
		fail("manifest.json is missing version");
	}
	return manifest.version;
}

function ensureLocalVersionFiles(version) {
	const minAppVersion = resolveMinAppVersion();
	const manifest = readJson("manifest.json");
	const packageJson = readJson("package.json");
	const versions = readJson("versions.json");

	manifest.version = version;
	packageJson.version = version;
	versions[version] = minAppVersion;

	writeJson("manifest.json", manifest);
	writeJson("package.json", packageJson);
	writeJson("versions.json", versions);
	writeJson("public/versions.json", versions);

	return { manifest, versions };
}

function getCurrentBranch() {
	return runCapture("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
}

function hasStashNamed(name) {
	const stashList = runCapture("git", ["stash", "list"]);
	return stashList.split("\n").some((line) => line.includes(name));
}

function resolvePushRef(explicitPushRef) {
	if (explicitPushRef) {
		return explicitPushRef;
	}
	if (process.env.WEAVE_OBSIDIAN_PUSH_REF) {
		return process.env.WEAVE_OBSIDIAN_PUSH_REF;
	}
	return `${SYNC_BRANCH}:${DEFAULT_BRANCH}`;
}

function main() {
	const args = parseArgs(process.argv.slice(2));
	const targetVersion = resolveTargetVersion(args.version);
	const pushRef = resolvePushRef(args.pushRef);
	const stashMessage = `wip-before-obsidian-version-sync-${Date.now()}`;
	const previousBranch = getCurrentBranch();
	const metadata = ensureLocalVersionFiles(targetVersion);

	console.log(`[sync-obsidian-community-version] Target version: ${targetVersion}`);
	console.log(`[sync-obsidian-community-version] Push ref: ${REMOTE} ${pushRef}`);

	if (args.dryRun) {
		console.log("[sync-obsidian-community-version] Dry run only. Planned actions:");
		console.log(`  - git fetch ${REMOTE}`);
		console.log(`  - git stash push -u -m "${stashMessage}"`);
		console.log(`  - git checkout -B ${SYNC_BRANCH} ${REMOTE}/${DEFAULT_BRANCH}`);
		console.log(`  - update ${VERSION_FILES.join(", ")}`);
		console.log(`  - git commit + git push ${REMOTE} ${pushRef}`);
		console.log(`  - git checkout ${previousBranch} && git stash pop`);
		return;
	}

	run("git", ["fetch", REMOTE]);

	let stashed = false;
	const status = runCapture("git", ["status", "--porcelain"]);
	if (status.length > 0) {
		run("git", ["stash", "push", "-u", "-m", stashMessage]);
		stashed = true;
	}

	try {
		run("git", ["checkout", "-B", SYNC_BRANCH, `${REMOTE}/${DEFAULT_BRANCH}`]);

		writeJson("manifest.json", metadata.manifest);

		run("git", ["checkout", `${REMOTE}/${DEFAULT_BRANCH}`, "--", "package.json"]);
		const packageJson = readJson("package.json");
		packageJson.version = targetVersion;
		writeJson("package.json", packageJson);

		writeJson("versions.json", metadata.versions);
		writeJson("public/versions.json", metadata.versions);

		run("git", ["add", ...VERSION_FILES]);

		const stagedDiff = runCapture("git", ["diff", "--cached", "--stat"]);
		console.log(stagedDiff);

		run("git", [
			"commit",
			"-m",
			`Sync version metadata on main to ${targetVersion} for Obsidian community updates.`,
		]);
		run("git", ["push", REMOTE, pushRef]);
	} finally {
		run("git", ["checkout", previousBranch]);
		if (stashed && hasStashNamed(stashMessage)) {
			run("git", ["stash", "pop"]);
		}
	}

	console.log(
		`[sync-obsidian-community-version] Done. Verify: https://raw.githubusercontent.com/${GITHUB_REPO}/${DEFAULT_BRANCH}/manifest.json`
	);
}

main();
