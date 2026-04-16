import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPluginPaths, getV2Paths } from "../../../config/paths";
import { IRPointStorageService } from "../IRPointStorageService";

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
		rmdir: vi.fn(async (dir: string, recursive = false) => {
			const normalized = normalizeTestPath(dir);
			if (recursive) {
				for (const file of Array.from(files.keys())) {
					if (file === normalized || file.startsWith(`${normalized}/`)) {
						files.delete(file);
					}
				}
				for (const folder of Array.from(folders)) {
					if (folder === normalized || folder.startsWith(`${normalized}/`)) {
						folders.delete(folder);
					}
				}
				return;
			}
			folders.delete(normalized);
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

	return { app, files, folders };
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-04-16T10:00:00.000Z"));
});

afterEach(() => {
	vi.useRealTimers();
});

describe("IRPointStorageService", () => {
	it("writes point files using the readable topic name and stores separated point metadata", async () => {
		const v2Paths = getV2Paths("");
		const { app, files } = createMemoryApp({
			[v2Paths.ir.topics]: JSON.stringify({
				topics: {
					"topic-1": { name: "Readable Topic" },
				},
			}),
		});
		const service = new IRPointStorageService(app);

		await service.syncLegacyPoint({
			id: "epubbm-1",
			topicId: "topic-1",
			title: "Chapter 1",
			tags: ["focus"],
			status: "new",
			priorityUi: 3,
			priorityEff: 5,
			intervalDays: 2,
			nextRepDate: 1713261600000,
			createdAt: 1713261600000,
			updatedAt: 1713261600000,
			sourceType: "epub-bookmark",
			sourcePath: "Books/Test.epub",
			locatorType: "epub-chapter",
			locator: { tocHref: "chapter-1.xhtml", tocLevel: 0 },
		});

		const pointIndex = JSON.parse(files.get(normalizeTestPath(v2Paths.ir.pointFilesIndex)) || "{}");
		expect(pointIndex.files[0]?.file).toBe("points/Readable Topic.points-001.json");

		const pointFilePath = normalizeTestPath(`${v2Paths.ir.root}/points/Readable Topic.points-001.json`);
		const pointFile = JSON.parse(files.get(pointFilePath) || "{}");
		expect(pointFile.topicName).toBe("Readable Topic");
		expect(pointFile.points).toHaveLength(1);
		expect(pointFile.points[0].trace.traceState).toBe("verified");
		expect(pointFile.points[0].userData.title).toBe("Chapter 1");
		expect(pointFile.points[0].materialId).toBeTruthy();
		expect(pointFile.points[0].parameterContext.materialClass).toBe("academic-book");

		const materialsIndex = JSON.parse(files.get(normalizeTestPath(v2Paths.ir.materialsIndex)) || "{}");
		expect(materialsIndex.materials).toHaveLength(1);
		const materialRecordPath = normalizeTestPath(`${v2Paths.ir.root}/${materialsIndex.materials[0].file}`);
		const materialRecord = JSON.parse(files.get(materialRecordPath) || "{}");
		expect(materialRecord.contentStorage.mode).toBe("external-source");
		expect(materialRecord.source.path).toBe("Books/Test.epub");
	});

	it("renames the topic shard file when the topic name changes", async () => {
		const v2Paths = getV2Paths("");
		const { app, files } = createMemoryApp({
			[v2Paths.ir.topics]: JSON.stringify({
				topics: {
					"topic-1": { name: "Old Topic" },
				},
			}),
		});
		const service = new IRPointStorageService(app);
		const input = {
			id: "pdfbm-1",
			topicId: "topic-1",
			title: "Selection 1",
			status: "new",
			sourceType: "pdf-bookmark" as const,
			sourcePath: "Docs/Test.pdf",
			locatorType: "pdf-selection",
			locator: { page: 1 },
		};

		await service.syncLegacyPoint(input);
		expect(files.has(normalizeTestPath(`${v2Paths.ir.root}/points/Old Topic.points-001.json`))).toBe(true);

		files.set(
			normalizeTestPath(v2Paths.ir.topics),
			JSON.stringify({
				topics: {
					"topic-1": { name: "New Topic" },
				},
			})
		);

		await service.syncLegacyPoint(input);

		expect(files.has(normalizeTestPath(`${v2Paths.ir.root}/points/Old Topic.points-001.json`))).toBe(false);
		expect(files.has(normalizeTestPath(`${v2Paths.ir.root}/points/New Topic.points-001.json`))).toBe(true);

		const pointIndex = JSON.parse(files.get(normalizeTestPath(v2Paths.ir.pointFilesIndex)) || "{}");
		expect(pointIndex.files[0]?.file).toBe("points/New Topic.points-001.json");
	});

	it("executes repeatable migration without duplicating points and relocates legacy reader state", async () => {
		const v2Paths = getV2Paths("");
		const pluginPaths = getPluginPaths({ vault: { configDir: ".obsidian" } } as any);
		const { app, files } = createMemoryApp({
			[v2Paths.ir.topics]: JSON.stringify({
				topics: {
					"topic-1": { name: "Topic One" },
				},
			}),
			[v2Paths.ir.pdfBookmarkTasks]: JSON.stringify({
				version: 1,
				tasks: {
					"pdfbm-1": {
						id: "pdfbm-1",
						topicId: "topic-1",
						pdfPath: "Docs/Test.pdf",
						title: "Selection 1",
						link: "obsidian://pdf",
						status: "new",
						priorityUi: 2,
						priorityEff: 4,
						intervalDays: 3,
						nextRepDate: 1713261600000,
						createdAt: 1713261600000,
						updatedAt: 1713261600000,
						tags: ["important"],
					},
				},
			}),
			[`${v2Paths.ir.epub}/book-1/state.json`]: JSON.stringify({
				currentPosition: { chapterIndex: 1, cfi: "/6/6", percent: 42 },
			}),
			[`${v2Paths.ir.epub}/book-1/last-open-bookmark.json`]: JSON.stringify({
				chapterIndex: 1,
				cfi: "epubcfi(/6/6)",
				percent: 42,
				title: "legacy",
				preview: "legacy",
				savedAt: 1713261600000,
			}),
			[`${v2Paths.ir.epub}/book-1/concealed-texts.json`]: JSON.stringify([
				{ id: "conceal-1", text: "legacy", mode: "mask", chapterIndex: 1, cfiRange: "/6/8", createdTime: 1 },
			]),
			[`${v2Paths.ir.epub}/reader-settings.desktop.json`]: JSON.stringify({
				lineHeight: 1.8,
				theme: "default",
				widthMode: "standard",
				layoutMode: "paginated",
				flowMode: "paginated",
				showScrolledSideNav: true,
			}),
		});
		const service = new IRPointStorageService(app);

		const firstReport = await service.executeMigration();
		const secondReport = await service.executeMigration();

		expect(firstReport.summary.migratedPoints).toBe(1);
		expect(firstReport.summary.migratedReaderStateFiles).toBe(4);
		expect(secondReport.summary.migratedPoints).toBe(1);

		const pointFile = JSON.parse(
			files.get(normalizeTestPath(`${v2Paths.ir.root}/points/Topic One.points-001.json`)) || "{}"
		);
		expect(pointFile.points).toHaveLength(1);
		expect(pointFile.points[0].id).toBe("pdfbm-1");

		expect(
			files.has(
				normalizeTestPath(
					`${pluginPaths.state.incrementalReading.readerState}/epub/book-1/state.json`
				)
			)
		).toBe(true);
		expect(
			files.has(
				normalizeTestPath(
					`${pluginPaths.state.incrementalReading.readerState}/epub/book-1/last-open-bookmark.json`
				)
			)
		).toBe(true);
		expect(
			files.has(
				normalizeTestPath(
					`${pluginPaths.cache.incrementalReading.readerArtifacts}/epub/book-1/concealed-texts.json`
				)
			)
		).toBe(true);
		expect(
			files.has(
				normalizeTestPath(
					`${pluginPaths.state.incrementalReading.readerState}/epub/reader-settings.desktop.json`
				)
			)
		).toBe(true);

		expect(files.has(normalizeTestPath(`${v2Paths.ir.epub}/book-1/state.json`))).toBe(true);
		expect(files.has(normalizeTestPath(`${v2Paths.ir.epub}/book-1/last-open-bookmark.json`))).toBe(true);
		expect(files.has(normalizeTestPath(`${v2Paths.ir.epub}/book-1/concealed-texts.json`))).toBe(true);
	});
});
