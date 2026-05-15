import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({
	normalizePath: (path: string) => path.replace(/\\/g, "/").replace(/\/{2,}/g, "/"),
}));

const pointTagSpies = {
	savePdfTaskTags: vi.fn(),
	saveEpubTaskTags: vi.fn(),
	saveChunkTags: vi.fn(),
	matchGroupForTags: vi.fn(),
};

const storageSpies = {
	initialize: vi.fn(),
	getAllBlocks: vi.fn(),
	getAllDecks: vi.fn(),
	getChunkData: vi.fn(),
	deleteChunkData: vi.fn(),
	deleteBlock: vi.fn(),
	saveBlock: vi.fn(),
	saveChunkData: vi.fn(),
	updateChunkDecks: vi.fn(),
	addBlocksToDeck: vi.fn(),
	removeBlocksFromDeck: vi.fn(),
};

const pdfSpies = {
	initialize: vi.fn(),
	createTask: vi.fn(),
	deleteTask: vi.fn(),
	deleteTasksByDeckIdentifiers: vi.fn(),
	deleteTasksByPdfPaths: vi.fn(),
	updateTask: vi.fn(),
};

	const epubSpies = {
	initialize: vi.fn(),
	createTask: vi.fn(),
	batchCreateTasks: vi.fn(),
	deleteTask: vi.fn(),
	deleteTasksByDeckIdentifiers: vi.fn(),
	deleteTasksByEpubPaths: vi.fn(),
	getTask: vi.fn(),
	setResumePoint: vi.fn(),
	updateTask: vi.fn(),
};

vi.mock("../IRPointTagService", () => ({
	IRPointTagService: class {
		savePdfTaskTags = pointTagSpies.savePdfTaskTags;
		saveEpubTaskTags = pointTagSpies.saveEpubTaskTags;
		saveChunkTags = pointTagSpies.saveChunkTags;
		matchGroupForTags = pointTagSpies.matchGroupForTags;
	},
	normalizeReadingPointTags: (tags: string[]) =>
		Array.from(new Map(tags.map((tag) => [String(tag).trim().toLowerCase(), String(tag).trim()])).values()).filter(Boolean),
}));

vi.mock("../IRStorageService", () => ({
	IRStorageService: class {
		initialize = storageSpies.initialize;
		getAllBlocks = storageSpies.getAllBlocks;
		getAllDecks = storageSpies.getAllDecks;
		getChunkData = storageSpies.getChunkData;
		deleteChunkData = storageSpies.deleteChunkData;
		deleteBlock = storageSpies.deleteBlock;
		saveBlock = storageSpies.saveBlock;
		saveChunkData = storageSpies.saveChunkData;
		updateChunkDecks = storageSpies.updateChunkDecks;
		addBlocksToDeck = storageSpies.addBlocksToDeck;
		removeBlocksFromDeck = storageSpies.removeBlocksFromDeck;
	},
}));

vi.mock("../IRPdfBookmarkTaskService", () => ({
	IRPdfBookmarkTaskService: class {
		initialize = pdfSpies.initialize;
		createTask = pdfSpies.createTask;
		deleteTask = pdfSpies.deleteTask;
		deleteTasksByDeckIdentifiers = pdfSpies.deleteTasksByDeckIdentifiers;
		deleteTasksByPdfPaths = pdfSpies.deleteTasksByPdfPaths;
		updateTask = pdfSpies.updateTask;
	},
	isPdfBookmarkTaskId: (id: string) => id.startsWith("pdf-task:"),
}));

vi.mock("../IREpubBookmarkTaskService", () => ({
	IREpubBookmarkTaskService: class {
		initialize = epubSpies.initialize;
		createTask = epubSpies.createTask;
		batchCreateTasks = epubSpies.batchCreateTasks;
		deleteTask = epubSpies.deleteTask;
		deleteTasksByDeckIdentifiers = epubSpies.deleteTasksByDeckIdentifiers;
		deleteTasksByEpubPaths = epubSpies.deleteTasksByEpubPaths;
		getTask = epubSpies.getTask;
		setResumePoint = epubSpies.setResumePoint;
		updateTask = epubSpies.updateTask;
	},
	isEpubBookmarkTaskId: (id: string) => id.startsWith("epub-task:"),
}));

import { IRPointWriteService } from "../IRPointWriteService";

