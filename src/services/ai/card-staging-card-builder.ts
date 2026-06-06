import type { Card } from "../../data/types";
import type { AICardPreviewItem, GeneratedCard } from "../../types/ai-types";
import type { CardStagingStudyMode } from "../../types/card-staging-types";
import { CardConverter } from "./CardConverter";

const STAGING_UUID_PREFIX = "weave-staging-";
const STAGING_BANK_PREFIX = "staging-";

export function isStagingCardUuid(uuid: string | undefined | null): boolean {
	return typeof uuid === "string" && uuid.startsWith(STAGING_UUID_PREFIX);
}

export function buildStagingBankId(sessionId: string): string {
	return `${STAGING_BANK_PREFIX}${sessionId}`;
}

export function isStagingBankId(bankId: string | undefined | null): boolean {
	return typeof bankId === "string" && bankId.startsWith(STAGING_BANK_PREFIX);
}

export function buildStagingPreviewCard(
	item: AICardPreviewItem,
	index: number,
	sessionId: string
): Card {
	const previewCard = CardConverter.convertForPreview(item.generatedCard);
	return {
		...previewCard,
		uuid: `${STAGING_UUID_PREFIX}${sessionId}-${index}-${item.id}`,
		sourceFile: undefined,
		metadata: {
			...(previewCard.metadata ?? {}),
			stagingItemId: item.id,
			stagingSessionId: sessionId,
		},
	};
}

export function filterGeneratedCardsForStudyMode(
	cards: GeneratedCard[],
	studyMode: CardStagingStudyMode
): GeneratedCard[] {
	if (studyMode === "exam") {
		return cards.filter((card) => card.type === "choice");
	}
	return cards.filter((card) => card.type === "qa" || card.type === "cloze");
}

export function filterPreviewItemsForStudyMode(
	items: AICardPreviewItem[],
	studyMode: CardStagingStudyMode
): AICardPreviewItem[] {
	return items.filter((item) =>
		filterGeneratedCardsForStudyMode([item.generatedCard], studyMode).length > 0
	);
}
