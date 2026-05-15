import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({
	normalizePath: (path: string) => path.replace(/\\/g, "/").replace(/\/{2,}/g, "/"),
	Platform: { isMobile: false },
	TAbstractFile: class TAbstractFile {},
	TFile: class TFile {},
}));

vi.mock("../../../config/paths", () => ({
	getReadableWeaveRoot: () => "weave",
	normalizeWeaveParentFolder: (value?: string) => value?.trim?.() || "",
	getV2Paths: () => ({
		root: "weave",
		ir: {
			root: "weave/incremental-reading",
			epub: "weave/incremental-reading/epub-reading",
			registry: "weave/incremental-reading/registry",
			pointsDir: "weave/incremental-reading/points",
			materialRecordsDir: "weave/incremental-reading/materials",
			legacyTopics: "weave/incremental-reading/topics.json",
			pdfBookmarkTasks: "weave/incremental-reading/pdf-bookmark-tasks.json",
			epubBookmarkTasks: "weave/incremental-reading/epub-bookmark-tasks.json",
			materialsIndex: "weave/incremental-reading/registry/materials-index.json",
			pointFilesIndex: "weave/incremental-reading/registry/point-files-index.json",
			scheduleProfiles: "weave/incremental-reading/registry/schedule-profiles.json",
			materials: {
				index: "weave/incremental-reading/materials/materials.json",
			},
		},
	}),
	getV2PathsFromApp: () => ({
		root: "weave",
		ir: {
			root: "weave/incremental-reading",
			epub: "weave/incremental-reading/epub-reading",
			registry: "weave/incremental-reading/registry",
			pointsDir: "weave/incremental-reading/points",
			materialRecordsDir: "weave/incremental-reading/materials",
			legacyTopics: "weave/incremental-reading/topics.json",
			pdfBookmarkTasks: "weave/incremental-reading/pdf-bookmark-tasks.json",
			epubBookmarkTasks: "weave/incremental-reading/epub-bookmark-tasks.json",
			materialsIndex: "weave/incremental-reading/registry/materials-index.json",
			pointFilesIndex: "weave/incremental-reading/registry/point-files-index.json",
			scheduleProfiles: "weave/incremental-reading/registry/schedule-profiles.json",
			materials: {
				index: "weave/incremental-reading/materials/materials.json",
			},
		},
	}),
	getPluginPaths: () => ({
		state: {
			incrementalReading: {
				root: ".obsidian/plugins/weave/data/state/incremental-reading",
				readingMaterialsRuntime:
					".obsidian/plugins/weave/data/state/incremental-reading/reading-materials-runtime.json",
				epubReaderData:
					".obsidian/plugins/weave/data/state/incremental-reading/epub-reader-data.json",
				monitoring:
					".obsidian/plugins/weave/data/state/incremental-reading/monitoring.json",
				history: ".obsidian/plugins/weave/data/state/incremental-reading/history.json",
				studySessions:
					".obsidian/plugins/weave/data/state/incremental-reading/study-sessions.json",
				calendarProgress:
					".obsidian/plugins/weave/data/state/incremental-reading/calendar-progress.json",
				readerState: ".obsidian/plugins/weave/data/state/incremental-reading/reader-state",
			},
		},
		cache: {
			incrementalReading: {
				root: ".obsidian/plugins/weave/data/cache/incremental-reading",
				documentGroupMap:
					".obsidian/plugins/weave/data/cache/incremental-reading/document-group-map.json",
				pointFilesIndex:
					".obsidian/plugins/weave/data/cache/incremental-reading/point-files-index.json",
				syncState:
					".obsidian/plugins/weave/data/cache/incremental-reading/sync-state.json",
				readerArtifacts:
					".obsidian/plugins/weave/data/cache/incremental-reading/reader-artifacts",
			},
		},
		migration: {
			root: ".obsidian/plugins/weave/data/cache/migration",
		},
		backups: ".obsidian/plugins/weave/data/backups",
	}),
}));

