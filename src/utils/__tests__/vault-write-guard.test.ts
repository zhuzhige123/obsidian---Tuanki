import { TFile } from "obsidian";
import {
	adapterWriteIfChanged,
	createUniqueVaultTextFile,
	ensureVaultTextFile,
	isVaultFileAlreadyExistsError,
	resolveUniqueVaultFilePath,
	textContentEquals,
} from "../vault-write-guard";

describe("vault-write-guard", () => {
	it("treats CRLF and LF as equal", () => {
		expect(textContentEquals("a\r\nb", "a\nb")).toBe(true);
	});

	it("skips adapter write when content is unchanged", async () => {
		const write = vi.fn(async () => undefined);
		const adapter = {
			exists: async () => true,
			read: async () => "same",
			write,
		};

		const result = await adapterWriteIfChanged(adapter, "weave/memory/test.json", "same");
		expect(result).toEqual({ written: false, skipped: true });
		expect(write).not.toHaveBeenCalled();
	});

	it("writes when content changed", async () => {
		const write = vi.fn(async () => undefined);
		const adapter = {
			exists: async () => true,
			read: async () => "old",
			write,
		};

		const result = await adapterWriteIfChanged(adapter, "weave/memory/test.json", "new");
		expect(result).toEqual({ written: true, skipped: false });
		expect(write).toHaveBeenCalledWith("weave/memory/test.json", "new");
	});

	it("detects vault already-exists errors", () => {
		expect(isVaultFileAlreadyExistsError(new Error("File already exists."))).toBe(true);
		expect(isVaultFileAlreadyExistsError(new Error("other"))).toBe(false);
	});

	it("modifies indexed vault files when content changed", async () => {
		const modify = vi.fn(async () => undefined);
		const read = vi.fn(async () => "old");
		const vault = {
			getAbstractFileByPath: () => new TFile("weave/memory/attachment-registry.md"),
			read,
			modify,
			create: vi.fn(),
			adapter: {
				exists: async () => false,
				read: async () => "",
				write: vi.fn(),
			},
		};

		const result = await ensureVaultTextFile(
			vault as never,
			"weave/memory/attachment-registry.md",
			"new"
		);

		expect(result).toEqual({ written: true, skipped: false });
		expect(modify).toHaveBeenCalled();
	});

	it("falls back to adapter write when file exists on disk but is not indexed", async () => {
		const write = vi.fn(async () => undefined);
		const vault = {
			getAbstractFileByPath: () => null,
			read: vi.fn(),
			modify: vi.fn(),
			create: vi.fn(),
			adapter: {
				exists: async () => true,
				read: async () => "old",
				write,
			},
		};

		const result = await ensureVaultTextFile(
			vault as never,
			"weave/memory/attachment-registry.md",
			"new"
		);

		expect(result).toEqual({ written: true, skipped: false });
		expect(write).toHaveBeenCalledWith("weave/memory/attachment-registry.md", "new");
	});

	it("recovers from create race when file already exists", async () => {
		const write = vi.fn(async () => undefined);
		const modify = vi.fn(async () => undefined);
		let indexed = false;
		const vault = {
			getAbstractFileByPath: () =>
				indexed ? new TFile("weave/memory/attachment-registry.md") : null,
			read: vi.fn(async () => "old"),
			modify,
			create: vi.fn(async () => {
				indexed = true;
				throw new Error("File already exists.");
			}),
			adapter: {
				exists: async () => false,
				read: async () => "old",
				write,
			},
		};

		const result = await ensureVaultTextFile(
			vault as never,
			"weave/memory/attachment-registry.md",
			"new"
		);

		expect(result).toEqual({ written: true, skipped: false });
		expect(modify).toHaveBeenCalled();
	});

	it("recovers via adapter read when create races and vault index is still empty", async () => {
		const write = vi.fn(async () => undefined);
		const vault = {
			getAbstractFileByPath: () => null,
			read: vi.fn(),
			modify: vi.fn(),
			create: vi.fn(async () => {
				throw new Error("File already exists.");
			}),
			adapter: {
				exists: async () => false,
				read: async () => "old",
				write,
			},
		};

		const result = await ensureVaultTextFile(
			vault as never,
			"weave/memory/attachment-registry.md",
			"new"
		);

		expect(result).toEqual({ written: true, skipped: false });
		expect(write).toHaveBeenCalledWith("weave/memory/attachment-registry.md", "new");
	});

	it("resolves unique vault paths when only adapter sees an existing file", async () => {
		const vault = {
			getAbstractFileByPath: () => null,
			create: vi.fn(),
			adapter: {
				exists: async (path: string) => path === "Weave Export 2026-07-04.md",
				read: async () => "",
				write: vi.fn(),
			},
		};

		await expect(
			resolveUniqueVaultFilePath(vault as never, "Weave Export 2026-07-04.md")
		).resolves.toBe("Weave Export 2026-07-04 1.md");
	});

	it("creates numbered suffix files when the target already exists", async () => {
		const existing = new Set(["Weave Export 2026-07-04.md"]);
		const create = vi.fn(async (path: string) => {
			existing.add(path);
		});
		const vault = {
			getAbstractFileByPath: (path: string) =>
				existing.has(path) ? new TFile(path) : null,
			create,
			adapter: {
				exists: async (path: string) => existing.has(path),
				read: async () => "",
				write: vi.fn(),
			},
		};

		const createdPath = await createUniqueVaultTextFile(
			vault as never,
			"Weave Export 2026-07-04.md",
			"export body"
		);

		expect(createdPath).toBe("Weave Export 2026-07-04 1.md");
		expect(create).toHaveBeenCalledWith("Weave Export 2026-07-04 1.md", "export body");
	});

	it("retries with the next suffix when create races with an already-exists error", async () => {
		const existing = new Set(["Weave Export 2026-07-04.md"]);
		const create = vi.fn(async (path: string) => {
			if (path === "Weave Export 2026-07-04 1.md") {
				existing.add(path);
				throw new Error("File already exists.");
			}
			existing.add(path);
		});
		const vault = {
			getAbstractFileByPath: (path: string) =>
				existing.has(path) ? new TFile(path) : null,
			create,
			adapter: {
				exists: async (path: string) => existing.has(path),
				read: async () => "",
				write: vi.fn(),
			},
		};

		const createdPath = await createUniqueVaultTextFile(
			vault as never,
			"Weave Export 2026-07-04.md",
			"export body"
		);

		expect(createdPath).toBe("Weave Export 2026-07-04 2.md");
		expect(create).toHaveBeenCalledTimes(2);
	});
});
