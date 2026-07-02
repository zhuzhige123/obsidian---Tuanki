import { describe, expect, it } from "vitest";
import {
	filterGeneratedCardsForStudyMode,
	filterPreviewItemsForStudyMode,
	buildStagingBankId,
	isStagingBankId,
	isStagingCardUuid,
} from "./card-staging-card-builder";
import type { GeneratedCard } from "../../types/ai-types";
import type { AICardPreviewItem } from "../../types/ai-types";

function makeGeneratedCard(type: GeneratedCard["type"]): GeneratedCard {
	return {
		uuid: "test-generated-card",
		type,
		content: `# Front\n---div---\nBack`,
		metadata: {
			generatedAt: new Date().toISOString(),
			provider: "openai",
			model: "gpt-4o-mini",
			temperature: 0.7,
		},
	};
}

function makePreviewItem(type: GeneratedCard["type"]): AICardPreviewItem {
	return {
		id: `${type}-1`,
		generatedCard: makeGeneratedCard(type),
		generatedContent: "sample",
		status: "valid",
		isNew: true,
		draft: makeGeneratedCard(type) as never,
		issues: [],
	};
}

describe("card-staging-card-builder", () => {
	it("filters memory cards to qa and cloze", () => {
		const cards = [
			makeGeneratedCard("qa"),
			makeGeneratedCard("cloze"),
			makeGeneratedCard("choice"),
		];
		const filtered = filterGeneratedCardsForStudyMode(cards, "memory");
		expect(filtered.map((card) => card.type)).toEqual(["qa", "cloze"]);
	});

	it("filters exam cards to choice only", () => {
		const items = [
			makePreviewItem("qa"),
			makePreviewItem("choice"),
		];
		const filtered = filterPreviewItemsForStudyMode(items, "exam");
		expect(filtered).toHaveLength(1);
		expect(filtered[0]?.generatedCard.type).toBe("choice");
	});

	it("detects staging card uuids", () => {
		expect(isStagingCardUuid("weave-staging-abc")).toBe(true);
		expect(isStagingCardUuid("normal-uuid")).toBe(false);
	});

	it("detects staging bank ids", () => {
		expect(buildStagingBankId("session-1")).toBe("staging-session-1");
		expect(isStagingBankId("staging-session-1")).toBe(true);
		expect(isStagingBankId("real-bank-id")).toBe(false);
	});
});