import { IREpubBookmarkTaskService } from "../IREpubBookmarkTaskService";
import { IRPdfBookmarkTaskService } from "../IRPdfBookmarkTaskService";

type MemoryAdapter = {
	exists: any;
	mkdir: any;
	list?: any;
	read: any;
	write: any;
	remove?: any;
	rmdir?: any;
	stat?: any;
	readBinary?: any;
	hasBinaryFile?: (path: string) => boolean;
};

function createMemoryAdapter(binaryFiles: Record<string, string> = {}): MemoryAdapter {
	const files = new Map<string, string>();
	const binaries = new Map<string, string>(Object.entries(binaryFiles));

	return {
		exists: vi.fn(async (path: string) => files.has(path) || binaries.has(path)),
		mkdir: vi.fn(async (_path: string) => {}),
		list: vi.fn(async (_path: string) => ({ files: [], folders: [] })),
		read: vi.fn(async (path: string) => {
			const value = files.get(path);
			if (value === undefined) {
				throw new Error(`Missing file: ${path}`);
			}
			return value;
		}),
		write: vi.fn(async (path: string, content: string) => {
			files.set(path, content);
		}),
		remove: vi.fn(async (path: string) => {
			files.delete(path);
		}),
		rmdir: vi.fn(async (_path: string, _recursive?: boolean) => {}),
		stat: vi.fn(async (path: string) => {
			if (!binaries.has(path)) {
				throw new Error(`Missing file: ${path}`);
			}
			return { size: 1024, mtime: 1710000000000 };
		}),
		readBinary: vi.fn(async (path: string) => {
			const value = binaries.get(path);
			if (value === undefined) {
				throw new Error(`Missing file: ${path}`);
			}
			return new TextEncoder().encode(value);
		}),
		hasBinaryFile: (path: string) => binaries.has(path),
	};
}

function createVaultFile(path: string) {
	return {
		path,
		extension: "epub",
		basename: path.split("/").pop()?.replace(/\.epub$/i, "") || path,
		name: path.split("/").pop() || path,
		stat: { size: 1024, mtime: 1710000000000 },
		parent: path.includes("/") ? { path: path.slice(0, path.lastIndexOf("/")) } : null,
	};
}

function createApp(adapter: MemoryAdapter): any {
	return {
		vault: {
			adapter,
			getAbstractFileByPath: vi.fn((path: string) =>
				adapter.hasBinaryFile?.(path) ? createVaultFile(path) : null
			),
		},
		plugins: {
			getPlugin: vi.fn(() => ({
				settings: { weaveParentFolder: "" },
			})),
		},
	};
}

