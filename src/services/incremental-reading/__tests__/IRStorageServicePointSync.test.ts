import { beforeEach, describe, expect, it, vi } from "vitest";

let pointDecks: Record<string, any> = {};
let pointSnapshots: any[] = [];

const pointStorageSpies = {
	syncChunkPoint: vi.fn(),
	syncLegacyPoint: vi.fn(),
	deletePointByLegacyId: vi.fn(),
	listPointSnapshots: vi.fn().mockResolvedValue([]),
	listPointDecks: vi.fn(async () => ({ ...pointDecks })),
	upsertPointDeck: vi.fn(async (deck: any) => {
		pointDecks[String(deck.id || deck.path || "").trim()] = { ...deck };
		return { ...deck };
	}),
	deletePointDeck: vi.fn(async (topicId: string) => {
		const existing = pointDecks[topicId];
		delete pointDecks[topicId];
		return {
			removed: Boolean(existing),
			topicName: existing?.name || "",
			pointIds: [],
			sourceFiles: [],
		};
	}),
	getPointTopicIds: vi.fn().mockResolvedValue([]),
	updatePointTopicIds: vi.fn().mockResolvedValue(true),
	ensureRuntimeBaseline: vi.fn(),
	initialize: vi.fn(),
};

vi.mock("obsidian", () => ({
	App: class {},
	TFile: class {},
	TFolder: class {},
	normalizePath: (path: string) => path.replace(/\\/g, "/").replace(/\/+/g, "/"),
}));

vi.mock("../IRPointStorageService", () => ({
	IRPointStorageService: class {
		syncChunkPoint = pointStorageSpies.syncChunkPoint;
		syncLegacyPoint = pointStorageSpies.syncLegacyPoint;
		deletePointByLegacyId = pointStorageSpies.deletePointByLegacyId;
		listPointSnapshots = pointStorageSpies.listPointSnapshots;
		listPointDecks = pointStorageSpies.listPointDecks;
		upsertPointDeck = pointStorageSpies.upsertPointDeck;
		deletePointDeck = pointStorageSpies.deletePointDeck;
		getPointTopicIds = pointStorageSpies.getPointTopicIds;
		updatePointTopicIds = pointStorageSpies.updatePointTopicIds;
		ensureRuntimeBaseline = pointStorageSpies.ensureRuntimeBaseline;
		initialize = pointStorageSpies.initialize;
	},
}));

import { IRStorageService } from "../IRStorageService";

function normalizeTestPath(path: string): string {
	return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
}

function parentPath(path: string): string {
	const normalized = normalizeTestPath(path);
	const idx = normalized.lastIndexOf("/");
	return idx > 0 ? normalized.slice(0, idx) : "";
}

function createMemoryApp(initialFiles: Record<string, string> = {}) {
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
		rmdir: vi.fn(async () => {}),
	};

	return {
		app: {
			vault: {
				configDir: ".obsidian",
				adapter,
				getAbstractFileByPath: vi.fn(() => null),
			},
			metadataCache: {
				getFileCache: vi.fn(() => null),
			},
			plugins: {
				getPlugin: vi.fn(() => ({
					settings: { weaveParentFolder: "" },
				})),
			},
			fileManager: {
				trashFile: vi.fn(),
			},
		} as any,
		files,
	};
}

