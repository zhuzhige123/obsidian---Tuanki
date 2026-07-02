/**
 * 从卡片/题库等内容中提取 vault 内媒体附件路径（供附件索引与一致性检测复用）
 */

const MEDIA_EXTENSION_PATTERN =
	/\.(png|jpe?g|gif|webp|svg|bmp|tiff|tif|avif|heic|heif|ico|mp3|wav|ogg|flac|m4a|aac|wma|mp4|mov|avi|webm|mkv|3gp|flv|pdf|docx?|xlsx?|pptx?)$/i;

const OBSIDIAN_EMBED_PATTERN = /!\[\[([^\]]+)\]\]/g;
const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*\]\(([^)]+)\)/g;
const HTML_MEDIA_SRC_PATTERN = /<(img|audio|video|source)\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;

export function normalizeMediaVaultPath(path: string): string {
	let normalized = path.trim().replace(/\\/g, "/");
	const isRemote = /^[a-z][a-z0-9+.-]*:\/\//i.test(normalized);

	if (!isRemote) {
		normalized = normalized.replace(/^\.\/+/, "");
	}

	try {
		normalized = decodeURIComponent(normalized);
	} catch {
		// keep raw path when decode fails
	}

	if (!isRemote) {
		normalized = normalized.replace(/\/+/g, "/");
	}

	return normalized;
}

export function isMediaVaultPath(path: string): boolean {
	const normalized = normalizeMediaVaultPath(path);
	if (!normalized || normalized.startsWith("http://") || normalized.startsWith("https://")) {
		return false;
	}
	if (normalized.startsWith("data:")) {
		return false;
	}
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)) {
		return false;
	}
	return MEDIA_EXTENSION_PATTERN.test(normalized);
}

function resolveWikiEmbedTarget(inner: string): string | undefined {
	const trimmed = inner.trim();
	if (!trimmed) {
		return undefined;
	}

	const pipeIndex = trimmed.indexOf("|");
	const target = pipeIndex === -1 ? trimmed : trimmed.slice(0, pipeIndex).trim();
	return target || undefined;
}

function addMediaPath(paths: Set<string>, rawPath: string | undefined): void {
	if (!rawPath) {
		return;
	}

	const normalized = normalizeMediaVaultPath(rawPath);
	if (!isMediaVaultPath(normalized)) {
		return;
	}

	paths.add(normalized);
}

export function extractMediaVaultPathsFromContent(content: string): Set<string> {
	const paths = new Set<string>();
	if (!content) {
		return paths;
	}

	for (const match of content.matchAll(OBSIDIAN_EMBED_PATTERN)) {
		addMediaPath(paths, resolveWikiEmbedTarget(match[1] ?? ""));
	}

	for (const match of content.matchAll(MARKDOWN_IMAGE_PATTERN)) {
		addMediaPath(paths, match[1]);
	}

	for (const match of content.matchAll(HTML_MEDIA_SRC_PATTERN)) {
		addMediaPath(paths, match[2]);
	}

	return paths;
}

export function extractMediaVaultPathsFromRegistryMarkdown(content: string): Set<string> {
	return extractMediaVaultPathsFromContent(content);
}

export function buildMediaWikiLink(vaultPath: string, options?: { documentLink?: boolean }): string {
	const normalized = normalizeMediaVaultPath(vaultPath);
	if (options?.documentLink) {
		return `[[${normalized}]]`;
	}
	return `![[${normalized}]]`;
}

export function buildAttachmentRegistryMarkdown(paths: Iterable<string>): string {
	const sortedPaths = Array.from(
		new Set(Array.from(paths).map((path) => normalizeMediaVaultPath(path)).filter(isMediaVaultPath))
	).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));

	const lines = [
		"---",
		"weave-managed: attachment-registry",
		"do-not-edit: true",
		"---",
		"",
		"# Weave 附件索引",
		"",
		"> 此文件由 Weave 自动维护，用于让 Obsidian 与常见清理插件识别插件 JSON / .wdeck 中引用的附件。",
		"> 请勿手动编辑；可在「卡片管理 → 数据管理」中重建索引。",
		"",
	];

	for (const path of sortedPaths) {
		lines.push(buildMediaWikiLink(path));
	}

	lines.push("");
	return lines.join("\n");
}
