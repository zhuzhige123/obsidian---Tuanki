import { buildNoCardsStatRows, resolveNoCardsStatsTitle, type NoCardsModalStatsText } from './no-cards-modal-stats';

const text: NoCardsModalStatsText = {
	title: '当前统计',
	sessionSummaryTitle: '本次学习结果',
	deckStatusTitle: '牌组状态',
	totalCards: '牌组总卡片',
	sessionCompleted: '本次学完',
	nextDue: '下次到期',
	todayNew: '今日新卡',
	completed: '已完成',
	unit: '张'
};

describe('no-cards-modal-stats', () => {
	it('uses session summary title for all-learned and puts session result first', () => {
		expect(resolveNoCardsStatsTitle('all-learned', text)).toBe('本次学习结果');
		expect(
			buildNoCardsStatRows(
				'all-learned',
				{
					totalCards: 42,
					sessionCompletedCards: 7,
					showSessionCompletedCards: true,
					nextDueTime: '明天 13:17',
					todayNewCards: 0,
					todayNewLimit: 35
				},
				text
			)
		).toEqual([
			{ label: '本次学完', value: '7 张' },
			{ label: '牌组总卡片', value: '42 张' },
			{ label: '下次到期', value: '明天 13:17' },
			{ label: '今日新卡', value: '0/35 已完成' }
		]);
	});

	it('uses deck status title for no-due and omits session result row', () => {
		expect(resolveNoCardsStatsTitle('no-due', text)).toBe('牌组状态');
		expect(
			buildNoCardsStatRows(
				'no-due',
				{
					totalCards: 42,
					sessionCompletedCards: 7,
					showSessionCompletedCards: true,
					nextDueTime: '明天 13:17',
					todayNewCards: 0,
					todayNewLimit: 35
				},
				text
			)
		).toEqual([
			{ label: '牌组总卡片', value: '42 张' },
			{ label: '下次到期', value: '明天 13:17' },
			{ label: '今日新卡', value: '0/35 已完成' }
		]);
	});

	it('returns default title and empty rows for empty state', () => {
		expect(resolveNoCardsStatsTitle('empty', text)).toBe('当前统计');
		expect(buildNoCardsStatRows('empty', { totalCards: 0 }, text)).toEqual([]);
	});
});
