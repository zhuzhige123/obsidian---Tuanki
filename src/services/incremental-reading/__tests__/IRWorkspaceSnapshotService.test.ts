import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getV2Paths } from "../../../config/paths";

vi.mock("obsidian", () => {
	class TFile {
		path: string;

		constructor(path: string) {
			this.path = path;
		}
	}

	return {
		TFile,
		normalizePath: (path: string) => path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, ""),
	};
});

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
			deckIds: ["topic-1"],
			days: [],
			itemsByDate: new Map(),
			triggerReason: "ui_refresh",
		},
		dayLoadsByDate: new Map(),
		dayLoadsByDeckId: new Map(),
	})),
	getProjectedDayLoad: vi.fn(() => ({
		dateKey: "2026-04-17",
		items: [],
		totalEstimatedMinutes: 0,
	})),
}));

import { IRStorageService } from "../IRStorageService";
import { IRPointStorageService } from "../IRPointStorageService";
import { IRWorkspaceSnapshotService } from "../IRWorkspaceSnapshotService";

function normalizeTestPath(path: string): string {
	return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
}

function parentPath(path: string): string {
	const normalized = normalizeTestPath(path);
	const idx = normalized.lastIndexOf("/");
	return idx > 0 ? normalized.slice(0, idx) : "";
}

function createMemoryApp(initialFiles: Record<string, string> = {}, initialDirs: string[] = []) {
	const files = new Map<string, string>();
	const folders = new Set<string>(["", ".obsidian", ".obsidian/plugins", ".obsidian/plugins/weave"]);

	const ensureDir = (dir: string) => {
		const normalized = normalizeTestPath(dir);
		if (!normalized) return;
		const parts = normalized.split("/");
		let current = "";
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			folders.add(current);
		}
	};

	const writeText = (path: string, content: string) => {
		const normalized = normalizeTestPath(path);
		ensureDir(parentPath(normalized));
		files.set(normalized, content);
	};

	for (const [path, content] of Object.entries(initialFiles)) {
		writeText(path, content);
	}

	for (const dir of initialDirs) {
		ensureDir(dir);
	}

	const adapter = {
		exists: vi.fn(async (path: string) => {
			const normalized = normalizeTestPath(path);
			return files.has(normalized) || folders.has(normalized);
		}),
		mkdir: vi.fn(async (path: string) => {
			ensureDir(path);
		}),
		list: vi.fn(async (dir: string) => {
			const normalized = normalizeTestPath(dir);
			const prefix = normalized ? `${normalized}/` : "";
			const childFolders = new Set<string>();
			const childFiles: string[] = [];

			for (const folder of folders) {
				if (!folder || folder === normalized || !folder.startsWith(prefix)) continue;
				const rest = folder.slice(prefix.length);
				if (!rest || rest.includes("/")) continue;
				childFolders.add(folder);
			}

			for (const file of files.keys()) {
				if (!file.startsWith(prefix)) continue;
				const rest = file.slice(prefix.length);
				if (!rest || rest.includes("/")) continue;
				childFiles.push(file);
			}

			return {
				files: childFiles.sort(),
				folders: Array.from(childFolders).sort(),
			};
		}),
		read: vi.fn(async (path: string) => {
			const normalized = normalizeTestPath(path);
			const value = files.get(normalized);
			if (value === undefined) {
				throw new Error(`File not found: ${normalized}`);
			}
			return value;
		}),
		write: vi.fn(async (path: string, content: string) => {
			writeText(path, content);
		}),
		remove: vi.fn(async (path: string) => {
			files.delete(normalizeTestPath(path));
		}),
	};

	const app = {
		vault: {
			configDir: ".obsidian",
			adapter,
			getAbstractFileByPath: vi.fn(() => null),
			read: vi.fn(async () => ""),
		},
		metadataCache: {
			getFileCache: vi.fn(() => null),
		},
		plugins: {
			getPlugin: vi.fn(() => ({
				settings: { weaveParentFolder: "" },
			})),
		},
	} as any;

	return { app };
}

