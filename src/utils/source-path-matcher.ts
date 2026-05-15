/**
 * Source document path matching helpers.
 *
 * Used by card-management document filtering so cards can be matched against
 * the currently active Markdown / EPUB / Canvas document.
 */

import type { Card } from "../data/types";
import { EpubLinkService } from "../services/epub/EpubLinkService";
import { parseBlockId, parseObsidianLink, parseSourceInfo, parseYAMLFromContent } from "./yaml-utils";

function sanitizeSourcePath(path: string | null | undefined): string | null {
	if (typeof path !== "string") {
		return null;
	}

	let normalized = path.trim();
	if (!normalized) {
		return null;
	}

	normalized = normalized.replace(/^['"]+|['"]+$/g, "");
	const epubMarkupPath = EpubLinkService.parseLinkMarkup(normalized)?.filePath;
	if (epubMarkupPath) {
		normalized = epubMarkupPath;
	} else {
		const obsidianLinkPath = parseObsidianLink(normalized);
		if (obsidianLinkPath) {
			normalized = obsidianLinkPath;
		}
	}

	normalized = normalized.replace(/\\/g, "/");
	if (/^[a-z]+:\/\//i.test(normalized) || /^[A-Za-z]:[\\/]/.test(normalized)) {
		return null;
	}

	normalized = normalized.replace(/^\/+/, "");
	if (!normalized || normalized.startsWith("../")) {
		return null;
	}

	const locatorIndex = normalized.search(/[?#]/);
	if (locatorIndex !== -1) {
		normalized = normalized.slice(0, locatorIndex);
	}

	if (!normalized) {
		return null;
	}

	try {
		normalized = decodeURIComponent(normalized);
	} catch {
		// Keep the original value if the input is not valid URI encoding.
	}

	return normalized.trim() || null;
}

function getSourcePathKey(path: string): string {
	return (sanitizeSourcePath(path) || "").toLowerCase();
}

function appendUniqueSourcePath(paths: string[], candidate: string | null | undefined): void {
	const sanitized = sanitizeSourcePath(candidate);
	if (!sanitized) {
		return;
	}

	const key = getSourcePathKey(sanitized);
	if (!key || paths.some((existing) => getSourcePathKey(existing) === key)) {
		return;
	}

	paths.push(sanitized);
}

function hasExplicitExtension(path: string): boolean {
	const sanitized = sanitizeSourcePath(path);
	return sanitized ? /\.[^/.]+$/i.test(sanitized) : false;
}

function matchesSingleSourcePath(cardSource: string, targetPath: string): boolean {
	const sanitizedCard = sanitizeSourcePath(cardSource);
	const sanitizedTarget = sanitizeSourcePath(targetPath);

	if (!sanitizedCard || !sanitizedTarget) {
		return false;
	}

	const cardKey = getSourcePathKey(sanitizedCard);
	const targetKey = getSourcePathKey(sanitizedTarget);

	// Keep extensions for exact matches so demo.md and demo.epub stay distinct.
	if (cardKey === targetKey) {
		return true;
	}

	const cardFilename = sanitizedCard.split("/").pop()?.toLowerCase() || "";
	const targetFilename = sanitizedTarget.split("/").pop()?.toLowerCase() || "";
	if (cardFilename === targetFilename && cardFilename !== "") {
		return true;
	}

	if (targetKey.endsWith(`/${cardKey}`) || cardKey.endsWith(`/${targetKey}`)) {
		return true;
	}

	// Only fall back to extension-less matching when one side has no extension.
	if (hasExplicitExtension(sanitizedCard) && hasExplicitExtension(sanitizedTarget)) {
		return false;
	}

	const normalizedCard = normalizePathForComparison(sanitizedCard);
	const normalizedTarget = normalizePathForComparison(sanitizedTarget);
	if (!normalizedCard || !normalizedTarget) {
		return false;
	}

	if (normalizedCard === normalizedTarget) {
		return true;
	}

	const cardBasename = extractBasename(sanitizedCard);
	const targetBasename = extractBasename(sanitizedTarget);
	if (cardBasename === targetBasename && cardBasename !== "") {
		return true;
	}

	if (
		normalizedTarget.endsWith(`/${normalizedCard}`) ||
		normalizedCard.endsWith(`/${normalizedTarget}`)
	) {
		return true;
	}

	return false;
}

export function extractAllSourcePaths(card: Card): string[] {
	const paths: string[] = [];

	if (card.content) {
		try {
			const yaml = parseYAMLFromContent(card.content);

			if (yaml?.we_source) {
				const sourceValues = Array.isArray(yaml.we_source) ? yaml.we_source : [yaml.we_source];
				for (const sourceValue of sourceValues) {
					if (typeof sourceValue !== "string" || !sourceValue.trim()) {
						continue;
					}

					appendUniqueSourcePath(paths, parseObsidianLink(sourceValue));
					appendUniqueSourcePath(paths, EpubLinkService.parseLinkMarkup(sourceValue)?.filePath);
				}
			}

			if (yaml?.we_block) {
				const blockValues = Array.isArray(yaml.we_block) ? yaml.we_block : [yaml.we_block];
				for (const blockValue of blockValues) {
					if (typeof blockValue !== "string" || !blockValue.trim()) {
						continue;
					}

					appendUniqueSourcePath(paths, parseObsidianLink(blockValue));
				}
			}

			if (yaml?.we_refs) {
				const refValues = Array.isArray(yaml.we_refs) ? yaml.we_refs : [yaml.we_refs];
				for (const refValue of refValues) {
					if (typeof refValue !== "string" || !refValue.trim()) {
						continue;
					}

					appendUniqueSourcePath(paths, parseObsidianLink(refValue));
				}
			}
		} catch {
			// Fall through to legacy fields if YAML content is malformed.
		}
	}

	appendUniqueSourcePath(paths, card.sourceFile);
	appendUniqueSourcePath(paths, card.fields?.source_file as string | undefined);
	appendUniqueSourcePath(paths, card.fields?.source_document as string | undefined);
	appendUniqueSourcePath(paths, card.customFields?.obsidianFilePath as string | undefined);

	return paths;
}

/**
 * Returns the primary source path.
 * For multi-source cards this remains the first valid source in YAML order.
 */
export function extractSourcePath(card: Card): string | null {
	return extractAllSourcePaths(card)[0] ?? null;
}

/**
 * Returns the primary source block id without the leading ^ marker.
 * YAML/content is authoritative; legacy fields remain as the final fallback.
 */
export function extractSourceBlock(card: Card): string | null {
	const sourceInfo = parseSourceInfo(card.content || "");
	const candidates = [
		sourceInfo.sourceBlock,
		card.sourceBlock,
		card.customFields?.blockId as string | undefined,
		card.fields?.obsidian_block_link as string | undefined,
	];

	for (const candidate of candidates) {
		if (typeof candidate !== "string" || !candidate.trim()) {
			continue;
		}

		const parsed = parseBlockId(candidate);
		if (parsed) {
			return parsed;
		}
	}

	return null;
}

/**
 * Normalizes a path for loose comparison.
 *
 * Examples:
 * normalizePathForComparison("Folder/Note.md") => "folder/note"
 * normalizePathForComparison("/path/to/File.MD") => "path/to/file"
 */
export function normalizePathForComparison(path: string): string {
	const sanitized = sanitizeSourcePath(path) || "";
	return sanitized.replace(/\.[^/.]+$/i, "").toLowerCase();
}

/**
 * Returns the basename without extension.
 */
export function extractBasename(path: string): string {
	const normalizedPath = sanitizeSourcePath(path) || "";
	const parts = normalizedPath.split("/");
	const filename = parts[parts.length - 1];

	return filename.replace(/\.[^/.]+$/i, "").toLowerCase();
}

/**
 * Checks whether a card belongs to the target document.
 *
 * Multi-source cards match if any real source path matches the target.
 */
export function matchesSourceDocument(card: Card, targetPath: string): boolean {
	if (!targetPath) {
		return false;
	}

	return extractAllSourcePaths(card).some((sourcePath) =>
		matchesSingleSourcePath(sourcePath, targetPath)
	);
}

/**
 * Filters cards to those that come from the target document.
 */
export function filterCardsBySourceDocument(cards: Card[], targetPath: string | null): Card[] {
	if (!targetPath) {
		return [];
	}

	return cards.filter((card) => matchesSourceDocument(card, targetPath));
}

/**
 * Builds a source document -> cards map.
 * Multi-source cards are indexed under every extracted source path.
 */
export function buildSourceDocumentMap(cards: Card[]): Map<string, Card[]> {
	const map = new Map<string, Card[]>();

	cards.forEach((_card) => {
		const sources = extractAllSourcePaths(_card);
		sources.forEach((_source) => {
			const normalized = normalizePathForComparison(_source);
			if (!normalized) {
				return;
			}

			if (!map.has(normalized)) {
				map.set(normalized, []);
			}

			if (!map.get(normalized)?.includes(_card)) {
				map.get(normalized)?.push(_card);
			}
		});
	});

	return map;
}

/**
 * Extracts the first EPUB source path from YAML content.
 * Supports current wikilinks and legacy weave-epub protocol links.
 */
export function extractEpubSourcePath(content: string): string | null {
	if (!content) return null;

	const markup = EpubLinkService.extractFirstEpubLinkMarkup(content);
	return markup ? EpubLinkService.extractFilePathFromEpubLinkMarkup(markup) : null;
}

export function debugSourceInfo(card: Card): {
	hasSource: boolean;
	sourceFile?: string;
	fieldsSourceFile?: string;
	fieldsSourceDoc?: string;
	extractedBlock: string | null;
	customFieldsPath?: string;
	extractedPath: string | null;
	allExtractedPaths: string[];
	normalized: string | null;
	basename: string | null;
} {
	const allExtractedPaths = extractAllSourcePaths(card);
	const extractedPath = allExtractedPaths[0] ?? null;

	return {
		hasSource: extractedPath !== null,
		sourceFile: card.sourceFile,
		fieldsSourceFile: card.fields?.source_file as string | undefined,
		fieldsSourceDoc: card.fields?.source_document as string | undefined,
		extractedBlock: extractSourceBlock(card),
		customFieldsPath: card.customFields?.obsidianFilePath as string | undefined,
		extractedPath,
		allExtractedPaths,
		normalized: extractedPath ? normalizePathForComparison(extractedPath) : null,
		basename: extractedPath ? extractBasename(extractedPath) : null,
	};
}
