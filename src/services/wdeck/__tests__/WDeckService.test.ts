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
			files.delete(normalizeTestPath(path));
		},
	};

	const vault = {
		adapter,
		configDir: ".obsidian",
		getFiles: () =>
			Array.from(files.keys())
				.filter((path) => path.toLowerCase().endsWith(".wdeck"))
				.sort()
				.map((path) => createMockTFile(path)),
		getAbstractFileByPath: (path: string) => {
			const normalized = normalizeTestPath(path);
			return files.has(normalized) ? createMockTFile(normalized) : null;
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
});
