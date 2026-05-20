import { normalizePath } from "obsidian";
import type { Card } from "../../data/types";
import { extractAllSourcePaths, normalizePathForComparison } from "../../utils/source-path-matcher";
import { parseObsidianLink, parseYAMLFromContent } from "../../utils/yaml-utils";
import { EpubLinkService } from "../epub-integration/EpubLinkService";
import { resolveAssociatedNotePaths } from "./IRAssociatedNoteSignals";

export type IRTraceSourceKind = "markdown" | "pdf" | "epub" | "unknown";

export interface IRTraceSourceDescriptor {
	sourceKind: IRTraceSourceKind;
	sourceDocumentKey: string;
	sourceSubunitKey?: string;
}

export interface IRTraceSourceUnit {
	sourceKind: IRTraceSourceKind;
	sourceDocumentKey: string;
	sourceSubunitKey?: string;
	associatedNotePath?: string;
}

export interface IRTraceOverviewStats {
	extractCount: number;
	memoryCardCount: number;
	noteCount: number;
}

export interface IRTraceCardMatch {
	sourceKind: IRTraceSourceKind;
	sourceDocumentKey: string;
	sourceSubunitKey?: string;
	isExtract: boolean;
}

function normalizeLooseValue(value: string | undefined | null): string | null {
	if (typeof value !== "string") {
		return null;
	}

	let normalized = value.trim();
	if (!normalized) {
		return null;
	}

	normalized = normalized.replace(/^['"]+|['"]+$/g, "");
	normalized = normalized.replace(/\\/g, "/");

	try {
		normalized = decodeURIComponent(normalized);
	} catch {
		// Keep the original value when decode fails.
	}

	return normalized.trim() || null;
}

export function detectTraceSourceKind(path: string | undefined | null): IRTraceSourceKind {
	const normalized = normalizeLooseValue(path);
	if (!normalized) {
		return "unknown";
	}

	if (/\.md$/i.test(normalized) || !/\.[^/.]+$/i.test(normalized)) {
		return "markdown";
	}
	if (/\.pdf$/i.test(normalized)) {
		return "pdf";
	}
	if (/\.epub$/i.test(normalized)) {
		return "epub";
	}
	return "unknown";
}

export function normalizeTraceDocumentKey(
	path: string | undefined | null,
	kind?: IRTraceSourceKind
): string | null {
	const normalized = normalizeLooseValue(path);
	if (!normalized) {
		return null;
	}

	const detectedKind = kind ?? detectTraceSourceKind(normalized);
	if (detectedKind === "markdown") {
		const key = normalizePathForComparison(normalized);
		return key || null;
	}

	return normalizePath(normalized).toLowerCase() || null;
}

export function normalizeTraceSubunitKey(value: string | undefined | null): string | null {
	const normalized = normalizeLooseValue(value);
	return normalized ? normalized.toLowerCase() : null;
}

function appendUniqueSource(
	sources: IRTraceSourceDescriptor[],
	sourceKind: IRTraceSourceKind,
	sourceDocumentKey: string | null,
	sourceSubunitKey?: string | null
): void {
	if (!sourceDocumentKey) {
		return;
	}

	const normalizedSubunitKey = normalizeTraceSubunitKey(sourceSubunitKey) || undefined;
	const dedupeKey = `${sourceKind}::${sourceDocumentKey}::${normalizedSubunitKey || ""}`;
	if (
		sources.some(
			(source) =>
				`${source.sourceKind}::${source.sourceDocumentKey}::${source.sourceSubunitKey || ""}` ===
				dedupeKey
		)
	) {
		return;
	}

	sources.push({
		sourceKind,
		sourceDocumentKey,
		sourceSubunitKey: normalizedSubunitKey,
	});
}

function extractYamlSourceValues(card: Card): string[] {
	if (!card.content) {
		return [];
	}

	try {
		const yaml = parseYAMLFromContent(card.content);
		if (!yaml?.we_source) {
			return [];
		}
		return (Array.isArray(yaml.we_source) ? yaml.we_source : [yaml.we_source]).filter(
			(value): value is string => typeof value === "string" && value.trim().length > 0
		);
	} catch {
		return [];
	}
}

function buildDescriptorFromExplicitCardFields(card: Card): IRTraceSourceDescriptor | null {
	const explicitSourcePath =
		card.sourceDocumentKey ||
		card.sourceFile ||
		(card.customFields?.obsidianFilePath as string | undefined);
	const sourceKind =
		card.sourceKind ?? detectTraceSourceKind(explicitSourcePath);
	const sourceDocumentKey = normalizeTraceDocumentKey(explicitSourcePath, sourceKind);
	if (!sourceDocumentKey) {
		return null;
	}

	return {
		sourceKind,
		sourceDocumentKey,
		sourceSubunitKey: normalizeTraceSubunitKey(card.sourceSubunitKey) || undefined,
	};
}

function buildDescriptorFromYamlSource(rawSource: string): IRTraceSourceDescriptor | null {
	const epubSource = EpubLinkService.parseLinkMarkup(rawSource);
	if (epubSource?.filePath) {
		const sourceDocumentKey = normalizeTraceDocumentKey(epubSource.filePath, "epub");
		if (!sourceDocumentKey) {
			return null;
		}
		return {
			sourceKind: "epub",
			sourceDocumentKey,
			sourceSubunitKey: normalizeTraceSubunitKey(epubSource.sourceId || epubSource.cfi) || undefined,
		};
	}

	const parsedPath = parseObsidianLink(rawSource);
	const sourceKind = detectTraceSourceKind(parsedPath);
	const sourceDocumentKey = normalizeTraceDocumentKey(parsedPath, sourceKind);
	if (!sourceDocumentKey) {
		return null;
	}

	let sourceSubunitKey: string | undefined;
	if (sourceKind === "pdf" && /\.pdf/i.test(rawSource) && rawSource.includes("#")) {
		sourceSubunitKey = normalizeTraceSubunitKey(rawSource) || undefined;
	}

	return {
		sourceKind,
		sourceDocumentKey,
		sourceSubunitKey,
	};
}

export function collectCardTraceSources(card: Card): IRTraceSourceDescriptor[] {
	const sources: IRTraceSourceDescriptor[] = [];

	const explicitDescriptor = buildDescriptorFromExplicitCardFields(card);
	if (explicitDescriptor) {
		appendUniqueSource(
			sources,
			explicitDescriptor.sourceKind,
			explicitDescriptor.sourceDocumentKey,
			explicitDescriptor.sourceSubunitKey
		);
	}

	for (const rawSource of extractYamlSourceValues(card)) {
		const descriptor = buildDescriptorFromYamlSource(rawSource);
		if (!descriptor) {
			continue;
		}
		appendUniqueSource(
			sources,
			descriptor.sourceKind,
			descriptor.sourceDocumentKey,
			descriptor.sourceSubunitKey
		);
	}

	for (const sourcePath of extractAllSourcePaths(card)) {
		const sourceKind = detectTraceSourceKind(sourcePath);
		appendUniqueSource(
			sources,
			sourceKind,
			normalizeTraceDocumentKey(sourcePath, sourceKind),
			undefined
		);
	}

	return sources;
}

function isTestCard(card: Card): boolean {
	return card.cardPurpose === "test";
}

function isExtractCard(card: Card, extractCardIds: Set<string>): boolean {
	if (card.outputKind === "extract") {
		return true;
	}
	if (card.outputKind === "memory") {
		return false;
	}
	return extractCardIds.has(card.uuid);
}

function buildUnitSelectorMap(units: IRTraceSourceUnit[]): Map<string, Set<string>> {
	const selectors = new Map<string, Set<string>>();
	for (const unit of units) {
		if (!unit.sourceDocumentKey) {
			continue;
		}

		const current = selectors.get(unit.sourceDocumentKey) ?? new Set<string>();
		if (unit.sourceSubunitKey) {
			current.add(unit.sourceSubunitKey);
		}
		selectors.set(unit.sourceDocumentKey, current);
	}
	return selectors;
}

function cardMatchesAnyTraceUnit(card: Card, selectorMap: Map<string, Set<string>>): boolean {
	if (selectorMap.size === 0) {
		return false;
	}

	for (const source of collectCardTraceSources(card)) {
		const selectedSubunits = selectorMap.get(source.sourceDocumentKey);
		if (!selectedSubunits) {
			continue;
		}

		if (selectedSubunits.size === 0) {
			return true;
		}

		if (!source.sourceSubunitKey || selectedSubunits.has(source.sourceSubunitKey)) {
			return true;
		}
	}

	return false;
}

export interface IRTraceSourceUnit {
	sourceKind: IRTraceSourceKind;
	sourceDocumentKey: string;
	sourceSubunitKey?: string;
	associatedNotePath?: string;
	associatedNotePaths?: string[];
}

export function buildIRTraceOverviewStats(options: {
	units: IRTraceSourceUnit[];
	cards: Card[];
	extractCardIds?: Iterable<string>;
}): IRTraceOverviewStats {
	const extractCardIds = new Set(options.extractCardIds || []);
	const selectorMap = buildUnitSelectorMap(options.units);
	const noteKeys = new Set<string>();

	for (const unit of options.units) {
		const notePaths = resolveAssociatedNotePaths({
			associatedNotePath: unit.associatedNotePath,
			associatedNotePaths: unit.associatedNotePaths,
		});
		for (const notePath of notePaths) {
			noteKeys.add(notePath);
		}
	}

	let extractCount = 0;
	let memoryCardCount = 0;

	for (const card of options.cards) {
		if (isTestCard(card) || !cardMatchesAnyTraceUnit(card, selectorMap)) {
			continue;
		}

		if (isExtractCard(card, extractCardIds)) {
			extractCount += 1;
		} else {
			memoryCardCount += 1;
		}
	}

	return {
		extractCount,
		memoryCardCount,
		noteCount: noteKeys.size,
	};
}

export function collectTraceCardMatches(options: {
	cards: Card[];
	extractCardIds?: Iterable<string>;
}): IRTraceCardMatch[] {
	const extractCardIds = new Set(options.extractCardIds || []);
	const matches: IRTraceCardMatch[] = [];

	for (const card of options.cards) {
		if (isTestCard(card)) {
			continue;
		}

		for (const source of collectCardTraceSources(card)) {
			matches.push({
				sourceKind: source.sourceKind,
				sourceDocumentKey: source.sourceDocumentKey,
				sourceSubunitKey: source.sourceSubunitKey,
				isExtract: isExtractCard(card, extractCardIds),
			});
		}
	}

	return matches;
}