describe("IRPointWriteService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		storageSpies.initialize.mockResolvedValue(undefined);
		storageSpies.getAllBlocks.mockResolvedValue({});
		storageSpies.getAllDecks.mockResolvedValue({});
		storageSpies.getChunkData.mockResolvedValue(null);
		storageSpies.deleteChunkData.mockResolvedValue(undefined);
		storageSpies.deleteBlock.mockResolvedValue(undefined);
		storageSpies.saveBlock.mockResolvedValue(undefined);
		storageSpies.saveChunkData.mockResolvedValue(undefined);
		storageSpies.updateChunkDecks.mockResolvedValue(undefined);
		storageSpies.addBlocksToDeck.mockResolvedValue(undefined);
		storageSpies.removeBlocksFromDeck.mockResolvedValue(undefined);

		pointTagSpies.savePdfTaskTags.mockResolvedValue(null);
		pointTagSpies.saveEpubTaskTags.mockResolvedValue(null);
		pointTagSpies.saveChunkTags.mockResolvedValue(null);
		pointTagSpies.matchGroupForTags.mockResolvedValue("default");

		pdfSpies.initialize.mockResolvedValue(undefined);
		pdfSpies.createTask.mockResolvedValue(null);
		pdfSpies.deleteTask.mockResolvedValue(true);
		pdfSpies.deleteTasksByDeckIdentifiers.mockResolvedValue(0);
		pdfSpies.deleteTasksByPdfPaths.mockResolvedValue(0);
		pdfSpies.updateTask.mockResolvedValue(null);

		epubSpies.initialize.mockResolvedValue(undefined);
		epubSpies.createTask.mockResolvedValue(null);
		epubSpies.batchCreateTasks.mockResolvedValue([]);
		epubSpies.deleteTask.mockResolvedValue(true);
		epubSpies.deleteTasksByDeckIdentifiers.mockResolvedValue(0);
		epubSpies.deleteTasksByEpubPaths.mockResolvedValue(0);
		epubSpies.getTask.mockResolvedValue(null);
		epubSpies.setResumePoint.mockResolvedValue(undefined);
		epubSpies.updateTask.mockResolvedValue(null);
	});

	it("PDF 标签更新走统一写入口并返回规范化源路径", async () => {
		pointTagSpies.savePdfTaskTags.mockResolvedValue({
			pdfPath: "Books\\Demo.pdf",
		});
		const service = new IRPointWriteService({} as any);

		const result = await service.updateTags(
			{ uuid: "pdf-task:1", metadata: {} } as any,
			["Alpha", "alpha", "Beta"]
		);

		expect(pointTagSpies.savePdfTaskTags).toHaveBeenCalledWith("pdf-task:1", ["alpha", "Beta"]);
		expect(result).toEqual({
			kind: "pdf",
			sourceDocumentPath: "Books/Demo.pdf",
		});
	});

	it("target 形式的标签更新会复用统一写入口卡片适配", async () => {
		pointTagSpies.saveChunkTags.mockResolvedValue({
			filePath: "Inbox\\Chunk.md",
		});
		const service = new IRPointWriteService({} as any);

		const result = await service.updatePointTags(
			{
				id: "chunk-1",
				kind: "chunk",
				sourceDocumentPath: "Inbox\\Chunk.md",
			},
			["Gamma", "gamma"]
		);

		expect(pointTagSpies.saveChunkTags).toHaveBeenCalledWith("chunk-1", ["gamma"]);
		expect(result).toEqual({
			kind: "chunk",
			sourceDocumentPath: "Inbox/Chunk.md",
		});
	});

	it("旧 block 优先级更新会同步 legacy priority 枚举和值", async () => {
		storageSpies.getAllBlocks.mockResolvedValue({
			"block-1": {
				id: "block-1",
				priority: 2,
				priorityUi: 4,
				priorityEff: 4,
			},
		});
		const service = new IRPointWriteService({} as any);

		const result = await service.updatePriority(
			{
				uuid: "block-1",
				metadata: { irBlock: true },
				ir_source_document_key: "Inbox\\block.md",
			} as any,
			7
		);

		expect(storageSpies.saveBlock).toHaveBeenCalledWith(
			expect.objectContaining({
				priority: 1,
				priorityUi: 7,
				priorityEff: 7,
			})
		);
		expect(result).toEqual({
			kind: "block",
			sourceDocumentPath: "Inbox/block.md",
		});
	});

	it("EPUB 关联笔记更新会归一化并写回任务 meta", async () => {
		epubSpies.updateTask.mockResolvedValue({
			epubFilePath: "Books\\Novel.epub",
		});
		const service = new IRPointWriteService({} as any);

		const result = await service.updateAssociatedNotes(
			{ uuid: "epub-task:1", metadata: {} } as any,
			["Notes/Topic", "Notes/Extra.md", "Notes/Topic.md"]
		);

		expect(epubSpies.updateTask).toHaveBeenCalledWith(
			"epub-task:1",
			expect.objectContaining({
				meta: expect.objectContaining({
					primaryAssociatedNotePath: "Notes/Topic.md",
					associatedNotePath: "Notes/Topic.md",
					associatedNotePaths: ["Notes/Topic.md", "Notes/Extra.md"],
				}),
			})
		);
		expect(result).toEqual({
			kind: "epub",
			sourceDocumentPath: "Books/Novel.epub",
		});
	});

	it("chunk 专题更新只保留首个专题", async () => {
		storageSpies.getChunkData.mockResolvedValue({
			id: "chunk-1",
			filePath: "Inbox\\chunk.md",
		});
		const service = new IRPointWriteService({} as any);

		const result = await service.updateDecks(
			{
				uuid: "chunk-1",
				metadata: { irChunk: true },
				ir_source_document_key: "Inbox\\chunk.md",
			} as any,
			["deck-a", "deck-a", "deck-b"]
		);

		expect(storageSpies.updateChunkDecks).toHaveBeenCalledWith("chunk-1", ["deck-a"]);
		expect(result).toEqual({
			kind: "chunk",
			sourceDocumentPath: "Inbox/chunk.md",
		});
	});
	it("PDF 创建走统一写入口并复用底层任务服务", async () => {
		const createdTask = {
			id: "pdf-task:created",
			pdfPath: "Books\\Created.pdf",
		};
		pdfSpies.createTask.mockResolvedValue(createdTask);
		const service = new IRPointWriteService({} as any);

		const result = await service.createPdfPoint({
			deckId: "deck-a",
			pdfPath: "Books\\Created.pdf",
			title: "Created",
			link: "Books/Created.pdf#page=1",
		});

		expect(pdfSpies.createTask).toHaveBeenCalledWith({
			deckId: "deck-a",
			pdfPath: "Books\\Created.pdf",
			title: "Created",
			link: "Books/Created.pdf#page=1",
		});
		expect(result).toBe(createdTask);
	});

	it("PDF 创建会透传首次导入顺序元数据", async () => {
		const createdTask = {
			id: "pdf-task:sequence",
			pdfPath: "Books\\Ordered.pdf",
		};
		pdfSpies.createTask.mockResolvedValue(createdTask);
		const service = new IRPointWriteService({} as any);

		await service.createPdfPoint({
			deckId: "deck-a",
			pdfPath: "Books\\Ordered.pdf",
			title: "Ordered",
			link: "Books/Ordered.pdf#page=3",
			sourceSequenceGroup: "pdf:Books/Ordered.pdf",
			sourceSequenceOrder: 3,
			sourceSequenceLocked: true,
			sourceSequenceAnchorDateKey: "2026-04-24",
		});

		expect(pdfSpies.createTask).toHaveBeenCalledWith({
			deckId: "deck-a",
			pdfPath: "Books\\Ordered.pdf",
			title: "Ordered",
			link: "Books/Ordered.pdf#page=3",
			sourceSequenceGroup: "pdf:Books/Ordered.pdf",
			sourceSequenceOrder: 3,
			sourceSequenceLocked: true,
			sourceSequenceAnchorDateKey: "2026-04-24",
		});
	});

	it("EPUB 批量创建走统一写入口", async () => {
		const createdTasks = [{ id: "epub-task:1" }, { id: "epub-task:2" }];
		epubSpies.batchCreateTasks.mockResolvedValue(createdTasks);
		const service = new IRPointWriteService({} as any);

		const result = await service.batchCreateEpubPoints([
			{
				deckId: "deck-a",
				epubFilePath: "Books\\Novel.epub",
				title: "Chapter 1",
				tocHref: "chapter-1.xhtml",
				tocLevel: 1,
				nextRepDate: 123,
			},
		]);

		expect(epubSpies.batchCreateTasks).toHaveBeenCalledWith([
			{
				deckId: "deck-a",
				epubFilePath: "Books\\Novel.epub",
				title: "Chapter 1",
				tocHref: "chapter-1.xhtml",
				tocLevel: 1,
				nextRepDate: 123,
			},
		]);
		expect(result).toBe(createdTasks);
	});

	it("EPUB 批量创建会透传首次导入顺序元数据", async () => {
		const createdTasks = [{ id: "epub-task:ordered" }];
		epubSpies.batchCreateTasks.mockResolvedValue(createdTasks);
		const service = new IRPointWriteService({} as any);

		await service.batchCreateEpubPoints([
			{
				deckId: "deck-a",
				epubFilePath: "Books\\Novel.epub",
				title: "Chapter 3",
				tocHref: "chapter-3.xhtml",
				tocLevel: 1,
				nextRepDate: 456,
				sourceSequenceGroup: "epub:source-1",
				sourceSequenceOrder: 3,
				sourceSequenceLocked: true,
				sourceSequenceAnchorDateKey: "2026-04-25",
			},
		]);

		expect(epubSpies.batchCreateTasks).toHaveBeenCalledWith([
			{
				deckId: "deck-a",
				epubFilePath: "Books\\Novel.epub",
				title: "Chapter 3",
				tocHref: "chapter-3.xhtml",
				tocLevel: 1,
				nextRepDate: 456,
				sourceSequenceGroup: "epub:source-1",
				sourceSequenceOrder: 3,
				sourceSequenceLocked: true,
				sourceSequenceAnchorDateKey: "2026-04-25",
			},
		]);
	});

	it("删除 PDF 点会走到底层 PDF 删除链路", async () => {
		const service = new IRPointWriteService({} as any);

		const result = await service.deletePoint({
			id: "pdf-task:delete-1",
		});

		expect(pdfSpies.deleteTask).toHaveBeenCalledWith("pdf-task:delete-1");
		expect(result).toBe(true);
	});

	it("按专题批量删除会同时复用 PDF 和 EPUB 删除链路", async () => {
		pdfSpies.deleteTasksByDeckIdentifiers.mockResolvedValue(2);
		epubSpies.deleteTasksByDeckIdentifiers.mockResolvedValue(3);
		const service = new IRPointWriteService({} as any);

		const result = await service.deletePointsByDeckIdentifiers(["deck-a", "deck-a", "deck-b"]);

		expect(pdfSpies.deleteTasksByDeckIdentifiers).toHaveBeenCalledWith(["deck-a", "deck-b"]);
		expect(epubSpies.deleteTasksByDeckIdentifiers).toHaveBeenCalledWith(["deck-a", "deck-b"]);
		expect(result).toBe(5);
	});

	it("按 PDF 路径批量删除会先规范化后走统一写入口", async () => {
		pdfSpies.deleteTasksByPdfPaths.mockResolvedValue(2);
		const service = new IRPointWriteService({} as any);

		const result = await service.deletePdfPointsByPaths(["Books\\A.pdf", "Books/A.pdf", ""]);

		expect(pdfSpies.deleteTasksByPdfPaths).toHaveBeenCalledWith(["Books/A.pdf"]);
		expect(result).toBe(2);
	});

	it("按 EPUB 路径批量删除会先规范化后走统一写入口", async () => {
		epubSpies.deleteTasksByEpubPaths.mockResolvedValue(3);
		const service = new IRPointWriteService({} as any);

		const result = await service.deleteEpubPointsByPaths(["Books\\Novel.epub", "Books/Novel.epub", ""]);

		expect(epubSpies.deleteTasksByEpubPaths).toHaveBeenCalledWith(["Books/Novel.epub"]);
		expect(result).toBe(3);
	});

	it("EPUB 续读点更新会走统一写入口并保留源文档路径", async () => {
		epubSpies.getTask.mockResolvedValue({
			id: "epub-task:1",
			epubFilePath: "Books\\Novel.epub",
		});
		const service = new IRPointWriteService({} as any);

		const result = await service.updateEpubResumePoint("epub-task:1", "epubcfi(/6/4)");

		expect(epubSpies.getTask).toHaveBeenCalledWith("epub-task:1");
		expect(epubSpies.setResumePoint).toHaveBeenCalledWith("epub-task:1", "epubcfi(/6/4)");
		expect(result).toEqual({
			kind: "epub",
			sourceDocumentPath: "Books/Novel.epub",
		});
	});

	it("删除 chunk 点会走旧存储删除并支持自动识别", async () => {
		storageSpies.getChunkData.mockResolvedValue({
			id: "chunk-1",
			filePath: "Inbox\\chunk.md",
		});
		const service = new IRPointWriteService({} as any);

		const result = await service.deletePoint({
			id: "chunk-1",
		});

		expect(storageSpies.deleteChunkData).toHaveBeenCalledWith("chunk-1");
		expect(result).toBe(true);
	});
});