describe("IRStorageService point sync", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		pointDecks = {};
		pointSnapshots = [];
		pointStorageSpies.syncChunkPoint.mockImplementation(async (chunk: any, options?: any) => {
			const sourcePath =
				options?.source?.originalPath || options?.source?.rawFilePath || chunk.filePath || "";
			const updatedAtIso = new Date(chunk.updatedAt || Date.now()).toISOString();
			const nextReviewAtIso =
				typeof chunk.nextRepDate === "number" && chunk.nextRepDate > 0
					? new Date(chunk.nextRepDate).toISOString()
					: updatedAtIso;
			const topicIds = Array.isArray(chunk.topicIds)
				? [...chunk.topicIds]
				: Array.isArray(chunk.deckIds)
					? [...chunk.deckIds]
					: [];
			const topicId = topicIds[0] || "";
			const snapshot = {
				point: {
					id: chunk.chunkId,
					pointType: "chunk-entry",
					materialId: chunk.sourceId,
					source: {
						id: options?.source?.sourceId || chunk.sourceId,
						type: "markdown",
						path: sourcePath,
						title: options?.source?.title || chunk.chunkId,
					},
					timestamps: {
						createdAt: updatedAtIso,
						updatedAt: updatedAtIso,
						lastInteractionAt: updatedAtIso,
					},
					trace: {
						locatorType: "markdown-chunk",
						locator: {
							sourcePath,
							chunkFilePath: chunk.filePath,
						},
						traceState: "verified",
						traceConfidence: 1,
						fallbackLocators: [],
					},
					parameterContext: {
						materialClass: "reference-note",
						scheduleProfileRef: "profile-reference-note",
						classificationSource: "manual",
						isOverride: false,
					},
					schedule: {
						status: chunk.scheduleStatus || "queued",
						priorityScore: Number(chunk.priorityEff || 0),
						manualPriority: Number(chunk.priorityUi || 0),
						nextReviewAt: nextReviewAtIso,
						lastReviewedAt: updatedAtIso,
						intervalDays: Number(chunk.intervalDays || 0),
					},
					relations: {
						topicIds,
						linkedCardIds: [],
						linkedNotePaths: [],
					},
					userData: {
						title: options?.source?.title || chunk.chunkId,
						note: "",
						tags: Array.isArray(chunk.tags) ? [...chunk.tags] : [],
						isStarred: Boolean(chunk.favorite),
					},
					stats: {
						impressionCount: Number(chunk?.stats?.impressions || 0),
						reviewCount: 0,
						extractCount: Number(chunk?.stats?.extracts || 0),
						cardCreatedCount: Number(chunk?.stats?.cardsCreated || 0),
						noteCreatedCount: Number(chunk?.stats?.notesWritten || 0),
						totalReadingTimeMs: Number(chunk?.stats?.totalReadingTimeSec || 0) * 1000,
					},
					audit: {
						createdBy: "test",
						origin: {
							type: "ir-chunk",
							id: chunk.chunkId,
						},
					},
					metadata: {
						sourceTitle: options?.source?.title || chunk.chunkId,
						sourcePath,
						rawFilePath: options?.source?.rawFilePath,
						indexFilePath: options?.source?.indexFilePath,
						chunkFilePath: chunk.filePath,
						tagGroupId: options?.source?.tagGroup || chunk?.meta?.tagGroup || "default",
					},
				},
				material: null,
				topicId,
				topicName: options?.topicNamesById?.get(topicId) || topicId,
			};
			const existingIndex = pointSnapshots.findIndex(
				(existing) => existing?.point?.id === chunk.chunkId
			);
			if (existingIndex >= 0) {
				pointSnapshots[existingIndex] = snapshot;
			} else {
				pointSnapshots.push(snapshot);
			}
			return snapshot.point;
		});
		pointStorageSpies.deletePointByLegacyId.mockImplementation(async (pointId: string) => {
			const before = pointSnapshots.length;
			pointSnapshots = pointSnapshots.filter((snapshot) => snapshot?.point?.id !== pointId);
			return before !== pointSnapshots.length;
		});
		pointStorageSpies.listPointSnapshots.mockImplementation(
			async () => JSON.parse(JSON.stringify(pointSnapshots))
		);
		pointStorageSpies.listPointDecks.mockImplementation(async () => ({ ...pointDecks }));
		pointStorageSpies.upsertPointDeck.mockImplementation(async (deck: any) => {
			pointDecks[String(deck.id || deck.path || "").trim()] = { ...deck };
			return { ...deck };
		});
		pointStorageSpies.deletePointDeck.mockImplementation(async (topicId: string) => {
			const existing = pointDecks[topicId];
			delete pointDecks[topicId];
			return {
				removed: Boolean(existing),
				topicName: existing?.name || "",
				pointIds: [],
				sourceFiles: [],
			};
		});
		pointStorageSpies.getPointTopicIds.mockResolvedValue([]);
		pointStorageSpies.updatePointTopicIds.mockResolvedValue(true);
	});

	it("does not fall back to legacy topics.json when no .irdeck files exist", async () => {
		const { app } = createMemoryApp({
			"weave/incremental-reading/topics.json": JSON.stringify({
				version: "2.0.0",
				topics: {
					"legacy-topic-1": {
						id: "legacy-topic-1",
						name: "旧专题",
						sourceFiles: ["Docs/Legacy.md"],
					},
				},
			}),
		});
		const service = new IRStorageService(app);

		const decks = await service.getAllDecks();

		expect(decks).toEqual({});
		expect(pointStorageSpies.listPointDecks).toHaveBeenCalled();
		expect(app.vault.adapter.read).not.toHaveBeenCalledWith(
			"weave/incremental-reading/topics.json"
		);
	});

	it("writes chunk/source changes only into point storage even when legacy files still exist", async () => {
		const legacyChunks = JSON.stringify({ version: "1.0.0", chunks: {} });
		const legacySources = JSON.stringify({ version: "1.0.0", sources: {} });
		const { app, files } = createMemoryApp({
			"weave/incremental-reading/chunks.json": legacyChunks,
			"weave/incremental-reading/sources.json": legacySources,
		});
		const service = new IRStorageService(app);

		await service.saveDeck({
			id: "topic-1",
			name: "Topic One",
			path: "Topic One",
			blockIds: [],
			sourceFiles: [],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		} as any);
		await service.saveSource({
			sourceId: "source-1",
			originalPath: "Docs/Source.md",
			rawFilePath: "weave/IR/raw/Source.md",
			indexFilePath: "weave/IR/Source.index.md",
			chunkIds: ["chunk-1"],
			title: "Source Title",
			tagGroup: "group-a",
			createdAt: Date.now(),
			updatedAt: Date.now(),
		} as any);

		expect(await service.getSource("source-1")).toMatchObject({
			sourceId: "source-1",
			title: "Source Title",
			tagGroup: "group-a",
		});
		expect(app.vault.adapter.read).not.toHaveBeenCalledWith(
			"weave/incremental-reading/sources.json"
		);

		await service.saveChunkData({
			chunkId: "chunk-1",
			sourceId: "source-1",
			filePath: "IR/Chunks/Chunk-1.md",
			topicIds: ["topic-1"],
			deckIds: ["topic-1"],
			priorityUi: 4,
			priorityEff: 6,
			intervalDays: 3,
			nextRepDate: Date.now(),
			scheduleStatus: "queued",
			stats: {
				impressions: 1,
				totalReadingTimeSec: 30,
				effectiveReadingTimeSec: 30,
				extracts: 0,
				cardsCreated: 0,
				notesWritten: 0,
				lastInteraction: Date.now(),
				lastShownAt: Date.now(),
			},
			meta: {},
			createdAt: Date.now(),
			updatedAt: Date.now(),
		} as any);

		expect(pointStorageSpies.syncChunkPoint).toHaveBeenCalledWith(
			expect.objectContaining({ chunkId: "chunk-1" }),
			expect.objectContaining({
				source: expect.objectContaining({ sourceId: "source-1" }),
				topicNamesById: expect.any(Map),
			})
		);

		await service.deleteChunkData("chunk-1");
		expect(pointStorageSpies.deletePointByLegacyId).toHaveBeenCalledWith("chunk-1");
		expect(await service.getSource("source-1")).toBeNull();
		expect(files.get("weave/incremental-reading/chunks.json")).toBe(legacyChunks);
		expect(files.get("weave/incremental-reading/sources.json")).toBe(legacySources);
	});

	it("ignores legacy chunks.json and sources.json for runtime reads once points exist", async () => {
		const { app } = createMemoryApp({
			"weave/incremental-reading/chunks.json": JSON.stringify({
				version: "1.0.0",
				chunks: {
					"legacy-chunk-only": {
						chunkId: "legacy-chunk-only",
						sourceId: "legacy-source-only",
						filePath: "Legacy/Chunk.md",
						priorityUi: 1,
						priorityEff: 1,
						intervalDays: 1,
						nextRepDate: 1,
						scheduleStatus: "queued",
					},
				},
			}),
			"weave/incremental-reading/sources.json": JSON.stringify({
				version: "1.0.0",
				sources: {
					"legacy-source-only": {
						sourceId: "legacy-source-only",
						originalPath: "Legacy/Source.md",
						rawFilePath: "Legacy/raw.md",
						indexFilePath: "Legacy/index.md",
						chunkIds: ["legacy-chunk-only"],
						title: "旧来源",
						tagGroup: "legacy",
						createdAt: 1,
						updatedAt: 1,
					},
				},
			}),
		});
		const service = new IRStorageService(app);

		pointStorageSpies.listPointSnapshots.mockResolvedValue([
			{
				point: {
					id: "chunk-1",
					pointType: "chunk-entry",
					materialId: "source-1",
					source: {
						id: "source-1",
						type: "markdown",
						path: "Docs/Source.md",
						title: "Point Source",
					},
					timestamps: {
						createdAt: "2026-04-16T10:00:00.000Z",
						updatedAt: "2026-04-16T11:00:00.000Z",
						lastInteractionAt: "2026-04-16T11:00:00.000Z",
					},
					trace: {
						locatorType: "markdown-chunk",
						locator: {
							sourcePath: "Docs/Source.md",
							chunkFilePath: "Docs/Chunk.md",
						},
						traceState: "verified",
						traceConfidence: 0.95,
						fallbackLocators: [],
					},
					parameterContext: {
						materialClass: "reference-note",
						scheduleProfileRef: "profile-reference-note",
						classificationSource: "manual",
						isOverride: false,
					},
					schedule: {
						status: "queued",
						priorityScore: 7,
						manualPriority: 6,
						nextReviewAt: "2026-04-17T00:00:00.000Z",
						lastReviewedAt: "2026-04-16T11:00:00.000Z",
						intervalDays: 3,
					},
					relations: {
						topicIds: ["topic-1"],
						linkedCardIds: [],
						linkedNotePaths: [],
					},
					userData: {
						title: "Chunk One",
						note: "",
						tags: ["focus"],
						isStarred: false,
					},
					stats: {
						impressionCount: 2,
						reviewCount: 1,
						extractCount: 0,
						cardCreatedCount: 0,
						noteCreatedCount: 0,
						totalReadingTimeMs: 90000,
					},
					audit: {
						createdBy: "test",
						origin: {
							type: "ir-chunk",
							id: "chunk-1",
						},
					},
					metadata: {
						sourceTitle: "Point Source",
						sourcePath: "Docs/Source.md",
						chunkFilePath: "Docs/Chunk.md",
						tagGroupId: "group-a",
						pointTitle: "Canvas 节点阅读点",
						resumeLink: "[[Boards/Test.canvas#^node-1?x=10&y=20&w=300&h=180]]",
						canvasNodeId: "node-1",
						canvasTextCandidates: ["这是第一条足够长的 canvas 定位候选文本"],
					},
				},
				material: null,
				topicId: "topic-1",
				topicName: "专题一",
			},
		]);

		const sources = await service.getAllSources();
		const chunks = await service.getAllChunkData();

		expect(sources).toMatchObject({
			"source-1": expect.objectContaining({
				sourceId: "source-1",
				originalPath: "Docs/Source.md",
				title: "Point Source",
				tagGroup: "group-a",
			}),
		});
		expect(sources["legacy-source-only"]).toBeUndefined();
		expect(chunks).toMatchObject({
			"chunk-1": expect.objectContaining({
				chunkId: "chunk-1",
				sourceId: "source-1",
				filePath: "Docs/Chunk.md",
				priorityUi: 6,
				priorityEff: 7,
				meta: expect.objectContaining({
					pointTitle: "Canvas 节点阅读点",
					resumeLink: "[[Boards/Test.canvas#^node-1?x=10&y=20&w=300&h=180]]",
					canvasNodeId: "node-1",
					canvasTextCandidates: ["这是第一条足够长的 canvas 定位候选文本"],
				}),
			}),
		});
		expect(chunks["legacy-chunk-only"]).toBeUndefined();
		expect(app.vault.adapter.read).not.toHaveBeenCalledWith(
			"weave/incremental-reading/sources.json"
		);
		expect(app.vault.adapter.read).not.toHaveBeenCalledWith(
			"weave/incremental-reading/chunks.json"
		);
	});

	it("does not recreate legacy chunk/source files after switching to point-only storage", async () => {
		const { app, files } = createMemoryApp();
		const service = new IRStorageService(app);

		await service.saveChunkData({
			chunkId: "chunk-point-only",
			sourceId: "source-point-only",
			filePath: "Docs/Chunk.md",
			topicIds: ["topic-1"],
			deckIds: ["topic-1"],
			priorityUi: 5,
			priorityEff: 5,
			intervalDays: 1,
			nextRepDate: Date.now(),
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
			createdAt: Date.now(),
			updatedAt: Date.now(),
		} as any);

		expect(pointStorageSpies.syncChunkPoint).toHaveBeenCalledWith(
			expect.objectContaining({ chunkId: "chunk-point-only" }),
			expect.anything()
		);
		expect(files.has("weave/incremental-reading/chunks.json")).toBe(false);
		expect(files.has("weave/incremental-reading/sources.json")).toBe(false);
	});

	it("reads legacy blocks from migrated point snapshots and writes back into point storage", async () => {
		const { app, files } = createMemoryApp();
		const service = new IRStorageService(app);

		pointStorageSpies.listPointSnapshots.mockResolvedValue([
			{
				point: {
					id: "legacy-block-1",
					pointType: "legacy-block-entry",
					materialId: "mat-1",
					source: {
						id: "mat-1",
						type: "markdown",
						path: "Docs/Legacy.md",
						title: "Legacy Source",
					},
					timestamps: {
						createdAt: "2026-04-16T10:00:00.000Z",
						updatedAt: "2026-04-16T11:00:00.000Z",
						lastInteractionAt: "2026-04-16T11:00:00.000Z",
					},
					trace: {
						locatorType: "markdown-block",
						locator: {
							sourcePath: "Docs/Legacy.md",
							headingPath: ["第一章", "第一节"],
							headingLevel: 2,
							startLine: 12,
							endLine: 18,
						},
						traceState: "verified",
						traceConfidence: 0.95,
						fallbackLocators: [],
					},
					parameterContext: {
						materialClass: "reference-note",
						scheduleProfileRef: "profile-reference-note",
						classificationSource: "inherited-from-material",
						isOverride: false,
					},
					schedule: {
						status: "queued",
						priorityScore: 7,
						manualPriority: 6,
						nextReviewAt: "2026-04-17T00:00:00.000Z",
						lastReviewedAt: "2026-04-16T11:00:00.000Z",
						intervalDays: 3,
					},
					relations: {
						topicIds: ["topic-1"],
						linkedCardIds: ["card-1"],
						linkedNotePaths: ["Notes/Legacy", "Notes/Legacy.md", "Notes/Appendix.md"],
					},
					userData: {
						title: "旧块标题",
						note: "旧块备注",
						tags: ["focus"],
						isStarred: true,
					},
					stats: {
						impressionCount: 2,
						reviewCount: 2,
						extractCount: 1,
						cardCreatedCount: 1,
						noteCreatedCount: 0,
						totalReadingTimeMs: 90000,
					},
					audit: {
						createdBy: "migration",
						origin: {
							type: "legacy-block",
							id: "legacy-block-1",
						},
					},
					metadata: {
						headingPath: ["第一章", "第一节"],
						headingText: "第一节",
						headingLevel: 2,
						startLine: 12,
						endLine: 18,
						contentPreview: "旧块预览",
						tagGroupId: "group-a",
					},
				},
				material: null,
				topicId: "topic-1",
				topicName: "专题一",
			},
		]);

		const blocks = await service.getAllBlocks();
		expect(blocks["legacy-block-1"]).toMatchObject({
			filePath: "Docs/Legacy.md",
			headingPath: ["第一章", "第一节"],
			state: "learning",
			priorityUi: 6,
			priorityEff: 7,
			tagGroupId: "group-a",
			primaryAssociatedNotePath: "Notes/Legacy.md",
			associatedNotePath: "Notes/Legacy.md",
			associatedNotePaths: ["Notes/Legacy.md", "Notes/Appendix.md"],
		});

		await service.saveDeck({
			id: "topic-1",
			name: "专题一",
			path: "topic-1",
			blockIds: ["legacy-block-1"],
			sourceFiles: ["Docs/Legacy.md"],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		} as any);

		await service.saveBlock({
			...blocks["legacy-block-1"],
			tags: ["focus", "updated"],
			notes: "已更新备注",
		});

		expect(pointStorageSpies.syncLegacyPoint).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "legacy-block-1",
				sourceType: "legacy-block",
				sourcePath: "Docs/Legacy.md",
				topicId: "topic-1",
				tags: ["focus", "updated"],
				note: "已更新备注",
				linkedNotePaths: ["Notes/Legacy.md", "Notes/Appendix.md"],
			}),
			expect.objectContaining({ preserveExisting: false })
		);

		await service.deleteBlock("legacy-block-1");
		expect(pointStorageSpies.deletePointByLegacyId).toHaveBeenCalledWith("legacy-block-1");
		expect(files.has("weave/incremental-reading/blocks.json")).toBe(false);
	});
});
