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
	saveBlock: vi.fn(),
	saveChunkData: vi.fn(),
	updateChunkDecks: vi.fn(),
	addBlocksToDeck: vi.fn(),
	removeBlocksFromDeck: vi.fn(),
};

const tagGroupSpies = {
	initialize: vi.fn(),
	clearDocumentMapCache: vi.fn(),
};

const pdfSpies = {
	initialize: vi.fn(),
	updateTask: vi.fn(),
};

const epubSpies = {
	initialize: vi.fn(),
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
		saveBlock = storageSpies.saveBlock;
		saveChunkData = storageSpies.saveChunkData;
		updateChunkDecks = storageSpies.updateChunkDecks;
		addBlocksToDeck = storageSpies.addBlocksToDeck;
		removeBlocksFromDeck = storageSpies.removeBlocksFromDeck;
	},
}));

vi.mock("../IRTagGroupService", () => ({
	IRTagGroupService: class {
		initialize = tagGroupSpies.initialize;
		clearDocumentMapCache = tagGroupSpies.clearDocumentMapCache;
	},
}));

vi.mock("../IRPdfBookmarkTaskService", () => ({
	IRPdfBookmarkTaskService: class {
		initialize = pdfSpies.initialize;
		updateTask = pdfSpies.updateTask;
	},
	isPdfBookmarkTaskId: (id: string) => id.startsWith("pdf-task:"),
}));

vi.mock("../IREpubBookmarkTaskService", () => ({
	IREpubBookmarkTaskService: class {
		initialize = epubSpies.initialize;
		updateTask = epubSpies.updateTask;
	},
	isEpubBookmarkTaskId: (id: string) => id.startsWith("epub-task:"),
}));

vi.mock("../../../utils/logger", () => ({
	logger: {
		warn: vi.fn(),
	},
}));

import {
	updateIRCardManagementAssociatedNotes,
	updateIRCardManagementDecks,
	updateIRCardManagementPriority,
	updateIRCardManagementTags,
} from "../IRCardManagementMutationService";

