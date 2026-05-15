import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getV2Paths } from "../../../config/paths";
import { IRAnalyticsService } from "../IRAnalyticsService";
import { IRMonitoringService } from "../IRMonitoringService";
import { IRPointStorageService } from "../IRPointStorageService";
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

vi.mock("../IRProjectedScheduleSummary", () => ({
	getProjectedScheduleSummary: vi.fn(async () => ({
		schedule: {
			generatedAt: 1,
			version: 1,
			deckIds: ["deck-1"],
			days: [],
			itemsByDate: new Map(),
			triggerReason: "ui_refresh",
		},
		dayLoadsByDate: new Map(),
		dayLoadsByDeckId: new Map(),
	})),
	buildProjectedDayLoadMap: vi.fn(() => new Map()),
}));

async function seedMigratedBookmarkPoints(app: any) {
	const pointStorage = new IRPointStorageService(app);
	const createdAt = Date.parse("2026-04-16T09:00:00.000Z");
	const updatedAt = Date.parse("2026-04-17T09:00:00.000Z");

	await pointStorage.syncLegacyPoint({
		id: "pdfbm-analytics-1",
		topicId: "deck-1",
		title: "PDF 分析点",
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
		sourcePath: "Books/Analytics.pdf",
		locatorType: "pdf-selection",
		locator: {
			pdfPath: "Books/Analytics.pdf",
			link: "obsidian://analytics-pdf",
			annotationId: "ann-analytics",
		},
		linkedNotePaths: ["Notes/Analytics PDF.md"],
		explicitTagGroupId: "research",
		stats: {
			impressions: 4,
			extracts: 2,
			cardsCreated: 1,
			notesWritten: 1,
			totalReadingTimeSec: 120,
			lastInteractionAt: updatedAt,
		},
	});

	await pointStorage.syncLegacyPoint({
		id: "epubbm-analytics-1",
		topicId: "deck-1",
		title: "EPUB 分析点",
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
		materialId: "epub-analytics-source-1",
		sourcePath: "Books/Analytics.epub",
		locatorType: "epub-chapter",
		locator: {
			tocHref: "chapter-analytics.xhtml",
			tocLevel: 1,
			resumeCfi: "epubcfi(/6/8)",
		},
		linkedNotePaths: ["Notes/Analytics EPUB.md"],
		explicitTagGroupId: "longform",
		stats: {
			impressions: 3,
			extracts: 3,
			cardsCreated: 2,
			notesWritten: 1,
			totalReadingTimeSec: 90,
			lastInteractionAt: updatedAt,
		},
	});
}

