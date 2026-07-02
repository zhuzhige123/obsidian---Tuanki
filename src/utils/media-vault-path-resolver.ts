import type { App } from "obsidian";
import { TFile } from "obsidian";
import { extractMediaVaultPathsFromContent, normalizeMediaVaultPath } from "./media-reference-extractor";

export type VaultMediaBasenameIndex = Map<string, TFile[]>;

export type UnresolvedMediaReferenceStrategy = "leave" | "placeholder" | "remove";

export interface MediaPathResolutionOptions {
	basenameIndex?: VaultMediaBasenameIndex;
	unresolvedStrategy?: UnresolvedMediaReferenceStrategy;
}

export function resolveRelativeVaultPath(baseFilePath: string, relativePath: string): string {
	const normalizedBase = baseFilePath.replace(/\\/g, "/");
	const baseParts = normalizedBase.split("/");
	if (baseParts.length > 1) {
		baseParts.pop();
	} else {
		baseParts.length = 0;
	}

	const parts = [...baseParts];
	for (const segment of relativePath.replace(/\\/g, "/").split("/")) {
		if (!segment || segment === ".") {
			continue;
		}
		if (segment === "..") {
			if (parts.length > 0) {
				parts.pop();
			}
			continue;
		}
		parts.push(segment);
	}

	return parts.join("/");
}

function buildMediaResolutionContextPaths(contextPath: string): string[] {
	const normalizedContext = normalizeMediaVaultPath(contextPath);
	const contexts = new Set<string>([normalizedContext]);
	const segments = normalizedContext.split("/").filter(Boolean);

	for (let depth = segments.length; depth >= 0; depth -= 1) {
		const prefix = depth === 0 ? "" : `${segments.slice(0, depth).join("/")}/`;
		contexts.add(`${prefix}_weave-media-context_.md`);
	}

	return Array.from(contexts);
}

export function buildVaultMediaBasenameIndex(app: App): VaultMediaBasenameIndex {
	const index: VaultMediaBasenameIndex = new Map();

	for (const file of app.vault.getFiles()) {
		const key = file.name.toLowerCase();
		const bucket = index.get(key) ?? [];
		bucket.push(file);
		index.set(key, bucket);
	}

	return index;
}

export function resolveMediaVaultPath(app: App, rawPath: string, contextPath: string): string {
	let path = normalizeMediaVaultPath(rawPath);

	if (path.startsWith("/")) {
		return path.replace(/^\/+/, "");
	}

	if (path.startsWith("../") || path.startsWith("./")) {
		return normalizeMediaVaultPath(resolveRelativeVaultPath(contextPath, path));
	}

	const linked = app.metadataCache.getFirstLinkpathDest(path, contextPath);
	if (linked instanceof TFile) {
		return linked.path;
	}

	return path;
}

function findVaultMediaFilesByName(
	app: App,
	fileName: string,
	basenameIndex?: VaultMediaBasenameIndex
): TFile[] {
	const target = fileName.toLowerCase();
	if (basenameIndex) {
		return basenameIndex.get(target) ?? [];
	}

	return app.vault.getFiles().filter((file) => file.name.toLowerCase() === target);
}

function scoreVaultMediaFileMatch(file: TFile, resolvedCandidates: string[]): number {
	const normalized = normalizeMediaVaultPath(file.path);
	const normalizedLower = normalized.toLowerCase();
	let score = 0;

	if (resolvedCandidates.some((candidate) => candidate.toLowerCase() === normalizedLower)) {
		score += 100;
	}
	if (/(^|\/)memory\/media\//i.test(normalized)) {
		score += 50;
	}
	if (/(^|\/)(附件|attachments)(\/|$)/i.test(normalized)) {
		score += 30;
	}

	score -= normalized.split("/").length;
	return score;
}

