import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPluginPaths, getV2Paths } from "../../../config/paths";
import { IRPointStorageService } from "../IRPointStorageService";
import { IR_POINT_STORAGE_VERSION } from "../../../types/ir-point-storage-types";

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

function buildMaterialRecord(id: string, sourcePath: string, title = id) {
	return {
		schemaVersion: IR_POINT_STORAGE_VERSION,
		id,
		createdAt: "2026-04-16T10:00:00.000Z",
		updatedAt: "2026-04-16T10:00:00.000Z",
		source: {
			type: sourcePath.toLowerCase().endsWith(".epub")
				? "epub"
				: sourcePath.toLowerCase().endsWith(".pdf")
					? "pdf"
					: "file",
			path: sourcePath,
		},
		bibliography: {
			title,
		},
		contentStorage: {
			mode: "external-source",
			ownedByPlugin: false,
		},
		defaultParameterContext: {
			materialClass: "reference-note",
			scheduleProfileRef: "profile-reference-note",
			classificationSource: "inherited-from-material",
			isOverride: false,
		},
		metadata: {
			status: "active",
		},
	};
}

function getPointFilesIndexPath(app: any): string {
	return normalizeTestPath(getPluginPaths(app as any).cache.incrementalReading.pointFilesIndex);
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
		const { app, files } = createMemoryApp();
		const service = new IRPointStorageService(app);

		await service.syncLegacyPoint({
			id: "epubbm-1",
			topicId: "topic-1",
			topicName: "Readable Topic",
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

		const pointIndex = JSON.parse(files.get(getPointFilesIndexPath(app)) || "{}");
		expect(pointIndex.files[0]?.file).toBe("points/Readable Topic.irdeck");

		const pointFilePath = normalizeTestPath(`${v2Paths.ir.root}/points/Readable Topic.irdeck`);
		const pointFile = JSON.parse(files.get(pointFilePath) || "{}");
		expect(pointFile.topicName).toBe("Readable Topic");
		expect(pointFile.points).toHaveLength(1);
		expect(pointFile.points[0].trace.traceState).toBe("verified");
		expect(pointFile.points[0].userData.title).toBe("Chapter 1");
		expect(pointFile.points[0].materialId).toBeTruthy();
		expect(pointFile.points[0].source.type).toBe("epub");
		expect(pointFile.points[0].source.path).toBe("Books/Test.epub");
		expect(pointFile.points[0].source.title).toBe("Chapter 1");
		expect(pointFile.points[0].parameterContext.materialClass).toBe("academic-book");
		expect(files.has(normalizeTestPath(v2Paths.ir.materialsIndex))).toBe(false);
	});

	it("keeps migrated stats and note links when later legacy syncs omit them, and exposes point snapshots", async () => {
		const v2Paths = getV2Paths("");
		const { app, files } = createMemoryApp();
		const service = new IRPointStorageService(app);

		await service.syncLegacyPoint({
			id: "pdfbm-keep",
			topicId: "topic-1",
			topicName: "Readable Topic",
			title: "Selection A",
			tags: ["alpha"],
			status: "queued",
			priorityUi: 6,
			priorityEff: 7,
			intervalDays: 3,
			nextRepDate: 1713261600000,
			createdAt: 1713261600000,
			updatedAt: 1713261600000,
			sourceType: "pdf-bookmark",
			sourcePath: "Docs/Keep.pdf",
			locatorType: "pdf-selection",
			locator: { link: "obsidian://pdf", annotationId: "ann-1", pdfPath: "Docs/Keep.pdf" },
			linkedNotePaths: ["Notes/A.md", "Notes/B.md"],
			explicitTagGroupId: "group-a",
			isStarred: true,
			stats: {
				impressions: 4,
				extracts: 2,
				cardsCreated: 1,
				notesWritten: 3,
				totalReadingTimeSec: 120,
				lastInteractionAt: 1713261600000,
			},
		});

		await service.syncLegacyPoint({
			id: "pdfbm-keep",
			topicId: "topic-1",
			title: "Selection A Updated",
			tags: [],
			status: "active",
			priorityUi: 5,
			priorityEff: 5,
			intervalDays: 5,
			nextRepDate: 1713348000000,
			updatedAt: 1713348000000,
			sourceType: "pdf-bookmark",
			sourcePath: "Docs/Keep.pdf",
			locatorType: "pdf-selection",
			locator: { link: "obsidian://pdf#updated", pdfPath: "Docs/Keep.pdf" },
		});

		const snapshots = await service.listPointSnapshots();
		expect(snapshots).toHaveLength(1);
		expect(snapshots[0].material?.source.path).toBe("Docs/Keep.pdf");
		expect(snapshots[0].topicName).toBe("Readable Topic");

		const pointFile = JSON.parse(
			files.get(normalizeTestPath(`${v2Paths.ir.root}/points/Readable Topic.irdeck`)) || "{}"
		);
		const point = pointFile.points[0];
		expect(point.userData.title).toBe("Selection A Updated");
		expect(point.relations.linkedNotePaths).toEqual(["Notes/A.md", "Notes/B.md"]);
		expect(point.metadata.tagGroupId).toBe("group-a");
		expect(point.stats.impressionCount).toBe(4);
		expect(point.stats.extractCount).toBe(2);
		expect(point.stats.cardCreatedCount).toBe(1);
		expect(point.stats.noteCreatedCount).toBe(3);
		expect(point.stats.totalReadingTimeMs).toBe(120000);
		expect(point.schedule.status).toBe("active");
		expect(point.trace.locator.link).toBe("obsidian://pdf#updated");
	});

	it("会在 Markdown 关联笔记改名后同步更新 point 真源中的 linkedNotePaths", async () => {
		const v2Paths = getV2Paths("");
		const { app, files } = createMemoryApp();
		const service = new IRPointStorageService(app);

		await service.syncLegacyPoint({
			id: "pdfbm-linked-note",
			topicId: "topic-1",
			topicName: "Readable Topic",
			title: "Selection Linked",
			status: "queued",
			sourceType: "pdf-bookmark",
			sourcePath: "Docs/Keep.pdf",
			locatorType: "pdf-selection",
			locator: { page: 1 },
			linkedNotePaths: ["Notes/Topic", "Notes/Appendix.md"],
		});

		expect(await service.remapAssociatedNoteFileReferences("Notes/Topic.md", "Notes/Renamed Topic.md")).toBe(1);

		const pointFile = JSON.parse(
			files.get(normalizeTestPath(`${v2Paths.ir.root}/points/Readable Topic.irdeck`)) || "{}"
		);
		expect(pointFile.points[0].relations.linkedNotePaths).toEqual([
			"Notes/Renamed Topic.md",
			"Notes/Appendix.md",
		]);
	});

	it("syncs chunk reading points into the new point storage with separated source metadata", async () => {
		const v2Paths = getV2Paths("");
		const { app, files } = createMemoryApp({
			"IR/Chunks/01_Chunk.md": `---
tags:
  - alpha
  - Beta
---
chunk body`,
		});
		const service = new IRPointStorageService(app);

		await service.syncChunkPoint(
			{
				chunkId: "chunk-1",
				sourceId: "source-1",
				filePath: "IR/Chunks/01_Chunk.md",
				topicIds: ["topic-1", "topic-2"],
				deckIds: ["topic-1", "topic-2"],
				priorityUi: 4,
				priorityEff: 6,
				intervalDays: 3,
				nextRepDate: 1713261600000,
				scheduleStatus: "queued",
				favorite: true,
				stats: {
					impressions: 2,
					extracts: 1,
					cardsCreated: 1,
					notesWritten: 2,
					totalReadingTimeSec: 60,
					lastInteraction: 1713261600000,
					lastShownAt: 1713261600000,
					effectiveReadingTimeSec: 60,
				},
				meta: {
					primaryAssociatedNotePath: "Notes/Chunk.md",
					associatedNotePaths: ["Notes/Chunk.md", "Notes/Chunk-2.md"],
					sourceSequenceGroup: "md:Docs/Source.md",
					sourceSequenceOrder: 1,
					sourceSequenceLocked: true,
					sourceSequenceAnchorDateKey: "2026-05-03",
					autoSubscribedAt: "2026-05-03T01:02:03.000Z",
					autoSubscribedFolderPath: "Inbox/Subscribed",
					autoSubscribedBadgeUntil: "2026-05-10T01:02:03.000Z",
					externalDocument: true,
				},
				createdAt: 1713261600000,
				updatedAt: 1713261600000,
			} as any,
			{
				source: {
					sourceId: "source-1",
					originalPath: "Docs/Source.md",
					rawFilePath: "weave/IR/raw/Source.md",
					indexFilePath: "weave/IR/Source.index.md",
					chunkIds: ["chunk-1"],
					title: "Source Title",
					tagGroup: "group-chunk",
					createdAt: 1713261600000,
					updatedAt: 1713261600000,
				},
				topicNamesById: new Map([
					["topic-1", "Topic One"],
					["topic-2", "Topic Two"],
				]),
			}
		);

		const pointIndex = JSON.parse(
			files.get(getPointFilesIndexPath(app)) || "{}"
		);
		const pointFilePath = normalizeTestPath(
			`${v2Paths.ir.root}/${pointIndex.files?.[0]?.file || ""}`
		);
		const pointFile = JSON.parse(files.get(pointFilePath) || "{}");
		expect(pointFile.points).toHaveLength(1);
		expect(pointFile.points[0].id).toBe("chunk-1");
		expect(pointFile.points[0].pointType).toBe("chunk-entry");
		expect(pointFile.points[0].relations.topicIds).toEqual(["topic-1", "topic-2"]);
		expect(pointFile.points[0].relations.linkedNotePaths).toEqual([
			"Notes/Chunk.md",
			"Notes/Chunk-2.md",
		]);
		expect(pointFile.points[0].metadata.chunkFilePath).toBe("IR/Chunks/01_Chunk.md");
		expect(pointFile.points[0].metadata.tagGroupId).toBe("group-chunk");
		expect(pointFile.points[0].metadata.sourceSequenceGroup).toBe("md:Docs/Source.md");
		expect(pointFile.points[0].metadata.sourceSequenceOrder).toBe(1);
		expect(pointFile.points[0].metadata.sourceSequenceLocked).toBe(true);
		expect(pointFile.points[0].metadata.sourceSequenceAnchorDateKey).toBe("2026-05-03");
		expect(pointFile.points[0].metadata.autoSubscribedAt).toBe("2026-05-03T01:02:03.000Z");
		expect(pointFile.points[0].metadata.autoSubscribedFolderPath).toBe("Inbox/Subscribed");
		expect(pointFile.points[0].metadata.autoSubscribedBadgeUntil).toBe("2026-05-10T01:02:03.000Z");
		expect(pointFile.points[0].metadata.externalDocument).toBe(true);
		expect(pointFile.points[0].userData.tags).toEqual(["alpha", "Beta"]);
		expect(pointFile.points[0].source.id).toBe("source-1");
		expect(pointFile.points[0].source.type).toBe("markdown");
		expect(pointFile.points[0].source.path).toBe("Docs/Source.md");
		expect(pointFile.points[0].source.title).toBe("Source Title");
		expect(files.has(normalizeTestPath(v2Paths.ir.materialsIndex))).toBe(false);
	});

	it("renames the topic shard file when the topic name changes", async () => {
		const v2Paths = getV2Paths("");
		const { app, files } = createMemoryApp();
		const service = new IRPointStorageService(app);
		const input = {
			id: "pdfbm-1",
			topicId: "topic-1",
			topicName: "Old Topic",
			title: "Selection 1",
			status: "new",
			sourceType: "pdf-bookmark" as const,
			sourcePath: "Docs/Test.pdf",
			locatorType: "pdf-selection",
			locator: { page: 1 },
		};

		await service.syncLegacyPoint(input);
		expect(files.has(normalizeTestPath(`${v2Paths.ir.root}/points/Old Topic.irdeck`))).toBe(true);

		await service.upsertPointDeck({
			id: "topic-1",
			path: "topic-1",
			name: "New Topic",
			blockIds: [],
			sourceFiles: [],
			createdAt: "2026-04-16T10:00:00.000Z",
			updatedAt: "2026-04-16T10:00:00.000Z",
		} as any);

		expect(files.has(normalizeTestPath(`${v2Paths.ir.root}/points/Old Topic.irdeck`))).toBe(false);
		expect(files.has(normalizeTestPath(`${v2Paths.ir.root}/points/New Topic.irdeck`))).toBe(true);

		const pointIndex = JSON.parse(files.get(getPointFilesIndexPath(app)) || "{}");
		expect(pointIndex.files[0]?.file).toBe("points/New Topic.irdeck");
	});

	it("reuses the current .irdeck topic name when legacy-format sync no longer has topics.json", async () => {
		const v2Paths = getV2Paths("");
		const { app, files } = createMemoryApp();
		const service = new IRPointStorageService(app);

		await service.syncLegacyPoint({
			id: "pdfbm-1",
			topicId: "topic-1",
			topicName: "Readable Topic",
			title: "Selection 1",
			status: "new",
			sourceType: "pdf-bookmark",
			sourcePath: "Docs/Test.pdf",
			locatorType: "pdf-selection",
			locator: { page: 1 },
		});

		await service.syncLegacyPoint({
			id: "pdfbm-2",
			topicId: "topic-1",
			title: "Selection 2",
			status: "queued",
			sourceType: "pdf-bookmark",
			sourcePath: "Docs/Test.pdf",
			locatorType: "pdf-selection",
			locator: { page: 2 },
		});

		expect(files.has(normalizeTestPath(`${v2Paths.ir.root}/points/topic-1.irdeck`))).toBe(false);

		const pointFile = JSON.parse(
			files.get(normalizeTestPath(`${v2Paths.ir.root}/points/Readable Topic.irdeck`)) || "{}"
		);
		expect(pointFile.topicName).toBe("Readable Topic");
		expect(pointFile.points).toHaveLength(2);
		expect(pointFile.points.map((point: { id: string }) => point.id)).toEqual([
			"pdfbm-1",
			"pdfbm-2",
		]);
	});

	it("normalizes legacy point shard filenames to .irdeck during baseline initialization", async () => {
		const v2Paths = getV2Paths("");
		const { app, files } = createMemoryApp({
			[v2Paths.ir.pointFilesIndex]: JSON.stringify({
				schemaVersion: 1,
				updatedAt: "2026-04-16T10:00:00.000Z",
				files: [
					{
						topicId: "topic-1",
						topicName: "Topic One",
						file: "points/Topic One.points-001.json",
						pointCount: 1,
						updatedAt: "2026-04-16T10:00:00.000Z",
					},
				],
			}),
			[`${v2Paths.ir.root}/points/Topic One.points-001.json`]: JSON.stringify({
				schemaVersion: 1,
				topicId: "topic-1",
				topicName: "Topic One",
				updatedAt: "2026-04-16T10:00:00.000Z",
				points: [
					{
						id: "point-1",
						source: {
							id: "source-1",
							type: "markdown",
							path: "Docs/Source.md",
							title: "Source",
						},
						trace: {
							locator: {
								path: "Docs/Source.md",
							},
							traceState: "verified",
							traceConfidence: 1,
							fallbackLocators: [],
						},
						schedule: {
							status: "new",
						},
						relations: {
							topicIds: ["topic-1"],
							linkedNotePaths: [],
							derivedCardIds: [],
							blockIds: [],
						},
						userData: {
							title: "Point One",
							tags: [],
							starred: false,
						},
						stats: {},
						audit: {
							createdAt: "2026-04-16T10:00:00.000Z",
							updatedAt: "2026-04-16T10:00:00.000Z",
						},
					},
				],
			}),
		});
		const service = new IRPointStorageService(app);

		const snapshots = await service.listPointSnapshots();

		expect(snapshots).toHaveLength(1);
		expect(files.has(normalizeTestPath(`${v2Paths.ir.root}/points/Topic One.points-001.json`))).toBe(
			false
		);
		expect(files.has(normalizeTestPath(`${v2Paths.ir.root}/points/Topic One.irdeck`))).toBe(true);

		const pointIndex = JSON.parse(files.get(getPointFilesIndexPath(app)) || "{}");
		expect(pointIndex.files[0]?.file).toBe("points/Topic One.irdeck");
	});

	it("resolves point topic metadata from a .irdeck file path", async () => {
		const v2Paths = getV2Paths("");
		const { app } = createMemoryApp({
			[v2Paths.ir.pointFilesIndex]: JSON.stringify({
				schemaVersion: 1,
				updatedAt: "2026-04-16T10:00:00.000Z",
				files: [
					{
						topicId: "topic-1",
						topicName: "Topic One",
						file: "points/Topic One.irdeck",
						pointCount: 1,
						updatedAt: "2026-04-16T10:00:00.000Z",
					},
				],
			}),
			[`${v2Paths.ir.root}/points/Topic One.irdeck`]: JSON.stringify({
				schemaVersion: 1,
				topicId: "topic-1",
				topicName: "Topic One",
				updatedAt: "2026-04-16T10:00:00.000Z",
				points: [],
			}),
		});
		const service = new IRPointStorageService(app);

		const entry = await service.getPointFileEntryByPath(`${v2Paths.ir.root}/points/Topic One.irdeck`);

		expect(entry).toEqual({
			topicId: "topic-1",
			topicName: "Topic One",
			relativePath: "points/Topic One.irdeck",
			absolutePath: `${v2Paths.ir.root}/points/Topic One.irdeck`,
		});
	});

	it("executes repeatable migration without duplicating points and relocates legacy reader state", async () => {
		const v2Paths = getV2Paths("");
		const pluginPaths = getPluginPaths({ vault: { configDir: ".obsidian" } } as any);
		const { app, files } = createMemoryApp({
			[v2Paths.ir.legacyTopics]: JSON.stringify({
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
						stats: {
							impressions: 3,
							extracts: 1,
							cardsCreated: 2,
							notesWritten: 1,
							totalReadingTimeSec: 90,
							lastInteraction: 1713261600000,
						},
						meta: {
							tagGroup: "group-a",
							primaryAssociatedNotePath: "Notes/PDF.md",
							associatedNotePaths: ["Notes/PDF.md", "Notes/PDF-2.md"],
						},
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
				widthMode: "standard",
				layoutMode: "paginated",
				flowMode: "paginated",
				showScrolledSideNav: true,
			}),
		});
		const service = new IRPointStorageService(app);

		const firstReport = await service.executeMigration();
		const inspectionAfterFirstMigration = await service.inspectMigrationStatus();
		const secondReport = await service.executeMigration();
		const inspectionAfterSecondMigration = await service.inspectMigrationStatus();

		expect(firstReport.summary.migratedPoints).toBe(1);
		expect(firstReport.summary.migratedReaderStateFiles).toBe(4);
		expect(firstReport.summary.removedLegacyReaderStateFiles).toBe(0);
		expect(firstReport.summary.removedLegacyBookmarkTaskFiles).toBe(0);
		expect(inspectionAfterFirstMigration.pendingCount).toBe(0);
		expect(inspectionAfterFirstMigration.legacyReaderStateCount).toBe(4);
		expect(inspectionAfterFirstMigration.pendingReaderStateFileCount).toBe(0);
		expect(secondReport.summary.migratedPoints).toBe(1);
		expect(secondReport.summary.removedLegacyReaderStateFiles).toBe(0);
		expect(secondReport.summary.removedLegacyBookmarkTaskFiles).toBe(0);
		expect(inspectionAfterSecondMigration.pendingCount).toBe(0);
		expect(inspectionAfterSecondMigration.legacyReaderStateCount).toBe(4);
		expect(inspectionAfterSecondMigration.pendingReaderStateFileCount).toBe(0);

		const pointIndex = JSON.parse(
			files.get(getPointFilesIndexPath(app)) || "{}"
		);
		const pointFilePath = normalizeTestPath(
			`${v2Paths.ir.root}/${pointIndex.files?.[0]?.file || ""}`
		);
		const pointFile = JSON.parse(files.get(pointFilePath) || "{}");
		expect(pointFile.points).toHaveLength(1);
		expect(pointFile.points[0].id).toBe("pdfbm-1");
		expect(pointFile.points[0].relations.linkedNotePaths).toEqual([
			"Notes/PDF.md",
			"Notes/PDF-2.md",
		]);
		expect(pointFile.points[0].metadata.tagGroupId).toBe("group-a");
		expect(pointFile.points[0].stats.impressionCount).toBe(3);
		expect(pointFile.points[0].stats.totalReadingTimeMs).toBe(90000);

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

	it("backfills point source data and removes legacy material files during migration cleanup", async () => {
		const v2Paths = getV2Paths("");
		const activeMaterial = buildMaterialRecord("src-active", "Docs/Source.md", "Source");
		const duplicateLegacyMaterial = buildMaterialRecord("tk-ir-legacy", "Docs/Source.md", "Source");
		const uniqueLegacyMaterial = buildMaterialRecord("legacy-keep", "Docs/Standalone.md", "Standalone");
		const { app, files, folders } = createMemoryApp(
			{
				[v2Paths.ir.pointFilesIndex]: JSON.stringify({
					schemaVersion: 1,
					updatedAt: "2026-04-16T10:00:00.000Z",
					files: [
						{
							topicId: "topic-1",
							topicName: "Topic One",
							file: "points/Topic One.points-001.json",
							pointCount: 1,
							updatedAt: "2026-04-16T10:00:00.000Z",
						},
					],
				}),
				[`${v2Paths.ir.root}/points/Topic One.points-001.json`]: JSON.stringify({
					schemaVersion: 1,
					topicId: "topic-1",
					topicName: "Topic One",
					updatedAt: "2026-04-16T10:00:00.000Z",
					points: [
						{
							id: "point-1",
							materialId: "src-active",
						},
					],
				}),
				[v2Paths.ir.materialsIndex]: JSON.stringify({
					schemaVersion: 1,
					updatedAt: "2026-04-16T10:00:00.000Z",
					materials: [
						{
							id: "src-active",
							type: "file",
							file: "materials/src-active.material.json",
							status: "active",
						},
						{
							id: "tk-ir-legacy",
							type: "file",
							file: "materials/tk-ir-legacy.material.json",
							status: "active",
						},
						{
							id: "missing-entry",
							type: "file",
							file: "materials/missing-entry.material.json",
							status: "active",
						},
					],
				}),
				[`${v2Paths.ir.root}/materials/src-active.material.json`]: JSON.stringify(activeMaterial),
				[`${v2Paths.ir.root}/materials/tk-ir-legacy.material.json`]: JSON.stringify(
					duplicateLegacyMaterial
				),
				[`${v2Paths.ir.root}/materials/legacy-keep.material.json`]: JSON.stringify(uniqueLegacyMaterial),
				[v2Paths.ir.materials.index]: JSON.stringify({
					version: "1.0.0",
					lastUpdated: "2026-04-16T10:00:00.000Z",
					materials: {
						"tk-ir-legacy": {
							uuid: "tk-ir-legacy",
							title: "Source",
							filePath: "Docs/Source.md",
						},
						"legacy-keep": {
							uuid: "legacy-keep",
							title: "Standalone",
							filePath: "Docs/Standalone.md",
						},
					},
				}),
				"Docs/Source.md": "# Source",
				"Docs/Standalone.md": "# Standalone",
			},
			[v2Paths.ir.materials.sessions]
		);
		const service = new IRPointStorageService(app);

		const inspectionBefore = await service.inspectMigrationStatus();
		const report = await service.executeMigration({
			cleanupLegacyMaterialFiles: true,
		});
		const inspectionAfter = await service.inspectMigrationStatus();

		expect(inspectionBefore.pendingEmbeddedSourceCount).toBe(1);
		expect(inspectionBefore.legacyMaterialRecordFileCount).toBe(3);
		expect(inspectionBefore.legacyMaterialsIndexFileCount).toBe(1);
		expect(inspectionBefore.legacyMaterialsFileCount).toBe(1);
		expect(inspectionBefore.emptyLegacyMaterialDirCount).toBe(1);

		expect(report.summary.migratedMaterials).toBe(1);
		expect(report.summary.removedLegacyMaterialRecordFiles).toBe(3);
		expect(report.summary.removedLegacyMaterialsIndexCount).toBe(1);
		expect(report.summary.removedLegacyMaterialsFileCount).toBe(1);
		expect(report.summary.removedEmptyLegacyMaterialDirs).toBe(1);

		expect(
			files.has(normalizeTestPath(`${v2Paths.ir.root}/materials/tk-ir-legacy.material.json`))
		).toBe(false);
		expect(
			files.has(normalizeTestPath(`${v2Paths.ir.root}/materials/src-active.material.json`))
		).toBe(false);
		expect(
			files.has(normalizeTestPath(`${v2Paths.ir.root}/materials/legacy-keep.material.json`))
		).toBe(false);
		expect(files.has(normalizeTestPath(v2Paths.ir.materialsIndex))).toBe(false);
		expect(files.has(normalizeTestPath(v2Paths.ir.materials.index))).toBe(false);
		expect(folders.has(normalizeTestPath(v2Paths.ir.materials.sessions))).toBe(false);

		const pointIndex = JSON.parse(
			files.get(getPointFilesIndexPath(app)) || "{}"
		);
		const pointFilePath = normalizeTestPath(
			`${v2Paths.ir.root}/${pointIndex.files?.[0]?.file || ""}`
		);
		const pointFile = JSON.parse(files.get(pointFilePath) || "{}");
		expect(pointFile.points[0].source).toMatchObject({
			id: "src-active",
			path: "Docs/Source.md",
			title: "Source",
		});

		expect(inspectionAfter.pendingCount).toBe(1);
		expect(inspectionAfter.pendingEmbeddedSourceCount).toBe(0);
		expect(inspectionAfter.legacyMaterialRecordFileCount).toBe(0);
		expect(inspectionAfter.legacyMaterialsIndexFileCount).toBe(0);
		expect(inspectionAfter.legacyMaterialsFileCount).toBe(0);
		expect(inspectionAfter.legacyRegistryFileCount).toBe(1);
	});

	it("reports residual legacy chunk storage files after chunk points have already been migrated", async () => {
		const v2Paths = getV2Paths("");
		const { app } = createMemoryApp({
			[v2Paths.ir.legacyTopics]: JSON.stringify({
				topics: {
					"topic-1": { name: "Topic One" },
				},
			}),
			[v2Paths.ir.sources]: JSON.stringify({
				version: "1.0.0",
				sources: {
					"source-1": {
						sourceId: "source-1",
						originalPath: "Docs/Source.md",
						rawFilePath: "Docs/Source.md",
						indexFilePath: "Docs/Source.index.md",
						chunkIds: ["chunk-1"],
						title: "Source 1",
						tagGroup: "default",
						createdAt: 1,
						updatedAt: 1,
					},
				},
			}),
			[v2Paths.ir.chunks]: JSON.stringify({
				version: "1.0.0",
				chunks: {
					"chunk-1": {
						chunkId: "chunk-1",
						sourceId: "source-1",
						filePath: "Docs/Chunk-1.md",
						topicIds: ["topic-1"],
						deckIds: ["topic-1"],
						priorityUi: 5,
						priorityEff: 5,
						intervalDays: 1,
						nextRepDate: 1,
						scheduleStatus: "queued",
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
						meta: {},
						createdAt: 1,
						updatedAt: 1,
					},
				},
			}),
		});
		const service = new IRPointStorageService(app);

		await service.executeMigration();
		const inspection = await service.inspectMigrationStatus();

		expect(inspection.pendingCount).toBe(0);
		expect(inspection.pendingChunkPointCount).toBe(0);
		expect(inspection.legacyChunkStorageFileCount).toBe(2);
	});

	it("migrates legacy blocks.json into point files and removes the deprecated file during cleanup", async () => {
		const v2Paths = getV2Paths("");
		const { app, files } = createMemoryApp({
			[v2Paths.ir.legacyTopics]: JSON.stringify({
				topics: {
					"topic-1": {
						name: "Topic One",
						blockIds: ["legacy-block-1"],
					},
				},
			}),
			[v2Paths.ir.blocks]: JSON.stringify({
				version: "2.0",
				blocks: {
					"legacy-block-1": {
						id: "legacy-block-1",
						filePath: "Docs/Legacy.md",
						headingPath: ["第一章", "第一节"],
						headingLevel: 2,
						startLine: 12,
						endLine: 18,
						priority: 2,
						state: "learning",
						interval: 3,
						intervalFactor: 1.5,
						nextReview: "2026-04-17T00:00:00.000Z",
						reviewCount: 2,
						lastReview: "2026-04-16T11:00:00.000Z",
						favorite: true,
						tags: ["focus"],
						notes: "legacy-note",
						extractedCards: ["card-1"],
						totalReadingTime: 90,
						createdAt: "2026-04-16T10:00:00.000Z",
						updatedAt: "2026-04-16T11:00:00.000Z",
						headingText: "第一节",
						contentPreview: "legacy preview",
						priorityUi: 6,
						priorityEff: 7,
						tagGroupId: "group-a",
					},
				},
			}),
			"Docs/Legacy.md": "# Legacy",
		});
		const service = new IRPointStorageService(app);

		const inspectionBefore = await service.inspectMigrationStatus();
		const report = await service.executeMigration({
			cleanupLegacyChunkStorageFiles: true,
		});
		const inspectionAfter = await service.inspectMigrationStatus();

		expect(inspectionBefore.pendingLegacyBlockCount).toBe(1);
		expect(inspectionBefore.legacyChunkStorageFileCount).toBe(1);
		expect(report.summary.migratedPoints).toBe(1);
		expect(report.summary.removedLegacyChunkStorageFiles).toBe(1);
		expect(files.has(normalizeTestPath(v2Paths.ir.blocks))).toBe(false);

		const pointIndex = JSON.parse(
			files.get(getPointFilesIndexPath(app)) || "{}"
		);
		const pointFilePath = normalizeTestPath(
			`${v2Paths.ir.root}/${pointIndex.files?.[0]?.file || ""}`
		);
		const pointFile = JSON.parse(files.get(pointFilePath) || "{}");
		expect(pointFile.points).toHaveLength(1);
		expect(pointFile.points[0].id).toBe("legacy-block-1");
		expect(pointFile.points[0].pointType).toBe("legacy-block-entry");
		expect(pointFile.points[0].trace.locatorType).toBe("markdown-block");
		expect(pointFile.points[0].relations.topicIds).toEqual(["topic-1"]);

		expect(inspectionAfter.pendingLegacyBlockCount).toBe(0);
		expect(inspectionAfter.legacyChunkStorageFileCount).toBe(0);
		expect(inspectionAfter.pendingCount).toBe(0);
	});

	it("migrates legacy blocks when only decks.json alias remains", async () => {
		const v2Paths = getV2Paths("");
		const { app, files } = createMemoryApp({
			[v2Paths.ir.legacyDecks]: JSON.stringify({
				decks: {
					"topic-1": {
						name: "Topic Alias",
						blockIds: ["legacy-block-alias"],
					},
				},
			}),
			[v2Paths.ir.blocks]: JSON.stringify({
				version: "2.0",
				blocks: {
					"legacy-block-alias": {
						id: "legacy-block-alias",
						filePath: "Docs/Alias.md",
						headingPath: ["别名专题"],
						headingLevel: 1,
						startLine: 1,
						endLine: 6,
						priority: 1,
						state: "new",
						interval: 1,
						intervalFactor: 1.2,
						nextReview: "2026-04-17T00:00:00.000Z",
						reviewCount: 0,
						favorite: false,
						tags: ["alias"],
						totalReadingTime: 10,
						createdAt: "2026-04-16T10:00:00.000Z",
						updatedAt: "2026-04-16T11:00:00.000Z",
						headingText: "别名专题",
						contentPreview: "alias preview",
					},
				},
			}),
			"Docs/Alias.md": "# Alias",
		});
		const service = new IRPointStorageService(app);

		const report = await service.executeMigration();
		const pointIndex = JSON.parse(files.get(getPointFilesIndexPath(app)) || "{}");
		const pointFilePath = normalizeTestPath(
			`${v2Paths.ir.root}/${pointIndex.files?.[0]?.file || ""}`
		);
		const pointFile = JSON.parse(files.get(pointFilePath) || "{}");

		expect(report.summary.migratedPoints).toBe(1);
		expect(pointFile.topicName).toBe("Topic Alias");
		expect(pointFile.points).toHaveLength(1);
		expect(pointFile.points[0].id).toBe("legacy-block-alias");
		expect(pointFile.points[0].relations.topicIds).toEqual(["topic-1"]);
	});

});
