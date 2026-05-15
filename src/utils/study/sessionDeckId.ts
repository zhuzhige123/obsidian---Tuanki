import type { Card, Deck } from "../../data/types";
import { resolvePrimaryStudyDeckIdFromCard } from "./memorySchedulingResolver";

interface ResolveStudySessionDeckIdOptions {
	currentDeckId?: string;
	firstCard?: Card;
	decks: Deck[];
}

/**
 * 学习会话的 deckId 必须优先绑定“用户从哪个牌组进入学习”。
 * 对引用式记忆牌组来说，卡片自身的 deckId 可能是源牌组，不适合拿来统计每日新卡限额。
 */
export function resolveStudySessionDeckId({
	currentDeckId,
	firstCard,
	decks,
}: ResolveStudySessionDeckIdOptions): string {
	if (currentDeckId) {
		return currentDeckId;
	}

	if (!firstCard) {
		return "";
	}

	return resolvePrimaryStudyDeckIdFromCard(firstCard, decks);
}
