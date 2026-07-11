import type { Card } from "../data/types";

const CARD_SYNC_HASH_FIELDS = [
	"content",
	"fsrs",
	"reviewHistory",
	"stats",
	"personalization",
	"sourceFile",
	"sourceExists",
	"sourceFileMtime",
] as const;

function stableStringHash(input: string): string {
	let hash = 0;
	for (let index = 0; index < input.length; index += 1) {
		hash = (hash * 31 + input.charCodeAt(index)) | 0;
	}
	return Math.abs(hash).toString(36);
}

export function parseTimestampMs(value: string | number | undefined | null): number {
	if (typeof value === "number" && Number.isFinite(value) && value > 0) {
		return value;
	}
	if (typeof value === "string" && value.trim()) {
		const parsed = Date.parse(value);
		if (Number.isFinite(parsed) && parsed > 0) {
			return parsed;
		}
	}
	return 0;
}

function getLatestReviewMs(card: Card): number {
	if (!Array.isArray(card.reviewHistory) || card.reviewHistory.length === 0) {
		return 0;
	}
	const last = card.reviewHistory[card.reviewHistory.length - 1];
	return parseTimestampMs(last?.review);
}

/** 卡片业务版本时间：不依赖文件系统 mtime */
export function getCardSemanticVersionMs(card: Card): number {
	const modified = parseTimestampMs(card.modified);
	const created = parseTimestampMs(card.created);
	const lastSync = parseTimestampMs(card.lastSyncTime);
	const fsrsDue = card.fsrs?.due ? parseTimestampMs(card.fsrs.due) : 0;
	const lastReview = getLatestReviewMs(card);
	return Math.max(modified, created, lastSync, fsrsDue, lastReview);
}

export function computeCardSyncPayloadHash(card: Card): string {
	const payload: Record<string, unknown> = {};
	for (const key of CARD_SYNC_HASH_FIELDS) {
		const value = (card as unknown as Record<string, unknown>)[key];
		if (value !== undefined) {
			payload[key] = value;
		}
	}
	return stableStringHash(JSON.stringify(payload));
}

/**
 * 比较两张卡片的跨端优先级。
 * 返回值 > 0 表示 left 更新、应作为赢家。
 */
export function compareCardsForSyncWinner(left: Card, right: Card): number {
	const leftVersion = getCardSemanticVersionMs(left);
	const rightVersion = getCardSemanticVersionMs(right);
	if (leftVersion !== rightVersion) {
		return leftVersion - rightVersion;
	}

	const leftReviews = left.stats?.totalReviews ?? 0;
	const rightReviews = right.stats?.totalReviews ?? 0;
	if (leftReviews !== rightReviews) {
		return leftReviews - rightReviews;
	}

	const leftHash = left.contentHash || computeCardSyncPayloadHash(left);
	const rightHash = right.contentHash || computeCardSyncPayloadHash(right);
	if (leftHash !== rightHash) {
		return leftHash.localeCompare(rightHash);
	}

	const leftContent = left.content || "";
	const rightContent = right.content || "";
	if (leftContent.length !== rightContent.length) {
		return leftContent.length - rightContent.length;
	}

	return String(left.uuid || "").localeCompare(String(right.uuid || ""));
}

export function pickNewerCard(candidates: Card[]): Card | null {
	if (!candidates.length) {
		return null;
	}
	return candidates.reduce((best, current) =>
		compareCardsForSyncWinner(current, best) > 0 ? current : best
	);
}

export function cardsSemanticallyEqual(left: Card, right: Card): boolean {
	return computeCardSyncPayloadHash(left) === computeCardSyncPayloadHash(right);
}

/** 在真实写盘前刷新卡片的业务版本元数据 */
export function stampCardSyncMetadata(card: Card, when = new Date()): Card {
	const iso = when.toISOString();
	return {
		...card,
		modified: iso,
		contentHash: computeCardSyncPayloadHash(card),
		lastSyncTime: when.getTime(),
	};
}
