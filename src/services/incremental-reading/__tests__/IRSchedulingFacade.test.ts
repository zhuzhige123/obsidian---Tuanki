import type { IRBlock, IRDeck, IRTagGroupProfile } from "../../../types/ir-types";
import { IRSchedulingFacade } from "../IRSchedulingFacade";
import type { ReadingCompletionData } from "../IRSchedulerV3";

const NOW = "2026-04-09T00:00:00.000Z";

const createBlock = (overrides: Partial<IRBlock> = {}): IRBlock =>
	({
		id: "block-1",
		filePath: "notes/source.md",
		headingPath: ["Heading"],
		headingLevel: 1,
		startLine: 1,
		priority: 2,
		state: "new",
		interval: 0,
		intervalFactor: 2.5,
		nextReview: null,
		reviewCount: 0,
		lastReview: null,
		favorite: false,
		tags: [],
		notes: "",
		extractedCards: [],
		totalReadingTime: 0,
		firstReadAt: null,
		createdAt: NOW,
		updatedAt: NOW,
		...overrides,
	}) as IRBlock;

const createDeck = (overrides: Partial<IRDeck> = {}): IRDeck =>
	({
		id: "deck-1",
		name: "Deck 1",
		description: "",
		icon: "",
		color: "",
		blockIds: [],
		sourceFiles: [],
		settings: {} as any,
		createdAt: NOW,
		updatedAt: NOW,
		archivedAt: null,
		...overrides,
	}) as IRDeck;

const createFacade = () => {
	const storage = {
		initialize: vi.fn().mockResolvedValue(undefined),
		getDeckById: vi.fn().mockResolvedValue(null),
		getAllDecks: vi.fn().mockResolvedValue({}),
	} as any;

	const app = {
		plugins: {
			getPlugin: vi.fn(() => null),
		},
	} as any;

	const facade = new IRSchedulingFacade(app, {
		storageService: storage,
		advancedSettings: {
			tagGroupLearningSpeed: "off",
		},
	});

	return { facade, storage };
};

const completionData: ReadingCompletionData = {
	readingTimeSeconds: 30,
	createdCardCount: 0,
	createdExtractCount: 0,
	createdNoteCount: 0,
};

describe("IRSchedulingFacade.completeBlock", () => {
	it("未传 deckId 时会按 blockIds 回退到真实所属牌组", async () => {
		const { facade, storage } = createFacade();
		const block = createBlock({
			id: "block-owned",
			deckPath: "legacy/missing-path",
		});
		const updatedBlock = createBlock({
			...block,
			state: "learning",
		});
		const nextBlock = createBlock({ id: "block-next" });
		const groupProfile = { groupId: "group-1" } as IRTagGroupProfile;

		storage.getAllDecks.mockResolvedValue({
			"deck-owned": createDeck({
				id: "deck-owned",
				blockIds: ["block-owned"],
				sourceFiles: ["notes/source.md"],
			}),
		});

		vi.spyOn(facade, "initialize").mockResolvedValue(undefined);
		(facade as any).tagGroupService = {
			getProfileForDocument: vi.fn().mockResolvedValue(groupProfile),
		};
		(facade as any).scheduler = {
			completeBlock: vi.fn().mockResolvedValue(updatedBlock),
		};
		const getStudyQueueSpy = vi.spyOn(facade, "getStudyQueue").mockResolvedValue({
			queue: [updatedBlock, nextBlock],
			stats: {
				totalDue: 2,
				scheduled: 2,
				postponed: 0,
				reachedDailyLimit: 0,
				totalEstimatedMinutes: 10,
				groupDistribution: {},
			},
			deckId: "deck-owned",
			strategy: {} as any,
			overloadInfo: {
				isOverloaded: false,
				overloadRatio: 0,
			},
		});

		const result = await facade.completeBlock(block, completionData);

		expect((facade as any).scheduler.completeBlock).toHaveBeenCalledWith(
			block,
			completionData,
			"deck-owned",
			groupProfile
		);
		expect(getStudyQueueSpy).toHaveBeenCalledWith("deck-owned");
		expect(result.nextInQueue?.id).toBe("block-next");
	});

	it("未传 deckId 时会按 sourceFiles 回退到真实所属牌组", async () => {
		const { facade, storage } = createFacade();
		const block = createBlock({
			id: "block-unindexed",
			filePath: "notes/unindexed.md",
		});
		const updatedBlock = createBlock({
			...block,
			state: "learning",
		});
		const groupProfile = { groupId: "group-2" } as IRTagGroupProfile;

		storage.getAllDecks.mockResolvedValue({
			"deck-source": createDeck({
				id: "deck-source",
				sourceFiles: ["notes/unindexed.md"],
			}),
		});

		vi.spyOn(facade, "initialize").mockResolvedValue(undefined);
		(facade as any).tagGroupService = {
			getProfileForDocument: vi.fn().mockResolvedValue(groupProfile),
		};
		(facade as any).scheduler = {
			completeBlock: vi.fn().mockResolvedValue(updatedBlock),
		};
		const getStudyQueueSpy = vi.spyOn(facade, "getStudyQueue").mockResolvedValue({
			queue: [updatedBlock],
			stats: {
				totalDue: 1,
				scheduled: 1,
				postponed: 0,
				reachedDailyLimit: 0,
				totalEstimatedMinutes: 5,
				groupDistribution: {},
			},
			deckId: "deck-source",
			strategy: {} as any,
			overloadInfo: {
				isOverloaded: false,
				overloadRatio: 0,
			},
		});

		await facade.completeBlock(block, completionData);

		expect((facade as any).scheduler.completeBlock).toHaveBeenCalledWith(
			block,
			completionData,
			"deck-source",
			groupProfile
		);
		expect(getStudyQueueSpy).toHaveBeenCalledWith("deck-source");
	});
});

describe("IRSchedulingFacade deck fallback for non-completion actions", () => {
	it("suspendBlock 未传 deckId 时会回退到真实所属牌组", async () => {
		const { facade, storage } = createFacade();
		const block = createBlock({ id: "block-suspend", filePath: "notes/suspend.md" });
		const updatedBlock = createBlock({ ...block, state: "suspended" });

		storage.getAllDecks.mockResolvedValue({
			"deck-suspend": createDeck({
				id: "deck-suspend",
				sourceFiles: ["notes/suspend.md"],
			}),
		});

		vi.spyOn(facade, "initialize").mockResolvedValue(undefined);
		(facade as any).scheduler = {
			suspendBlock: vi.fn().mockResolvedValue(updatedBlock),
		};

		const result = await facade.suspendBlock(block);

		expect((facade as any).scheduler.suspendBlock).toHaveBeenCalledWith(block, "deck-suspend");
		expect(result.state).toBe("suspended");
	});

	it("skipBlock 未传 deckId 时会回退到真实所属牌组", async () => {
		const { facade, storage } = createFacade();
		const block = createBlock({ id: "block-skip", deckPath: "legacy/skip-path" });

		storage.getDeckById.mockResolvedValue(
			createDeck({
				id: "deck-skip",
				path: "legacy/skip-path",
			})
		);

		vi.spyOn(facade, "initialize").mockResolvedValue(undefined);
		(facade as any).scheduler = {
			skipBlock: vi.fn().mockResolvedValue(undefined),
		};

		await facade.skipBlock(block);

		expect((facade as any).scheduler.skipBlock).toHaveBeenCalledWith(block, "deck-skip");
	});
});
