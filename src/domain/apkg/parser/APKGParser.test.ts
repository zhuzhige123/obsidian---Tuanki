
const { fromArrayBufferMock, sqliteReaderConstructor, sqliteReaderReadMock } = vi.hoisted(() => {
	const fromArrayBufferMock = vi.fn();
	const sqliteReaderReadMock = vi.fn();
	const sqliteReaderConstructor = vi.fn(() => ({ read: sqliteReaderReadMock }));
	return { fromArrayBufferMock, sqliteReaderConstructor, sqliteReaderReadMock };
});

vi.mock("../zip/minimal-zip", () => ({
	MinimalZipArchive: {
		fromArrayBuffer: fromArrayBufferMock,
	},
}));

vi.mock("./SQLiteReader", () => ({
	SQLiteReader: sqliteReaderConstructor,
}));

import { APKGParser } from "./APKGParser";

describe("APKGParser", () => {
	beforeEach(() => {
		fromArrayBufferMock.mockReset();
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
		fromArrayBufferMock.mockResolvedValue({
			has: vi.fn((name: string) => zipEntries.has(name)),
			file: vi.fn((name: string) => zipEntries.get(name) ?? null),
			names: Array.from(zipEntries.keys()),
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
