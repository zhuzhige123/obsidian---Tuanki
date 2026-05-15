import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getV2Paths } from "../../../config/paths";
import { IRPointStorageService } from "../IRPointStorageService";
import { IRScheduleKernel } from "../IRScheduleKernel";
import { IRStorageService } from "../IRStorageService";
import { createMemoryApp } from "./testMemoryApp";

vi.mock("../../epub/EpubStorageService", () => ({
	EpubStorageService: class {
		async ensureSourceIdentity(filePath: string, options?: { preferredSourceId?: string }) {
			return {
				sourceId: options?.preferredSourceId || `src-${filePath}`,
				filePath,
			};
		}

		async resolveSourceFilePath(sourceId: string, fallbackPath?: string) {
			return fallbackPath || sourceId;
		}
	},
}));

async function seedMigratedBookmarkPoints(app: any) {
	const pointStorage = new IRPointStorageService(app);
	const createdAt = Date.parse("2026-04-16T09:00:00.000Z");
	const updatedAt = Date.parse("2026-04-17T09:00:00.000Z");

	await pointStorage.syncLegacyPoint({
		id: "pdfbm-1",
		topicId: "deck-1",
		title: "PDF 新点",
		tags: ["focus"],
		status: "active",
		priorityUi: 7,
		priorityEff: 8,
		intervalDays: 4,
		nextRepDate: 0,
		createdAt,
		updatedAt,
		lastInteractionAt: updatedAt,
		sourceType: "pdf-bookmark",
		sourcePath: "Books/Schedule.pdf",
		locatorType: "pdf-selection",
		locator: {
			pdfPath: "Books/Schedule.pdf",
			link: "obsidian://pdf-schedule",
			annotationId: "ann-1",
		},
		linkedNotePaths: ["Notes/PDF.md"],
		explicitTagGroupId: "research",
		stats: {
			impressions: 4,
			extracts: 1,
			cardsCreated: 1,
			notesWritten: 1,
			totalReadingTimeSec: 120,
			lastInteractionAt: updatedAt,
		},
	});

	await pointStorage.syncLegacyPoint({
		id: "epubbm-1",
		topicId: "deck-1",
		title: "EPUB 新点",
		tags: ["book"],
		status: "queued",
		priorityUi: 6,
		priorityEff: 6,
		intervalDays: 3,
		nextRepDate: 0,
		createdAt,
		updatedAt,
		lastInteractionAt: updatedAt,
		sourceType: "epub-bookmark",
		materialId: "epub-source-1",
		sourcePath: "Books/Schedule.epub",
		locatorType: "epub-chapter",
		locator: {
			tocHref: "chapter-1.xhtml",
			tocLevel: 1,
			resumeCfi: "epubcfi(/6/4)",
		},
		linkedNotePaths: ["Notes/EPUB.md"],
		explicitTagGroupId: "longform",
		stats: {
			impressions: 3,
			totalReadingTimeSec: 90,
			lastInteractionAt: updatedAt,
		},
	});
}

