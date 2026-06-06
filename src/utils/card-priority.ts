import type { Card } from "../data/types";
import { getCardMetadataService } from "../services/CardMetadataService";
import { getCardMetadata } from "./yaml-utils";

const VALID_PRIORITIES = new Set([1, 2, 3, 4]);

export type CardPriorityLevel = 1 | 2 | 3 | 4;

export function normalizeCardPriority(value: unknown): CardPriorityLevel | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return undefined;
	}

	const rounded = Math.round(value);
	if (!VALID_PRIORITIES.has(rounded)) {
		return undefined;
	}

	return rounded as CardPriorityLevel;
}

/**
 * 同步解析卡片优先级，避免贴纸等待异步元数据后才出现。
 */
export function resolveCardDisplayPriority(card: Card | null | undefined): CardPriorityLevel | undefined {
	if (!card) {
		return undefined;
	}

	const metadataService = getCardMetadataService();

	return (
		normalizeCardPriority(metadataService.getCardPriority(card)) ??
		normalizeCardPriority(card.priority) ??
		normalizeCardPriority(getCardMetadata(card.content || "").we_priority)
	);
}
