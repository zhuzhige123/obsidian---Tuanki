
vi.mock("obsidian", async () => {
	const actual = await vi.importActual<typeof import("../../../tests/mocks/obsidian")>(
		"../../../tests/mocks/obsidian"
	);
	return {
		...actual,
		normalizePath: (path: string) => path.replace(/\\/g, "/").replace(/\/{2,}/g, "/"),
	};
});

vi.mock("../../../config/paths", () => ({
	normalizeWeaveParentFolder: (path?: string) => String(path || "").trim(),
	getV2Paths: () => ({
		ir: {
			root: "weave/incremental-reading",
			epub: "weave/incremental-reading/epub-reading",
		},
	}),
	getV2PathsFromApp: () => ({
		ir: {
			root: "weave/incremental-reading",
			epub: "weave/incremental-reading/epub-reading",
		},
	}),
	resolveIRImportFolder: (chunkRoot?: string) => String(chunkRoot || "weave/incremental-reading/chunks"),
}));

import { IREpubBookmarkTaskService } from "../IREpubBookmarkTaskService";
import { IRPdfBookmarkTaskService } from "../IRPdfBookmarkTaskService";
import { IRScheduleKernel } from "../IRScheduleKernel";
import { IRStorageService } from "../IRStorageService";

describe("IRScheduleKernel deck identifier compatibility", () => {
	beforeEach(() => {
		vi.restoreAllMocks();

		vi.spyOn(IRStorageService.prototype, "initialize").mockResolvedValue(undefined);
		vi.spyOn(IRStorageService.prototype, "getAllDecks").mockResolvedValue({
			"deck-1": {
				id: "deck-1",
				name: "Deck 1",
				path: "legacy/deck-path",
			} as any,
		});
		vi.spyOn(IRPdfBookmarkTaskService.prototype, "initialize").mockResolvedValue(undefined);
		vi.spyOn(IREpubBookmarkTaskService.prototype, "initialize").mockResolvedValue(undefined);
		vi.spyOn(IREpubBookmarkTaskService.prototype, "getAllTasks").mockResolvedValue([]);
	});

	it("includes legacy-path pdf tasks in canonical deck recompute output", async () => {
		vi.spyOn(IRStorageService.prototype, "getAllChunkDataWithSync").mockResolvedValue({});
		vi.spyOn(IRPdfBookmarkTaskService.prototype, "getAllTasks").mockResolvedValue([
			{
				id: "pdfbm-1",
				topicId: "legacy/deck-path",
				deckId: "legacy/deck-path",
				pdfPath: "Books/Test.pdf",
				title: "Legacy PDF",
				link: "[[Books/Test.pdf#page=1]]",
				status: "new",
				priorityUi: 5,
				priorityEff: 5,
				intervalDays: 1,
				nextRepDate: 0,
				stats: {},
				meta: {},
				tags: [],
				createdAt: 1,
				updatedAt: 1,
			} as any,
		]);

		const kernel = new IRScheduleKernel({
			plugins: {
				getPlugin: () => null,
			},
		} as any);
		const plan = await kernel.recomputeScheduleForDeck("ui_refresh", { deckIds: ["deck-1"] });
		const items = plan.days.flatMap((day) => day.items);

		expect(items).toHaveLength(1);
		expect(items[0]?.id).toBe("pdfbm-1");
		expect(items[0]?.deckId).toBe("deck-1");
		expect(plan.deckIds).toEqual(["deck-1"]);
	});

	it("uses the last hierarchical segment as displayName for pdf and epub reading points", async () => {
		vi.spyOn(IRStorageService.prototype, "getAllChunkDataWithSync").mockResolvedValue({});
		vi.spyOn(IRPdfBookmarkTaskService.prototype, "getAllTasks").mockResolvedValue([
			{
				id: "pdfbm-1",
				topicId: "deck-1",
				deckId: "deck-1",
				pdfPath: "Books/Test.pdf",
				title: "第一章 / 第二节 / PDF 阅读点",
				link: "[[Books/Test.pdf#page=1]]",
				status: "new",
				priorityUi: 5,
				priorityEff: 5,
				intervalDays: 1,
				nextRepDate: 0,
				stats: {},
				meta: {},
				tags: [],
				createdAt: 1,
				updatedAt: 1,
			} as any,
		]);
		vi.spyOn(IREpubBookmarkTaskService.prototype, "getAllTasks").mockResolvedValue([
			{
				id: "epubbm-1",
				topicId: "deck-1",
				deckId: "deck-1",
				sourceId: "book-1",
				epubFilePath: "Books/Test.epub",
				title: "第一部分 / 第二章 / EPUB 阅读点",
				tocHref: "chapter-2.xhtml",
				tocLevel: 2,
				status: "new",
				priorityUi: 5,
				priorityEff: 5,
				intervalDays: 1,
				nextRepDate: 0,
				stats: {},
				meta: {},
				tags: [],
				createdAt: 1,
				updatedAt: 1,
			} as any,
		]);

		const kernel = new IRScheduleKernel({
			plugins: {
				getPlugin: () => null,
			},
		} as any);
		const plan = await kernel.recomputeScheduleForDeck("ui_refresh", { deckIds: ["deck-1"] });
		const items = plan.days.flatMap((day) => day.items);

		expect(items).toHaveLength(2);
		expect(items.find((item) => item.id === "pdfbm-1")?.displayName).toBe("PDF 阅读点");
		expect(items.find((item) => item.id === "epubbm-1")?.displayName).toBe("EPUB 阅读点");
	});

	it("includes legacy-path chunks in canonical deck recompute output", async () => {
		vi.spyOn(IRStorageService.prototype, "getAllChunkDataWithSync").mockResolvedValue({
			"chunk-1": {
				chunkId: "chunk-1",
				filePath: "Books/Chunk.md",
				deckIds: ["legacy/deck-path"],
				priorityEff: 5,
				intervalDays: 1,
				nextRepDate: 0,
				scheduleStatus: "new",
				stats: {},
				meta: {},
			} as any,
		});
		vi.spyOn(IRPdfBookmarkTaskService.prototype, "getAllTasks").mockResolvedValue([]);

		const kernel = new IRScheduleKernel({
			plugins: {
				getPlugin: () => null,
			},
		} as any);
		const plan = await kernel.recomputeScheduleForDeck("ui_refresh", { deckIds: ["deck-1"] });
		const items = plan.days.flatMap((day) => day.items);

		expect(items).toHaveLength(1);
		expect(items[0]?.id).toBe("chunk-1");
		expect(items[0]?.deckId).toBe("deck-1");
		expect(plan.deckIds).toEqual(["deck-1"]);
	});

	it("uses renamed chunk source path and title after metadata refresh", async () => {
		vi.spyOn(IRStorageService.prototype, "getAllChunkDataWithSync").mockResolvedValue({
			"chunk-1": {
				chunkId: "chunk-1",
				filePath: "Books/Renamed Chapter.md",
				deckIds: ["deck-1"],
				priorityEff: 5,
				intervalDays: 1,
				nextRepDate: 0,
				scheduleStatus: "new",
				stats: {},
				meta: {},
			} as any,
		});
		vi.spyOn(IRPdfBookmarkTaskService.prototype, "getAllTasks").mockResolvedValue([]);

		const kernel = new IRScheduleKernel({
			plugins: {
				getPlugin: (id: string) =>
					id === "weave"
						? {
								readingMaterialManager: {
									getAllMaterials: vi.fn(async () => [
										{
											uuid: "rm-1",
											filePath: "Books/Renamed Chapter.md",
											title: "Renamed Chapter",
											resumeLink: "[[Books/Renamed Chapter.md#^chunk-1]]",
										},
									]),
									},
						  }
						: null,
			},
		} as any);
		const plan = await kernel.recomputeScheduleForDeck("metadata_renamed", { deckIds: ["deck-1"] });
		const items = plan.days.flatMap((day) => day.items);

		expect(items).toHaveLength(1);
		expect(items[0]?.id).toBe("chunk-1");
		expect(items[0]?.sourceFile).toBe("Books/Renamed Chapter.md");
		expect(items[0]?.title).toBe("Renamed Chapter");
		expect(items[0]?.resumeLink).toBe("[[Books/Renamed Chapter.md#^chunk-1]]");
	});

	it("deduplicates concurrent recomputes for the same deck scope and keeps a cached schedule", async () => {
		const chunkSpy = vi.spyOn(IRStorageService.prototype, "getAllChunkDataWithSync").mockResolvedValue({
			"chunk-1": {
				chunkId: "chunk-1",
				filePath: "Books/Chunk.md",
				deckIds: ["deck-1"],
				priorityEff: 5,
				intervalDays: 1,
				nextRepDate: 0,
				scheduleStatus: "new",
				stats: {},
				meta: {},
			} as any,
		});
		vi.spyOn(IRPdfBookmarkTaskService.prototype, "getAllTasks").mockResolvedValue([]);

		const kernel = new IRScheduleKernel({
			plugins: {
				getPlugin: () => null,
			},
		} as any);

		const [planA, planB] = await Promise.all([
			kernel.recomputeScheduleForDeck("ui_refresh", { deckIds: ["deck-1"] }),
			kernel.recomputeScheduleForDeck("ui_refresh", { deckIds: ["deck-1"] }),
		]);

		expect(chunkSpy).toHaveBeenCalledTimes(1);
		expect(planA.generatedAt).toBe(planB.generatedAt);
		expect(kernel.getCachedSchedule({ deckIds: ["deck-1"] })?.generatedAt).toBe(planA.generatedAt);
	});

	it("separates cache entries and planning spread for different horizonDays", async () => {
		const chunkSpy = vi.spyOn(IRStorageService.prototype, "getAllChunkDataWithSync").mockResolvedValue({
			"chunk-1": {
				chunkId: "chunk-1",
				filePath: "Books/Chunk-1.md",
				deckIds: ["deck-1"],
				priorityEff: 8,
				intervalDays: 1,
				nextRepDate: 0,
				scheduleStatus: "new",
				stats: { impressions: 1, effectiveReadingTimeSec: 1200 },
				meta: {},
			} as any,
			"chunk-2": {
				chunkId: "chunk-2",
				filePath: "Books/Chunk-2.md",
				deckIds: ["deck-1"],
				priorityEff: 7,
				intervalDays: 1,
				nextRepDate: 0,
				scheduleStatus: "new",
				stats: { impressions: 1, effectiveReadingTimeSec: 1200 },
				meta: {},
			} as any,
			"chunk-3": {
				chunkId: "chunk-3",
				filePath: "Books/Chunk-3.md",
				deckIds: ["deck-1"],
				priorityEff: 6,
				intervalDays: 1,
				nextRepDate: 0,
				scheduleStatus: "new",
				stats: { impressions: 1, effectiveReadingTimeSec: 1200 },
				meta: {},
			} as any,
		});
		vi.spyOn(IRPdfBookmarkTaskService.prototype, "getAllTasks").mockResolvedValue([]);

		const kernel = new IRScheduleKernel({
			plugins: {
				getPlugin: () => null,
			},
		} as any);

		const shortPlan = await kernel.recomputeScheduleForDeck("ui_refresh", {
			deckIds: ["deck-1"],
			horizonDays: 1,
		});
		const longPlan = await kernel.recomputeScheduleForDeck("ui_refresh", {
			deckIds: ["deck-1"],
			horizonDays: 3,
		});

		expect(chunkSpy).toHaveBeenCalledTimes(2);
		expect(shortPlan.days).toHaveLength(1);
		expect(longPlan.days.length).toBeGreaterThan(1);
		expect(kernel.getCachedSchedule({ deckIds: ["deck-1"], horizonDays: 1 })?.generatedAt).toBe(
			shortPlan.generatedAt
		);
		expect(kernel.getCachedSchedule({ deckIds: ["deck-1"], horizonDays: 3 })?.generatedAt).toBe(
			longPlan.generatedAt
		);
	});

	it("previewScheduleImpact removes items that become inactive", async () => {
		vi.spyOn(IRStorageService.prototype, "getAllChunkDataWithSync").mockResolvedValue({
			"chunk-1": {
				chunkId: "chunk-1",
				filePath: "Books/Chunk.md",
				deckIds: ["deck-1"],
				priorityEff: 5,
				intervalDays: 1,
				nextRepDate: 0,
				scheduleStatus: "new",
				stats: {},
				meta: {},
			} as any,
		});
		vi.spyOn(IRPdfBookmarkTaskService.prototype, "getAllTasks").mockResolvedValue([]);

		const kernel = new IRScheduleKernel({
			plugins: {
				getPlugin: () => null,
			},
		} as any);

		const preview = await kernel.previewScheduleImpact(
			{
				itemId: "chunk-1",
				scheduleStatus: "removed",
			},
			{ deckIds: ["deck-1"] }
		);

		expect(preview.beforeItem?.id).toBe("chunk-1");
		expect(preview.afterItem).toBeUndefined();
	});

	it("previewScheduleImpact can re-enter a suspended item into the future plan", async () => {
		const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
		vi.spyOn(IRStorageService.prototype, "getAllChunkDataWithSync").mockResolvedValue({
			"chunk-1": {
				chunkId: "chunk-1",
				filePath: "Books/Chunk.md",
				deckIds: ["deck-1"],
				priorityUi: 7,
				priorityEff: 6,
				intervalDays: 2,
				nextRepDate: tomorrow,
				scheduleStatus: "suspended",
				stats: {},
				meta: {},
			} as any,
		});
		vi.spyOn(IRPdfBookmarkTaskService.prototype, "getAllTasks").mockResolvedValue([]);

		const kernel = new IRScheduleKernel({
			plugins: {
				getPlugin: () => null,
			},
		} as any);

		const preview = await kernel.previewScheduleImpact(
			{
				itemId: "chunk-1",
				scheduleStatus: "queued",
				nextRepDate: tomorrow,
				intervalDays: 2,
				manualPriority: 7,
				effectivePriority: 6,
			},
			{ deckIds: ["deck-1"] }
		);

		expect(preview.beforeItem).toBeUndefined();
		expect(preview.afterItem?.id).toBe("chunk-1");
		expect(preview.afterItem?.scheduleStatus).toBe("queued");
	});
});
