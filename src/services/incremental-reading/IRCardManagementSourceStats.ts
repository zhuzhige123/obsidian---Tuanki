import type { Card } from "../../data/types";
import { resolveAssociatedNotePaths } from "./IRAssociatedNoteSignals";
import {
	collectCardTraceSources,
	type IRTraceSourceKind,
} from "./IRSourceTraceStats";

export interface IRCardManagementSourceUnit {
	sourceDocumentKey: string;
	sourceKind: IRTraceSourceKind;
	sourceSubunitKey?: string;
	associatedNotePath?: string;
	associatedNotePaths?: string[];
}

export interface IRCardManagementSourceStat {
	sourceDocumentKey: string;
	sourceKind: IRTraceSourceKind;
	associatedNoteCount: number;
	associatedNotePaths: string[];
	associatedNotePrimaryPath?: string;
	extractCardCount: number;
	memoryCardCount: number;
}

function isExtractCard(card: Card, extractCardIds: Set<string>): boolean {
	if (card.outputKind === "extract") return true;
	if (card.outputKind === "memory") return false;
	return extractCardIds.has(card.uuid);
}

function isTestCard(card: Card): boolean {
	return card.cardPurpose === "test";
}

function matchesDocumentSelection(
	card: Card,
	sourceDocumentKey: string,
	selectedSubunits: Set<string>
): boolean {
	const documentSources = collectCardTraceSources(card).filter(
		(source) => source.sourceDocumentKey === sourceDocumentKey
	);
	if (documentSources.length === 0) {
		return false;
	}

	if (selectedSubunits.size === 0) {
		return true;
	}

	const explicitSubunitSources = documentSources.filter((source) => !!source.sourceSubunitKey);
	if (explicitSubunitSources.length > 0) {
		return explicitSubunitSources.some(
			(source) => !!source.sourceSubunitKey && selectedSubunits.has(source.sourceSubunitKey)
		);
	}

	return true;
}

export function buildIRCardManagementSourceStats(options: {
	units: IRCardManagementSourceUnit[];
	cards: Card[];
	extractCardIds?: Iterable<string>;
}): Map<string, IRCardManagementSourceStat> {
	const stats = new Map<string, IRCardManagementSourceStat>();
	const extractCardIds = new Set(options.extractCardIds || []);
	const noteKeysByDocument = new Map<string, Map<string, string>>();
	const selectedSubunitsByDocument = new Map<string, Set<string>>();

	for (const unit of options.units) {
		if (!unit.sourceDocumentKey) {
			continue;
		}

		if (!stats.has(unit.sourceDocumentKey)) {
			stats.set(unit.sourceDocumentKey, {
				sourceDocumentKey: unit.sourceDocumentKey,
				sourceKind: unit.sourceKind,
				associatedNoteCount: 0,
				associatedNotePaths: [],
				associatedNotePrimaryPath: undefined,
				extractCardCount: 0,
				memoryCardCount: 0,
			});
		}

		const normalizedNotePaths = resolveAssociatedNotePaths({
			associatedNotePath: unit.associatedNotePath,
			associatedNotePaths: unit.associatedNotePaths,
		});
		if (normalizedNotePaths.length > 0) {
			const noteKeys = noteKeysByDocument.get(unit.sourceDocumentKey) || new Map<string, string>();
			for (const normalizedNotePath of normalizedNotePaths) {
				const noteKey = normalizedNotePath.toLowerCase().replace(/\.md$/i, "");
				const existingPath = noteKeys.get(noteKey);
				if (
					!existingPath ||
					(!/\.[^/.]+$/i.test(existingPath) && /\.[^/.]+$/i.test(normalizedNotePath))
				) {
					noteKeys.set(noteKey, normalizedNotePath);
				}
			}
			noteKeysByDocument.set(unit.sourceDocumentKey, noteKeys);
		}

		if (unit.sourceSubunitKey) {
			const subunits = selectedSubunitsByDocument.get(unit.sourceDocumentKey) || new Set<string>();
			subunits.add(unit.sourceSubunitKey);
			selectedSubunitsByDocument.set(unit.sourceDocumentKey, subunits);
		}
	}

	for (const [sourceDocumentKey, noteKeys] of noteKeysByDocument.entries()) {
		const stat = stats.get(sourceDocumentKey);
		if (stat) {
			const notePaths = Array.from(noteKeys.values()).sort((a, b) =>
				a.localeCompare(b, "zh-CN")
			);
			stat.associatedNoteCount = notePaths.length;
			stat.associatedNotePaths = notePaths;
			stat.associatedNotePrimaryPath = notePaths[0];
		}
	}

	for (const card of options.cards) {
		if (isTestCard(card)) {
			continue;
		}

		for (const [sourceDocumentKey, stat] of stats.entries()) {
			const selectedSubunits = selectedSubunitsByDocument.get(sourceDocumentKey) || new Set<string>();
			if (!matchesDocumentSelection(card, sourceDocumentKey, selectedSubunits)) {
				continue;
			}

			if (isExtractCard(card, extractCardIds)) {
				stat.extractCardCount += 1;
			} else {
				stat.memoryCardCount += 1;
			}
		}
	}

	return stats;
}
