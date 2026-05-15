import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadAsyncMock, sqliteReaderConstructor, sqliteReaderReadMock } = vi.hoisted(() => {
	const loadAsyncMock = vi.fn();
	const sqliteReaderReadMock = vi.fn();
	const sqliteReaderConstructor = vi.fn(() => ({ read: sqliteReaderReadMock }));
	return { loadAsyncMock, sqliteReaderConstructor, sqliteReaderReadMock };
});

vi.mock("jszip", () => ({
	default: {
		loadAsync: loadAsyncMock,
	},
}));

vi.mock("./SQLiteReader", () => ({
	SQLiteReader: sqliteReaderConstructor,
}));

import { APKGParser } from "./APKGParser";

describe("APKGParser", () => {
	beforeEach(() => {
		loadAsyncMock.mockReset();
		sqliteReaderReadMock.mockReset();
		sqliteReaderConstructor.mockClear();
		sqliteReaderConstructor.mockImplementation(() => ({ read: sqliteReaderReadMock }));
	});

	it("passes wasmUrl to SQLiteReader", () => {
		new APKGParser("app://plugin/sql-wasm.wasm");

		expect(sqliteReaderConstructor).toHaveBeenCalledWith("app://plugin/sql-wasm.wasm");
	});

	it("reports media extraction progress while parsing", async () => {
		const zipEntries = new Map<string, { async: (type: string) => Promise<Uint8Array | string> }>([
			[
				"collection.anki2",
				{ async: vi.fn(async () => new Uint8Array([1, 2, 3])) },
			],
			[
				"media",
				{ async: vi.fn(async () => JSON.stringify({ 0: "sound.mp3", 1: "image.png" })) },
			],
			[
				"0",
				{ async: vi.fn(async () => new Uint8Array([7])) },
			],
			[
				"1",
				{ async: vi.fn(async () => new Uint8Array([8])) },
			],
		]);
		loadAsyncMock.mockResolvedValue({
			files: Object.fromEntries(Array.from(zipEntries.keys()).map((key) => [key, {}])),
			file: vi.fn((name: string) => zipEntries.get(name) ?? null),
		});
		sqliteReaderReadMock.mockResolvedValue({
			models: [],
			decks: [],
			notes: [],
			metadata: { created: 0, modified: 0, totalCards: 0, totalNotes: 0 },
		});

		const parser = new APKGParser("app://plugin/sql-wasm.wasm");
		const onProgress = vi.fn();
		const result = await parser.parse(
			{
				name: "demo.apkg",
				arrayBuffer: vi.fn(async () => new ArrayBuffer(8)),
			} as unknown as File,
			onProgress
		);

		expect(result.media.size).toBe(2);
		expect(result.media.get("sound.mp3")).toEqual(new Uint8Array([7]));
		expect(onProgress).toHaveBeenCalledWith(
			expect.objectContaining({
				stage: "media",
				totalItems: 2,
				completedItems: 1,
				currentItem: "sound.mp3",
			})
		);
	});
});
