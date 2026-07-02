import type { DeckGroupByType, GroupConfig } from "../types/deck-kanban-types";
import { DECK_GROUP_CONFIGS } from "../types/deck-kanban-types";

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

export function getDeckGroupByTypeLabel(groupBy: DeckGroupByType, t: TranslateFn): string {
	return t(`decks.kanban.groupByTypes.${groupBy}`);
}

export function localizeDeckGroupConfig(groupBy: DeckGroupByType, t: TranslateFn): GroupConfig {
	const base = DECK_GROUP_CONFIGS[groupBy];
	return {
		...base,
		title: getDeckGroupByTypeLabel(groupBy, t),
		groups: base.groups.map((group) => ({
			...group,
			label: t(`decks.kanban.groupColumns.${groupBy}.${group.key}`),
		})),
	};
}
