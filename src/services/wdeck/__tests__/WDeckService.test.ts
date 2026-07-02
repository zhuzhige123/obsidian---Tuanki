vi.mock("obsidian", () => ({
	TFile: class TFile {
		path: string;
		basename: string;
		extension: string;
		stat?: { mtime: number };

		constructor(path = "", mtime = Date.now()) {
			this.path = path;
			const name = path.split("/").pop() || "";
			this.basename = name.replace(/\.[^.]+$/, "");
			this.extension = name.includes(".") ? name.split(".").pop() || "" : "";
			this.stat = { mtime };
		}
	},
	normalizePath: (path: string) => String(path || "").replace(/\\/g, "/").replace(/\/+/g, "/"),
}));

import { TFile } from "obsidian";
import { WDECK_UNGROUPED_DECK_NAME, WDeckService } from "../WDeckService";

function normalizeTestPath(path: string): string {
	return String(path || "").replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
}

function parentPath(path: string): string {
	const normalized = normalizeTestPath(path);
	const idx = normalized.lastIndexOf("/");
	return idx > 0 ? normalized.slice(0, idx) : "";
}

function createMockTFile(path: string, mtime = Date.now()): TFile {
	const normalized = normalizeTestPath(path);
	const file = new TFile();
	const name = normalized.split("/").pop() || "";
	return Object.assign(file, {
		path: normalized,
		basename: name.replace(/\.[^.]+$/, ""),
		extension: name.includes(".") ? name.split(".").pop() || "" : "",
		stat: { mtime },
	}) as TFile;
}

function createWDeckFile(logicalDeckId: string, logicalDeckName: string, cards: any[]) {
	return JSON.stringify(
		{
			schemaVersion: 1,
			fileType: "wdeck",
			logicalDeckId,
			logicalDeckName,
			segmentId: `${logicalDeckId}-seg-01`,
			segmentIndex: 1,
			segmentLabel: "01",
			deck: {
				id: logicalDeckId,
				name: logicalDeckName,
				purpose: "memory",
			},
			cards,
		},
		null,
		2
	);
}

function createPlugin(initialFiles: Record<string, string>, persistedDecks: Record<string, any> = {}) {
	const files = new Map<string, string>();
	const fileMtimes = new Map<string, number>();
	const folders = new Set<string>(["", ".obsidian", ".obsidian/plugins", ".obsidian/plugins/weave"]);
	let currentMtime = 1;

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
		fileMtimes.set(normalized, currentMtime);
		currentMtime += 1;
	};

	for (const [path, content] of Object.entries(initialFiles)) {
		writeText(path, content);
	}

	const adapter = {
		basePath: "C:/vault",
		exists: async (path: string) => {
			const normalized = normalizeTestPath(path);
			return files.has(normalized) || folders.has(normalized);
		},
		mkdir: async (path: string) => {
			ensureDir(path);
		},
		list: async (dir: string) => {
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
		},
		read: async (path: string) => {
			const normalized = normalizeTestPath(path);
			const value = files.get(normalized);
			if (value === undefined) {
				throw new Error(`File not found: ${normalized}`);
			}
			return value;
		},
		write: async (path: string, content: string) => {
			writeText(path, content);
		},
		remove: async (path: string) => {
			const normalized = normalizeTestPath(path);
			files.delete(normalized);
			fileMtimes.delete(normalized);
		},
	};

	const vault = {
		adapter,
		configDir: ".obsidian",
		getFiles: () =>
			Array.from(files.keys())
				.filter((path) => path.toLowerCase().endsWith(".wdeck"))
				.sort()
				.map((path) => createMockTFile(path, fileMtimes.get(path) || 0)),
		getAbstractFileByPath: (path: string) => {
			const normalized = normalizeTestPath(path);
			return files.has(normalized)
				? createMockTFile(normalized, fileMtimes.get(normalized) || 0)
				: null;
		},
		cachedRead: async (file: TFile) => {
			const value = files.get(normalizeTestPath(file.path));
			if (value === undefined) {
				throw new Error(`File not found: ${file.path}`);
			}
			return value;
		},
		modify: async (file: TFile, content: string) => {
			writeText(file.path, content);
		},
		create: async (path: string, content: string) => {
			writeText(path, content);
			return createMockTFile(path, fileMtimes.get(normalizeTestPath(path)) || 0);
		},
	};

	const plugin = {
		settings: {
			weaveParentFolder: "",
		},
		app: {
			vault,
		},
		dataStorage: {
			getDeck: vi.fn(async (deckId: string) => persistedDecks[deckId] || null),
		},
	} as any;

	return {
		files,
		plugin,
	};
}

