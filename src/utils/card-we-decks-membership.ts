import type { Card } from "../data/types";
import {
	getMemoryFormalDeckEntries,
	getKnownSingleMemoryFormalDeckNames,
	getSingleMemoryFormalDeckNames,
	type DeckIdentifierLookup,
} from "./memory-deck-membership";
import { getCardDeckIdsFromFormalSource, getCardMetadata, setCardProperties } from "./yaml-utils";

export interface WeDecksMembershipResolution {
	formalDeckNames: string[];
	formalDeckId?: string;
	invalidNames: string[];
	cleared: boolean;
}

function normalizeWeDecksInput(raw: unknown): string[] {
	if (!raw) return [];
	if (Array.isArray(raw)) {
		return raw
			.map((value) => String(value ?? "").trim())
			.filter(Boolean);
	}
	if (typeof raw === "string") {
		const trimmed = raw.trim();
		return trimmed ? [trimmed] : [];
	}
	return [];
}

export function resolveWeDecksMembershipFromValues(
	rawValues: unknown,
	decks?: DeckIdentifierLookup[]
): WeDecksMembershipResolution {
	const values = normalizeWeDecksInput(rawValues);
	const entries = getMemoryFormalDeckEntries(values, decks);
	const invalidNames = Array.from(
		new Set(entries.filter((entry) => !entry.isKnownDeck).map((entry) => entry.rawValue))
	);
	const knownFormal = entries.filter((entry) => entry.isKnownDeck && entry.purpose !== "test");
	const formalDeckNames = getSingleMemoryFormalDeckNames(values, decks);

	return {
		formalDeckNames,
		formalDeckId: knownFormal[0]?.deckId,
		invalidNames,
		cleared: values.length === 0,
	};
}

export function resolveWeDecksMembershipFromContent(
	content: string,
	decks?: DeckIdentifierLookup[]
): WeDecksMembershipResolution {
	const yaml = getCardMetadata(content || "");
	return resolveWeDecksMembershipFromValues(yaml.we_decks, decks);
}

export function isPersistedMemoryCardUuid(uuid?: string): boolean {
	const normalized = String(uuid || "").trim();
	if (!normalized) return false;
	if (normalized.startsWith("temp-")) return false;
	if (normalized.startsWith("preview-")) return false;
	return true;
}

export interface MemoryDeckWriteTarget {
	id: string;
	name: string;
	primaryDeckId?: string;
	deckIds: string[];
	source: "formal" | "runtime" | "ungrouped";
}

/**
 * 解析记忆卡写入 .wdeck 时应使用的目标牌组。
 * 正式归属（content YAML we_decks）优先于运行时 deckId，避免修复后再次漂移。
 */
export function resolveMemoryDeckWriteTarget(
	card: Pick<Card, "deckId" | "referencedByDecks" | "cardPurpose"> & Pick<Partial<Card>, "content">,
	decks?: DeckIdentifierLookup[],
	ungroupedDeckName = "未归组卡片"
): MemoryDeckWriteTarget {
	const formal = getCardDeckIdsFromFormalSource(card, decks);
	const memoryFormalIds = formal.deckIds.filter(
		(deckId) => decks?.find((deck) => deck.id === deckId)?.purpose !== "test"
	);
	const primaryFormalId = formal.primaryDeckId || memoryFormalIds[0];

	if (primaryFormalId && memoryFormalIds.length > 0) {
		const primaryDeck = decks?.find((deck) => deck.id === primaryFormalId);
		return {
			id: primaryFormalId,
			name: primaryDeck?.name || primaryFormalId,
			primaryDeckId: primaryFormalId,
			deckIds: memoryFormalIds,
			source: "formal",
		};
	}

	const runtimeDeckId = String(card.deckId || "").trim();
	if (runtimeDeckId) {
		const matchedDeck = decks?.find(
			(deck) => deck.id === runtimeDeckId || deck.name === runtimeDeckId
		);
		return {
			id: matchedDeck?.id || runtimeDeckId,
			name: matchedDeck?.name || runtimeDeckId,
			primaryDeckId: matchedDeck?.id || runtimeDeckId,
			deckIds: [matchedDeck?.id || runtimeDeckId],
			source: "runtime",
		};
	}

	return {
		id: ungroupedDeckName,
		name: ungroupedDeckName,
		deckIds: [],
		source: "ungrouped",
	};
}