describe("IRWorkspaceSnapshotService", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-17T09:00:00.000Z"));
		vi.restoreAllMocks();
		vi.spyOn(IRStorageService.prototype, "initialize").mockResolvedValue(undefined);
		vi.spyOn(IRStorageService.prototype, "getAllDecks").mockResolvedValue({
			"topic-1": {
				id: "topic-1",
				name: "专题一",
				path: "topic-1",
				blockIds: [],
			} as any,
		});
		vi.spyOn(IRStorageService.prototype, "getAllBlocks").mockResolvedValue({});
		vi.spyOn(IRStorageService.prototype, "getAllChunkData").mockResolvedValue({});
		vi.spyOn(IRStorageService.prototype, "getAllSources").mockResolvedValue({});
		vi.spyOn(IRStorageService.prototype, "getHistory").mockResolvedValue({ sessions: [] });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("builds workspace snapshot and deck overview from migrated points first, with legacy fallback kept", async () => {
		const v2Paths = getV2Paths("");
		const { app } = createMemoryApp({
			[v2Paths.ir.legacyTopics]: JSON.stringify({
				topics: {
					"topic-1": { name: "专题一" },
				},
			}),
			[v2Paths.ir.pdfBookmarkTasks]: JSON.stringify({
				version: 1,
				tasks: {
					"pdfbm-1": {
						id: "pdfbm-1",
						topicId: "topic-1",
						deckId: "topic-1",
						pdfPath: "Docs/Legacy.pdf",
						title: "旧 PDF",
						link: "obsidian://legacy-pdf",
						status: "new",
						priorityUi: 1,
						priorityEff: 1,
						intervalDays: 1,
						nextRepDate: 0,
						stats: {
							impressions: 0,
							totalReadingTimeSec: 0,
							effectiveReadingTimeSec: 0,
							extracts: 0,
							cardsCreated: 0,
							notesWritten: 0,
							lastInteraction: 0,
							lastShownAt: 0,
						},
						meta: {
							priorityLog: [],
							siblings: { prev: null, next: null },
							tagGroup: "default",
						},
						tags: [],
						createdAt: 1713261600000,
						updatedAt: 1713261600000,
					},
					"pdfbm-legacy-only": {
						id: "pdfbm-legacy-only",
						topicId: "topic-1",
						deckId: "topic-1",
						pdfPath: "Docs/LegacyOnly.pdf",
						title: "仅旧 PDF",
						link: "obsidian://legacy-only",
						status: "new",
						priorityUi: 3,
						priorityEff: 3,
						intervalDays: 2,
						nextRepDate: 1713261600000,
						stats: {
							impressions: 1,
							totalReadingTimeSec: 10,
							effectiveReadingTimeSec: 10,
							extracts: 0,
							cardsCreated: 0,
							notesWritten: 0,
							lastInteraction: 1,
							lastShownAt: 1,
						},
						meta: {
							priorityLog: [],
							siblings: { prev: null, next: null },
							tagGroup: "default",
						},
						tags: [],
						createdAt: 1713261600000,
						updatedAt: 1713261600000,
					},
				},
			}),
			[v2Paths.ir.epubBookmarkTasks]: JSON.stringify({
				version: 1,
				tasks: {
					"epubbm-1": {
						id: "epubbm-1",
						topicId: "topic-1",
						deckId: "topic-1",
						sourceId: "legacy-src",
						epubFilePath: "Books/Legacy.epub",
						title: "旧 EPUB",
						tocHref: "old.xhtml",
						tocLevel: 0,
						status: "new",
						priorityUi: 2,
						priorityEff: 2,
						intervalDays: 1,
						nextRepDate: 0,
						stats: {
							impressions: 0,
							totalReadingTimeSec: 0,
							effectiveReadingTimeSec: 0,
							extracts: 0,
							cardsCreated: 0,
							notesWritten: 0,
							lastInteraction: 0,
							lastShownAt: 0,
						},
						meta: {
							priorityLog: [],
							siblings: { prev: null, next: null },
							tagGroup: "default",
						},
						tags: [],
						createdAt: 1713261600000,
						updatedAt: 1713261600000,
					},
				},
			}),
		});

		const pointStorage = new IRPointStorageService(app);
		await pointStorage.syncLegacyPoint({
			id: "pdfbm-1",
			topicId: "topic-1",
			title: "新 PDF",
			tags: ["focus"],
			status: "active",
			priorityUi: 7,
			priorityEff: 8,
			intervalDays: 5,
			nextRepDate: 1713348000000,
			createdAt: 1713261600000,
			updatedAt: 1713348000000,
			sourceType: "pdf-bookmark",
			sourcePath: "Docs/New.pdf",
			locatorType: "pdf-selection",
			locator: {
				pdfPath: "Docs/New.pdf",
				link: "obsidian://new-pdf",
			},
			linkedNotePaths: ["Notes/PDF.md"],
		});
		await pointStorage.syncLegacyPoint({
			id: "epubbm-1",
			topicId: "topic-1",
			title: "新 EPUB",
			tags: ["chapter"],
			status: "scheduled",
			priorityUi: 6,
			priorityEff: 6,
			intervalDays: 3,
			nextRepDate: 1713348000000,
			createdAt: 1713261600000,
			updatedAt: 1713348000000,
			sourceType: "epub-bookmark",
			materialId: "book-src-1",
			sourcePath: "Books/New.epub",
			locatorType: "epub-chapter",
			locator: {
				tocHref: "chapter-1.xhtml",
				tocLevel: 1,
				resumeCfi: "epubcfi(/6/4)",
			},
			linkedNotePaths: ["Notes/EPUB.md"],
		});

		const service = new IRWorkspaceSnapshotService(app);
		const workspaceData = await service.getWorkspaceData();
		const overview = await service.getDeckOverview();

		expect(workspaceData.pdfTasks.map((task) => task.id).sort()).toEqual([
			"pdfbm-1",
			"pdfbm-legacy-only",
		]);
		expect(workspaceData.epubTasks.map((task) => task.id)).toEqual(["epubbm-1"]);
		expect(workspaceData.pdfTasks.find((task) => task.id === "pdfbm-1")).toMatchObject({
			title: "新 PDF",
			pdfPath: "Docs/New.pdf",
			link: "obsidian://new-pdf",
			status: "active",
			priorityUi: 7,
		});
		expect(workspaceData.epubTasks[0]).toMatchObject({
			title: "新 EPUB",
			epubFilePath: "Books/New.epub",
			tocHref: "chapter-1.xhtml",
			status: "scheduled",
			priorityUi: 6,
		});

		expect(overview.deckStats["topic-1"]).toMatchObject({
			newCount: 1,
			learningCount: 1,
			reviewCount: 1,
			totalCount: 3,
			fileCount: 3,
			questionCount: 0,
			completedQuestionCount: 0,
		});
	});

	it("drops stale inflight overview results after invalidate and keeps the fresh deck list cached", async () => {
		const { app } = createMemoryApp();
		let resolveFirstDecks!: (value: Record<string, any>) => void;
		let getAllDecksCallCount = 0;

		vi.spyOn(IRStorageService.prototype, "getAllDecks").mockImplementation(async () => {
			getAllDecksCallCount += 1;
			if (getAllDecksCallCount === 1) {
				return await new Promise((resolve) => {
					resolveFirstDecks = resolve;
				});
			}

			return {
				"topic-2": {
					id: "topic-2",
					name: "专题二",
					path: "topic-2",
					blockIds: [],
				} as any,
			};
		});

		const service = new IRWorkspaceSnapshotService(app);
		const stalePromise = service.getDeckOverview();
		await Promise.resolve();
		await Promise.resolve();

		service.invalidate();

		const freshOverview = await service.getDeckOverview();
		expect(getAllDecksCallCount).toBe(2);
		expect(freshOverview.decks.map((deck) => deck.id)).toEqual(["topic-2"]);

		resolveFirstDecks({
			"topic-1": {
				id: "topic-1",
				name: "专题一",
				path: "topic-1",
				blockIds: [],
			} as any,
		});
		const staleOverview = await stalePromise;
		expect(staleOverview.decks.map((deck) => deck.id)).toEqual(["topic-1"]);

		const cachedOverview = service.getCachedDeckOverview();
		expect(cachedOverview?.decks.map((deck) => deck.id)).toEqual(["topic-2"]);
	});
});
