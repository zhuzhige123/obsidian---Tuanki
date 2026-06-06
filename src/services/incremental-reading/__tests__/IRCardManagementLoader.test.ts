
let workspaceSnapshotMock: any;
let pointSnapshotsMock: any[] = [];

const builderSpies = {
	buildLegacyIRBlockCard: vi.fn(),
	buildIRChunkCard: vi.fn(),
	buildIRPdfTaskCard: vi.fn(),
	buildIREpubTaskCard: vi.fn(),
	buildIRPdfPointCard: vi.fn(),
	buildIREpubPointCard: vi.fn(),
};

vi.mock("../../../utils/logger", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
	},
}));

vi.mock("../IRWorkspaceSnapshotService", () => ({
	getSharedIRWorkspaceSnapshotService: () => ({
		getWorkspaceData: vi.fn(async () => workspaceSnapshotMock),
	}),
}));

vi.mock("../IRPointDataReadService", () => ({
	IRPointDataReadService: class {
		async listPointSnapshots() {
			return pointSnapshotsMock;
		}
	},
}));

vi.mock("../IRCardManagementAdapter", () => ({
	createIRTagGroupNameResolver: vi.fn(async () => async () => "默认"),
}));

vi.mock("../IRCardManagementBuilders", () => ({
	buildLegacyIRBlockCard: (...args: any[]) => builderSpies.buildLegacyIRBlockCard(...args),
	buildIRChunkCard: (...args: any[]) => builderSpies.buildIRChunkCard(...args),
	buildIRPdfTaskCard: (...args: any[]) => builderSpies.buildIRPdfTaskCard(...args),
	buildIREpubTaskCard: (...args: any[]) => builderSpies.buildIREpubTaskCard(...args),
	buildIRPdfPointCard: (...args: any[]) => builderSpies.buildIRPdfPointCard(...args),
	buildIREpubPointCard: (...args: any[]) => builderSpies.buildIREpubPointCard(...args),
}));

import { loadIRCardManagementData } from "../IRCardManagementLoader";

