const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const LOCK_FILES = [
	{
		target: "desktop",
		path: path.join(PROJECT_ROOT, ".dev-watch.lock.json"),
		label: "desktop dev watcher",
	},
	{
		target: "mobile",
		path: path.join(PROJECT_ROOT, ".mobile-watch.lock.json"),
		label: "mobile watch",
	},
];

function parseTarget(argv) {
	for (const arg of argv) {
		if (arg === "--help" || arg === "-h") {
			return "help";
		}
		if (arg === "--mobile-only" || arg === "--target=mobile" || arg === "--mobile") {
			return "mobile";
		}
		if (arg === "--desktop-only" || arg === "--target=desktop" || arg === "--desktop") {
			return "desktop";
		}
		if (arg === "--all" || arg === "--target=all") {
			return "all";
		}
	}

	return "all";
}

function printHelp() {
	console.log(`Usage: node scripts/kill-vite.cjs [--target=desktop|mobile|all]

Stops hot-reload watcher processes recorded in lock files.

  --target=desktop   Stop only desktop dev watcher (npm run dev)
  --target=mobile    Stop only mobile watch (npm run dev:mobile:watch)
  --target=all       Stop both (default; used before production build)

Aliases: --desktop-only, --mobile-only, --all`);
}

function isProcessAlive(pid) {
	if (!Number.isInteger(pid) || pid <= 0) {
		return false;
	}

	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

function stopLockFile(lockFile) {
	if (!fs.existsSync(lockFile.path)) {
		return false;
	}

	let lock;
	try {
		lock = JSON.parse(fs.readFileSync(lockFile.path, "utf8"));
	} catch {
		fs.rmSync(lockFile.path, { force: true });
		return false;
	}

	const pid = Number(lock?.pid);
	if (!isProcessAlive(pid)) {
		fs.rmSync(lockFile.path, { force: true });
		return false;
	}

	try {
		if (process.platform === "win32") {
			execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
				stdio: "ignore",
			});
		} else {
			process.kill(pid, "SIGTERM");
		}

		console.log(`Stopped ${lockFile.label} process: ${pid}`);
		return true;
	} catch (error) {
		console.warn(`Unable to stop ${lockFile.label} process ${pid}: ${error.message}`);
		return false;
	} finally {
		fs.rmSync(lockFile.path, { force: true });
	}
}

function cleanupStaleLocks(lockFiles) {
	for (const lockFile of lockFiles) {
		if (!fs.existsSync(lockFile.path)) {
			continue;
		}

		let lock;
		try {
			lock = JSON.parse(fs.readFileSync(lockFile.path, "utf8"));
		} catch {
			fs.rmSync(lockFile.path, { force: true });
			continue;
		}

		const pid = Number(lock?.pid);
		if (!isProcessAlive(pid)) {
			fs.rmSync(lockFile.path, { force: true });
		}
	}
}

const target = parseTarget(process.argv.slice(2));
if (target === "help") {
	printHelp();
	process.exit(0);
}

if (!["all", "desktop", "mobile"].includes(target)) {
	console.error(`Unknown kill target: ${target}`);
	printHelp();
	process.exit(1);
}

const selectedLockFiles =
	target === "all" ? LOCK_FILES : LOCK_FILES.filter((lockFile) => lockFile.target === target);

let stoppedAny = false;
for (const lockFile of selectedLockFiles) {
	if (stopLockFile(lockFile)) {
		stoppedAny = true;
	}
}

if (!stoppedAny) {
	cleanupStaleLocks(selectedLockFiles);
}
