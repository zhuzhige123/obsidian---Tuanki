import { resolveWeDecksMembershipFromContent } from "./card-we-decks-membership";
import type { DeckIdentifierLookup } from "./memory-deck-membership";
import {
	createContentWithMetadata,
	extractBodyContent,
	parseYAMLFromContent,
} from "./yaml-utils";

export interface CardEditorDeckSelectorState {
	deckId: string;
	deckNames: string[];
}

/** 将牌组名称写入卡片正文 YAML 的 we_decks，保留正文与其它 frontmatter 字段。 */
export function applyWeDecksNamesToCardContent(
	content: string,
	deckNames: string[]
): string {
	const existingYaml = parseYAMLFromContent(content) || {};
	const bodyContent = extractBodyContent(content) || "";
	const normalizedNames = deckNames.map((name) => String(name || "").trim()).filter(Boolean);

	if (normalizedNames.length > 0) {
		existingYaml.we_decks = normalizedNames;
	} else {
		delete existingYaml.we_decks;
	}

	return createContentWithMetadata(existingYaml, bodyContent);
}

/** 从卡片正文 YAML 解析工具栏牌组选择器应展示的状态（正式记忆牌组，单选）。 */
export function resolveDeckSelectorFromCardContent(
	content: string,
	decks?: DeckIdentifierLookup[]
): CardEditorDeckSelectorState {
	const resolution = resolveWeDecksMembershipFromContent(content || "", decks);
	const primaryName = resolution.formalDeckNames[0];

	return {
		deckId: resolution.formalDeckId || "",
		deckNames: primaryName ? [primaryName] : [],
	};
}

export function isSameDeckSelectorState(
	left: CardEditorDeckSelectorState,
	right: CardEditorDeckSelectorState
): boolean {
	return left.deckId === right.deckId && left.deckNames.join("\u0000") === right.deckNames.join("\u0000");
}