function pickBestVaultMediaFile(files: TFile[], resolvedCandidates: string[]): TFile | null {
	if (files.length === 0) {
		return null;
	}

	return [...files].sort(
		(left, right) =>
			scoreVaultMediaFileMatch(right, resolvedCandidates) -
			scoreVaultMediaFileMatch(left, resolvedCandidates)
	)[0];
}

export async function resolveExistingMediaVaultPath(
	app: App,
	rawPath: string,
	contextPath: string,
	options?: MediaPathResolutionOptions
): Promise<string | null> {
	const candidates: string[] = [];
	const pushCandidate = (value?: string) => {
		if (!value) {
			return;
		}
		const normalized = normalizeMediaVaultPath(value);
		if (!normalized || candidates.includes(normalized)) {
			return;
		}
		candidates.push(normalized);
	};

	pushCandidate(rawPath);

	for (const resolutionContext of buildMediaResolutionContextPaths(contextPath)) {
		pushCandidate(resolveMediaVaultPath(app, rawPath, resolutionContext));
		if (rawPath.startsWith("../") || rawPath.startsWith("./")) {
			pushCandidate(
				normalizeMediaVaultPath(resolveRelativeVaultPath(resolutionContext, rawPath))
			);
		}
	}

	const basename = normalizeMediaVaultPath(rawPath).split("/").pop();
	if (basename) {
		for (const resolutionContext of buildMediaResolutionContextPaths(contextPath)) {
			const linked = app.metadataCache.getFirstLinkpathDest(basename, resolutionContext);
			if (linked instanceof TFile) {
				pushCandidate(linked.path);
			}
		}
	}

	const adapter = app.vault.adapter;
	for (const candidate of candidates) {
		if (!(await adapter.exists(candidate))) {
			continue;
		}

		const file = app.vault.getAbstractFileByPath(candidate);
		if (file instanceof TFile) {
			return file.path;
		}

		return candidate;
	}

	if (basename) {
		const matches = findVaultMediaFilesByName(app, basename, options?.basenameIndex);
		const bestMatch = pickBestVaultMediaFile(matches, candidates);
		if (bestMatch) {
			return bestMatch.path;
		}
	}

	return null;
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildMediaPathMatchVariants(path: string): string[] {
	const variants = new Set<string>();
	const push = (value?: string) => {
		if (!value) {
			return;
		}
		variants.add(value);
	};

	push(path);
	push(normalizeMediaVaultPath(path));

	for (const variant of Array.from(variants)) {
		if (variant.includes(" ")) {
			push(variant.replace(/ /g, "%20"));
		}
	}

	return Array.from(variants);
}

function rewriteMediaPathVariant(content: string, fromPath: string, toPath: string): string {
	if (!content || fromPath === toPath) {
		return content;
	}

	const from = escapeRegex(fromPath);
	let result = content;

	result = result.replace(
		new RegExp(`!\\[\\[${from}(\\|[^\\]]*)?\\]\\]`, "g"),
		(_match, aliasPart: string | undefined) => `![[${toPath}${aliasPart ?? ""}]]`
	);

	result = result.replace(
		new RegExp(`!\\[[^\\]]*\\]\\(${from}\\)`, "g"),
		(match) => match.replace(fromPath, toPath)
	);

	result = result.replace(
		new RegExp(`(src=["'])${from}(["'])`, "gi"),
		(_match, prefix: string, suffix: string) => `${prefix}${toPath}${suffix}`
	);

	return result;
}

export function rewriteMediaPathInContent(content: string, fromPath: string, toPath: string): string {
	let result = content;
	for (const variant of buildMediaPathMatchVariants(fromPath)) {
		result = rewriteMediaPathVariant(result, variant, toPath);
	}
	return result;
}

function removeMediaPathVariant(content: string, path: string): string {
	if (!content || !path) {
		return content;
	}

	const from = escapeRegex(path);
	let result = content;

	result = result.replace(new RegExp(`!\\[\\[${from}(\\|[^\\]]*)?\\]\\]\\n?`, "g"), "");
	result = result.replace(new RegExp(`!\\[[^\\]]*\\]\\(${from}\\)\\n?`, "g"), "");
	result = result.replace(
		new RegExp(`<(img|audio|video|source)\\b[^>]*\\bsrc=["']${from}["'][^>]*>\\n?`, "gi"),
		""
	);

	return result;
}

export function removeMediaPathFromContent(content: string, path: string): string {
	let result = content;
	for (const variant of buildMediaPathMatchVariants(path)) {
		result = removeMediaPathVariant(result, variant);
	}
	return result;
}

export function buildUnavailableMediaPlaceholder(path: string): string {
	const fileLabel = normalizeMediaVaultPath(path).split("/").pop() || path;
	return `> [!warning] 附件暂不可用\n> \`${fileLabel}\``;
}

function replaceMediaPathVariantWithPlaceholder(
	content: string,
	path: string,
	placeholder: string
): string {
	if (!content || !path) {
		return content;
	}

	const from = escapeRegex(path);
	let result = content;

	result = result.replace(
		new RegExp(`!\\[\\[${from}(\\|[^\\]]*)?\\]\\]\\n?`, "g"),
		`${placeholder}\n`
	);
	result = result.replace(new RegExp(`!\\[[^\\]]*\\]\\(${from}\\)\\n?`, "g"), `${placeholder}\n`);
	result = result.replace(
		new RegExp(`<(img|audio|video|source)\\b[^>]*\\bsrc=["']${from}["'][^>]*>\\n?`, "gi"),
		`${placeholder}\n`
	);

	return result;
}

export function replaceUnresolvedMediaPathWithPlaceholder(content: string, path: string): string {
	const placeholder = buildUnavailableMediaPlaceholder(path);
	let result = content;
	for (const variant of buildMediaPathMatchVariants(path)) {
		result = replaceMediaPathVariantWithPlaceholder(result, variant, placeholder);
	}
	return result;
}

export interface MediaReferenceRepairResult {
	text: string;
	changed: boolean;
	pathsNormalized: number;
	pathsPlaceholdered: number;
	pathsRemoved: number;
}

export async function repairMediaReferencesInContent(
	app: App,
	text: string,
	contextPath: string,
	options?: MediaPathResolutionOptions
): Promise<MediaReferenceRepairResult> {
	let nextText = text;
	let changed = false;
	let pathsNormalized = 0;
	let pathsPlaceholdered = 0;
	let pathsRemoved = 0;
	const unresolvedStrategy = options?.unresolvedStrategy ?? "leave";

	for (let pass = 0; pass < 8; pass += 1) {
		let passChanged = false;
		const referencedPaths = extractMediaVaultPathsFromContent(nextText);

		for (const rawPath of referencedPaths) {
			const canonicalPath = await resolveExistingMediaVaultPath(
				app,
				rawPath,
				contextPath,
				options
			);

			if (canonicalPath && canonicalPath !== rawPath) {
				const rewritten = rewriteMediaPathInContent(nextText, rawPath, canonicalPath);
				if (rewritten !== nextText) {
					nextText = rewritten;
					passChanged = true;
					pathsNormalized += 1;
				}
				continue;
			}

			if (!canonicalPath && unresolvedStrategy !== "leave") {
				const nextContent =
					unresolvedStrategy === "placeholder"
						? replaceUnresolvedMediaPathWithPlaceholder(nextText, rawPath)
						: removeMediaPathFromContent(nextText, rawPath);
				if (nextContent !== nextText) {
					nextText = nextContent;
					passChanged = true;
					if (unresolvedStrategy === "placeholder") {
						pathsPlaceholdered += 1;
					} else {
						pathsRemoved += 1;
					}
				}
			}
		}

		if (!passChanged) {
			break;
		}
		changed = true;
	}

	return { text: nextText, changed, pathsNormalized, pathsPlaceholdered, pathsRemoved };
}