/**
 * 将运行时 deckId / referencedByDecks 与 YAML we_decks 对齐，供写入 .wdeck 前使用。
 */
export function alignCardRuntimeMembershipFromFormalSource(
	card: Card,
	decks?: DeckIdentifierLookup[]
): Card {
	const formal = getCardDeckIdsFromFormalSource(card, decks);
	const memoryFormalIds = formal.deckIds.filter(
		(deckId) => decks?.find((deck) => deck.id === deckId)?.purpose !== "test"
	);
	if (memoryFormalIds.length === 0) {
		return card;
	}

	const primaryDeckId = formal.primaryDeckId || memoryFormalIds[0];
	const currentPrimary = String(card.deckId || "").trim();
	const currentRefs = Array.from(new Set((card.referencedByDecks || []).filter(Boolean)));
	const samePrimary = currentPrimary === primaryDeckId;
	const sameRefs =
		currentRefs.length === memoryFormalIds.length &&
		memoryFormalIds.every((deckId) => currentRefs.includes(deckId));

	if (samePrimary && sameRefs) {
		return card;
	}

	return {
		...card,
		deckId: primaryDeckId,
		referencedByDecks: memoryFormalIds,
	};
}

/**
 * 清除 we_decks 中已失效的牌组 ID/名称，仅保留当前仍存在的牌组。
 * 若全部失效则删除 we_decks，以便后续从 .wdeck 物理位置补写。
 */
export function sanitizeCardWeDecksToKnownDecks(
	card: Card,
	decks: DeckIdentifierLookup[]
): { card: Card; changed: boolean; invalidValues: string[] } {
	if (!card.content) {
		return { card, changed: false, invalidValues: [] };
	}

	const yaml = getCardMetadata(card.content);
	const rawValues = normalizeWeDecksInput(yaml.we_decks);
	if (rawValues.length === 0) {
		return { card, changed: false, invalidValues: [] };
	}

	const entries = getMemoryFormalDeckEntries(rawValues, decks);
	const invalidValues = Array.from(
		new Set(entries.filter((entry) => !entry.isKnownDeck).map((entry) => entry.rawValue))
	);
	if (invalidValues.length === 0) {
		return { card, changed: false, invalidValues: [] };
	}

	const knownNames = getKnownSingleMemoryFormalDeckNames(rawValues, decks);
	const nextContent = setCardProperties(card.content, {
		we_decks: knownNames.length > 0 ? knownNames : undefined,
	});

	if (nextContent === card.content) {
		return { card, changed: false, invalidValues };
	}

	return {
		card: {
			...card,
			content: nextContent,
			modified: new Date().toISOString(),
		},
		changed: true,
		invalidValues,
	};
}

export function applyWeDecksMembershipToCard(
	card: Card,
	content: string,
	decks: DeckIdentifierLookup[]
): { card: Card; content: string; resolution: WeDecksMembershipResolution } {
	const resolution = resolveWeDecksMembershipFromContent(content, decks);
	let nextContent = content;

	if (resolution.formalDeckNames.length > 0) {
		nextContent = setCardProperties(nextContent, {
			we_decks: resolution.formalDeckNames,
		});
	} else if (resolution.cleared) {
		nextContent = setCardProperties(nextContent, {
			we_decks: undefined,
		});
	}

	const nextCard: Card = {
		...card,
		content: nextContent,
		modified: new Date().toISOString(),
	};

	return { card: nextCard, content: nextContent, resolution };
}