describe("IRAnalyticsService migrated point compatibility", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-17T09:00:00.000Z"));
		vi.restoreAllMocks();
		vi.spyOn(IRStorageService.prototype, "initialize").mockResolvedValue(undefined);
		vi.spyOn(IRStorageService.prototype, "getAllSources").mockResolvedValue({});
		vi.spyOn(IRStorageService.prototype, "getAllChunkDataWithSync").mockResolvedValue({});
		vi.spyOn(IRStorageService.prototype, "getAllBlocks").mockResolvedValue({});
		vi.spyOn(IRStorageService.prototype, "getHistory").mockResolvedValue({ sessions: [] } as any);
		vi.spyOn(IRStorageService.prototype, "getAllDecks").mockResolvedValue({
			"deck-1": {
				id: "deck-1",
				name: "专题一",
				path: "deck-1",
				blockIds: [],
			} as any,
		});
		vi.spyOn(IRMonitoringService.prototype, "load").mockResolvedValue(undefined);
		vi.spyOn(IRMonitoringService.prototype, "getSummaryReport").mockReturnValue({
			today: null,
			weeklyAvg: {
				readingMinutes: 0,
				scheduledCount: 0,
				completedCount: 0,
			},
		} as any);
		vi.spyOn(IRMonitoringService.prototype, "getDecisionCalibrationSummary").mockReturnValue({
			linkedOutcomeRate: 0,
		} as any);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("builds analytics snapshot from point-only migrated bookmark tasks", async () => {
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

		const service = new IRAnalyticsService(app);
		const snapshot = await service.getSnapshot({
			mode: "overall",
			days: 14,
		});

		expect(snapshot.overview).toMatchObject({
			totalItems: 2,
			activeItems: 2,
			dueToday: 2,
			actionCardsCreated: 3,
			actionExtracts: 5,
			actionNotesWritten: 2,
		});
		expect(snapshot.sourceBreakdown).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					label: "PDF 分析点",
					sourceKind: "pdf",
					itemCount: 1,
					activeCount: 1,
					notesWritten: 1,
				}),
				expect.objectContaining({
					label: "EPUB 分析点",
					sourceKind: "epub",
					itemCount: 1,
					activeCount: 1,
					notesWritten: 1,
				}),
			])
		);
		expect(snapshot.monitoringSummary).toMatchObject({
			dailyReadingMinutes: 0,
			dailyScheduled: 0,
			dailyCompleted: 0,
			linkedOutcomeRate: 0,
		});
	});

	it("prefers chunk-level associated note paths in analytics even when no material-level note exists", async () => {
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

		vi.spyOn(IRStorageService.prototype, "getAllSources").mockResolvedValue({
			"src-1": {
				sourceId: "src-1",
				originalPath: "Notes/Source.md",
				title: "Chunk Source",
			} as any,
		});
		vi.spyOn(IRStorageService.prototype, "getAllChunkDataWithSync").mockResolvedValue({
			"chunk-analytics-1": {
				chunkId: "chunk-analytics-1",
				sourceId: "src-1",
				filePath: "IR/Chunks/chunk-analytics-1.md",
				topicIds: ["deck-1"],
				deckIds: ["deck-1"],
				scheduleStatus: "active",
				priorityUi: 5,
				priorityEff: 5,
				intervalDays: 2,
				nextRepDate: 0,
				createdAt: Date.parse("2026-04-16T09:00:00.000Z"),
				updatedAt: Date.parse("2026-04-17T09:00:00.000Z"),
				stats: {
					impressions: 1,
					extracts: 0,
					cardsCreated: 0,
					notesWritten: 1,
					totalReadingTimeSec: 30,
					lastInteraction: Date.parse("2026-04-17T09:00:00.000Z"),
				},
				meta: {
					associatedNotePaths: ["Notes/Chunk Linked"],
				},
			} as any,
		});

		const service = new IRAnalyticsService(app);
		const snapshot = await service.getSnapshot({
			mode: "overall",
			days: 14,
		});

		expect(snapshot.sourceBreakdown).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					label: "Chunk Source",
					sourceKind: "markdown",
					notesWritten: 1,
				}),
			])
		);
	});

	it("counts multiple chunk-level associated note paths in analytics overview and source breakdown", async () => {
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

		vi.spyOn(IRStorageService.prototype, "getAllSources").mockResolvedValue({
			"src-1": {
				sourceId: "src-1",
				originalPath: "Notes/Source.md",
				title: "Chunk Source",
			} as any,
		});
		vi.spyOn(IRStorageService.prototype, "getAllChunkDataWithSync").mockResolvedValue({
			"chunk-analytics-2": {
				chunkId: "chunk-analytics-2",
				sourceId: "src-1",
				filePath: "IR/Chunks/chunk-analytics-2.md",
				topicIds: ["deck-1"],
				deckIds: ["deck-1"],
				scheduleStatus: "active",
				priorityUi: 5,
				priorityEff: 5,
				intervalDays: 2,
				nextRepDate: 0,
				createdAt: Date.parse("2026-04-16T09:00:00.000Z"),
				updatedAt: Date.parse("2026-04-17T09:00:00.000Z"),
				stats: {
					impressions: 1,
					extracts: 0,
					cardsCreated: 0,
					notesWritten: 2,
					totalReadingTimeSec: 30,
					lastInteraction: Date.parse("2026-04-17T09:00:00.000Z"),
				},
				meta: {
					associatedNotePaths: ["Notes/Chunk Linked", "Notes/Chunk Linked.md", "Notes/Appendix.md"],
				},
			} as any,
		});

		const service = new IRAnalyticsService(app);
		const snapshot = await service.getSnapshot({
			mode: "overall",
			days: 14,
		});

		expect(snapshot.overview).toMatchObject({
			notesWritten: 2,
			actionNotesWritten: 2,
		});
		expect(snapshot.sourceBreakdown).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					label: "Chunk Source",
					sourceKind: "markdown",
					notesWritten: 2,
				}),
			])
		);
	});
});
