import { pathToFileURL } from "url";
import { createRequire } from "module";
import { builtinModules as builtins } from "node:module";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import UnoCSS from "unocss/vite";
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import commonjs from "vite-plugin-commonjs";
import path from "path";
import fs from "fs";

const require = createRequire(import.meta.url);
const {
	DEFAULT_PRUNABLE_RUNTIME_FILES,
	copyFileAtomicWithRetry,
	pruneManagedRuntimeFiles,
	resolvePluginDir,
	syncRuntimeFiles,
} = require("./scripts/hot-reload-utils.cjs");

const STANDALONE_EPUB_PLUGIN_ID = "weave-epub-reader";
const STANDALONE_EPUB_MANIFEST = "manifest.epub.json";
const STANDALONE_IR_PLUGIN_ID = "weave-incremental-reading";
const STANDALONE_IR_MANIFEST = "manifest.ir.json";
const DEFAULT_MANIFEST = "manifest.json";

function resolveInstalledPackageVersion(packageName: string): string {
	const packageJsonPath = path.resolve(
		process.cwd(),
		"node_modules",
		...packageName.split("/"),
		"package.json"
	);

	if (!fs.existsSync(packageJsonPath)) {
		throw new Error(`Unable to find installed package.json for ${packageName}`);
	}

	return JSON.parse(fs.readFileSync(packageJsonPath, "utf8")).version as string;
}

const svelteVersion = resolveInstalledPackageVersion("svelte");
const vitePluginSvelteVersion = resolveInstalledPackageVersion("@sveltejs/vite-plugin-svelte");
const svelteCacheFingerprint = [svelteVersion, vitePluginSvelteVersion]
	.join("-")
	.replace(/[^a-zA-Z0-9._-]/g, "_");

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFiles(filePaths: string[], timeoutMs = 4000, intervalMs = 120) {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() <= deadline) {
		if (filePaths.every((filePath) => fs.existsSync(filePath))) {
			return true;
		}

		await sleep(intervalMs);
	}

	return filePaths.every((filePath) => fs.existsSync(filePath));
}