describe("IRCardManagementMutationService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		storageSpies.initialize.mockResolvedValue(undefined);
		storageSpies.getAllBlocks.mockResolvedValue({});
		storageSpies.getAllDecks.mockResolvedValue({});
		storageSpies.getChunkData.mockResolvedValue(null);
		storageSpies.saveBlock.mockResolvedValue(undefined);
		storageSpies.saveChunkData.mockResolvedValue(undefined);
		storageSpies.updateChunkDecks.mockResolvedValue(undefined);
		storageSpies.addBlocksToDeck.mockResolvedValue(undefined);
		storageSpies.removeBlocksFromDeck.mockResolvedValue(undefined);

		tagGroupSpies.initialize.mockResolvedValue(undefined);
		tagGroupSpies.clearDocumentMapCache.mockResolvedValue(undefined);

		pointTagSpies.savePdfTaskTags.mockResolvedValue(null);
		pointTagSpies.saveEpubTaskTags.mockResolvedValue(null);
		pointTagSpies.saveChunkTags.mockResolvedValue(null);
		pointTagSpies.matchGroupForTags.mockResolvedValue("default");

		pdfSpies.initialize.mockResolvedValue(undefined);
		pdfSpies.updateTask.mockResolvedValue(null);

		epubSpies.initialize.mockResolvedValue(undefined);
		epubSpies.updateTask.mockResolvedValue(null);
	});

	it("PDF 标签更新复用 IRPointTagService 并清理文档缓存", async () => {
		pointTagSpies.savePdfTaskTags.mockResolvedValue({
			pdfPath: "Books\\Demo.pdf",
		});

		const result = await updateIRCardManagementTags(
			{} as any,
			{ uuid: "pdf-task:1", metadata: {} } as any,
			["Alpha", "alpha", "Beta"]
		);

		expect(pointTagSpies.savePdfTaskTags).toHaveBeenCalledWith("pdf-task:1", ["alpha", "Beta"]);
		expect(tagGroupSpies.clearDocumentMapCache).toHaveBeenCalledWith("Books/Demo.pdf");
		expect(result).toEqual({
			kind: "pdf",
			sourceDocumentPath: "Books/Demo.pdf",
		});
	});

	it("旧版 block 标签更新会同步 tagGroupId 与 meta.tagGroup", async () => {
		const block = {
			id: "block-1",
			tags: ["old"],
			tagGroupId: "default",
			meta: {
				tagGroup: "default",
			},
		};
		storageSpies.getAllBlocks.mockResolvedValue({
			"block-1": block,
		});
		pointTagSpies.matchGroupForTags.mockResolvedValue("group-a");

		await updateIRCardManagementTags(
			{} as any,
			{
				uuid: "block-1",
				metadata: { irBlock: true },
				ir_source_document_key: "Inbox\\demo.md",
			} as any,
			["Topic/A", "Topic/A", "Topic/B"]
		);

		expect(storageSpies.saveBlock).toHaveBeenCalledWith(
			expect.objectContaining({
				tags: ["Topic/A", "Topic/B"],
				tagGroupId: "group-a",
				meta: expect.objectContaining({
					tagGroup: "group-a",
				}),
			})
		);
		expect(tagGroupSpies.clearDocumentMapCache).toHaveBeenCalledWith("Inbox/demo.md");
	});

	it("旧版 block 优先级更新会回填连续值并同步旧优先级枚举", async () => {
		const block = {
			id: "block-2",
			priority: 2,
			priorityUi: 5,
			priorityEff: 5,
		};
		storageSpies.getAllBlocks.mockResolvedValue({
			"block-2": block,
		});

		const result = await updateIRCardManagementPriority(
			{} as any,
			{
				uuid: "block-2",
				metadata: { irBlock: true },
				ir_source_document_key: "Books/source.md",
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
			sourceDocumentPath: "Books/source.md",
		});
	});

	it("chunk 关联笔记更新会写回主笔记和多笔记列表", async () => {
		storageSpies.getChunkData.mockResolvedValue({
			id: "chunk-1",
			filePath: "Inbox\\chunk.md",
			meta: {
				associatedNotePath: "Old/Legacy.md",
			},
		});

		const result = await updateIRCardManagementAssociatedNotes(
			{} as any,
			{
				uuid: "chunk-1",
				metadata: { irChunk: true },
				ir_source_document_key: "Inbox\\chunk.md",
			} as any,
			["Notes/Topic", "Notes/Appendix.md", "Notes/Topic.md"]
		);

		expect(storageSpies.saveChunkData).toHaveBeenCalledWith(
			expect.objectContaining({
				meta: expect.objectContaining({
					primaryAssociatedNotePath: "Notes/Topic.md",
					associatedNotePath: "Notes/Topic.md",
					associatedNotePaths: ["Notes/Topic.md", "Notes/Appendix.md"],
				}),
			})
		);
		expect(result).toEqual({
			kind: "chunk",
			sourceDocumentPath: "Inbox/chunk.md",
		});
	});

	it("PDF 关联笔记更新会通过任务服务写回 meta", async () => {
		pdfSpies.updateTask.mockResolvedValue({
			pdfPath: "Books\\Demo.pdf",
		});

		const result = await updateIRCardManagementAssociatedNotes(
			{} as any,
			{
				uuid: "pdf-task:1",
				metadata: {},
			} as any,
			["Notes/Primary.md", "Notes/Extra.md"]
		);

		expect(pdfSpies.updateTask).toHaveBeenCalledWith(
			"pdf-task:1",
			expect.objectContaining({
				meta: expect.objectContaining({
					primaryAssociatedNotePath: "Notes/Primary.md",
					associatedNotePath: "Notes/Primary.md",
					associatedNotePaths: ["Notes/Primary.md", "Notes/Extra.md"],
				}),
			})
		);
		expect(result).toEqual({
			kind: "pdf",
			sourceDocumentPath: "Books/Demo.pdf",
		});
	});
	it("chunk 专题更新会写回 deckIds", async () => {
		storageSpies.getChunkData.mockResolvedValue({
			chunkId: "chunk-2",
			filePath: "Inbox\\chunk-2.md",
		});

		const result = await updateIRCardManagementDecks(
			{} as any,
			{
				uuid: "chunk-2",
				metadata: { irChunk: true },
				ir_source_document_key: "Inbox\\chunk-2.md",
			} as any,
			["deck-a", "deck-a", "deck-b"]
		);

		expect(storageSpies.updateChunkDecks).toHaveBeenCalledWith("chunk-2", ["deck-a", "deck-b"]);
		expect(result).toEqual({
			kind: "chunk",
			sourceDocumentPath: "Inbox/chunk-2.md",
		});
	});

	it("PDF 专题更新会写回 topicId", async () => {
		pdfSpies.updateTask.mockResolvedValue({
			pdfPath: "Books\\Deck.pdf",
		});

		const result = await updateIRCardManagementDecks(
			{} as any,
			{
				uuid: "pdf-task:deck",
				metadata: {},
			} as any,
			["deck-target"]
		);

		expect(pdfSpies.updateTask).toHaveBeenCalledWith(
			"pdf-task:deck",
			expect.objectContaining({
				topicId: "deck-target",
				deckId: "deck-target",
			})
		);
		expect(result).toEqual({
			kind: "pdf",
			sourceDocumentPath: "Books/Deck.pdf",
		});
	});
});
