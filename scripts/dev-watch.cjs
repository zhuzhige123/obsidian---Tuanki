const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { resolvePluginDir } = require("./hot-reload-utils.cjs");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const LOCK_FILE = path.join(PROJECT_ROOT, ".dev-watch.lock.json");
const VITE_ENTRY = path.join("node_modules", "vite", "bin", "vite.js");
const MAX_OLD_SPACE_SIZE = process.env.WEAVE_DEV_MEMORY_MB || "4096";
const PLUGIN_ID = "weave";
const DESKTOP_SOURCE_DIR = process.env.WEAVE_DESKTOP_SOURCE_DIR?.trim()
	? path.resolve(process.env.WEAVE_DESKTOP_SOURCE_DIR)
	: path.resolve(PROJECT_ROOT, ".desktop-hot-reload");

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

function readLockFile() {
	if (!fs.existsSync(LOCK_FILE)) {
		return null;
	}

	try {
		return JSON.parse(fs.readFileSync(LOCK_FILE, "utf8"));
	} catch {
		return null;
	}
}

function removeLockFile() {
	if (fs.existsSync(LOCK_FILE)) {
		fs.rmSync(LOCK_FILE, { force: true });
	}
}

function writeLockFile() {
	fs.writeFileSync(
		LOCK_FILE,
		JSON.stringify(
			{
				pid: process.pid,
				projectRoot: PROJECT_ROOT,
				pluginId: PLUGIN_ID,
				sourceDir: DESKTOP_SOURCE_DIR,
				createdAt: new Date().toISOString(),
			},
			null,
			2
		),
		"utf8"
	);
}

function resolveTargetPluginDir() {
	return resolvePluginDir(PLUGIN_ID, process.env);
}

const targetPluginDir = resolveTargetPluginDir();
const useDesktopStaging = Boolean(targetPluginDir);
const childEnv = useDesktopStaging
	? {
			...process.env,
			WEAVE_DESKTOP_HOT_RELOAD: "1",
			WEAVE_DESKTOP_SOURCE_DIR: DESKTOP_SOURCE_DIR,
	  }
	: process.env;
let cleanedUp = false;

function cleanup() {
	if (cleanedUp) {
		return;
	}

	cleanedUp = true;
	const lock = readLockFile();
	if (lock?.pid === process.pid) {
		removeLockFile();
	}
}

const existingLock = readLockFile();
if (existingLock?.pid && existingLock.pid !== process.pid) {
	if (isProcessAlive(existingLock.pid)) {
		console.log(`Desktop watcher is already running. PID: ${existingLock.pid}`);
		console.log("Run `node scripts/kill-vite.cjs --target=desktop` before restarting.");
		process.exit(0);
	}

	removeLockFile();
}

writeLockFile();

if (useDesktopStaging) {
	console.log(`Desktop hot reload staging dir: ${DESKTOP_SOURCE_DIR}`);
	console.log(`Desktop hot reload target dir: ${targetPluginDir}`);
} else {
	console.warn("OBSIDIAN_VAULT_PATH is not set. Falling back to Vite default dev output.");
}

const child = spawn(
	process.execPath,
	[
		`--max-old-space-size=${MAX_OLD_SPACE_SIZE}`,
		VITE_ENTRY,
		"build",
		"--mode",
		"development",
		"--watch",
	],
	{
		cwd: PROJECT_ROOT,
		env: childEnv,
		stdio: ["inherit", "pipe", "pipe"],
	}
);

child.stdout.on("data", (data) => {
	process.stdout.write(data.toString());
});

child.stderr.on("data", (data) => {
	process.stderr.write(data.toString());
});

process.on("SIGINT", () => {
	if (!child.killed) {
		child.kill("SIGINT");
	}
	cleanup();
	process.exit(0);
});

process.on("SIGTERM", () => {
	if (!child.killed) {
		child.kill("SIGTERM");
	}
	cleanup();
	process.exit(0);
});

process.on("exit", cleanup);

child.on("error", (error) => {
	console.error(error?.message || error);
	cleanup();
	process.exit(1);
});

child.on("close", (code, signal) => {
	cleanup();

	if (signal) {
		process.kill(process.pid, signal);
		return;
	}

	process.exit(code ?? 0);
});