describe("bookmark task update merging", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-08T10:00:00.000Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("pdf bookmark updates preserve existing meta and stats fields", async () => {
		const adapter = createMemoryAdapter();
		const service = new IRPdfBookmarkTaskService(createApp(adapter));
		const task = await service.createTask({
			topicId: "deck-1",
			pdfPath: "Books/Test.pdf",
			title: "Test",
			link: "obsidian://pdf",
		});

		const updated = await service.updateTask(task.id, {
			meta: {
				associatedNotePath: "Inbox/Linked.md",
			} as any,
			stats: {
				notesWritten: 3,
			} as any,
		});

		expect(updated).not.toBeNull();
		expect(updated?.meta.associatedNotePath).toBe("Inbox/Linked.md");
		expect(updated?.meta.siblings).toEqual({ prev: null, next: null });
		expect(updated?.meta.priorityLog).toEqual(task.meta.priorityLog);
		expect(updated?.stats.notesWritten).toBe(3);
		expect(updated?.stats.impressions).toBe(task.stats.impressions);
	});

	it("epub bookmark updates preserve existing meta and stats fields", async () => {
		const adapter = createMemoryAdapter();
		const service = new IREpubBookmarkTaskService(createApp(adapter));
		const task = await service.createTask({
			topicId: "deck-1",
			epubFilePath: "Books/Test.epub",
			title: "Chapter 1",
			tocHref: "chapter-1.xhtml",
			tocLevel: 1,
		});

		const updated = await service.updateTask(task.id, {
			meta: {
				associatedNotePath: "Inbox/Epub-Linked.md",
			} as any,
			stats: {
				notesWritten: 5,
			} as any,
		});

		expect(updated).not.toBeNull();
		expect(updated?.meta.associatedNotePath).toBe("Inbox/Epub-Linked.md");
		expect(updated?.meta.siblings).toEqual({ prev: null, next: null });
		expect(updated?.meta.priorityLog).toEqual(task.meta.priorityLog);
		expect(updated?.stats.notesWritten).toBe(5);
		expect(updated?.stats.impressions).toBe(task.stats.impressions);
		expect(updated?.tocLevel).toBe(1);
	});

	it("epub bookmark creation normalizes legacy 0-based toc levels to 1-based storage", async () => {
		const adapter = createMemoryAdapter();
		const service = new IREpubBookmarkTaskService(createApp(adapter));

		const task = await service.createTask({
			topicId: "deck-1",
			epubFilePath: "Books/Test.epub",
			title: "Legacy Level Input",
			tocHref: "chapter-legacy.xhtml",
			tocLevel: 0,
		});

		expect(task.tocLevel).toBe(1);
	});

	it("pdf bookmark tasks support mixed deck identifiers", async () => {
		const adapter = createMemoryAdapter();
		const service = new IRPdfBookmarkTaskService(createApp(adapter));

		const canonical = await service.createTask({
			deckId: "deck-1",
			pdfPath: "Books/Test.pdf",
			title: "Canonical",
			link: "obsidian://canonical",
		});
		const legacy = await service.createTask({
			deckId: "Books/Test.pdf::deck",
			pdfPath: "Books/Test.pdf",
			title: "Legacy",
			link: "obsidian://legacy",
		});

		const tasks = await service.getTasksByDeckIdentifiers([
			"deck-1",
			" Books/Test.pdf::deck ",
			"deck-1",
		]);

		expect(tasks.map((task) => task.id).sort()).toEqual([canonical.id, legacy.id].sort());
	});

	it("epub bookmark tasks support mixed deck identifiers", async () => {
		const adapter = createMemoryAdapter();
		const service = new IREpubBookmarkTaskService(createApp(adapter));

		const canonical = await service.createTask({
			deckId: "deck-1",
			epubFilePath: "Books/Test.epub",
			title: "Chapter 1",
			tocHref: "chapter-1.xhtml",
			tocLevel: 1,
		});
		const legacy = await service.createTask({
			deckId: "Books/Test.epub::deck",
			epubFilePath: "Books/Test.epub",
			title: "Chapter 2",
			tocHref: "chapter-2.xhtml",
			tocLevel: 1,
		});

		const tasks = await service.getTasksByDeckIdentifiers([
			"deck-1",
			"Books/Test.epub::deck",
			"",
		]);

		expect(tasks.map((task) => task.id).sort()).toEqual([canonical.id, legacy.id].sort());
	});

	it("epub bookmark tasks keep a stable sourceId when the same file is re-added under a new path", async () => {
		const adapter = createMemoryAdapter({
			"Books/Test.epub": "same-epub-binary",
			"Library/Test Renamed.epub": "same-epub-binary",
		});
		const service = new IREpubBookmarkTaskService(createApp(adapter));

		const original = await service.createTask({
			deckId: "deck-1",
			epubFilePath: "Books/Test.epub",
			title: "Chapter 1",
			tocHref: "chapter-1.xhtml",
			tocLevel: 1,
		});

		expect(original.sourceId).toBeTruthy();

		const renamed = await service.createTask({
			deckId: "deck-1",
			epubFilePath: "Library/Test Renamed.epub",
			title: "Chapter 2",
			tocHref: "chapter-2.xhtml",
			tocLevel: 1,
		});

		expect(renamed.sourceId).toBe(original.sourceId);

		const matched = await service.getTasksByEpub("Library/Test Renamed.epub");
		expect(matched.map((task) => task.id).sort()).toEqual([original.id, renamed.id].sort());
	});
});
