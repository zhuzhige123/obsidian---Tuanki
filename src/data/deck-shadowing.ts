import type { Deck } from "./types";
import { normalizeWDeckLogicalDeckId } from "../services/wdeck/WDeckService";

export interface WDeckDeckShadowSummary {
	logicalDeckId: string;
	logicalDeckName?: string;
}

type ShadowableDeck = Pick<Deck, "id" | "name" | "purpose" | "metadata">;

export function isDeckMigratedToWDeck(deck: Pick<Deck, "metadata">): boolean {
	const metadata =
		deck.metadata && typeof deck.metadata === "object" ? deck.metadata : null;
	const migration =
		metadata?.wdeckMigration && typeof metadata.wdeckMigration === "object"
			? (metadata.wdeckMigration as Record<string, unknown>)
			: null;

	return migration?.status === "migrated";
}

/**
 * legacy decks.json 条目是否已被同名或同逻辑 ID 的 .wdeck 正式牌组接管。
 */
export function isLegacyMemoryDeckCoveredByWDeck(
	deck: ShadowableDeck,
	aggregates: WDeckDeckShadowSummary[]
): boolean {
	if (deck.purpose === "test") {
		return false;
	}

	if (isDeckMigratedToWDeck(deck)) {
		return true;
	}

	const logicalDeckId = normalizeWDeckLogicalDeckId(deck.id, deck.name);
	const normalizedName = String(deck.name || "").trim();
	return aggregates.some((aggregate) => {
		if (aggregate.logicalDeckId === logicalDeckId) {
			return true;
		}

		return (
			!!normalizedName &&
			normalizedName === String(aggregate.logicalDeckName || "").trim()
		);
	});
}

/**
 * 保存 .wdeck 牌组后，是否应删除 decks.json 中的对应 legacy 残留。
 */
export function shouldRemovePersistedDeckShadowedByWDeck(
	deck: ShadowableDeck,
	logicalDeckId: string,
	logicalDeckName?: string
): boolean {
	if (deck.purpose === "test") {
		return false;
	}

	if (normalizeWDeckLogicalDeckId(deck.id, deck.name) === logicalDeckId) {
		return true;
	}

	const normalizedName = String(logicalDeckName || "").trim();
	if (!normalizedName) {
		return false;
	}

	return isLegacyMemoryDeckCoveredByWDeck(deck, [
		{ logicalDeckId, logicalDeckName: normalizedName },
	]);
}
