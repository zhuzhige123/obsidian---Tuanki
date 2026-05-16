import {
	cleanupUnusedLegacyMemoryStorage,
	hasLegacyMemoryCardStorage,
} from "../legacy-memory-storage";

function normalizePath(path: string): string {
	return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
}

function parentPath(path: string): string {
	const normalized = normalizePath(path);
	const index = normalized.lastIndexOf("/");
	return index > 0 ? normalized.slice(0, index) : "";
}

function createApp(initialFiles: Record<string, string> = {}, initialDirs: string[] = []) {
	const files = new Map<string, string>();
	const dirs = new Set<string>(["", "weave", "weave/memory"]);

	const ensureDir = (dir: string) => {
		const normalized = normalizePath(dir);
		if (!normalized) return;
		const parts = normalized.split("/");
		let current = "";
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			dirs.add(current);
		}
	};

	const writeFile = (path: string, content: string) => {
		const normalized = normalizePath(path);
		ensureDir(parentPath(normalized));
		files.set(normalized, content);
	};

	for (const dir of initialDirs) {
		ensureDir(dir);
	}

	for (const [path, content] of Object.entries(initialFiles)) {
		writeFile(path, content);
	}

	const adapter = {
		exists: async (path: string) => {
			const normalized = normalizePath(path);
			return files.has(normalized) || dirs.has(normalized);
		},
		list: async (dir: string) => {
			const normalized = normalizePath(dir);
			const prefix = normalized ? `${normalized}/` : "";
			const childFiles = Array.from(files.keys()).filter((path) => {
				if (!path.startsWith(prefix)) return false;
				return !path.slice(prefix.length).includes("/");
			});
			const childDirs = Array.from(dirs.values()).filter((path) => {
				if (!path || path === normalized || !path.startsWith(prefix)) return false;
				return !path.slice(prefix.length).includes("/");
			});
			return { files: childFiles, folders: childDirs };
		},
		read: async (path: string) => {
			const normalized = normalizePath(path);
			const value = files.get(normalized);
			if (value === undefined) {
				throw new Error(`File not found: ${normalized}`);
			}
			return value;
		},
		remove: async (path: string) => {
			const normalized = normalizePath(path);
			files.delete(normalized);
			dirs.delete(normalized);
		},
		rmdir: async (dir: string, _recursive = false) => {
			const normalized = normalizePath(dir);
			const prefix = normalized ? `${normalized}/` : "";
			const hasChildren =
				Array.from(files.keys()).some((path) => path.startsWith(prefix)) ||
				Array.from(dirs.values()).some(
					(path) => path && path !== normalized && path.startsWith(prefix)
				);
			if (hasChildren) {
				throw new Error(`Directory not empty: ${normalized}`);
			}
			dirs.delete(normalized);
		},
	};

	return {
		app: {
			vault: {
				adapter,
			},
		} as any,
		files,
		dirs,
	};
}

describe("legacy-memory-storage", () => {
	it("does not treat empty legacy helper files as active card storage", async () => {
		const { app } = createApp(
			{
				"weave/memory/cards/card-files-index.json": JSON.stringify({ files: [] }),
				"weave/memory/cards/cards-0.json": JSON.stringify({ cards: [] }),
				"weave/memory/deck-cards/deck-1.json": JSON.stringify({ cardUUIDs: [] }),
			},
			["weave/memory/cards", "weave/memory/deck-cards"]
		);

		await expect(hasLegacyMemoryCardStorage(app)).resolves.toBe(false);
	});

	it("treats non-empty card shard files as active legacy card storage", async () => {
		const { app } = createApp(
			{
				"weave/memory/cards/cards-0.json": JSON.stringify({
					cards: [{ uuid: "card-1", content: "Q" }],
				}),
			},
			["weave/memory/cards"]
		);

		await expect(hasLegacyMemoryCardStorage(app)).resolves.toBe(true);
	});

	it("removes empty cards and deck-cards legacy directories", async () => {
		const { app, files, dirs } = createApp(
			{
				"weave/memory/cards/card-files-index.json": JSON.stringify({ files: [] }),
				"weave/memory/cards/cards-0.json": JSON.stringify({ cards: [] }),
				"weave/memory/deck-cards/deck-1.json": JSON.stringify({ cardUUIDs: [] }),
			},
			["weave/memory/cards", "weave/memory/deck-cards"]
		);

		const cleanup = await cleanupUnusedLegacyMemoryStorage(app);

		expect(cleanup.removedFiles).toEqual(
			expect.arrayContaining([
				"weave/memory/cards/card-files-index.json",
				"weave/memory/cards/cards-0.json",
				"weave/memory/deck-cards/deck-1.json",
			])
		);
		expect(cleanup.removedDirs).toEqual(
			expect.arrayContaining(["weave/memory/cards", "weave/memory/deck-cards"])
		);
		expect(files.has("weave/memory/cards/card-files-index.json")).toBe(false);
		expect(files.has("weave/memory/deck-cards/deck-1.json")).toBe(false);
		expect(dirs.has("weave/memory/cards")).toBe(false);
		expect(dirs.has("weave/memory/deck-cards")).toBe(false);
	});

	it("preserves deck-cards when it still contains real membership data", async () => {
		const { app, dirs } = createApp(
			{
				"weave/memory/deck-cards/deck-1.json": JSON.stringify({ cardUUIDs: ["card-1"] }),
			},
			["weave/memory/deck-cards"]
		);

		const cleanup = await cleanupUnusedLegacyMemoryStorage(app);

		expect(cleanup.removedDirs).toEqual([]);
		expect(dirs.has("weave/memory/deck-cards")).toBe(true);
	});
});
