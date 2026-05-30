import { StudyDueIndexService } from "../StudyDueIndexService";
import { getPluginPaths } from "../../../config/paths";

function normalize(path: string): string {
	return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
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
		const parent = normalized.includes("/") ? normalized.slice(0, normalized.lastIndexOf("/")) : "";
		if (parent) ensureDir(parent);
		files.set(normalized, content);
	};

	for (const [path, content] of Object.entries(initialFiles)) {
		writeText(path, content);
	}

	const adapter = {
		exists: async (path: string) => files.has(normalize(path)) || folders.has(normalize(path)),
		mkdir: async (path: string) => {
			ensureDir(path);
		},
		read: async (path: string) => {
			const value = files.get(normalize(path));
			if (value === undefined) {
				throw new Error(`File not found: ${path}`);
			}
			return value;
		},
		write: async (path: string, content: string) => {
			writeText(path, content);
		},
	};

	return {
		plugin: {
			app: { vault: { configDir: ".obsidian", adapter } },
			deckMembershipIndexService: undefined,
		} as any,
		files,
	};
}

describe("StudyDueIndexService", () => {
	it("stores due timestamps under plugin cache indices", async () => {
		const { plugin, files } = createPlugin();
		const service = new StudyDueIndexService(plugin);
		const pluginPaths = getPluginPaths(plugin.app);

		await service.initialize();
		await service.updateCard(
			{
				uuid: "card-due",
				content: "---\n---\nQ",
				fsrs: { due: "2020-01-01T00:00:00.000Z" } as any,
			} as any,
			[]
		);

		expect(files.has(normalize(pluginPaths.indices.studyDue))).toBe(true);

		const dueUUIDs = await service.getDueUUIDs(Date.parse("2021-01-01T00:00:00.000Z"));
		expect(dueUUIDs).toEqual(["card-due"]);
	});
});
