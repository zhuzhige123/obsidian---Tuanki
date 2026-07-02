/**
 * Vite/Obsidian-safe build environment helpers.
 * Avoid Node `process.env` in plugin runtime (community ESLint no-undef / no-nodejs-modules).
 */

export function isDevBuild(): boolean {
	return Boolean(import.meta.env.DEV);
}

export function readBuildEnv(key: string): string | undefined {
	const value = import.meta.env[key];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}
