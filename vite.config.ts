import { pathToFileURL } from "url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import builtins from "builtin-modules";
import UnoCSS from "unocss/vite";
import { defineConfig, loadEnv } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import commonjs from "vite-plugin-commonjs";
import path from "path";

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	console.log(`🔧 Vite mode: ${mode}`);
	const isDev = mode === "development";

	// 环境变量配置
	const obsidianVaultPath = env.OBSIDIAN_VAULT_PATH ? path.resolve(env.OBSIDIAN_VAULT_PATH) : null;
	const PLUGIN_DIR = isDev
		? obsidianVaultPath
			? `${obsidianVaultPath}/plugins/tuanki`
			: "D:/桌面/obsidian luman/.obsidian/plugins/tuanki"
		: obsidianVaultPath
			? `${obsidianVaultPath}/plugins/tuanki`
			: "dist";


	return {
		resolve: {
			conditions: ['browser', 'import', 'module', 'default']
		},
		define: {
			'process.env.NODE_ENV': JSON.stringify(mode),
			'global': 'globalThis'
		},
		plugins: [
			commonjs(),
			// 简化的构建监控
			{
				name: 'build-monitor',
				buildEnd() {
					if (isDev) {
						console.log(`✅ 构建完成 - 输出到: ${PLUGIN_DIR}`);
					}
				}
			},
			viteStaticCopy({
				targets: [
					{
						src: "manifest.json",
						dest: ".",
					},
					{
						src: "node_modules/sql.js/dist/sql-wasm.wasm",
						dest: ".",
					},
					...(isDev ? [] : [
						{
							src: "README.md",
							dest: ".",
						}
					])
				],
			}),
			svelte({
				emitCss: true,
				compilerOptions: {
					runes: true,
					compatibility: {
						componentApi: 4
					},
					hmr: isDev
				}
			}),
			UnoCSS(),
		],
		
		build: {
			lib: {
				entry: "src/main",
				formats: ["cjs"],
			},
			cssCodeSplit: false,
			assetsInlineLimit: 4096000,
		...(isDev && {
			watch: {
				include: ["src/**", "manifest.json"],
				exclude: ["node_modules/**", "dist/**", "**/*.test.*"],
				chokidar: {
					usePolling: true,
					interval: 100,
					binaryInterval: 300,
					ignoreInitial: true,
					awaitWriteFinish: {
						stabilityThreshold: 100,
						pollInterval: 50
					}
				}
			}
		}),
			rollupOptions: {
				output: {
					entryFileNames: "main.js",
					inlineDynamicImports: true,
					manualChunks: undefined,
					assetFileNames: "styles.css",
					sourcemapBaseUrl: isDev ? pathToFileURL(`${PLUGIN_DIR}/`).toString() : undefined,
				},
				external: [
					"obsidian",
					"electron",
					...builtins,
				],
				treeshake: {
					moduleSideEffects: (id) => {
						if (id && (id.includes('demo.ts') || id.includes('integration-demo.ts'))) {
							return false;
						}
						return true;
					}
				}
			},
			outDir: isDev ? PLUGIN_DIR : "dist",
			emptyOutDir: !isDev,
			sourcemap: isDev ? "inline" : false,
			target: ["es2018"],
			minify: isDev ? false : "terser",
		},
	};
});