describe("IRScheduleKernel migrated point compatibility", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-17T09:00:00.000Z"));
		vi.restoreAllMocks();
		vi.spyOn(IRStorageService.prototype, "initialize").mockResolvedValue(undefined);
		vi.spyOn(IRStorageService.prototype, "getAllDecks").mockResolvedValue({
			"deck-1": {
				id: "deck-1",
				name: "专题一",
				path: "deck-1",
				blockIds: [],
			} as any,
		});
		vi.spyOn(IRStorageService.prototype, "getAllChunkDataWithSync").mockResolvedValue({});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("recomputes deck schedule from point-only migrated bookmark tasks", async () => {
		const v2Paths = getV2Paths("");
		const { app } = createMemoryApp({
			initialFiles: {
				[v2Paths.ir.legacyTopics]: JSON.stringify({
					topics: {
						"deck-1": { name: "专题一" },
					},
				}),
			},
			weavePlugin: {
				dataStorage: {
					getAllCards: vi.fn(async () => []),
				},
				readingMaterialManager: {
					getAllMaterials: vi.fn(async () => []),
				},
			},
		});
		await seedMigratedBookmarkPoints(app);

		const kernel = new IRScheduleKernel(app);
		const plan = await kernel.recomputeScheduleForDeck("ui_refresh", {
			deckIds: ["deck-1"],
			horizonDays: 7,
		});
		const items = plan.days.flatMap((day) => day.items);
		const pdfItem = items.find((item) => item.id === "pdfbm-1");
		const epubItem = items.find((item) => item.id === "epubbm-1");

		expect(plan.deckIds).toEqual(["deck-1"]);
		expect(items.map((item) => item.id).sort()).toEqual(["epubbm-1", "pdfbm-1"]);
		expect(pdfItem).toMatchObject({
			id: "pdfbm-1",
			deckId: "deck-1",
			sourceType: "pdf",
			sourceFile: "Books/Schedule.pdf",
			resumeLink: "obsidian://pdf-schedule",
			associatedNotePath: "Notes/PDF.md",
		});
		expect(epubItem).toMatchObject({
			id: "epubbm-1",
			deckId: "deck-1",
			sourceType: "epub",
			sourceFile: "Books/Schedule.epub",
			associatedNotePath: "Notes/EPUB.md",
		});
	});

	it("prefers point-level associatedNotePaths arrays over material fallback in schedule items", async () => {
		const v2Paths = getV2Paths("");
		vi.spyOn(IRStorageService.prototype, "getAllChunkDataWithSync").mockResolvedValue({
			"chunk-array-only": {
				chunkId: "chunk-array-only",
				filePath: "Books/Chunk.md",
				deckIds: ["deck-1"],
				priorityUi: 5,
				priorityEff: 5,
				intervalDays: 1,
				nextRepDate: 0,
				scheduleStatus: "queued",
				meta: {
					associatedNotePaths: ["Notes/Point", "Notes/Point.md", "Notes/Appendix.md"],
				},
				stats: {
					impressions: 1,
					effectiveReadingTimeSec: 60,
				},
			} as any,
		});

		const { app } = createMemoryApp({
			initialFiles: {
				[v2Paths.ir.legacyTopics]: JSON.stringify({
					topics: {
						"deck-1": { name: "专题一" },
					},
				}),
			},
			weavePlugin: {
				dataStorage: {
					getAllCards: vi.fn(async () => []),
				},
				readingMaterialManager: {
					getAllMaterials: vi.fn(async () => [
						{
							uuid: "mat-1",
							filePath: "Books/Chunk.md",
							associatedNotePath: "Notes/Material.md",
						},
					]),
				},
			},
		});

		const kernel = new IRScheduleKernel(app);
		const plan = await kernel.recomputeScheduleForDeck("ui_refresh", {
			deckIds: ["deck-1"],
			horizonDays: 7,
		});
		const item = plan.days.flatMap((day) => day.items).find((entry) => entry.id === "chunk-array-only");

		expect(item).toMatchObject({
			id: "chunk-array-only",
			associatedNotePath: "Notes/Point.md",
			associatedNoteScope: "point",
		});
	});

	it("previewScheduleImpact can resolve point-only migrated items by id", async () => {
		const v2Paths = getV2Paths("");
		const { app } = createMemoryApp({
			initialFiles: {
				[v2Paths.ir.legacyTopics]: JSON.stringify({
					topics: {
						"deck-1": { name: "专题一" },
					},
				}),
			},
			weavePlugin: {
				dataStorage: {
					getAllCards: vi.fn(async () => []),
				},
				readingMaterialManager: {
					getAllMaterials: vi.fn(async () => []),
				},
			},
		});
		await seedMigratedBookmarkPoints(app);

		const kernel = new IRScheduleKernel(app);
		const preview = await kernel.previewScheduleImpact(
			{
				itemId: "pdfbm-1",
				scheduleStatus: "removed",
			},
			{
				deckIds: ["deck-1"],
				horizonDays: 7,
			}
		);

		expect(preview.beforeItem).toMatchObject({
			id: "pdfbm-1",
			sourceFile: "Books/Schedule.pdf",
			resumeLink: "obsidian://pdf-schedule",
		});
		expect(preview.afterItem).toBeUndefined();
	});
});
