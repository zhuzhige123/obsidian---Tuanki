import type { Card } from "../../data/types";
import {
	readCardAssociatedNotePaths,
	readCardIrPriorityValue,
	readCardIrTagGroup,
	readCardSourceDocumentKey,
	readCardSourceFilePath,
	readCardSourceKind,
	readCardSourceSubunitKey,
} from "../../utils/ir-card-metadata";
import {
	buildIRCardManagementSourceStats,
	type IRCardManagementSourceUnit,
} from "./IRCardManagementSourceStats";
import {
	type IRTraceSourceKind,
} from "./IRSourceTraceStats";
import {
	getIRSourceDocumentLabel,
	getIRSourceSubunitLabel,
	getIRTagGroupLabel,
} from "./IRCardManagementAdapter";

export function applyIRCardManagementSourceStats(options: {
	rows: Card[];
	allCards: Card[];
	extractCardIds?: Iterable<string>;
}): Card[] {
	const units: IRCardManagementSourceUnit[] = options.rows
		.map((card) => {
			const associatedNotePaths = readCardAssociatedNotePaths(card);
			const sourceDocumentKey = readCardSourceDocumentKey(card);
			return {
				sourceDocumentKey,
				sourceKind: readCardSourceKind(card) as IRTraceSourceKind,
				sourceSubunitKey: readCardSourceSubunitKey(card),
				associatedNotePath: associatedNotePaths[0],
				associatedNotePaths,
			};
		})
		.filter((unit) => !!unit.sourceDocumentKey);

	const sourceStats = buildIRCardManagementSourceStats({
		units,
		cards: options.allCards,
		extractCardIds: options.extractCardIds,
	});

	return options.rows.map((card) => {
		const sourceDocumentKey = readCardSourceDocumentKey(card);
		const sourceKind = readCardSourceKind(card) as IRTraceSourceKind;
		const sourceStat = sourceDocumentKey ? sourceStats.get(sourceDocumentKey) : undefined;
		const rowAssociatedNotePaths = readCardAssociatedNotePaths(card);
		const sourceFilePath = readCardSourceFilePath(card);
		return {
			...card,
			ir_source_kind: sourceKind,
			ir_source_document_label: getIRSourceDocumentLabel(
				sourceFilePath || sourceDocumentKey,
				sourceDocumentKey
			),
			ir_source_subunit: getIRSourceSubunitLabel(
				readCardSourceSubunitKey(card),
				sourceKind
			),
			ir_notes: rowAssociatedNotePaths.length,
			ir_primary_associated_note_path: rowAssociatedNotePaths[0],
			ir_associated_note_primary_path: rowAssociatedNotePaths[0],
			ir_associated_note_paths: rowAssociatedNotePaths,
			ir_extract_cards: sourceStat?.extractCardCount ?? 0,
			ir_memory_cards: sourceStat?.memoryCardCount ?? 0,
			ir_priority_value: readCardIrPriorityValue(card),
			ir_tag_group: getIRTagGroupLabel(readCardIrTagGroup(card)),
		};
	});
}
