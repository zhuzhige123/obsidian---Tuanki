import {
	createPluginFsrsCard,
	createTsFsrsScheduler,
} from "../algorithms/fsrs-adapter";
import { CardType, type Card, type FSRSCard } from "../data/types";
import type { ProgressiveClozeParentCard } from "../types/progressive-cloze-v2";

export function isMemoryCard(card: Card): boolean {
	return card.cardPurpose === "memory" || !card.cardPurpose;
}

export function createDefaultMemoryCardFsrs(now = new Date()): FSRSCard {
	const scheduler = createTsFsrsScheduler();
	return createPluginFsrsCard(scheduler, now);
}

export function createDefaultMemoryCardStats(): Card["stats"] {
	return {
		totalReviews: 0,
		totalTime: 0,
		averageTime: 0,
		memoryRate: 0,
	};
}

/**
 * 将单张记忆卡的学习进度恢复为「新卡」状态。
 * 保留卡片正文、牌组归属、标签等内容字段，仅重置 FSRS / 复习历史 / 学习统计。
 */
export function resetCardLearningState(card: Card, now = new Date()): Card {
	const stats = createDefaultMemoryCardStats();
	if (card.stats?.testStats) {
		stats.testStats = card.stats.testStats;
	}

	return {
		...card,
		fsrs: createDefaultMemoryCardFsrs(now),
		reviewHistory: [],
		stats,
		personalization: undefined,
		modified: now.toISOString(),
	};
}

/**
 * 渐进式挖空父卡的学习进度分散在子卡上；重置父卡时一并重置全部子卡。
 */
export function collectCardsToResetToNew(card: Card, allCards: Card[]): Card[] {
	if (card.type !== CardType.ProgressiveParent) {
		return [card];
	}

	const childIds =
		(card as ProgressiveClozeParentCard).progressiveCloze?.childCardIds ?? [];
	const children = childIds
		.map((id) => allCards.find((candidate) => candidate.uuid === id))
		.filter((candidate): candidate is Card => !!candidate);

	return [card, ...children];
}
