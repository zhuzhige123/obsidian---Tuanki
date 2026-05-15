vi.mock("obsidian", () => ({
	TFile: class TFile {
		path: string;
		basename: string;
		extension: string;

		constructor(path = "") {
			this.path = path;
			const fileName = path.split("/").pop() || path;
			const dotIndex = fileName.lastIndexOf(".");
			this.basename = dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName;
			this.extension = dotIndex >= 0 ? fileName.slice(dotIndex + 1) : "";
		}
	},
	normalizePath: (path: string) => path.replace(/\\/g, "/").replace(/\/+/g, "/"),
}));

import { TFile } from "obsidian";
import {
	WDECK_UNGROUPED_DECK_NAME,
	WDeckFileLoadError,
	WDeckService,
	isWDeckRuntimeDeckId,
	normalizeWDeckLogicalDeckId,
	parseWDeckFileName,
	toWDeckRuntimeDeckId,
} from "./WDeckService";

function normalizeTestPath(path: string): string {
	return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
}

function parentPath(path: string): string {
	const normalized = normalizeTestPath(path);
	const idx = normalized.lastIndexOf("/");
	return idx > 0 ? normalized.slice(0, idx) : "";
}

function createWDeckPlugin(initialFiles: Record<string, string> = {}) {
	const files = new Map<string, string>();
	const folders = new Set<string>(["", "weave", "weave/memory", "weave/memory/deck-files"]);

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

	const renameText = (sourcePath: string, targetPath: string) => {
		const normalizedSource = normalizeTestPath(sourcePath);
		const normalizedTarget = normalizeTestPath(targetPath);
		const value = files.get(normalizedSource);
		if (value === undefined) {
			throw new Error(`File not found: ${normalizedSource}`);
		}
		ensureDir(parentPath(normalizedTarget));
		files.set(normalizedTarget, value);
		files.delete(normalizedSource);
	};

	for (const [path, content] of Object.entries(initialFiles)) {
		writeText(path, content);
	}

	const adapter = {
		exists: async (path: string) => {
			const normalized = normalizeTestPath(path);
			return files.has(normalized) || folders.has(normalized);
		},
		mkdir: async (path: string) => {
			ensureDir(path);
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
	};

	const getTFile = (path: string) => {
		const normalized = normalizeTestPath(path);
		const fileName = normalized.split("/").pop() || normalized;
		const dotIndex = fileName.lastIndexOf(".");
		return Object.assign(new TFile(), {
			path: normalized,
			basename: dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName,
			extension: dotIndex >= 0 ? fileName.slice(dotIndex + 1) : "",
		}) as TFile;
	};

	const plugin = {
		app: {
			vault: {
				configDir: ".obsidian",
				adapter,
				getFiles: () =>
					Array.from(files.keys())
						.filter((path) => path.toLowerCase().endsWith(".wdeck"))
						.map((path) => getTFile(path)),
				getAbstractFileByPath: (path: string) => {
					const normalized = normalizeTestPath(path);
					if (files.has(normalized) && normalized.toLowerCase().endsWith(".wdeck")) {
						return getTFile(normalized);
					}
					return folders.has(normalized) ? ({ path: normalized } as any) : null;
				},
				cachedRead: async (file: TFile) => adapter.read(file.path),
				modify: async (file: TFile, content: string) => adapter.write(file.path, content),
				rename: async (file: TFile, newPath: string) => {
					renameText(file.path, newPath);
				},
			},
			fileManager: {
				trashFile: async (file: TFile) => {
					files.delete(normalizeTestPath(file.path));
				},
				renameFile: async (file: TFile, newPath: string) => {
					renameText(file.path, newPath);
				},
			},
		},
		settings: {
			weaveParentFolder: "",
		},
	} as any;

	return {
		plugin,
		files,
	};
}

describe("WDeckService helpers", () => {
	test("parses segmented deck names with underscore and hyphen", () => {
		expect(parseWDeckFileName("循环系统_01")).toEqual({
			logicalDeckName: "循环系统",
			segmentIndex: 1,
		});

		expect(parseWDeckFileName("循环系统-06")).toEqual({
			logicalDeckName: "循环系统",
			segmentIndex: 6,
		});
	});

	test("keeps deck name when no segment suffix exists", () => {
		expect(parseWDeckFileName("循环系统")).toEqual({
			logicalDeckName: "循环系统",
		});
	});

	test("builds and recognizes runtime deck ids", () => {
		expect(toWDeckRuntimeDeckId("循环系统")).toBe("wdeck:循环系统");
		expect(toWDeckRuntimeDeckId("wdeck:循环系统")).toBe("wdeck:循环系统");
		expect(isWDeckRuntimeDeckId("wdeck:循环系统")).toBe(true);
		expect(isWDeckRuntimeDeckId("循环系统")).toBe(false);
	});

	test("normalizes logical deck ids by stripping the runtime prefix", () => {
		expect(normalizeWDeckLogicalDeckId("wdeck:deck-1", "circulation")).toBe("deck-1");
		expect(normalizeWDeckLogicalDeckId("", "circulation")).toBe("circulation");
	});
});

describe("WDeckService deck file actions", () => {
	test("deletes every file that belongs to the same logical deck", async () => {
		const { plugin, files } = createWDeckPlugin({
			"weave/memory/deck-files/循环系统_01.wdeck": JSON.stringify({
				fileType: "wdeck",
				logicalDeckId: "循环系统",
				logicalDeckName: "循环系统",
				segmentIndex: 1,
				cards: [{ uuid: "card-1", content: "a" }],
			}),
			"weave/memory/deck-files/循环系统_02.wdeck": JSON.stringify({
				fileType: "wdeck",
				logicalDeckId: "循环系统",
				logicalDeckName: "循环系统",
				segmentIndex: 2,
				cards: [{ uuid: "card-2", content: "b" }],
			}),
		});
		const service = new WDeckService(plugin);

		const result = await service.deleteDeckByDeckId("wdeck:循环系统");

		expect(result).toEqual({
			deletedFiles: [
				"weave/memory/deck-files/循环系统_01.wdeck",
				"weave/memory/deck-files/循环系统_02.wdeck",
			],
			deletedCards: 2,
		});
		expect(files.has("weave/memory/deck-files/循环系统_01.wdeck")).toBe(false);
		expect(files.has("weave/memory/deck-files/循环系统_02.wdeck")).toBe(false);
	});

	test("treats a 0KB .wdeck file as a dedicated empty-file error", async () => {
		const filePath = "weave/memory/deck-files/空文件_01.wdeck";
		const { plugin } = createWDeckPlugin({
			[filePath]: "",
		});
		const service = new WDeckService(plugin);

		const loadPromise = service.loadDeckAggregateFromFilePath(filePath);

		await expect(loadPromise).rejects.toBeInstanceOf(WDeckFileLoadError);
		await expect(loadPromise).rejects.toMatchObject({
			code: "empty_file",
			filePath,
		});
	});

	test("allows a valid empty .wdeck deck to open as an empty deck", async () => {
		const filePath = "weave/memory/deck-files/空牌组_01.wdeck";
		const { plugin } = createWDeckPlugin({
			[filePath]: JSON.stringify({
				fileType: "wdeck",
				logicalDeckId: "空牌组",
				logicalDeckName: "空牌组",
				segmentIndex: 1,
				cards: [],
			}),
		});
		const service = new WDeckService(plugin);

		const aggregate = await service.loadDeckAggregateFromFilePath(filePath);

		expect(aggregate.logicalDeckId).toBe("空牌组");
		expect(aggregate.logicalDeckName).toBe("空牌组");
		expect(aggregate.cards).toEqual([]);
	});

	test("dissolves a deck into the ungrouped deck file and keeps review data", async () => {
		const { plugin, files } = createWDeckPlugin({
			"weave/memory/deck-files/循环系统_01.wdeck": JSON.stringify({
				fileType: "wdeck",
				logicalDeckId: "循环系统",
				logicalDeckName: "循环系统",
				segmentIndex: 1,
				segmentId: "循环系统_01",
				cards: [
					{
						uuid: "card-1",
						content: "心脏",
						fsrsState: { stability: 12 },
						reviewHistory: [{ rating: 3 }],
					},
				],
			}),
			"weave/memory/deck-files/未归组卡片_01.wdeck": JSON.stringify({
				fileType: "wdeck",
				logicalDeckId: WDECK_UNGROUPED_DECK_NAME,
				logicalDeckName: WDECK_UNGROUPED_DECK_NAME,
				segmentIndex: 1,
				segmentId: "未归组卡片_01",
				cards: [{ uuid: "card-existing", content: "existing" }],
			}),
		});
		const service = new WDeckService(plugin);

		const result = await service.dissolveDeckByDeckId("wdeck:循环系统");

		expect(result).toMatchObject({
			movedCards: 1,
			targetDeckId: "wdeck:未归组卡片",
			targetDeckName: WDECK_UNGROUPED_DECK_NAME,
			targetFilePath: "weave/memory/deck-files/未归组卡片_01.wdeck",
			removedFiles: ["weave/memory/deck-files/循环系统_01.wdeck"],
		});
		expect(files.has("weave/memory/deck-files/循环系统_01.wdeck")).toBe(false);

		const targetData = JSON.parse(
			files.get("weave/memory/deck-files/未归组卡片_01.wdeck") || "{}"
		);
		expect(targetData.logicalDeckId).toBe(WDECK_UNGROUPED_DECK_NAME);
		expect(targetData.logicalDeckName).toBe(WDECK_UNGROUPED_DECK_NAME);
		expect(targetData.cards).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ uuid: "card-existing", content: "existing" }),
				expect.objectContaining({
					uuid: "card-1",
					content: "心脏",
					fsrsState: { stability: 12 },
					reviewHistory: [{ rating: 3 }],
				}),
			])
		);
		expect(targetData.cards.find((card: any) => card.uuid === "card-1")?.customFields?.wdeck).toBeUndefined();
	});

	test("rebuilds private cache and reports uuid conflicts", async () => {
		const { plugin, files } = createWDeckPlugin({
			"weave/memory/deck-files/循环系统_01.wdeck": JSON.stringify({
				fileType: "wdeck",
				logicalDeckId: "循环系统",
				logicalDeckName: "循环系统",
				segmentIndex: 1,
				cards: [{ uuid: "shared-card", content: "a" }],
			}),
			"weave/memory/deck-files/循环系统_02.wdeck": JSON.stringify({
				fileType: "wdeck",
				logicalDeckId: "循环系统",
				logicalDeckName: "循环系统",
				segmentIndex: 2,
				cards: [{ uuid: "shared-card", content: "b" }],
			}),
		});
		const service = new WDeckService(plugin);

		const status = await service.rebuildCache();
		const report = await service.getConflictReport();

		expect(status.exists).toBe(true);
	expect(status.issueCount).toBeGreaterThan(0);
	expect(files.has(".obsidian/plugins/weave/cache/wdeck-index.json")).toBe(true);
	expect(files.has(".obsidian/plugins/weave/cache/wdeck-conflicts.json")).toBe(true);
	expect(report.issues.some((issue) => issue.type === "uuid_conflict")).toBe(true);
	});

	test("loads the full logical deck aggregate from any matching .wdeck file path", async () => {
		const { plugin } = createWDeckPlugin({
			"vault/study/circulation_03.wdeck": JSON.stringify({
				fileType: "wdeck",
				logicalDeckId: "deck-circulation",
				logicalDeckName: "circulation",
				segmentIndex: 3,
				cards: [{ uuid: "card-3", content: "segment-3" }],
			}),
			"archive/memory/circulation_01.wdeck": JSON.stringify({
				fileType: "wdeck",
				logicalDeckId: "deck-circulation",
				logicalDeckName: "circulation",
				segmentIndex: 1,
				cards: [{ uuid: "card-1", content: "segment-1" }],
			}),
			"vault/study/other_01.wdeck": JSON.stringify({
				fileType: "wdeck",
				logicalDeckId: "deck-other",
				logicalDeckName: "other",
				segmentIndex: 1,
				cards: [{ uuid: "other-card", content: "other" }],
			}),
		});
		const service = new WDeckService(plugin);

		const aggregate = await service.loadDeckAggregateFromFilePath("vault/study/circulation_03.wdeck");

		expect(aggregate.runtimeDeckId).toBe("wdeck:deck-circulation");
		expect(aggregate.logicalDeckId).toBe("deck-circulation");
		expect(aggregate.logicalDeckName).toBe("circulation");
		expect(aggregate.files.map((file) => file.path)).toEqual([
			"archive/memory/circulation_01.wdeck",
			"vault/study/circulation_03.wdeck",
		]);
		expect(aggregate.segmentIndices).toEqual([1, 3]);
		expect(aggregate.cards.map((card) => card.uuid)).toEqual(["card-1", "card-3"]);
	});

	test("resolves aggregates from snapshot members without depending on scanResolvedFiles", async () => {
		const { plugin } = createWDeckPlugin({
			"vault/study/circulation_03.wdeck": JSON.stringify({
				fileType: "wdeck",
				logicalDeckId: "deck-circulation",
				logicalDeckName: "circulation",
				segmentIndex: 3,
				cards: [{ uuid: "card-3", content: "segment-3" }],
			}),
			"archive/memory/circulation_01.wdeck": JSON.stringify({
				fileType: "wdeck",
				logicalDeckId: "deck-circulation",
				logicalDeckName: "circulation",
				segmentIndex: 1,
				cards: [{ uuid: "card-1", content: "segment-1" }],
			}),
			"vault/study/other_01.wdeck": JSON.stringify({
				fileType: "wdeck",
				logicalDeckId: "deck-other",
				logicalDeckName: "other",
				segmentIndex: 1,
				cards: [{ uuid: "other-card", content: "other" }],
			}),
		});
		const service = new WDeckService(plugin);

		await service.rebuildCache();
		const scanSpy = vi
			.spyOn(service as any, "scanResolvedFiles")
			.mockRejectedValue(new Error("scanResolvedFiles should not be used here"));

		try {
			const aggregateByRuntime = await service.getDeckAggregateByDeckId("wdeck:deck-circulation");
			const aggregateByLogical = await service.getDeckAggregateByAnyDeckId("deck-circulation");
			const aggregateByPath = await service.loadDeckAggregateFromFilePath(
				"vault/study/circulation_03.wdeck"
			);
			const allCards = await service.getAllCards();
			const locatedCard = await service.getCardByUUID("card-3");

			expect(aggregateByRuntime?.files.map((file) => file.path)).toEqual([
				"archive/memory/circulation_01.wdeck",
				"vault/study/circulation_03.wdeck",
			]);
			expect(aggregateByLogical?.cards.map((card) => card.uuid)).toEqual(["card-1", "card-3"]);
			expect(aggregateByPath.segmentIndices).toEqual([1, 3]);
			expect(allCards.map((card) => card.uuid)).toEqual(["card-1", "card-3", "other-card"]);
			expect(locatedCard?.uuid).toBe("card-3");
			expect(scanSpy).not.toHaveBeenCalled();
		} finally {
			scanSpy.mockRestore();
		}
	});

	test("builds all deck aggregates from cached .wdeck members without depending on scanResolvedFiles", async () => {
		const { plugin } = createWDeckPlugin({
			"vault/study/circulation_03.wdeck": JSON.stringify({
				fileType: "wdeck",
				logicalDeckId: "deck-circulation",
				logicalDeckName: "circulation",
				segmentIndex: 3,
				cards: [{ uuid: "card-3", content: "segment-3" }],
			}),
			"archive/memory/circulation_01.wdeck": JSON.stringify({
				fileType: "wdeck",
				logicalDeckId: "deck-circulation",
				logicalDeckName: "circulation",
				segmentIndex: 1,
				cards: [{ uuid: "card-1", content: "segment-1" }],
				deck: { id: "deck-circulation", name: "circulation", description: "bio" },
			}),
			"vault/study/other_01.wdeck": JSON.stringify({
				fileType: "wdeck",
				logicalDeckId: "deck-other",
				logicalDeckName: "other",
				segmentIndex: 1,
				cards: [{ uuid: "other-card", content: "other" }],
			}),
		});
		const service = new WDeckService(plugin);

		await service.rebuildCache();
		const scanSpy = vi
			.spyOn(service as any, "scanResolvedFiles")
			.mockRejectedValue(new Error("scanResolvedFiles should not be used here"));

		try {
			const aggregates = await service.getAllDeckAggregates();
			const circulation = aggregates.find((item) => item.logicalDeckId === "deck-circulation");
			const other = aggregates.find((item) => item.logicalDeckId === "deck-other");

			expect(circulation).toMatchObject({
				runtimeDeckId: "wdeck:deck-circulation",
				logicalDeckName: "circulation",
				segmentIndices: [1, 3],
				deck: expect.objectContaining({
					id: "deck-circulation",
					name: "circulation",
					description: "bio",
				}),
			});
			expect(circulation?.files.map((file) => file.path)).toEqual([
				"archive/memory/circulation_01.wdeck",
				"vault/study/circulation_03.wdeck",
			]);
			expect(circulation?.cards.map((card) => card.uuid)).toEqual(["card-1", "card-3"]);
			expect(other?.cards.map((card) => card.uuid)).toEqual(["other-card"]);
			expect(scanSpy).not.toHaveBeenCalled();
		} finally {
			scanSpy.mockRestore();
		}
	});

	test("builds lightweight deck summaries from cached .wdeck members", async () => {
		const { plugin } = createWDeckPlugin({
			"archive/memory/circulation_01.wdeck": JSON.stringify({
				fileType: "wdeck",
				logicalDeckId: "deck-circulation",
				logicalDeckName: "circulation",
				segmentIndex: 1,
				cards: [{ uuid: "card-1", content: "segment-1" }],
				deck: { id: "deck-circulation", name: "circulation", description: "bio" }
			}),
			"vault/study/circulation_03.wdeck": JSON.stringify({
				fileType: "wdeck",
				logicalDeckId: "deck-circulation",
				logicalDeckName: "circulation",
				segmentIndex: 3,
				cards: [{ uuid: "card-3", content: "segment-3" }, { uuid: "card-1", content: "dup" }]
			}),
			"vault/study/other_01.wdeck": JSON.stringify({
				fileType: "wdeck",
				logicalDeckId: "deck-other",
				logicalDeckName: "other",
				segmentIndex: 1,
				cards: [{ uuid: "other-card", content: "other" }]
			}),
		});
		const service = new WDeckService(plugin);

		const summaries = await service.getAllDeckSummaries();
		const circulation = summaries.find((item) => item.logicalDeckId === "deck-circulation");

		expect(circulation).toMatchObject({
			runtimeDeckId: "wdeck:deck-circulation",
			logicalDeckName: "circulation",
			segmentIndices: [1, 3],
			filePaths: ["archive/memory/circulation_01.wdeck", "vault/study/circulation_03.wdeck"],
			cardUUIDs: ["card-1", "card-3"],
			deck: expect.objectContaining({
				id: "deck-circulation",
				name: "circulation",
				description: "bio"
			})
		});
	});

	test("reuses an existing .wdeck file when the stable deck id stays the same", async () => {
		const { plugin, files } = createWDeckPlugin({
			"custom/decks/legacy-name_01.wdeck": JSON.stringify({
				fileType: "wdeck",
				logicalDeckId: "deck-1",
				logicalDeckName: "legacy-name",
				segmentIndex: 1,
				cards: [],
			}),
		});
		const service = new WDeckService(plugin);

		const filePath = await service.ensureDeckFileForDeck({
			id: "wdeck:deck-1",
			name: "renamed-deck",
		} as any);

		expect(filePath).toBe("custom/decks/legacy-name_01.wdeck");
		expect(Array.from(files.keys()).filter((path) => path.endsWith(".wdeck"))).toEqual([
			"custom/decks/legacy-name_01.wdeck",
		]);
	});

	test("persists deck definitions inside .wdeck files and resolves the deck from logical ids", async () => {
		const { plugin, files } = createWDeckPlugin({
			"custom/decks/legacy-name_01.wdeck": JSON.stringify({
				fileType: "wdeck",
				logicalDeckId: "deck-1",
				logicalDeckName: "legacy-name",
				segmentIndex: 1,
				cards: [{ uuid: "card-1", content: "a" }],
			}),
			"custom/decks/legacy-name_02.wdeck": JSON.stringify({
				fileType: "wdeck",
				logicalDeckId: "deck-1",
				logicalDeckName: "legacy-name",
				segmentIndex: 2,
				cards: [{ uuid: "card-2", content: "b" }],
			}),
		});
		const service = new WDeckService(plugin);

		const aggregate = await service.saveDeckDefinition({
			id: "wdeck:deck-1",
			name: "renamed-deck",
			description: "deck meta",
			category: "biology",
			cardUUIDs: [],
			path: "renamed-deck",
			level: 0,
			order: 0,
			inheritSettings: false,
			settings: {
				newCardsPerDay: 20,
				maxReviewsPerDay: 100,
				enableAutoAdvance: true,
				showAnswerTime: 0,
				fsrsParams: {
					w: [],
					requestRetention: 0.9,
					maximumInterval: 36500,
					enableFuzz: true,
				},
				learningSteps: [1, 10],
				relearningSteps: [10],
				graduatingInterval: 1,
				easyInterval: 4,
			},
			stats: {
				totalCards: 2,
				newCards: 2,
				learningCards: 0,
				reviewCards: 0,
				todayNew: 0,
				todayReview: 0,
				todayTime: 0,
				totalReviews: 0,
				totalTime: 0,
				memoryRate: 0,
				averageEase: 0,
				forecastDays: {},
			},
			includeSubdecks: false,
			deckType: "mixed",
			purpose: "memory",
			created: "2026-04-15T00:00:00.000Z",
			modified: "2026-04-15T00:00:00.000Z",
			tags: ["tag-1"],
			metadata: {
				fileType: "wdeck",
				logicalDeckId: "deck-1",
				filePaths: ["custom/decks/legacy-name_01.wdeck"],
			},
		} as any);

		expect(aggregate.runtimeDeckId).toBe("wdeck:deck-1");
		expect(aggregate.logicalDeckName).toBe("renamed-deck");
		expect(aggregate.deck).toMatchObject({
			id: "deck-1",
			name: "renamed-deck",
			category: "biology",
			tags: ["tag-1"],
		});

		const deckInfo = await service.getDeckInfoByAnyDeckId("deck-1");
		expect(deckInfo).toEqual({
			runtimeDeckId: "wdeck:deck-1",
			logicalDeckId: "deck-1",
			logicalDeckName: "renamed-deck",
		});
		expect(files.has("custom/decks/legacy-name_01.wdeck")).toBe(false);
		expect(files.has("custom/decks/legacy-name_02.wdeck")).toBe(false);
		expect(files.has("custom/decks/renamed-deck_01.wdeck")).toBe(true);
		expect(files.has("custom/decks/renamed-deck_02.wdeck")).toBe(true);

		const firstSegment = JSON.parse(files.get("custom/decks/renamed-deck_01.wdeck") || "{}");
		const secondSegment = JSON.parse(files.get("custom/decks/renamed-deck_02.wdeck") || "{}");
		expect(firstSegment.logicalDeckName).toBe("renamed-deck");
		expect(secondSegment.logicalDeckName).toBe("renamed-deck");
		expect(firstSegment.deck).toMatchObject({
			id: "deck-1",
			name: "renamed-deck",
			category: "biology",
			tags: ["tag-1"],
		});
		expect(firstSegment.deck.cardUUIDs).toBeUndefined();
		expect(firstSegment.deck.metadata?.fileType).toBeUndefined();
		expect(firstSegment.deck.metadata?.logicalDeckId).toBeUndefined();
	});
});
