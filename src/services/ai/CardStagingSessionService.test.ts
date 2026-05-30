import { describe, expect, it } from "vitest";
import { CardStagingSessionService } from "./CardStagingSessionService";
import type { AICardPreviewItem } from "../../types/ai-types";

function makeItem(id: string, type: "qa" | "choice"): AICardPreviewItem {
	const generatedCard = {
		type,
		content: `# Q\n---div---\nA`,
		metadata: {
			generatedAt: new Date().toISOString(),
			provider: "openai",
			model: "gpt-4o-mini",
			temperature: 0.7,
		},
	} as AICardPreviewItem["generatedCard"];

	return {
		id,
		generatedCard,
		generatedContent: "sample",
		status: "valid",
		isNew: true,
		draft: generatedCard as never,
		issues: [],
	};
}

describe("CardStagingSessionService", () => {
	it("tracks keep and discard state until session completes", () => {
		const service = new CardStagingSessionService();
		const session = service.createSession({
			sourceFilePath: "notes/demo.md",
			sourceFileName: "demo.md",
			studyMode: "memory",
			targetDeckId: "deck-1",
			targetDeckName: "Demo Deck",
			generationConfig: {
				templateId: "",
				promptTemplate: "",
				cardCount: 2,
				difficulty: "medium",
				typeDistribution: { qa: 100, cloze: 0, choice: 0 },
				provider: "openai",
				model: "gpt-4o-mini",
				temperature: 0.7,
				maxTokens: 1000,
			},
			items: [makeItem("a", "qa"), makeItem("b", "qa")],
		});

		expect(session.items).toHaveLength(2);
		const firstItem = session.items[0];
		service.keepItem(session.id, firstItem.id);
		service.discardItem(session.id, session.items[1].id);

		expect(service.getSummary(session.id)?.keptCount).toBe(1);
		expect(service.getSummary(session.id)?.discardedCount).toBe(1);
		expect(service.isSessionComplete(session.id)).toBe(true);
		expect(service.getPendingCards(session.id)).toHaveLength(0);
	});

	it("stores reviewed card fsrs when marking item reviewed", () => {
		const service = new CardStagingSessionService();
		const session = service.createSession({
			sourceFilePath: "notes/demo.md",
			sourceFileName: "demo.md",
			studyMode: "memory",
			targetDeckId: "deck-1",
			targetDeckName: "Demo Deck",
			generationConfig: {
				templateId: "",
				promptTemplate: "",
				cardCount: 1,
				difficulty: "medium",
				typeDistribution: { qa: 100, cloze: 0, choice: 0 },
				provider: "openai",
				model: "gpt-4o-mini",
				temperature: 0.7,
				maxTokens: 1000,
			},
			items: [makeItem("a", "qa")],
		});

		const item = session.items[0];
		const reviewedCard = {
			...item.previewCard,
			fsrs: {
				...item.previewCard.fsrs,
				reps: 1,
				state: 1,
			},
		};

		service.markItemReviewed(session.id, item.id, reviewedCard);
		const updated = service.getSession(session.id)?.items[0];
		expect(updated?.status).toBe("kept");
		expect(updated?.previewCard.fsrs?.reps).toBe(1);
	});

	it("reopens kept items for further study", () => {
		const service = new CardStagingSessionService();
		const session = service.createSession({
			sourceFilePath: "notes/demo.md",
			sourceFileName: "demo.md",
			studyMode: "memory",
			targetDeckId: "deck-1",
			targetDeckName: "Demo Deck",
			generationConfig: {
				templateId: "",
				promptTemplate: "",
				cardCount: 2,
				difficulty: "medium",
				typeDistribution: { qa: 100, cloze: 0, choice: 0 },
				provider: "openai",
				model: "gpt-4o-mini",
				temperature: 0.7,
				maxTokens: 1000,
			},
			items: [makeItem("a", "qa"), makeItem("b", "qa")],
		});

		service.keepItem(session.id, session.items[0].id);
		service.discardItem(session.id, session.items[1].id);
		expect(service.getPendingCards(session.id)).toHaveLength(0);

		const reopened = service.reopenKeptItemsForStudy(session.id);
		expect(reopened).toHaveLength(1);
		expect(service.getSummary(session.id)?.pendingCount).toBe(1);
		expect(service.getSummary(session.id)?.keptCount).toBe(0);
		expect(service.isSessionComplete(session.id)).toBe(false);
	});

	it("updates preview and generated card content after inline edit", () => {
		const service = new CardStagingSessionService();
		const session = service.createSession({
			sourceFilePath: "notes/demo.md",
			sourceFileName: "demo.md",
			studyMode: "memory",
			targetDeckId: "deck-1",
			targetDeckName: "Demo Deck",
			generationConfig: {
				templateId: "",
				promptTemplate: "",
				cardCount: 1,
				difficulty: "medium",
				typeDistribution: { qa: 100, cloze: 0, choice: 0 },
				provider: "openai",
				model: "gpt-4o-mini",
				temperature: 0.7,
				maxTokens: 1000,
			},
			items: [makeItem("a", "qa")],
		});

		const item = session.items[0];
		const editedCard = {
			...item.previewCard,
			content: "# Updated question\n---div---\nUpdated answer",
		};

		service.updateItemPreviewCard(session.id, item.id, editedCard);
		const updated = service.getSession(session.id)?.items[0];
		expect(updated?.previewCard.content).toBe(editedCard.content);
		expect(updated?.generatedCard.content).toBe(editedCard.content);
	});
});
