import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	apkgParserConstructor,
	mediaProcessorConstructor,
	mediaProcessorProcessMock,
	parserExtractMediaMock,
	parserParseDatabaseMock,
	parserPrepareArchiveMock,
} = vi.hoisted(() => {
	const parserPrepareArchiveMock = vi.fn();
	const parserParseDatabaseMock = vi.fn();
	const parserExtractMediaMock = vi.fn();
	const apkgParserConstructor = vi.fn(() => ({
		prepareArchive: parserPrepareArchiveMock,
		parseDatabase: parserParseDatabaseMock,
		extractMedia: parserExtractMediaMock,
	}));
	const mediaProcessorProcessMock = vi.fn();
	const mediaProcessorConstructor = vi.fn(() => ({ process: mediaProcessorProcessMock }));
	return {
		apkgParserConstructor,
		mediaProcessorConstructor,
		mediaProcessorProcessMock,
		parserExtractMediaMock,
		parserParseDatabaseMock,
		parserPrepareArchiveMock,
	};
});

vi.mock("../../../domain/apkg/parser/APKGParser", () => ({
	APKGParser: apkgParserConstructor,
}));

vi.mock("../../../domain/apkg/converter/MediaProcessor", () => ({
	MediaProcessor: mediaProcessorConstructor,
}));

import { APKGImportService } from "./APKGImportService";

describe("APKGImportService", () => {
	beforeEach(() => {
		apkgParserConstructor.mockClear();
		mediaProcessorConstructor.mockClear();
		mediaProcessorProcessMock.mockReset();
		parserExtractMediaMock.mockReset();
		parserParseDatabaseMock.mockReset();
		parserPrepareArchiveMock.mockReset();

		parserPrepareArchiveMock.mockResolvedValue({
			zip: {},
			format: { version: "anki2", dbFileName: "collection.anki2", supported: true, description: "Legacy" },
		});
		parserParseDatabaseMock.mockResolvedValue({
			models: [],
			decks: [{ id: 1, name: "导入牌组", desc: "", conf: 1, dyn: 0 }],
			notes: [],
			metadata: { created: 0, modified: 0, totalCards: 0, totalNotes: 0 },
		});
		parserExtractMediaMock.mockResolvedValue(new Map());
		mediaProcessorProcessMock.mockResolvedValue({
			success: true,
			savedFiles: new Map(),
			manifest: {
				deckName: "导入牌组",
				basePath: "weave/media/导入牌组",
				files: [],
				created: new Date(0).toISOString(),
				version: 1,
			},
			errors: [],
			stats: { totalFiles: 0, savedFiles: 0, skippedFiles: 0, failedFiles: 0, totalSize: 0 },
		});
	});

	it("creates standard import config for Weave and Obsidian-compatible content", () => {
		const config = APKGImportService.createStandardImportConfig({ name: "demo.apkg" } as File, "目标牌组");

		expect(config.targetDeckName).toBe("目标牌组");
		expect(config.skipExisting).toBe(false);
		expect(config.createDeckIfNotExist).toBe(true);
		expect(config.conversion).toEqual({
			preserveComplexTables: true,
			convertSimpleTables: true,
			mediaFormat: "wikilink",
			clozeFormat: "==",
			preserveStyles: false,
			preserveCardContentHtml: false,
			tableComplexityThreshold: {
				maxColumns: 10,
				maxRows: 20,
				allowMergedCells: false,
			},
		});
	});

	it("passes wasmUrl to APKGParser", () => {
		new APKGImportService({} as any, {} as any, {
			wasmUrl: "app://plugin/sql-wasm.wasm",
		});

		expect(apkgParserConstructor).toHaveBeenCalledWith("app://plugin/sql-wasm.wasm");
	});

	it("passes saving progress callback to data storage adapter", async () => {
		const createCards = vi.fn(async (_cards: any[], onProgress?: (current: number, total: number, detail: string) => void) => {
			onProgress?.(1, 1, "正在保存导入卡片（1/1）");
		});
		const getDeckByName = vi.fn(async () => ({
			id: "deck-1",
			name: "导入牌组",
		}));
		const dataStorage = {
			getDefaultDeckSettings: vi.fn(async () => ({})),
			getDeckByName,
			createDeck: vi.fn(),
			createCards,
			saveAll: vi.fn(async () => undefined),
		};
		const plugin = {
			settings: {},
			saveSettings: vi.fn(async () => undefined),
		} as any;
		const mediaStorage = {
			createDeckMediaFolder: vi.fn(async () => "weave/media/导入牌组"),
			calculateHash: vi.fn(async () => "hash"),
			generateObsidianPath: vi.fn((filename: string) => `weave/media/导入牌组/${filename}`),
			mediaFileExists: vi.fn(async () => false),
			saveMediaFile: vi.fn(async (filename: string) => `weave/media/导入牌组/${filename}`),
			saveManifest: vi.fn(async () => undefined),
		};
		const service = new APKGImportService(dataStorage as any, mediaStorage as any);
		const onProgress = vi.fn();

		await service.import(
			{
				file: { name: "demo.apkg" } as File,
				conversion: {
					preserveComplexTables: true,
					convertSimpleTables: true,
					mediaFormat: "wikilink",
					clozeFormat: "==",
					preserveStyles: false,
					preserveCardContentHtml: false,
					tableComplexityThreshold: {
						maxColumns: 3,
						maxRows: 5,
						allowMergedCells: false,
					},
				},
				skipExisting: false,
				createDeckIfNotExist: true,
			},
			plugin,
			onProgress
		);

		expect(createCards).toHaveBeenCalledWith(expect.any(Array), expect.any(Function));
		expect(onProgress).toHaveBeenCalledWith(
			expect.objectContaining({
				stage: "saving",
				completedItems: 1,
				totalItems: 1,
			})
		);
	});

	it("forwards parser media extraction progress to import progress", async () => {
		parserExtractMediaMock.mockImplementation(async (_archive: unknown, onProgress?: (progress: any) => void) => {
			onProgress?.({
				stage: "media",
				progress: 50,
				message: "正在提取媒体文件...",
				totalItems: 4,
				completedItems: 2,
				currentItem: "sound.mp3",
			});
			return new Map();
		});

		const dataStorage = {
			getDefaultDeckSettings: vi.fn(async () => ({})),
			getDeckByName: vi.fn(async () => ({ id: "deck-1", name: "导入牌组" })),
			createDeck: vi.fn(),
			createCards: vi.fn(async () => undefined),
			saveAll: vi.fn(async () => undefined),
		};
		const plugin = {
			settings: {},
			saveSettings: vi.fn(async () => undefined),
		} as any;
		const service = new APKGImportService(dataStorage as any, {} as any);
		const onProgress = vi.fn();

		await service.import(
			{
				file: { name: "demo.apkg" } as File,
				conversion: {
					preserveComplexTables: true,
					convertSimpleTables: true,
					mediaFormat: "wikilink",
					clozeFormat: "==",
					preserveStyles: false,
					preserveCardContentHtml: false,
					tableComplexityThreshold: {
						maxColumns: 3,
						maxRows: 5,
						allowMergedCells: false,
					},
				},
				skipExisting: false,
				createDeckIfNotExist: true,
			},
			plugin,
			onProgress
		);

		expect(onProgress).toHaveBeenCalledWith(
			expect.objectContaining({
				stage: "media",
				message: "正在提取媒体文件...",
				completedItems: 2,
				totalItems: 4,
				detail: "sound.mp3",
			})
		);
	});
});