describe("IRCardManagementLoader", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		workspaceSnapshotMock = {
			blocksRecord: {},
			decksRecord: {},
			history: { sessions: [] },
			chunksRecord: {},
			sourcesRecord: {},
			pdfTasks: [],
			epubTasks: [],
		};
		pointSnapshotsMock = [];
		builderSpies.buildLegacyIRBlockCard.mockResolvedValue(null);
		builderSpies.buildIRChunkCard.mockResolvedValue(null);
		builderSpies.buildIRPdfTaskCard.mockImplementation(async ({ task }: any) => ({
			uuid: task.id,
			metadata: { irPdfBookmark: true },
		}));
		builderSpies.buildIREpubTaskCard.mockImplementation(async ({ task }: any) => ({
			uuid: task.id,
			metadata: { irEpubBookmark: true },
		}));
		builderSpies.buildIRPdfPointCard.mockImplementation(async ({ point }: any) => ({
			uuid: point.id,
			metadata: { irPdfBookmark: true },
		}));
		builderSpies.buildIREpubPointCard.mockImplementation(async ({ point }: any) => ({
			uuid: point.id,
			metadata: { irEpubBookmark: true },
		}));
	});

	it("优先读取已迁移的新点，并对旧任务做去重回退", async () => {
		pointSnapshotsMock = [
			{
				point: {
					id: "pdfbm-1",
					pointType: "selection-entry",
					trace: { locatorType: "pdf-selection" },
					schedule: { status: "queued" },
					audit: { origin: { type: "pdf-bookmark" } },
				},
				material: { source: { type: "pdf", path: "Docs/A.pdf" } },
				topicId: "topic-1",
				topicName: "专题一",
			},
			{
				point: {
					id: "epubbm-1",
					pointType: "chapter-entry",
					trace: { locatorType: "epub-chapter" },
					schedule: { status: "active" },
					audit: { origin: { type: "epub-bookmark" } },
				},
				material: { source: { type: "epub", path: "Books/A.epub" } },
				topicId: "topic-2",
				topicName: "专题二",
			},
		];
		workspaceSnapshotMock.pdfTasks = [
			{ id: "pdfbm-1", status: "queued" },
			{ id: "pdfbm-2", status: "queued" },
		];
		workspaceSnapshotMock.epubTasks = [
			{ id: "epubbm-1", status: "queued" },
			{ id: "epubbm-2", status: "queued" },
		];

		const result = await loadIRCardManagementData({
			app: {} as any,
			plugin: {} as any,
			storage: {} as any,
			helpers: {
				buildIRCardBase: vi.fn(),
				resolveIRDeckId: vi.fn(),
				resolveIRDeckIds: vi.fn(),
				getIRDeckName: vi.fn(),
				getIRReadingSeconds: vi.fn(),
			},
		});

		expect(result.cards.map((card) => card.uuid)).toEqual([
			"pdfbm-1",
			"pdfbm-2",
			"epubbm-1",
			"epubbm-2",
		]);
		expect(result.pdfTaskCount).toBe(2);
		expect(result.epubTaskCount).toBe(2);
		expect(builderSpies.buildIRPdfPointCard).toHaveBeenCalledTimes(1);
		expect(builderSpies.buildIREpubPointCard).toHaveBeenCalledTimes(1);
		expect(builderSpies.buildIRPdfTaskCard).toHaveBeenCalledTimes(1);
		expect(builderSpies.buildIRPdfTaskCard).toHaveBeenCalledWith(
			expect.objectContaining({
				task: expect.objectContaining({ id: "pdfbm-2" }),
			})
		);
		expect(builderSpies.buildIREpubTaskCard).toHaveBeenCalledTimes(1);
		expect(builderSpies.buildIREpubTaskCard).toHaveBeenCalledWith(
			expect.objectContaining({
				task: expect.objectContaining({ id: "epubbm-2" }),
			})
		);
	});

	it("新点已完成或移除时不会回退显示同 ID 的旧任务", async () => {
		pointSnapshotsMock = [
			{
				point: {
					id: "pdfbm-archived",
					pointType: "selection-entry",
					trace: { locatorType: "pdf-selection" },
					schedule: { status: "done" },
					audit: { origin: { type: "pdf-bookmark" } },
				},
				material: { source: { type: "pdf", path: "Docs/B.pdf" } },
				topicId: "topic-1",
				topicName: "专题一",
			},
		];
		workspaceSnapshotMock.pdfTasks = [
			{ id: "pdfbm-archived", status: "queued" },
		];

		const result = await loadIRCardManagementData({
			app: {} as any,
			plugin: {} as any,
			storage: {} as any,
			helpers: {
				buildIRCardBase: vi.fn(),
				resolveIRDeckId: vi.fn(),
				resolveIRDeckIds: vi.fn(),
				getIRDeckName: vi.fn(),
				getIRReadingSeconds: vi.fn(),
			},
		});

		expect(result.cards).toHaveLength(0);
		expect(result.pdfTaskCount).toBe(0);
		expect(builderSpies.buildIRPdfPointCard).not.toHaveBeenCalled();
		expect(builderSpies.buildIRPdfTaskCard).not.toHaveBeenCalled();
	});

	it("优先读取已迁移的 chunk point，并跳过同 ID 的旧 chunk 回退", async () => {
		pointSnapshotsMock = [
			{
				point: {
					id: "chunk-1",
					pointType: "chunk-entry",
					materialId: "source-1",
					trace: {
						locatorType: "markdown-chunk",
						locator: {
							chunkFilePath: "IR/Chunks/01_Chunk.md",
							sourcePath: "Docs/Source.md",
						},
					},
					schedule: {
						status: "queued",
						manualPriority: 4,
						priorityScore: 6,
						intervalDays: 3,
						nextReviewAt: "2026-04-16T10:00:00.000Z",
					},
					audit: { origin: { type: "ir-chunk" } },
					relations: {
						topicIds: ["topic-1"],
						linkedCardIds: [],
						linkedNotePaths: [],
					},
					userData: {
						title: "Chunk Title",
						tags: ["alpha"],
						isStarred: false,
					},
					stats: {
						impressionCount: 2,
						reviewCount: 2,
						extractCount: 1,
						cardCreatedCount: 0,
						noteCreatedCount: 0,
						totalReadingTimeMs: 60000,
					},
					timestamps: {
						createdAt: "2026-04-16T10:00:00.000Z",
						updatedAt: "2026-04-16T10:00:00.000Z",
						lastInteractionAt: "2026-04-16T10:00:00.000Z",
					},
					metadata: {
						chunkFilePath: "IR/Chunks/01_Chunk.md",
						sourceTitle: "Source Title",
						sourcePath: "Docs/Source.md",
					},
				},
				material: {
					source: { type: "file", path: "Docs/Source.md" },
					bibliography: { title: "Source Title" },
				},
				topicId: "topic-1",
				topicName: "专题一",
			},
		];
		workspaceSnapshotMock.chunksRecord = {
			"chunk-1": {
				chunkId: "chunk-1",
				sourceId: "source-1",
				filePath: "IR/Chunks/01_Chunk.md",
				scheduleStatus: "queued",
			},
			"chunk-2": {
				chunkId: "chunk-2",
				sourceId: "source-2",
				filePath: "IR/Chunks/02_Chunk.md",
				scheduleStatus: "queued",
			},
		};
		workspaceSnapshotMock.sourcesRecord = {
			"source-1": { sourceId: "source-1", title: "Old Source 1", originalPath: "Docs/Source.md" },
			"source-2": { sourceId: "source-2", title: "Old Source 2", originalPath: "Docs/Other.md" },
		};
		builderSpies.buildIRChunkCard.mockImplementation(async ({ chunk }: any) => ({
			uuid: chunk.chunkId,
			metadata: { irChunk: true },
		}));

		const result = await loadIRCardManagementData({
			app: {} as any,
			plugin: {} as any,
			storage: {} as any,
			helpers: {
				buildIRCardBase: vi.fn(),
				resolveIRDeckId: vi.fn(),
				resolveIRDeckIds: vi.fn((ids: Array<string | null | undefined>) =>
					ids.filter((id): id is string => typeof id === "string")
				),
				getIRDeckName: vi.fn(() => "专题一"),
				getIRReadingSeconds: vi.fn(),
			},
		});

		expect(result.cards.map((card) => card.uuid)).toContain("chunk-1");
		expect(result.cards.map((card) => card.uuid)).toContain("chunk-2");
		expect(builderSpies.buildIRChunkCard).toHaveBeenCalledTimes(2);
		expect(builderSpies.buildIRChunkCard).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				chunk: expect.objectContaining({ chunkId: "chunk-1" }),
			})
		);
		expect(builderSpies.buildIRChunkCard).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				chunk: expect.objectContaining({ chunkId: "chunk-2" }),
			})
		);
	});

	it("旧 block 与新 point 同时存在时，会按 uuid 去重并优先保留新 point 卡片", async () => {
		workspaceSnapshotMock.blocksRecord = {
			"dup-point-1": {
				id: "dup-point-1",
			},
		};
		pointSnapshotsMock = [
			{
				point: {
					id: "dup-point-1",
					pointType: "chunk-entry",
					materialId: "source-1",
					trace: {
						locatorType: "markdown-chunk",
						locator: {
							chunkFilePath: "IR/Chunks/Duplicate.md",
							sourcePath: "Docs/Source.md",
						},
					},
					schedule: {
						status: "queued",
						manualPriority: 4,
						priorityScore: 6,
						intervalDays: 3,
						nextReviewAt: "2026-04-16T10:00:00.000Z",
					},
					audit: { origin: { type: "ir-chunk" } },
					relations: {
						topicIds: ["topic-1"],
						linkedCardIds: [],
						linkedNotePaths: [],
					},
					userData: {
						title: "Duplicate Title",
						tags: ["alpha"],
						isStarred: false,
					},
					stats: {
						impressionCount: 2,
						reviewCount: 2,
						extractCount: 1,
						cardCreatedCount: 0,
						noteCreatedCount: 0,
						totalReadingTimeMs: 60000,
					},
					timestamps: {
						createdAt: "2026-04-16T10:00:00.000Z",
						updatedAt: "2026-04-16T10:00:00.000Z",
						lastInteractionAt: "2026-04-16T10:00:00.000Z",
					},
					metadata: {
						chunkFilePath: "IR/Chunks/Duplicate.md",
						sourceTitle: "Source Title",
						sourcePath: "Docs/Source.md",
					},
				},
				material: {
					source: { type: "file", path: "Docs/Source.md" },
					bibliography: { title: "Source Title" },
				},
				topicId: "topic-1",
				topicName: "专题一",
			},
		];
		builderSpies.buildLegacyIRBlockCard.mockResolvedValue({
			uuid: "dup-point-1",
			metadata: { irBlock: true, source: "legacy" },
		});
		builderSpies.buildIRChunkCard.mockImplementation(async ({ chunk }: any) => ({
			uuid: chunk.chunkId,
			metadata: { irChunk: true, source: "point" },
		}));

		const result = await loadIRCardManagementData({
			app: {} as any,
			plugin: {} as any,
			storage: {} as any,
			helpers: {
				buildIRCardBase: vi.fn(),
				resolveIRDeckId: vi.fn(),
				resolveIRDeckIds: vi.fn((ids: Array<string | null | undefined>) =>
					ids.filter((id): id is string => typeof id === "string")
				),
				getIRDeckName: vi.fn(() => "专题一"),
				getIRReadingSeconds: vi.fn(),
			},
		});

		expect(result.cards).toEqual([
			{
				uuid: "dup-point-1",
				metadata: { irChunk: true, source: "point" },
			},
		]);
	});
});
