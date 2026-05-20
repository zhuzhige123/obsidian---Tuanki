const fs = require("fs");
const path = require("path");
const {
	DEFAULT_PRUNABLE_RUNTIME_FILES,
	copyFileAtomicWithRetry,
	resolvePluginDir,
	syncRuntimeFiles,
} = require("./hot-reload-utils.cjs");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DIST_DIR = path.join(PROJECT_ROOT, "dist");
const MANIFEST_SOURCE = path.join(PROJECT_ROOT, "manifest.json");
const PLUGIN_ID = "weave";

function resolveTargetDirs() {
	const targets = new Set();
	targets.add(DIST_DIR);

	const pluginDir = resolvePluginDir(PLUGIN_ID, process.env);
	if (pluginDir) {
		targets.add(pluginDir);
	}

	return [...targets];
}

if (!fs.existsSync(MANIFEST_SOURCE)) {
	console.error(`Manifest source not found: ${MANIFEST_SOURCE}`);
	process.exit(1);
}

async function main() {
	for (const targetDir of resolveTargetDirs()) {
		fs.mkdirSync(targetDir, { recursive: true });
		await copyFileAtomicWithRetry(MANIFEST_SOURCE, path.join(targetDir, "manifest.json"), {
			retries: 8,
			delayMs: 120,
		});

		const { runtimeFiles, removed } = await syncRuntimeFiles(DIST_DIR, targetDir, {
			pruneStaleManagedFiles: true,
			managedFiles: DEFAULT_PRUNABLE_RUNTIME_FILES,
			retries: 8,
			delayMs: 120,
		});

		const syncedFiles = new Set(["manifest.json", ...runtimeFiles]);
		console.log(`Synced ${syncedFiles.size} build file(s) -> ${targetDir}`);
		if (removed.length > 0) {
			console.log(`Removed stale build file(s) -> ${removed.join(", ")}`);
		}
	}
}

main().catch((error) => {
	console.error(error?.message || error);
	process.exit(1);
});
