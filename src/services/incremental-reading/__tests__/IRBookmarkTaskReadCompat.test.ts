import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getV2Paths } from "../../../config/paths";
import { IREpubBookmarkTaskService } from "../IREpubBookmarkTaskService";
import { IRPdfBookmarkTaskService } from "../IRPdfBookmarkTaskService";
import { IRPointStorageService } from "../IRPointStorageService";

vi.mock("obsidian", () => ({
	normalizePath: (path: string) => path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, ""),
}));

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
		},
		plugins: {
			getPlugin: vi.fn(() => ({
				settings: { weaveParentFolder: "" },
			})),
		},
	} as any;

	return { app, files };
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-04-17T09:00:00.000Z"));
});

afterEach(() => {
	vi.useRealTimers();
});

describe("Bookmark task services prefer IRPoint storage reads", () => {
	it("PDF task service returns migrated point data before legacy task content", async () => {
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
						title: "旧标题",
						link: "obsidian://legacy",
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
						pdfPath: "Docs/OnlyLegacy.pdf",
						title: "旧任务保留",
						link: "obsidian://legacy-only",
						status: "queued",
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
		});

		const pointStorage = new IRPointStorageService(app);
		await pointStorage.syncLegacyPoint({
			id: "pdfbm-1",
			topicId: "topic-1",
			title: "新点标题",
			tags: ["focus"],
			status: "active",
			priorityUi: 7,
			priorityEff: 8,
			intervalDays: 5,
			nextRepDate: 1713348000000,
			createdAt: 1713261600000,
			updatedAt: 1713348000000,
			lastInteractionAt: 1713348000000,
			sourceType: "pdf-bookmark",
			sourcePath: "Docs/New.pdf",
			locatorType: "pdf-selection",
			locator: {
				pdfPath: "Docs/New.pdf",
				link: "obsidian://new",
				annotationId: "ann-1",
			},
			linkedNotePaths: ["Notes/A.md"],
			explicitTagGroupId: "group-a",
			stats: {
				impressions: 4,
				extracts: 2,
				cardsCreated: 1,
				notesWritten: 1,
				totalReadingTimeSec: 120,
				lastInteractionAt: 1713348000000,
			},
		});

		const service = new IRPdfBookmarkTaskService(app);
		const task = await service.getTask("pdfbm-1");
		const allTasks = await service.getAllTasks();

		expect(task).toMatchObject({
			id: "pdfbm-1",
			title: "新点标题",
			pdfPath: "Docs/New.pdf",
			link: "obsidian://new",
			annotationId: "ann-1",
			status: "active",
			priorityUi: 7,
			priorityEff: 8,
			tags: ["focus"],
			favorite: false,
			meta: expect.objectContaining({
				tagGroup: "group-a",
				associatedNotePath: "Notes/A.md",
			}),
			stats: expect.objectContaining({
				impressions: 4,
				totalReadingTimeSec: 120,
				extracts: 2,
				cardsCreated: 1,
			}),
		});
		expect(allTasks.map((entry) => entry.id).sort()).toEqual(["pdfbm-1", "pdfbm-legacy-only"]);
	});

	it("PDF task service can delete point-only migrated tasks even when legacy store is missing", async () => {
		const v2Paths = getV2Paths("");
		const { app } = createMemoryApp({
			[v2Paths.ir.legacyTopics]: JSON.stringify({
				topics: {
					"topic-1": { name: "专题一" },
				},
			}),
		});

		const pointStorage = new IRPointStorageService(app);
		await pointStorage.syncLegacyPoint({
			id: "pdfbm-point-only",
			topicId: "topic-1",
			title: "仅新点 PDF",
			tags: [],
			status: "active",
			priorityUi: 5,
			priorityEff: 5,
			intervalDays: 1,
			nextRepDate: 0,
			createdAt: 1713261600000,
			updatedAt: 1713348000000,
			lastInteractionAt: 1713348000000,
			sourceType: "pdf-bookmark",
			sourcePath: "Docs/PointOnly.pdf",
			locatorType: "pdf-selection",
			locator: {
				pdfPath: "Docs/PointOnly.pdf",
				link: "obsidian://point-only",
			},
		});

		const service = new IRPdfBookmarkTaskService(app);
		expect(await service.getTask("pdfbm-point-only")).not.toBeNull();

		const deleted = await service.deleteTask("pdfbm-point-only");

		expect(deleted).toBe(true);
		expect(await service.getTask("pdfbm-point-only")).toBeNull();
		expect(await pointStorage.getPointSnapshotById("pdfbm-point-only")).toBeNull();
	});

	it("PDF task service can update point-only migrated tasks and sync changes back to point storage", async () => {
		const v2Paths = getV2Paths("");
		const { app } = createMemoryApp({
			[v2Paths.ir.legacyTopics]: JSON.stringify({
				topics: {
					"topic-1": { name: "专题一" },
				},
			}),
		});

		const pointStorage = new IRPointStorageService(app);
		await pointStorage.syncLegacyPoint({
			id: "pdfbm-point-update",
			topicId: "topic-1",
			title: "旧标题",
			tags: ["legacy"],
			status: "active",
			priorityUi: 5,
			priorityEff: 5,
			intervalDays: 1,
			nextRepDate: 0,
			createdAt: 1713261600000,
			updatedAt: 1713348000000,
			lastInteractionAt: 1713348000000,
			sourceType: "pdf-bookmark",
			sourcePath: "Docs/UpdateOnly.pdf",
			locatorType: "pdf-selection",
			locator: {
				pdfPath: "Docs/UpdateOnly.pdf",
				link: "obsidian://point-update",
			},
			linkedNotePaths: ["Notes/Before.md"],
		});

		const service = new IRPdfBookmarkTaskService(app);
		const updated = await service.updateTask("pdfbm-point-update", {
			title: "新标题",
			meta: {
				associatedNotePath: "Notes/After.md",
				associatedNotePaths: ["Notes/After.md"],
			} as any,
		});

		expect(updated).toMatchObject({
			id: "pdfbm-point-update",
			title: "新标题",
			pdfPath: "Docs/UpdateOnly.pdf",
			meta: expect.objectContaining({
				associatedNotePath: "Notes/After.md",
			}),
		});
		expect((await service.getTask("pdfbm-point-update"))?.title).toBe("新标题");
		expect((await pointStorage.getPointSnapshotById("pdfbm-point-update"))?.point.userData.title).toBe("新标题");
		expect((await pointStorage.getPointSnapshotById("pdfbm-point-update"))?.point.relations.linkedNotePaths).toEqual([
			"Notes/After.md",
			"Notes/Before.md",
		]);
	});

	it("EPUB task service returns migrated point data and keeps EPUB lookup working", async () => {
		const v2Paths = getV2Paths("");
		const { app } = createMemoryApp({
			[v2Paths.ir.legacyTopics]: JSON.stringify({
				topics: {
					"topic-2": { name: "专题二" },
				},
			}),
			[v2Paths.ir.epubBookmarkTasks]: JSON.stringify({
				version: 1,
				tasks: {
					"epubbm-1": {
						id: "epubbm-1",
						topicId: "topic-2",
						deckId: "topic-2",
						sourceId: "legacy-src",
						epubFilePath: "Books/Legacy.epub",
						title: "旧章节",
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
			id: "epubbm-1",
			topicId: "topic-2",
			title: "新章节",
			tags: ["epub"],
			status: "queued",
			priorityUi: 6,
			priorityEff: 6,
			intervalDays: 3,
			nextRepDate: 1713348000000,
			createdAt: 1713261600000,
			updatedAt: 1713348000000,
			lastInteractionAt: 1713348000000,
			sourceType: "epub-bookmark",
			materialId: "book-src-1",
			sourcePath: "Books/New.epub",
			locatorType: "epub-chapter",
			locator: {
				tocHref: "chapter-1.xhtml",
				tocLevel: 1,
				resumeCfi: "epubcfi(/6/4)",
			},
			linkedNotePaths: ["Notes/Chapter.md"],
			explicitTagGroupId: "group-epub",
			stats: {
				impressions: 5,
				totalReadingTimeSec: 90,
				lastInteractionAt: 1713348000000,
			},
		});

		const service = new IREpubBookmarkTaskService(app);
		const task = await service.getTask("epubbm-1");
		const byEpub = await service.getTasksByEpub("Books/New.epub");

		expect(task).toMatchObject({
			id: "epubbm-1",
			title: "新章节",
			sourceId: "book-src-1",
			epubFilePath: "Books/New.epub",
			tocHref: "chapter-1.xhtml",
			tocLevel: 1,
			resumeCfi: "epubcfi(/6/4)",
			status: "queued",
			priorityUi: 6,
			priorityEff: 6,
			tags: ["epub"],
			meta: expect.objectContaining({
				tagGroup: "group-epub",
				associatedNotePath: "Notes/Chapter.md",
			}),
			stats: expect.objectContaining({
				impressions: 5,
				totalReadingTimeSec: 90,
			}),
		});
		expect(byEpub.map((entry) => entry.id)).toEqual(["epubbm-1"]);
	});

	it("EPUB task service can batch delete point-only migrated tasks by deck identifiers", async () => {
		const v2Paths = getV2Paths("");
		const { app } = createMemoryApp({
			[v2Paths.ir.legacyTopics]: JSON.stringify({
				topics: {
					"topic-2": { name: "专题二" },
				},
			}),
		});

		const pointStorage = new IRPointStorageService(app);
		await pointStorage.syncLegacyPoint({
			id: "epubbm-point-only",
			topicId: "topic-2",
			title: "仅新点 EPUB",
			tags: [],
			status: "queued",
			priorityUi: 5,
			priorityEff: 5,
			intervalDays: 1,
			nextRepDate: 0,
			createdAt: 1713261600000,
			updatedAt: 1713348000000,
			lastInteractionAt: 1713348000000,
			sourceType: "epub-bookmark",
			materialId: "epub-source-only",
			sourcePath: "Books/PointOnly.epub",
			locatorType: "epub-chapter",
			locator: {
				tocHref: "chapter.xhtml",
				tocLevel: 0,
				resumeCfi: "epubcfi(/6/4)",
			},
		});

		const service = new IREpubBookmarkTaskService(app);
		expect(await service.getTask("epubbm-point-only")).not.toBeNull();

		const deletedCount = await service.deleteTasksByDeckIdentifiers(["topic-2"]);

		expect(deletedCount).toBe(1);
		expect(await service.getTask("epubbm-point-only")).toBeNull();
		expect(await pointStorage.getPointSnapshotById("epubbm-point-only")).toBeNull();
	});

	it("EPUB task service can update resume point for point-only migrated tasks", async () => {
		const v2Paths = getV2Paths("");
		const { app } = createMemoryApp({
			[v2Paths.ir.legacyTopics]: JSON.stringify({
				topics: {
					"topic-2": { name: "专题二" },
				},
			}),
		});

		const pointStorage = new IRPointStorageService(app);
		await pointStorage.syncLegacyPoint({
			id: "epubbm-point-resume",
			topicId: "topic-2",
			title: "续读点 EPUB",
			tags: [],
			status: "queued",
			priorityUi: 5,
			priorityEff: 5,
			intervalDays: 1,
			nextRepDate: 0,
			createdAt: 1713261600000,
			updatedAt: 1713348000000,
			lastInteractionAt: 1713348000000,
			sourceType: "epub-bookmark",
			materialId: "epub-source-resume",
			sourcePath: "Books/ResumeOnly.epub",
			locatorType: "epub-chapter",
			locator: {
				tocHref: "chapter.xhtml",
				tocLevel: 0,
				resumeCfi: "epubcfi(/6/2)",
			},
		});

		const service = new IREpubBookmarkTaskService(app);
		await service.setResumePoint("epubbm-point-resume", "epubcfi(/6/8)");

		expect((await service.getTask("epubbm-point-resume"))?.resumeCfi).toBe("epubcfi(/6/8)");
		expect(
			(await pointStorage.getPointSnapshotById("epubbm-point-resume"))?.point.trace.locator.resumeCfi
		).toBe("epubcfi(/6/8)");
	});
});
