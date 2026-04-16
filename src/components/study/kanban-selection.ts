export type KanbanSelectionGroupBy = "status" | "type" | "priority" | "deck" | "createTime" | "tag" | "ir_tag_group";

const DECK_SELECTION_SEPARATOR = "::";

export function usesGroupScopedSelection(groupBy: KanbanSelectionGroupBy): boolean {
	return groupBy === "deck";
}

export function buildKanbanSelectionKey(
	cardUuid: string,
	groupBy: KanbanSelectionGroupBy,
	groupKey?: string
): string {
	if (!usesGroupScopedSelection(groupBy)) {
		return cardUuid;
	}

	return `${groupKey || "_none"}${DECK_SELECTION_SEPARATOR}${cardUuid}`;
}

export function extractCardUuidFromSelectionKey(selectionKey: string): string {
	const separatorIndex = selectionKey.lastIndexOf(DECK_SELECTION_SEPARATOR);
	if (separatorIndex === -1) {
		return selectionKey;
	}

	return selectionKey.slice(separatorIndex + DECK_SELECTION_SEPARATOR.length);
}

export function collectSelectedCardUUIDs(selectionKeys: Iterable<string>): string[] {
	const uuids = new Set<string>();

	for (const selectionKey of selectionKeys) {
		const uuid = extractCardUuidFromSelectionKey(selectionKey);
		if (uuid) {
			uuids.add(uuid);
		}
	}

	return Array.from(uuids);
}
