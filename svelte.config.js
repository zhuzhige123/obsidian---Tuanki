import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** Standalone Svelte config for svelte-check and tooling (vite.config.ts remains the build source of truth). */
export default {
	preprocess: vitePreprocess(),
	compilerOptions: {
		runes: true,
		compatibility: {
			componentApi: 4,
		},
	},
};
