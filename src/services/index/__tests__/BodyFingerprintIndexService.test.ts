import { BodyFingerprintIndexService } from "../BodyFingerprintIndexService";
import { getPluginPaths } from "../../../config/paths";
import { getCardBodyFingerprint } from "../../../utils/card-content-fingerprint";

function normalize(path: string): string {
	return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
}

function parent(path: string): string {
	const normalized = normalize(path);
	const index = normalized.lastIndexOf("/");
	return index > 0 ? normalized.slice(0, index) : "";
}

function createPlugin(initialFiles: Record<string, string> = {}) {
	const files = new Map<string, string>();
	const folders = new Set<string>(["", ".obsidian", ".obsidian/plugins", ".obsidian/plugins/weave"]);

	const ensureDir = (dir: string) => {
		const normalized = normalize(dir);
		if (!normalized) return;
		const parts = normalized.split("/");
		let current = "";
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			folders.add(current);
		}
	};

	const writeText = (path: string, content: string) => {
		const normalized = normalize(path);
		ensureDir(parent(normalized));
		files.set(normalized, content);
	};

	for (const [path, content] of Object.entries(initialFiles)) {
		writeText(path, content);
	}

	const adapter = {
		exists: async (path: string) => {
			const normalized = normalize(path);
			return files.has(normalized) || folders.has(normalized);
		},
		mkdir: async (path: string) => {
			ensureDir(path);
		},
		read: async (path: string) => {
			const normalized = normalize(path);
			const value = files.get(normalized);
			if (value === undefined) {
				throw new Error(`File not found: ${normalized}`);
			}
			return value;
		},
		write: async (path: string, content: string) => {
			writeText(path, content);
		},
	};

	return {
		plugin: {
			app: {
				vault: {
					configDir: ".obsidian",
					adapter,
				},
			},
		} as any,
		files,
	};
}

const canonicalCard = {
	uuid: "card-canonical",
	content: "---\nwe_decks:\n  - 目标牌组\n---\n重复正文",
	stats: { totalReviews: 5, totalTime: 5, averageTime: 1 },
} as any;

describe("BodyFingerprintIndexService", () => {
	it("stores the body fingerprint index under the plugin cache indices folder", async () => {
		const { plugin, files } = createPlugin();
		const service = new BodyFingerprintIndexService(plugin);
		const pluginPaths = getPluginPaths(plugin.app);

		await service.initialize();
		await service.rebuildFromCards([canonicalCard]);

		expect(files.has(normalize(pluginPaths.indices.bodyFingerprint))).toBe(true);

		const snapshot = JSON.parse(files.get(normalize(pluginPaths.indices.bodyFingerprint)) || "{}");
		expect(snapshot.initialized).toBe(true);
		expect(snapshot.fullRebuildRequired).toBe(false);
		expect(snapshot.uuidToFingerprint).toEqual({
			"card-canonical": getCardBodyFingerprint(canonicalCard),
		});
	});

	it("upserts cards incrementally without requiring a full rebuild", async () => {
		const { plugin } = createPlugin();
		const service = new BodyFingerprintIndexService(plugin);

		await service.upsertCards([canonicalCard]);
		expect(await service.needsRebuild()).toBe(false);

		const index = await service.getIndexMap();
		expect(index.get(getCardBodyFingerprint(canonicalCard))).toBe("card-canonical");
	});

	it("marks full rebuild required when removing the canonical uuid for a fingerprint", async () => {
		const { plugin } = createPlugin();
		const service = new BodyFingerprintIndexService(plugin);

		await service.rebuildFromCards([canonicalCard]);
		await service.removeCards(["card-canonical"]);

		expect(await service.needsRebuild()).toBe(true);
	});

	it("marks full rebuild required explicitly", async () => {
		const { plugin } = createPlugin();
		const service = new BodyFingerprintIndexService(plugin);

		await service.rebuildFromCards([canonicalCard]);
		await service.markFullRebuildRequired();

		expect(await service.needsRebuild()).toBe(true);
	});
});
