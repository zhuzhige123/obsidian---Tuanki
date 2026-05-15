import { describe, expect, it } from "vitest";
import type { Card, Deck } from "../../data/types";
import { EmergentDeckService } from "../deck/EmergentDeckService";

function createService() {
	return new EmergentDeckService({
		app: {} as any,
		settings: {
			memoryDeckOrganization: {
				enabled: true,
				minCandidateCardCount: 2,
				tagDriftFollowMode: "ask",
			},
		} as any,
	});
}

function createDeck(id: string, name: string): Deck {
	return {
		id,
		name,
		description: "",
		category: "默认",
		path: name,
		level: 0,
		order: 0,
		inheritSettings: false,
		settings: {} as any,
		includeSubdecks: false,
		created: new Date().toISOString(),
		modified: new Date().toISOString(),
		stats: {
			totalCards: 0,
			newCards: 0,
			learningCards: 0,
			reviewCards: 0,
			todayNew: 0,
			todayReview: 0,
			todayTime: 0,
			totalReviews: 0,
			totalTime: 0,
			memoryRate: 0,
			averageEase: 0,
			forecastDays: {},
		},
		tags: [],
		metadata: {},
	};
}

function createCard(uuid: string, tags: string[], deckId?: string): Card {
	return {
		uuid,
		deckId,
		content: "",
		type: "basic" as any,
		tags,
		created: new Date().toISOString(),
		modified: new Date().toISOString(),
		fsrs: undefined as any,
		reviewHistory: [],
		stats: {
			totalReviews: 0,
			totalTime: 0,
			averageTime: 0,
			memoryRate: 0,
		},
	};
}

describe("EmergentDeckService", () => {
	it("会按单标签生成候选主题簇并过滤低频标签", () => {
		const service = createService();
		const runtime = service.buildRuntimeFromBindings(
			[
				createCard("card-1", ["呼吸", "病例"]),
				createCard("card-2", ["呼吸"]),
				createCard("card-3", ["循环"]),
			],
			[],
			[]
		);

		expect(runtime.candidates.map((candidate) => candidate.name)).toEqual(["呼吸"]);
		expect(runtime.candidates[0]?.cardUUIDs).toEqual(["card-1", "card-2"]);
	});

	it("正式绑定只保留观察绑定与摘要，不自动吸收到正式牌组", () => {
		const service = createService();
		const decks = [createDeck("deck-formal", "呼吸系统")];
		const runtime = service.buildRuntimeFromBindings(
			[
				createCard("card-1", ["呼吸"]),
				createCard("card-2", ["呼吸", "病例"]),
				createCard("card-3", ["循环"]),
			],
			decks,
			[
				{
					formalDeckId: "deck-formal",
					candidateId: "tag:呼吸",
					bindingMode: "stable-weak-sync",
					primaryTagSet: ["呼吸"],
					manualPinnedCardUUIDs: [],
					manualExcludedCardUUIDs: [],
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			]
		);

		expect(runtime.formalDeckIdsByCardUUID["card-1"]).toEqual([]);
		expect(runtime.formalDeckIdsByCardUUID["card-2"]).toEqual([]);
		expect(runtime.formalDeckIdsByCardUUID["card-3"]).toEqual([]);
		expect(runtime.formalDeckSummary["deck-formal"]?.matchedCardCount).toBe(2);
	});

	it("主学习入口优先采用显式正式归属，不会把涌现绑定回填为正式归属", () => {
		const service = createService();
		const decks = [createDeck("deck-formal", "呼吸系统"), createDeck("deck-legacy", "旧牌组")];
		const card = createCard("card-1", ["呼吸"], "deck-legacy");
		const runtime = service.buildRuntimeFromBindings(
			[card],
			decks,
			[
				{
					formalDeckId: "deck-formal",
					candidateId: "tag:呼吸",
					bindingMode: "stable-weak-sync",
					primaryTagSet: ["呼吸"],
					manualPinnedCardUUIDs: [],
					manualExcludedCardUUIDs: [],
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			]
		);

		expect(service.getPrimaryDeckIdForCard(card, decks, runtime)).toBe("deck-legacy");
		expect(service.getResolvedDeckIdsForCard(card, decks, runtime)).toEqual(["deck-legacy"]);
	});

	it("不会把仅存在 referencedByDecks 的旧引用式归属解析为正式牌组", () => {
		const service = createService();
		const decks = [createDeck("deck-formal", "呼吸系统"), createDeck("deck-legacy", "旧牌组")];
		const legacyReferencedCard = {
			...createCard("card-1", ["呼吸"]),
			referencedByDecks: ["deck-legacy"],
		} as Card;
		const runtime = service.buildRuntimeFromBindings(
			[legacyReferencedCard, createCard("card-2", ["呼吸"])],
			decks,
			[]
		);

		expect(runtime.formalDeckIdsByCardUUID["card-1"]).toEqual([]);
		expect(service.getPrimaryDeckIdForCard(legacyReferencedCard, decks, runtime)).toBeUndefined();
		expect(service.getResolvedDeckIdsForCard(legacyReferencedCard, decks, runtime)).toEqual(["tag:呼吸"]);
		expect(runtime.resolvedDeckRefsByCardUUID["card-1"]).toEqual([
			{ id: "tag:呼吸", name: "呼吸", kind: "emergent", isPrimary: false },
		]);
	});

	it("会输出一张卡的显式正式归属与全部涌现引用", () => {
		const service = createService();
		const decks = [createDeck("deck-formal", "呼吸系统"), createDeck("deck-legacy", "旧牌组")];
		const runtime = service.buildRuntimeFromBindings(
			[
				createCard("card-1", ["呼吸", "病例"], "deck-legacy"),
				createCard("card-2", ["呼吸"]),
				createCard("card-3", ["病例"]),
			],
			decks,
			[
				{
					formalDeckId: "deck-formal",
					candidateId: "tag:呼吸",
					bindingMode: "stable-weak-sync",
					primaryTagSet: ["呼吸"],
					manualPinnedCardUUIDs: [],
					manualExcludedCardUUIDs: [],
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			]
		);

		expect(runtime.emergentDeckViews.find((view) => view.id === "tag:呼吸")?.statusBadge).toBe("已沉淀");
		expect(runtime.resolvedDeckRefsByCardUUID["card-1"]).toEqual([
			{ id: "deck-legacy", name: "旧牌组", kind: "formal", isPrimary: true },
			{ id: "tag:病例", name: "病例", kind: "emergent", isPrimary: false },
			{ id: "tag:呼吸", name: "呼吸", kind: "emergent", isPrimary: false },
		]);
	});
});
