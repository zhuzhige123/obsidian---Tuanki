import type { Card } from "../data/types";
import {
	getMemoryFormalDeckEntries,
	getSingleMemoryFormalDeckNames,
	type DeckIdentifierLookup,
} from "./memory-deck-membership";
import { getCardMetadata, setCardProperties } from "./yaml-utils";

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