describe("WDeckService", () => {
	it("moves a card out of the ungrouped .wdeck file when its formal deck changes", async () => {
		const ungroupedPath = `weave/memory/deck-files/${WDECK_UNGROUPED_DECK_NAME}_01.wdeck`;
		const { files, plugin } = createPlugin(
			{
				[ungroupedPath]: createWDeckFile(WDECK_UNGROUPED_DECK_NAME, WDECK_UNGROUPED_DECK_NAME, [
					{
						uuid: "card-1",
						content: "---\n---\nA",
					},
				]),
			},
			{
				"deck-target": {
					id: "deck-target",
					name: "目标牌组",
					purpose: "memory",
				},
			}
		);
		const service = new WDeckService(plugin);

		const card = await service.getCardByUUID("card-1");
		expect(card).not.toBeNull();

		const saved = await service.saveCard({
			...(card as any),
			deckId: "deck-target",
			referencedByDecks: ["deck-target"],
		});

		const targetPath = Array.from(files.keys()).find((path) => path.endsWith("/目标牌组_01.wdeck"));
		expect(targetPath).toBeTruthy();
		const targetData = JSON.parse(files.get(targetPath as string) || "{}");
		const ungroupedData = JSON.parse(files.get(ungroupedPath) || "{}");

		expect(targetData.cards.map((item: any) => item.uuid)).toContain("card-1");
		expect(ungroupedData.cards.map((item: any) => item.uuid)).not.toContain("card-1");
		expect(saved.deckId).toBe("wdeck:deck-target");
		expect((saved.customFields as any)?.wdeck?.sourcePath).toBe(targetPath);
	});

	it("removes stale duplicate UUIDs from other .wdeck files when saving cards into a formal deck", async () => {
		const targetPath = "weave/memory/deck-files/目标牌组_01.wdeck";
		const ungroupedPath = `weave/memory/deck-files/${WDECK_UNGROUPED_DECK_NAME}_01.wdeck`;
		const duplicateCard = {
			uuid: "card-1",
			content: "---\nwe_decks:\n  - 目标牌组\n---\nA",
		};
		const { files, plugin } = createPlugin({
			[targetPath]: createWDeckFile("deck-target", "目标牌组", [duplicateCard]),
			[ungroupedPath]: createWDeckFile(WDECK_UNGROUPED_DECK_NAME, WDECK_UNGROUPED_DECK_NAME, [
				duplicateCard,
			]),
		});
		const service = new WDeckService(plugin);

		await service.saveCardsToDeck(
			{
				id: "deck-target",
				name: "目标牌组",
			},
			[duplicateCard as any]
		);

		const targetData = JSON.parse(files.get(targetPath) || "{}");
		const ungroupedData = JSON.parse(files.get(ungroupedPath) || "{}");
		expect(targetData.cards.map((item: any) => item.uuid)).toEqual(["card-1"]);
		expect(ungroupedData.cards).toEqual([]);
	});

	it("updates a warmed cache incrementally for single-card saves without calling rebuildCache", async () => {
		const targetPath = "weave/memory/deck-files/目标牌组_01.wdeck";
		const { files, plugin } = createPlugin({
			[targetPath]: createWDeckFile("deck-target", "目标牌组", [
				{
					uuid: "card-1",
					content: "old-content",
				},
			]),
		});
		const service = new WDeckService(plugin);

		await service.rebuildCache();
		const rebuildSpy = vi.spyOn(service, "rebuildCache");

		const existingCard = await service.getCardByUUID("card-1");
		expect(existingCard).not.toBeNull();

		await service.saveCard({
			...(existingCard as any),
			content: "new-content",
		});

		expect(rebuildSpy).not.toHaveBeenCalled();
		const persisted = JSON.parse(files.get(targetPath) || "{}");
		const aggregate = await service.getDeckAggregateByDeckId("wdeck:deck-target");
		expect(persisted.cards[0]?.content).toContain("new-content");
		expect(aggregate?.cards.map((card) => card.content).join("\n")).toContain("new-content");
	});

	it("updates a warmed cache incrementally for duplicate cleanup across touched files", async () => {
		const targetPath = "weave/memory/deck-files/目标牌组_01.wdeck";
		const ungroupedPath = `weave/memory/deck-files/${WDECK_UNGROUPED_DECK_NAME}_01.wdeck`;
		const duplicateCard = {
			uuid: "card-1",
			content: "same-card",
		};
		const { files, plugin } = createPlugin({
			[targetPath]: createWDeckFile("deck-target", "目标牌组", [duplicateCard]),
			[ungroupedPath]: createWDeckFile(WDECK_UNGROUPED_DECK_NAME, WDECK_UNGROUPED_DECK_NAME, [
				duplicateCard,
			]),
		});
		const service = new WDeckService(plugin);

		await service.rebuildCache();
		const rebuildSpy = vi.spyOn(service, "rebuildCache");

		await service.saveCardsToDeck(
			{
				id: "deck-target",
				name: "目标牌组",
			},
			[{ ...duplicateCard } as any]
		);

		expect(rebuildSpy).not.toHaveBeenCalled();
		const targetAggregate = await service.getDeckAggregateByDeckId("wdeck:deck-target");
		const ungroupedAggregate = await service.getDeckAggregateByDeckId(
			`wdeck:${WDECK_UNGROUPED_DECK_NAME}`
		);
		expect(targetAggregate?.cards.map((card) => card.uuid)).toEqual(["card-1"]);
		expect(ungroupedAggregate?.cards || []).toEqual([]);
		const ungroupedData = JSON.parse(files.get(ungroupedPath) || "{}");
		expect(ungroupedData.cards).toEqual([]);
	});

	it("automatically shards large deck writes and keeps card locator pointing to the right segment", async () => {
		const cards = Array.from({ length: 501 }, (_, index) => ({
			uuid: `card-${index + 1}`,
			content: `content-${index + 1}`,
		}));
		const { files, plugin } = createPlugin({});
		const service = new WDeckService(plugin);

		await service.saveCardsToDeck(
			{
				id: "deck-target",
				name: "目标牌组",
			},
			cards as any[]
		);

		const shardPaths = Array.from(files.keys())
			.filter(
				(path) =>
					path.startsWith("weave/memory/deck-files/") &&
					path.includes("目标牌组_") &&
					path.endsWith(".wdeck")
			)
			.sort();
		expect(shardPaths).toEqual([
			"weave/memory/deck-files/目标牌组_01.wdeck",
			"weave/memory/deck-files/目标牌组_02.wdeck",
		]);

		const shard1 = JSON.parse(files.get(shardPaths[0]) || "{}");
		const shard2 = JSON.parse(files.get(shardPaths[1]) || "{}");
		expect(shard1.cards).toHaveLength(500);
		expect(shard2.cards).toHaveLength(1);
		expect(shard2.cards[0]?.uuid).toBe("card-501");

		const cacheIndexPath = ".obsidian/plugins/weave/cache/wdeck-index.json";
		const cacheIndex = JSON.parse(files.get(cacheIndexPath) || "{}");
		expect(cacheIndex.cardLocator?.["card-501"]).toBe("weave/memory/deck-files/目标牌组_02.wdeck");

		const locatedCard = await service.getCardByUUID("card-501");
		expect(locatedCard?.deckId).toBe("wdeck:deck-target");
		expect((locatedCard?.customFields as any)?.wdeck?.sourcePath).toBe(
			"weave/memory/deck-files/目标牌组_02.wdeck"
		);
	});

	it("rewrites and shrinks multi-segment decks during replaceDeckCardsForDeck", async () => {
		const shard1Path = "weave/memory/deck-files/目标牌组_01.wdeck";
		const shard2Path = "weave/memory/deck-files/目标牌组_02.wdeck";
		const { files, plugin } = createPlugin({
			[shard1Path]: JSON.stringify({
				schemaVersion: 1,
				fileType: "wdeck",
				logicalDeckId: "deck-target",
				logicalDeckName: "目标牌组",
				segmentId: "目标牌组_01",
				segmentIndex: 1,
				segmentLabel: "01",
				deck: {
					id: "deck-target",
					name: "目标牌组",
					purpose: "memory",
				},
				cards: [{ uuid: "card-1", content: "one" }],
			}),
			[shard2Path]: JSON.stringify({
				schemaVersion: 1,
				fileType: "wdeck",
				logicalDeckId: "deck-target",
				logicalDeckName: "目标牌组",
				segmentId: "目标牌组_02",
				segmentIndex: 2,
				segmentLabel: "02",
				deck: {
					id: "deck-target",
					name: "目标牌组",
					purpose: "memory",
				},
				cards: [{ uuid: "card-2", content: "two" }],
			}),
		});
		const service = new WDeckService(plugin);

		const result = await service.replaceDeckCardsForDeck(
			{
				id: "deck-target",
				name: "目标牌组",
			},
			[{ uuid: "card-3", content: "three" } as any]
		);

		expect(result.map((card) => card.uuid)).toEqual(["card-3"]);
		expect(files.has(shard1Path)).toBe(true);
		expect(files.has(shard2Path)).toBe(false);
		const rewrittenShard = JSON.parse(files.get(shard1Path) || "{}");
		expect(rewrittenShard.cards.map((card: any) => card.uuid)).toEqual(["card-3"]);

		const aggregate = await service.getDeckAggregateByDeckId("wdeck:deck-target");
		expect(aggregate?.segmentIndices).toEqual([1]);
		expect(aggregate?.cards.map((card) => card.uuid)).toEqual(["card-3"]);
	});

	it("returns cards by UUIDs via locator across multiple segments in input order", async () => {
		const shard1Path = "weave/memory/deck-files/目标牌组_01.wdeck";
		const shard2Path = "weave/memory/deck-files/目标牌组_02.wdeck";
		const { plugin } = createPlugin({
			[shard1Path]: JSON.stringify({
				schemaVersion: 1,
				fileType: "wdeck",
				logicalDeckId: "deck-target",
				logicalDeckName: "目标牌组",
				segmentId: "目标牌组_01",
				segmentIndex: 1,
				segmentLabel: "01",
				deck: { id: "deck-target", name: "目标牌组", purpose: "memory" },
				cards: [{ uuid: "card-1", content: "one" }],
			}),
			[shard2Path]: JSON.stringify({
				schemaVersion: 1,
				fileType: "wdeck",
				logicalDeckId: "deck-target",
				logicalDeckName: "目标牌组",
				segmentId: "目标牌组_02",
				segmentIndex: 2,
				segmentLabel: "02",
				deck: { id: "deck-target", name: "目标牌组", purpose: "memory" },
				cards: [{ uuid: "card-2", content: "two" }],
			}),
		});
		const service = new WDeckService(plugin);

		await service.rebuildCache();
		const cards = await service.getCardsByUUIDs(["card-2", "card-1", "missing-card"]);

		expect(cards.map((card) => card.uuid)).toEqual(["card-2", "card-1"]);
		expect((cards[0]?.customFields as any)?.wdeck?.sourcePath).toBe(shard2Path);
		expect((cards[1]?.customFields as any)?.wdeck?.sourcePath).toBe(shard1Path);
	});

	it("deletes cards by UUIDs via locator and refreshes cache incrementally", async () => {
		const shard1Path = "weave/memory/deck-files/目标牌组_01.wdeck";
		const shard2Path = "weave/memory/deck-files/目标牌组_02.wdeck";
		const { files, plugin } = createPlugin({
			[shard1Path]: JSON.stringify({
				schemaVersion: 1,
				fileType: "wdeck",
				logicalDeckId: "deck-target",
				logicalDeckName: "目标牌组",
				segmentId: "目标牌组_01",
				segmentIndex: 1,
				segmentLabel: "01",
				deck: { id: "deck-target", name: "目标牌组", purpose: "memory" },
				cards: [
					{ uuid: "card-1", content: "one" },
					{ uuid: "card-2", content: "two" },
				],
			}),
			[shard2Path]: JSON.stringify({
				schemaVersion: 1,
				fileType: "wdeck",
				logicalDeckId: "deck-target",
				logicalDeckName: "目标牌组",
				segmentId: "目标牌组_02",
				segmentIndex: 2,
				segmentLabel: "02",
				deck: { id: "deck-target", name: "目标牌组", purpose: "memory" },
				cards: [{ uuid: "card-3", content: "three" }],
			}),
		});
		const service = new WDeckService(plugin);

		await service.rebuildCache();
		const rebuildSpy = vi.spyOn(service, "rebuildCache");

		const deleted = await service.deleteCardsByUUIDs(["card-1", "card-3"]);

		expect(deleted.sort()).toEqual(["card-1", "card-3"]);
		expect(rebuildSpy).not.toHaveBeenCalled();

		const shard1 = JSON.parse(files.get(shard1Path) || "{}");
		const shard2 = JSON.parse(files.get(shard2Path) || "{}");
		expect(shard1.cards.map((card: any) => card.uuid)).toEqual(["card-2"]);
		expect(shard2.cards).toEqual([]);

		const deletedCard = await service.getCardByUUID("card-3");
		const remainingCard = await service.getCardByUUID("card-2");
		expect(deletedCard).toBeNull();
		expect(remainingCard?.uuid).toBe("card-2");

		const cacheIndex = JSON.parse(files.get(".obsidian/plugins/weave/cache/wdeck-index.json") || "{}");
		expect(cacheIndex.cardLocator?.["card-1"]).toBeUndefined();
		expect(cacheIndex.cardLocator?.["card-3"]).toBeUndefined();
		expect(cacheIndex.cardLocator?.["card-2"]).toBe(shard1Path);
	});

	it("warns only once for the same invalid .wdeck file across repeated cache rebuilds", async () => {
		const invalidPath = "weave/memory/deck-files/坏文件_01.wdeck";
		const { plugin } = createPlugin({
			[invalidPath]: "",
		});
		const service = new WDeckService(plugin);
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		try {
			await service.rebuildCache();
			await service.rebuildCache();

			const relevantCalls = warnSpy.mock.calls.filter(([message]) =>
				String(message).includes("[WDeckService] 读取 WDeck 文件失败")
			);
			expect(relevantCalls).toHaveLength(1);
		} finally {
			warnSpy.mockRestore();
		}
	});

	it("warns again when the invalid .wdeck content changes to a new broken state", async () => {
		const invalidPath = "weave/memory/deck-files/坏文件_01.wdeck";
		const { plugin } = createPlugin({
			[invalidPath]: "",
		});
		const service = new WDeckService(plugin);
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		try {
			await service.rebuildCache();
			await plugin.app.vault.adapter.write(invalidPath, "{");
			await service.rebuildCache();

			const relevantCalls = warnSpy.mock.calls.filter(([message]) =>
				String(message).includes("[WDeckService] 读取 WDeck 文件失败")
			);
			expect(relevantCalls).toHaveLength(2);
		} finally {
			warnSpy.mockRestore();
		}
	});

	it("returns the semantically newer duplicate UUID across multiple .wdeck files", async () => {
		const deckAPath = "weave/memory/deck-files/牌组A_01.wdeck";
		const deckBPath = "weave/memory/deck-files/牌组B_01.wdeck";
		const { plugin } = createPlugin({
			[deckAPath]: JSON.stringify({
				schemaVersion: 1,
				fileType: "wdeck",
				logicalDeckId: "deck-a",
				logicalDeckName: "牌组A",
				segmentId: "牌组A_01",
				segmentIndex: 1,
				segmentLabel: "01",
				deck: { id: "deck-a", name: "牌组A", purpose: "memory" },
				cards: [
					{
						uuid: "dup-card",
						content: "stale",
						modified: "2026-01-01T00:00:00.000Z",
						stats: { totalReviews: 1, totalTime: 0, averageTime: 0 },
					},
				],
			}),
			[deckBPath]: JSON.stringify({
				schemaVersion: 1,
				fileType: "wdeck",
				logicalDeckId: "deck-b",
				logicalDeckName: "牌组B",
				segmentId: "牌组B_01",
				segmentIndex: 1,
				segmentLabel: "01",
				deck: { id: "deck-b", name: "牌组B", purpose: "memory" },
				cards: [
					{
						uuid: "dup-card",
						content: "fresh",
						modified: "2026-06-15T12:00:00.000Z",
						stats: { totalReviews: 5, totalTime: 0, averageTime: 0 },
					},
				],
			}),
		});
		const service = new WDeckService(plugin);

		await service.rebuildCache();
		const card = await service.getCardByUUID("dup-card");

		expect(card?.content).toBe("fresh");
		expect((card?.customFields as any)?.wdeck?.sourcePath).toBe(deckBPath);
	});
});