export default defineConfig(({ mode }) => {
	console.log(`[vite] mode: ${mode}`);

	const isDev = mode === "development";
	const watchPollingEnv = process.env.WEAVE_WATCH_USE_POLLING?.trim();
	const usePollingWatcher =
		watchPollingEnv != null && watchPollingEnv !== ""
			? watchPollingEnv !== "0"
			: process.platform === "win32";
	const isMobileHotReloadBuild = process.env.WEAVE_MOBILE_HOT_RELOAD === "1";
	const isDesktopHotReloadBuild = process.env.WEAVE_DESKTOP_HOT_RELOAD === "1";
	const isStandaloneEpubBuild = process.env.WEAVE_EPUB_STANDALONE === "1";
	const isStandaloneIRBuild = process.env.WEAVE_IR_STANDALONE === "1";
	const shouldInlineDynamicImports = true;
	const mobileHotReloadOutputDir = process.env.WEAVE_MOBILE_SOURCE_DIR?.trim()
		? path.resolve(process.env.WEAVE_MOBILE_SOURCE_DIR)
		: path.resolve(process.cwd(), ".mobile-hot-reload");
	const desktopHotReloadOutputDir = process.env.WEAVE_DESKTOP_SOURCE_DIR?.trim()
		? path.resolve(process.env.WEAVE_DESKTOP_SOURCE_DIR)
		: path.resolve(process.cwd(), ".desktop-hot-reload");
	const shouldMinifyOutput = !isDev || isMobileHotReloadBuild;
	const buildSourceMap = isMobileHotReloadBuild ? "hidden" : isDev ? "inline" : false;

	const suppressedSvelteWarnings = new Set([
		"a11y_click_events_have_key_events",
		"a11y_no_static_element_interactions",
		"a11y_label_has_associated_control",
		"a11y_autofocus",
		"a11y_interactive_supports_focus",
		"css_unused_selector",
	]);
	const pluginId = isStandaloneEpubBuild
		? STANDALONE_EPUB_PLUGIN_ID
		: isStandaloneIRBuild
			? STANDALONE_IR_PLUGIN_ID
			: "weave";
	const manifestFileName = isStandaloneEpubBuild
		? STANDALONE_EPUB_MANIFEST
		: isStandaloneIRBuild
			? STANDALONE_IR_MANIFEST
			: DEFAULT_MANIFEST;

	const resolvedPluginDir =
		resolvePluginDir(pluginId, process.env) ?? path.resolve(process.cwd(), "dist");
	const buildOutDir = isMobileHotReloadBuild
		? mobileHotReloadOutputDir
		: isDesktopHotReloadBuild
			? desktopHotReloadOutputDir
			: resolvedPluginDir;
	const displayOutputDir =
		isDesktopHotReloadBuild && !isMobileHotReloadBuild ? resolvedPluginDir : buildOutDir;
	let buildWatchAnnounced = false;

	return {
		cacheDir: path.resolve(process.cwd(), `node_modules/.vite-${svelteCacheFingerprint}`),
		resolve: {
			conditions: ["browser", "import", "module", "default"],
		},
		define: {
			"process.env.NODE_ENV": JSON.stringify(mode),
			global: "globalThis",
			__WEAVE_EPUB_STANDALONE__: JSON.stringify(isStandaloneEpubBuild),
			__WEAVE_IR_STANDALONE__: JSON.stringify(isStandaloneIRBuild),
		},
		server: isDev
			? {
					watch: {
						usePolling: false,
						useFsEvents: true,
						depth: 10,
						interval: 100,
						binaryInterval: 300,
					},
					hmr: {
						overlay: false,
					},
			  }
			: undefined,
		clearScreen: false,
		plugins: [
			commonjs(),
			{
				name: "build-monitor",
				handleHotUpdate({ file }) {
					if (isDev) {
						console.log(`[watch] file changed: ${path.basename(file)}`);
					}
				},
				buildStart() {
					if (isDev) {
						if (!buildWatchAnnounced) {
							buildWatchAnnounced = true;
							console.log("[watch] development build watcher started");
							console.log(
								`[watch] backend: ${usePollingWatcher ? "polling" : "fs-events"}`
							);
							if (isDesktopHotReloadBuild && buildOutDir !== displayOutputDir) {
								console.log(`[watch] staging output: ${buildOutDir}`);
								console.log(`[watch] final desktop target: ${displayOutputDir}`);
							} else {
								console.log(`[watch] output: ${buildOutDir}`);
							}
						}

						console.log("[build] started");
					}
				},
				buildEnd() {
					if (!isDev) return;

					const timestamp = new Date().toLocaleTimeString("zh-CN");
					console.log(`[build] finished [${timestamp}]`);
					if (isDesktopHotReloadBuild && buildOutDir !== displayOutputDir) {
						console.log(`[build] staged at: ${buildOutDir}`);
						console.log(`[build] syncing desktop target: ${displayOutputDir}`);
						return;
					}

					console.log(`[build] output written to: ${buildOutDir}`);
				},
				watchChange(id, change) {
					if (isDev && id) {
						const fileName = path.basename(id);
						console.log(`[watch] detected change: ${fileName} (${change.event})`);
					}
				},
			},
			{
				name: "copy-manifest-with-retry",
				async writeBundle() {
					const manifestSource = path.resolve(process.cwd(), manifestFileName);
					const manifestTarget = path.resolve(buildOutDir, "manifest.json");

					try {
						await copyFileAtomicWithRetry(manifestSource, manifestTarget, {
							retries: 8,
							delayMs: 120,
						});
					} catch (error: any) {
						console.warn(
							`[manifest-copy] Failed to copy manifest.json to ${manifestTarget}: ${error?.message || error}`
						);
					}
				},
			},
			viteStaticCopy({
				targets: [
					{
						src: "node_modules/sql.js/dist/sql-wasm.wasm",
						dest: ".",
					},
					{
						src: "public/assets/coffee-support-qr.png",
						dest: "assets",
					},
					...(!isDev && !isStandaloneEpubBuild && !isStandaloneIRBuild
						? [
								{
									src: "README.md",
									dest: ".",
								},
								{
									src: "public/versions.json",
									dest: ".",
								},
						  ]
						: isDev
							? []
							: []),
				],
			}),
			svelte({
				emitCss: true,
				onwarn(warning, handler) {
					if (warning?.code && suppressedSvelteWarnings.has(warning.code)) return;
					handler(warning);
				},
				compilerOptions: {
					runes: true,
					compatibility: {
						componentApi: 4,
					},
				},
			}),
			UnoCSS(),
			{
				name: "desktop-hot-reload-sync",
				buildStart() {
					if (!isDesktopHotReloadBuild || buildOutDir === resolvedPluginDir) {
						return;
					}

					pruneManagedRuntimeFiles(buildOutDir, new Set(), DEFAULT_PRUNABLE_RUNTIME_FILES);
				},
				async closeBundle() {
					if (!isDesktopHotReloadBuild || buildOutDir === resolvedPluginDir) {
						return;
					}

					try {
						const expectedFiles = [
							path.join(buildOutDir, "main.js"),
							path.join(buildOutDir, "styles.css"),
							path.join(buildOutDir, "manifest.json"),
							path.join(buildOutDir, "sql-wasm.wasm"),
						];
						const filesReady = await waitForFiles(expectedFiles);
						if (!filesReady) {
							const missingFiles = expectedFiles
								.filter((filePath) => !fs.existsSync(filePath))
								.map((filePath) => path.basename(filePath));
							console.warn(
								`[desktop-sync] Delayed file(s) still missing before sync: ${missingFiles.join(", ")}`
							);
						}

						const { runtimeFiles, removed } = await syncRuntimeFiles(
							buildOutDir,
							resolvedPluginDir,
							{
								pruneStaleManagedFiles: true,
								managedFiles: DEFAULT_PRUNABLE_RUNTIME_FILES,
							}
						);

						const timestamp = new Date().toLocaleTimeString("zh-CN");
						console.log(
							`[desktop-sync] synced ${runtimeFiles.length} file(s) to ${resolvedPluginDir} [${timestamp}]`
						);
						if (removed.length > 0) {
							console.log(`[desktop-sync] removed stale file(s): ${removed.join(", ")}`);
						}
					} catch (error: any) {
						console.warn(
							`[desktop-sync] Failed to sync desktop build to ${resolvedPluginDir}: ${error?.message || error}`
						);
					}
				},
			},
		],

			build: {
				lib: {
				entry: isStandaloneEpubBuild
					? "src/epub-main"
					: isStandaloneIRBuild
						? "src/ir-main"
						: "src/main",
				formats: ["cjs"],
			},
			cssCodeSplit: false,
			assetsInlineLimit: 4096000,
			...(isDev && {
				watch: {
					include: ["src/**", DEFAULT_MANIFEST, STANDALONE_EPUB_MANIFEST, STANDALONE_IR_MANIFEST],
					exclude: ["node_modules/**", "dist/**", "**/*.test.*", ".git/**"],
					buildDelay: 120,
					chokidar: {
						usePolling: usePollingWatcher,
						interval: usePollingWatcher ? 220 : undefined,
						binaryInterval: usePollingWatcher ? 360 : undefined,
						awaitWriteFinish: {
							stabilityThreshold: 240,
							pollInterval: 80,
						},
						ignoreInitial: true,
					},
					skipWrite: false,
					clearScreen: false,
				},
			}),
			rollupOptions: {
				onwarn(warning, warn) {
					if (warning.code === "UNUSED_EXTERNAL_IMPORT") return;
					warn(warning);
				},
				output: {
					entryFileNames: "main.js",
					inlineDynamicImports: shouldInlineDynamicImports,
					chunkFileNames: undefined,
					manualChunks: undefined,
					assetFileNames: "styles.css",
					sourcemapBaseUrl:
						isDev && !isMobileHotReloadBuild
							? pathToFileURL(`${displayOutputDir}/`).toString()
							: undefined,
					exports: "named",
				},
				external: [
					"obsidian",
					"electron",
					"codemirror",
					/^@codemirror\/.*/,
					/^@lezer\/.*/,
					...builtins,
				],
				treeshake: {
					moduleSideEffects: (id) => {
						if (id && (id.includes("demo.ts") || id.includes("integration-demo.ts"))) {
							return false;
						}
						return true;
					},
				},
			},
			outDir: isDev ? buildOutDir : "dist",
			copyPublicDir: false,
			emptyOutDir: !isDev && (isStandaloneEpubBuild || isStandaloneIRBuild),
			sourcemap: buildSourceMap,
			target: ["es2020"],
			minify: shouldMinifyOutput ? "esbuild" : false,
		},
		esbuild: shouldMinifyOutput
			? {
					...(isDev ? {} : { drop: ["console", "debugger"] }),
					legalComments: "none",
			  }
			: undefined,
	};
});
