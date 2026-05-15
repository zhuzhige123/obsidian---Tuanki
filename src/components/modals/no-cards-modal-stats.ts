export type NoCardsModalReason = 'empty' | 'all-learned' | 'no-due';

export interface NoCardsModalStatsText {
	title: string;
	sessionSummaryTitle: string;
	deckStatusTitle: string;
	totalCards: string;
	sessionCompleted: string;
	nextDue: string;
	todayNew: string;
	completed: string;
	unit: string;
}

export interface NoCardsModalStats {
	totalCards: number;
	sessionCompletedCards?: number;
	showSessionCompletedCards?: boolean;
	nextDueTime?: string;
	todayNewCards?: number;
	todayNewLimit?: number;
}

export interface NoCardsModalStatRow {
	label: string;
	value: string;
}

export function resolveNoCardsStatsTitle(
	reason: NoCardsModalReason,
	text: NoCardsModalStatsText
): string {
	if (reason === 'all-learned') {
		return text.sessionSummaryTitle;
	}
	if (reason === 'no-due') {
		return text.deckStatusTitle;
	}
	return text.title;
}

export function buildNoCardsStatRows(
	reason: NoCardsModalReason,
	stats: NoCardsModalStats | undefined,
	text: NoCardsModalStatsText
): NoCardsModalStatRow[] {
	if (!stats || reason === 'empty') {
		return [];
	}

	const unitSuffix = text.unit ? ` ${text.unit}` : '';
	const rows: NoCardsModalStatRow[] = [];

	if (reason === 'all-learned' && stats.showSessionCompletedCards && stats.sessionCompletedCards !== undefined) {
		rows.push({
			label: text.sessionCompleted,
			value: `${stats.sessionCompletedCards}${unitSuffix}`
		});
	}

	rows.push({
		label: text.totalCards,
		value: `${stats.totalCards}${unitSuffix}`
	});

	if (stats.nextDueTime) {
		rows.push({
			label: text.nextDue,
			value: stats.nextDueTime
		});
	}

	if (stats.todayNewCards !== undefined && stats.todayNewLimit) {
		rows.push({
			label: text.todayNew,
			value: `${stats.todayNewCards}/${stats.todayNewLimit} ${text.completed}`
		});
	}

	return rows;
}
