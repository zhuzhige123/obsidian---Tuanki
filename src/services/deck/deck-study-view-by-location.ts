export type DeckStudyViewMode = "kanban";

export const DECK_STUDY_VIEW_MODE: DeckStudyViewMode = "kanban";

export function resolveDeckStudyViewMode(): DeckStudyViewMode {
	return DECK_STUDY_VIEW_MODE;
}

/** @deprecated 牌组学习已固定为看板视图，保留仅为兼容旧调用。 */
export function normalizeDeckStudyViewMode(
	_value: string | null | undefined,
	_canUseKanban = true
): DeckStudyViewMode {
	return DECK_STUDY_VIEW_MODE;
}

/** @deprecated 牌组学习已固定为看板视图，保留仅为兼容旧调用。 */
export function resolveDeckStudyViewByLocation(_options?: unknown): DeckStudyViewMode {
	return DECK_STUDY_VIEW_MODE;
}
