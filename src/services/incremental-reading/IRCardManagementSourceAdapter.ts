import type { Card } from "../../data/types";
import { resolveAssociatedNotePaths } from "./IRAssociatedNoteSignals";
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

function getCardAssociatedNotePaths(card: Card): string[] {
	return resolveAssociatedNotePaths({
		associatedNotePath:
			(card as any).primaryAssociatedNotePath ||
			(card as any).associatedNotePath ||
			(card as any).ir_primary_associated_note_path ||
			(card as any).ir_associated_note_primary_path,
		associatedNotePaths: [
			...(Array.isArray((card as any).associatedNotePaths) ? (card as any).associatedNotePaths : []),
			...(Array.isArray((card as any).ir_associated_note_paths)
				? (card as any).ir_associated_note_paths
				: []),
		],
	});
}

export function applyIRCardManagementSourceStats(options: {
	rows: Card[];
	allCards: Card[];
	extractCardIds?: Iterable<string>;
}): Card[] {
	const units: IRCardManagementSourceUnit[] = options.rows
		.map((card) => {
			const associatedNotePaths = getCardAssociatedNotePaths(card);
			return {
				sourceDocumentKey: String((card as any).sourceDocumentKey || ""),
				sourceKind: (((card as any).sourceKind || "unknown") as IRTraceSourceKind),
				sourceSubunitKey: (card as any).sourceSubunitKey || undefined,
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
		const sourceDocumentKey = String((card as any).sourceDocumentKey || "");
		const sourceKind = (((card as any).sourceKind || "unknown") as IRTraceSourceKind);
		const sourceStat = sourceDocumentKey ? sourceStats.get(sourceDocumentKey) : undefined;
		const rowAssociatedNotePaths = getCardAssociatedNotePaths(card);
		return {
			...card,
			ir_source_kind: sourceKind,
			ir_source_document_label: getIRSourceDocumentLabel(
				(card as any).sourceFile || (card as any).ir_source_file || sourceDocumentKey,
				sourceDocumentKey
			),
			ir_source_subunit: getIRSourceSubunitLabel(
				(card as any).sourceSubunitKey || undefined,
				sourceKind
			),
			ir_notes: rowAssociatedNotePaths.length,
			ir_primary_associated_note_path: rowAssociatedNotePaths[0],
			ir_associated_note_primary_path: rowAssociatedNotePaths[0],
			ir_associated_note_paths: rowAssociatedNotePaths,
			ir_extract_cards: sourceStat?.extractCardCount ?? 0,
			ir_memory_cards: sourceStat?.memoryCardCount ?? 0,
			ir_priority_value: (card as any).ir_priority_value ?? (card as any).ir_priority ?? 5,
			ir_tag_group: getIRTagGroupLabel((card as any).ir_tag_group),
		};
	});
}
