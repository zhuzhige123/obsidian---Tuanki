import { type App, normalizePath } from "obsidian";
import { getPluginPaths, getV2Paths } from "../config/paths";
import { logger } from "./logger";

export interface PathRewriteRule {
	from: string;
	to: string;
}

const REWRITE_STRING_KEYS = new Set([
	"filePath",
	"rawFilePath",
	"indexFilePath",
	"sourcePath",
	"storagePath",
	"originalPath",
	"pdfPath",
	"epubFilePath",
	"importFolder",
]);

const REWRITE_STRING_ARRAY_KEYS = new Set(["sourceFiles", "chunkFilePaths"]);

export function buildKnownPathReferenceFiles(args: {
	v2Paths: ReturnType<typeof getV2Paths>;
	pluginPaths: ReturnType<typeof getPluginPaths>;
}): string[] {
	const { v2Paths, pluginPaths } = args;
	return [
		v2Paths.ir.blocks,
		v2Paths.ir.legacyDecks,
		v2Paths.ir.chunks,
		v2Paths.ir.sources,
		v2Paths.ir.materials.index,
		v2Paths.ir.documentGroupMap,
		v2Paths.ir.pdfBookmarkTasks,
		v2Paths.ir.epubBookmarkTasks,
		pluginPaths.state.incrementalReading.readingMaterialsRuntime,
		pluginPaths.state.userProfile,
	];
}

export function normalizeRewriteRules(rules: Iterable<PathRewriteRule>): PathRewriteRule[] {
	const normalized = Array.from(rules)
		.map((rule) => ({
			from: normalizePath(rule.from || ""),
			to: normalizePath(rule.to || ""),
		}))
		.filter((rule) => rule.from && rule.to && rule.from !== rule.to);

	normalized.sort((a, b) => b.from.length - a.from.length);
	return normalized;
}

export function rewritePathWithRules(
	value: string,
	rules: Iterable<PathRewriteRule>
): string | null {
	if (!value || typeof value !== "string") return null;

	let rewritten = normalizePath(value);
	if (!rewritten) return null;

	for (const rule of normalizeRewriteRules(rules)) {
		if (rewritten === rule.from) {
			rewritten = rule.to;
			continue;
		}

		if (rewritten.startsWith(`${rule.from}/`)) {
			rewritten = normalizePath(`${rule.to}/${rewritten.slice(rule.from.length + 1)}`);
		}
	}

	return rewritten;
}

export function rewriteJsonWithRules(
	value: unknown,
	rules: Iterable<PathRewriteRule>,
	parentKey?: string
): { value: unknown; changed: boolean; count: number } {
	const normalizedRules = normalizeRewriteRules(rules);

	if (typeof value === "string") {
		if (parentKey && REWRITE_STRING_KEYS.has(parentKey)) {
			const rewritten = rewritePathWithRules(value, normalizedRules);
			if (rewritten && rewritten !== value) {
				return { value: rewritten, changed: true, count: 1 };
			}
		}
		return { value, changed: false, count: 0 };
	}

	if (Array.isArray(value)) {
		let changed = false;
		let count = 0;

		const next = value.map((item) => {
			if (typeof item === "string" && parentKey && REWRITE_STRING_ARRAY_KEYS.has(parentKey)) {
				const rewritten = rewritePathWithRules(item, normalizedRules);
				if (rewritten && rewritten !== item) {
					changed = true;
					count++;
					return rewritten;
				}
			}

			const nested = rewriteJsonWithRules(item, normalizedRules, parentKey);
			changed = changed || nested.changed;
			count += nested.count;
			return nested.value;
		});

		return { value: next, changed, count };
	}

	if (value && typeof value === "object") {
		let changed = false;
		let count = 0;
		const next: Record<string, unknown> = {};

		for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
			const nested = rewriteJsonWithRules(nestedValue, normalizedRules, key);
			next[key] = nested.value;
			changed = changed || nested.changed;
			count += nested.count;
		}

		return { value: next, changed, count };
	}

	return { value, changed: false, count: 0 };
}

export async function rewriteKnownPathReferences(
	app: App,
	filePaths: Iterable<string>,
	rules: Iterable<PathRewriteRule>
): Promise<number> {
	const adapter = app.vault.adapter as any;
	const normalizedRules = normalizeRewriteRules(rules);

	if (normalizedRules.length === 0) return 0;

	let rewritten = 0;
	for (const filePath of filePaths) {
		if (!(await adapter.exists(filePath))) continue;

		try {
			const raw = await adapter.read(filePath);
			const parsed = JSON.parse(raw);
			const result = rewriteJsonWithRules(parsed, normalizedRules);
			if (!result.changed) continue;

			await adapter.write(filePath, JSON.stringify(result.value, null, 2));
			rewritten += result.count;
		} catch (error) {
			logger.warn(`[PathRewrite] Failed to rewrite ${filePath}`, error);
		}
	}

	return rewritten;
}
