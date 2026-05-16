import { createDefaultIRBlockV4 } from "../../../types/ir-types";
import { IRV4SchedulerService } from "../IRV4SchedulerService";

describe("IRV4SchedulerService bookmark deck fallback", () => {
	it("会同时按 deckId 和旧 deckPath 收集书签任务块并去重", async () => {
		const app = {
			plugins: {
				getPlugin: vi.fn(() => null),
			},
			vault: {
				adapter: {},
			},
		} as any;

		const service = new IRV4SchedulerService(app);
		const pdfTask = { id: "pdf-task-1" } as any;
		const epubTask = { id: "epub-task-1" } as any;
		const pdfBlock = createDefaultIRBlockV4("pdf-task-1", "pdfs/demo.pdf");
		const epubBlock = createDefaultIRBlockV4("epub-task-1", "books/demo.epub");

		(service as any).storageAdapterV4 = {
			getDeckById: vi.fn().mockResolvedValue({
				id: "deck-1",
				path: "topics/demo",
			}),
		};

		(service as any)._pdfBookmarkTaskService = {
			getTasksByDeck: vi.fn(async (deckId: string) => {
				if (deckId === "deck-1" || deckId === "topics/demo") {
					return [pdfTask];
				}
				return [];
			}),
			toBlockV4: vi.fn(() => pdfBlock),
		};

		(service as any)._epubBookmarkTaskService = {
			getTasksByDeck: vi.fn(async (deckId: string) => {
				if (deckId === "topics/demo") {
					return [epubTask];
				}
				return [];
			}),
			toBlockV4: vi.fn(() => epubBlock),
		};

		const result = await (service as any).collectBookmarkTaskBlocks("deck-1");

		expect((service as any).storageAdapterV4.getDeckById).toHaveBeenCalledWith("deck-1");
		expect((service as any)._pdfBookmarkTaskService.getTasksByDeck).toHaveBeenCalledWith("deck-1");
		expect((service as any)._pdfBookmarkTaskService.getTasksByDeck).toHaveBeenCalledWith(
			"topics/demo"
		);
		expect((service as any)._epubBookmarkTaskService.getTasksByDeck).toHaveBeenCalledWith(
			"deck-1"
		);
		expect((service as any)._epubBookmarkTaskService.getTasksByDeck).toHaveBeenCalledWith(
			"topics/demo"
		);
		expect(result.pdfTaskBlocks).toHaveLength(1);
		expect(result.epubTaskBlocks).toHaveLength(1);
		expect(result.pdfTaskBlocks[0].id).toBe("pdf-task-1");
		expect(result.epubTaskBlocks[0].id).toBe("epub-task-1");
	});

	it("recordSession 会将 deckPath 归一化为标准 deck.id", async () => {
		const app = {
			plugins: {
				getPlugin: vi.fn(() => null),
			},
			vault: {
				adapter: {},
			},
		} as any;

		const service = new IRV4SchedulerService(app);
		const block = createDefaultIRBlockV4("chunk-1", "notes/source.md");
		const addSession = vi.fn().mockResolvedValue(undefined);

		(service as any).storageAdapterV4 = {
			getDeckById: vi.fn().mockResolvedValue({
				id: "deck-1",
				path: "topics/demo",
			}),
		};
		(service as any).storageService = {
			addSession,
		};

		await (service as any).recordSession(
			block,
			{
				rating: 3,
				readingTimeSeconds: 45,
				priorityUi: 5,
				createdCardCount: 0,
				createdExtractCount: 0,
				createdNoteCount: 0,
			},
			"topics/demo",
			"completed"
		);

		expect((service as any).storageAdapterV4.getDeckById).toHaveBeenCalledWith("topics/demo");
		expect(addSession).toHaveBeenCalledWith(
			expect.objectContaining({
				blockId: "chunk-1",
				deckId: "deck-1",
				action: "completed",
				duration: 45,
			})
		);
	});

	it("统一计划生成器会把标签组 profile 映射成轻量排序偏置", async () => {
		const app = {
			plugins: {
				getPlugin: vi.fn(() => ({
					settings: {
						incrementalReading: {
							enableTagGroupPrior: true,
							defaultIntervalFactor: 1.5,
							interleaveMode: false,
							maxConsecutiveSameTopic: 3,
						},
					},
				})),
			},
			vault: {
				adapter: {},
			},
		} as any;

		const service = new IRV4SchedulerService(app);
		const denseBlock = {
			...createDefaultIRBlockV4("dense", "notes/dense.md"),
			status: "scheduled",
			priorityUi: 5,
			priorityEff: 5,
			nextRepDate: Date.now(),
			meta: {
				...createDefaultIRBlockV4("dense-meta", "notes/dense.md").meta,
				tagGroup: "dense",
			},
		} as any;
		const looseBlock = {
			...createDefaultIRBlockV4("loose", "notes/loose.md"),
			status: "scheduled",
			priorityUi: 5.1,
			priorityEff: 5.1,
			nextRepDate: Date.now(),
			meta: {
				...createDefaultIRBlockV4("loose-meta", "notes/loose.md").meta,
				tagGroup: "loose",
			},
		} as any;

		(service as any).tagGroupService = {
			getProfile: vi.fn(async (groupId: string) => {
				if (groupId === "dense") {
					return { groupId, intervalFactorBase: 1.2, sampleCount: 8 };
				}
				return { groupId, intervalFactorBase: 1.8, sampleCount: 8 };
			}),
		};

		const result = await (service as any).generateUnifiedQueue([denseBlock, looseBlock], 15, null);

		expect(result.queue.map((block: any) => block.id)).toEqual(["dense", "loose"]);
	});

	it("关闭 enableTagGroupPrior 时不会应用标签组排序偏置", async () => {
		const app = {
			plugins: {
				getPlugin: vi.fn(() => ({
					settings: {
						incrementalReading: {
							enableTagGroupPrior: false,
							defaultIntervalFactor: 1.5,
							interleaveMode: false,
							maxConsecutiveSameTopic: 3,
						},
					},
				})),
			},
			vault: {
				adapter: {},
			},
		} as any;

		const service = new IRV4SchedulerService(app);
		const denseBlock = {
			...createDefaultIRBlockV4("dense", "notes/dense.md"),
			status: "scheduled",
			priorityUi: 5,
			priorityEff: 5,
			nextRepDate: Date.now(),
			meta: {
				...createDefaultIRBlockV4("dense-meta", "notes/dense.md").meta,
				tagGroup: "dense",
			},
		} as any;
		const looseBlock = {
			...createDefaultIRBlockV4("loose", "notes/loose.md"),
			status: "scheduled",
			priorityUi: 5.1,
			priorityEff: 5.1,
			nextRepDate: Date.now(),
			meta: {
				...createDefaultIRBlockV4("loose-meta", "notes/loose.md").meta,
				tagGroup: "loose",
			},
		} as any;

		(service as any).tagGroupService = {
			getProfile: vi.fn(async (groupId: string) => {
				if (groupId === "dense") {
					return { groupId, intervalFactorBase: 1.2, sampleCount: 8 };
				}
				return { groupId, intervalFactorBase: 1.8, sampleCount: 8 };
			}),
		};

		const result = await (service as any).generateUnifiedQueue([denseBlock, looseBlock], 15, null);

		expect(result.queue.map((block: any) => block.id)).toEqual(["loose", "dense"]);
	});
});
