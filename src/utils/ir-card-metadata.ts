import type { Card } from "../data/types";
import type { IRBlock } from "../types/ir-types";
import { readUnknownBoolean, readUnknownProperty, readUnknownString } from "./dynamic-access";
import { isRecord } from "./typed-json";

export function isIrChunkCard(card: Card): boolean {
	return readUnknownBoolean(card.metadata, "irChunk") === true;
}

export function isIrBlockCard(card: Card): boolean {
	return readUnknownBoolean(card.metadata, "irBlock") === true;
}

export function resolveIrPointKindFromCard(card: Card): "block" | "chunk" | undefined {
	if (isIrChunkCard(card)) {
		return "chunk";
	}
	if (isIrBlockCard(card)) {
		return "block";
	}
	return undefined;
}

export function readCardMetaRecord(card: Card): Record<string, unknown> {
	const directMeta = readUnknownProperty(card, "meta");
	if (isRecord(directMeta)) {
		return directMeta;
	}
	const metadataMeta = readUnknownProperty(card.metadata, "meta");
	return isRecord(metadataMeta) ? metadataMeta : {};
}

export function readCardStringList(card: Card, key: string): string[] {
	const raw = readUnknownProperty(card, key);
	if (!Array.isArray(raw)) {
		return [];
	}
	return raw.filter((item): item is string => typeof item === "string");
}

export function readCardAssociatedNotePaths(card: Card): string[] {
	const primary =
		readUnknownString(card, "primaryAssociatedNotePath") ||
		readUnknownString(card, "associatedNotePath") ||
		readUnknownString(card, "ir_primary_associated_note_path") ||
		readUnknownString(card, "ir_associated_note_primary_path");
	const paths = [
		...readCardStringList(card, "associatedNotePaths"),
		...readCardStringList(card, "ir_associated_note_paths"),
	];
	if (primary) {
		return [...new Set([primary, ...paths])];
	}
	return [...new Set(paths)];
}

export function readCardSourceDocumentKey(card: Card): string {
	return (
		readUnknownString(card, "sourceDocumentKey") ||
		readUnknownString(card, "ir_source_document_key") ||
		""
	);
}

export function readCardSourceKind(card: Card): string {
	return readUnknownString(card, "sourceKind") || "unknown";
}

export function readCardSourceSubunitKey(card: Card): string | undefined {
	return readUnknownString(card, "sourceSubunitKey");
}

export function readCardSourceFilePath(card: Card): string | undefined {
	return (
		readUnknownString(card, "sourceFile") ||
		readUnknownString(card, "ir_source_file") ||
		undefined
	);
}

export function readCardIrTagGroup(card: Card): string | undefined {
	return readUnknownString(card, "ir_tag_group");
}

export function readCardIrPriorityValue(card: Card): number {
	const value =
		readUnknownProperty(card, "ir_priority_value") ?? readUnknownProperty(card, "ir_priority");
	return typeof value === "number" && Number.isFinite(value) ? value : 5;
}

export function resolveCardSourceDocumentPath(card: Card): string | undefined {
	const rawPath =
		readUnknownString(card, "ir_source_document_key") ||
		readUnknownString(card, "sourceDocumentKey") ||
		readUnknownString(card, "sourceFile") ||
		readUnknownString(card, "ir_source_file") ||
		"";

	return rawPath.trim() || undefined;
}

export function mutateIrBlock(
	block: IRBlock,
	mutator: (block: IRBlock & Record<string, unknown>) => void
): void {
	mutator(block as IRBlock & Record<string, unknown>);
}
