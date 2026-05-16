import { getPluginPaths, getV2PathsFromApp } from "../../../config/paths";
import { ReadingCategory } from "../../../types/incremental-reading-types";
import type {
	ReadingMaterial,
	ReadingMaterialsIndex,
	ReadingSession,
} from "../../../types/incremental-reading-types";
import { ReadingMaterialStorage } from "../ReadingMaterialStorage";

type AdapterHarness = ReturnType<typeof createAdapterHarness>;

function normalizePath(path: string): string {
	return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
}

function ensureParentDirs(path: string, dirs: Set<string>): void {
	const normalized = normalizePath(path);
	const parts = normalized.split("/");
	for (let index = 1; index < parts.length; index += 1) {
		dirs.add(parts.slice(0, index).join("/"));
	}
}

function createAdapterHarness(initialFiles: Record<string, string> = {}) {
	const files = new Map<string, string>();
	const dirs = new Set<string>();
	const mkdirCalls: string[] = [];

	for (const [path, content] of Object.entries(initialFiles)) {
		const normalized = normalizePath(path);
		files.set(normalized, content);
		ensureParentDirs(normalized, dirs);
	}

	return {
		files,
		dirs,
		mkdirCalls,
		adapter: {
			exists: async (path: string) => {
				const normalized = normalizePath(path);
				return files.has(normalized) || dirs.has(normalized);
			},
			read: async (path: string) => {
				const normalized = normalizePath(path);
				const content = files.get(normalized);
				if (content === undefined) {
					throw new Error(`File not found: ${normalized}`);
				}
				return content;
			},
			write: async (path: string, content: string) => {
				const normalized = normalizePath(path);
				ensureParentDirs(normalized, dirs);
				files.set(normalized, content);
			},
			remove: async (path: string) => {
				files.delete(normalizePath(path));
			},
			mkdir: async (path: string) => {
				const normalized = normalizePath(path);
				dirs.add(normalized);
				ensureParentDirs(normalized, dirs);
				mkdirCalls.push(normalized);
			},
			list: async (path: string) => {
				const normalized = normalizePath(path);
				const filePrefix = `${normalized}/`;
				return {
					files: Array.from(files.keys()).filter((candidate) => {
						if (!candidate.startsWith(filePrefix)) {
							return false;
						}
						return !candidate.slice(filePrefix.length).includes("/");
					}),
					folders: Array.from(dirs).filter((candidate) => {
						if (!candidate.startsWith(filePrefix)) {
							return false;
						}
						return !candidate.slice(filePrefix.length).includes("/");
					}),
				};
			},
		},
	};
}

function createApp(harness: AdapterHarness) {
	return {
		vault: {
			configDir: ".obsidian",
			adapter: harness.adapter,
		},
	};
}

function createMaterial(overrides: Partial<ReadingMaterial> = {}): ReadingMaterial {
	const now = "2026-04-17T10:00:00.000Z";
	return {
		uuid: "mat-1",
		filePath: "notes/source.md",
		title: "Source",
		category: ReadingCategory.Later,
		priority: 50,
		priorityDecay: 0.5,
		lastAccessed: now,
		progress: {
			currentAnchor: "",
			anchorHistory: [],
			percentage: 0,
			totalWords: 100,
			readWords: 0,
			estimatedTimeRemaining: 1,
		},
		extractedCards: [],
		tags: [],
		created: now,
		modified: now,
		source: "manual",
		...overrides,
	};
}

describe("ReadingMaterialStorage", () => {
	it("将兼容运行时状态写入插件本地单文件，不再创建旧 vault materials 目录", async () => {
		const harness = createAdapterHarness();
		const app = createApp(harness) as any;
		const storage = new ReadingMaterialStorage(app);
		const runtimePath = normalizePath(
			getPluginPaths(app).state.incrementalReading.readingMaterialsRuntime
		);
		const legacyMaterialsRoot = normalizePath(getV2PathsFromApp(app).ir.materials.root);
		const legacyMaterialsIndex = normalizePath(getV2PathsFromApp(app).ir.materials.index);

		await storage.initialize();
		await storage.saveMaterial(createMaterial());

		expect(harness.files.has(runtimePath)).toBe(true);
		expect(harness.files.has(legacyMaterialsIndex)).toBe(false);
		expect(harness.mkdirCalls).not.toContain(legacyMaterialsRoot);
		expect(harness.mkdirCalls).not.toContain(`${legacyMaterialsRoot}/sessions`);

		const saved = JSON.parse(harness.files.get(runtimePath) || "{}");
		expect(saved.materials["mat-1"]).toBeTruthy();
	});

	it("在插件本地状态缺失时，会把旧 vault materials 兼容数据导入到本地单文件", async () => {
		const legacyMaterial = createMaterial({
			uuid: "mat-legacy",
			title: "Legacy Material",
			filePath: "docs/legacy.md",
		});
		const legacyIndex: ReadingMaterialsIndex = {
			version: "1.0.0",
			lastUpdated: "2026-04-16T00:00:00.000Z",
			materials: {
				[legacyMaterial.uuid]: legacyMaterial,
			},
		};
		const legacySession: ReadingSession = {
			uuid: "session-1",
			materialId: legacyMaterial.uuid,
			startTime: "2026-04-16T01:00:00.000Z",
			endTime: "2026-04-16T01:10:00.000Z",
			duration: 600,
			wordsRead: 120,
			cardsCreated: [],
		};

		const legacyFiles = {
			"weave/incremental-reading/materials/materials.json": JSON.stringify(legacyIndex),
			[`weave/incremental-reading/materials/sessions/${legacyMaterial.uuid}.json`]: JSON.stringify({
				sessions: [legacySession],
			}),
		};
		const harness = createAdapterHarness(legacyFiles);
		const app = createApp(harness) as any;
		const storage = new ReadingMaterialStorage(app);
		const runtimePath = normalizePath(
			getPluginPaths(app).state.incrementalReading.readingMaterialsRuntime
		);

		await storage.initialize();

		expect(storage.getMaterialById(legacyMaterial.uuid)?.title).toBe("Legacy Material");
		expect(await storage.getSessionsForMaterial(legacyMaterial.uuid)).toEqual([legacySession]);
		expect(harness.files.has(runtimePath)).toBe(true);

		const saved = JSON.parse(harness.files.get(runtimePath) || "{}");
		expect(saved.materials[legacyMaterial.uuid]?.filePath).toBe("docs/legacy.md");
		expect(saved.sessionsByMaterial[legacyMaterial.uuid]).toHaveLength(1);
	});

	it("会在 Markdown 关联笔记改名后同步更新材料级关联路径", async () => {
		const harness = createAdapterHarness();
		const app = createApp(harness) as any;
		const storage = new ReadingMaterialStorage(app);

		await storage.initialize();
		await storage.saveMaterial(
			createMaterial({
				uuid: "mat-linked",
				primaryAssociatedNotePath: "Folder/Topic.md",
				associatedNotePath: "Folder/Topic.md",
				associatedNotePaths: ["Folder/Topic", "Folder/Appendix.md"],
			})
		);

		expect(await storage.remapAssociatedNoteFileReferences("Folder/Topic.md", "Folder/Renamed Topic.md")).toBe(1);

		const updated = storage.getMaterialById("mat-linked");
		expect(updated?.primaryAssociatedNotePath).toBe("Folder/Renamed Topic.md");
		expect(updated?.associatedNotePath).toBe("Folder/Renamed Topic.md");
		expect(updated?.associatedNotePaths).toEqual(["Folder/Renamed Topic.md", "Folder/Appendix.md"]);
	});
});
