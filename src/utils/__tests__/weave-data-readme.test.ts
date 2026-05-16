import {
	WEAVE_DATA_README_NAME,
	ensureExistingWeaveDataReadmes,
	ensureWeaveDataReadmesForPath,
	getRelevantWeaveDataReadmeDescriptors,
	getWeaveDataReadmeDescriptors,
} from "../weave-data-readme";

describe("weave-data-readme", () => {
	function createAdapter(existingPaths: string[]) {
		const present = new Set(existingPaths);
		const writes: Array<{ path: string; content: string }> = [];
		const removed: string[] = [];

		return {
			adapter: {
				exists: async (path: string) => present.has(path),
				write: async (path: string, content: string) => {
					writes.push({ path, content });
					present.add(path);
				},
				remove: async (path: string) => {
					removed.push(path);
					present.delete(path);
				},
			},
			writes,
			removed,
		};
	}

	it("defines a single root readme path", () => {
		const descriptors = getWeaveDataReadmeDescriptors();

		expect(descriptors).toHaveLength(1);
		expect(descriptors[0]?.dirPath).toBe("weave");
		expect(descriptors[0]?.readmePath).toBe(`weave/${WEAVE_DATA_README_NAME}`);
	});

	it("returns the root readme when a weave path is touched", () => {
		const descriptors = getRelevantWeaveDataReadmeDescriptors(
			"weave/memory/learning/sessions/2026-04.json"
		);

		expect(descriptors).toHaveLength(1);
		expect(descriptors[0]?.dirPath).toBe("weave");
		expect(descriptors[0]?.readmePath).toBe(`weave/${WEAVE_DATA_README_NAME}`);
	});

	it("ignores paths outside the weave vault data root", () => {
		expect(
			getRelevantWeaveDataReadmeDescriptors(".obsidian/plugins/weave/state/study-session.json")
		).toHaveLength(0);
	});

	it("only writes the merged root readme when the weave root exists", async () => {
		const { adapter, writes } = createAdapter(["weave"]);

		await ensureExistingWeaveDataReadmes(adapter);

		expect(writes.map((item) => item.path)).toEqual([`weave/${WEAVE_DATA_README_NAME}`]);
	});

	it("refreshes an existing merged root readme with the latest content", async () => {
		const { adapter, writes } = createAdapter(["weave", `weave/${WEAVE_DATA_README_NAME}`]);

		await ensureExistingWeaveDataReadmes(adapter);

		expect(writes).toHaveLength(1);
		expect(writes[0]?.path).toBe(`weave/${WEAVE_DATA_README_NAME}`);
		expect(writes[0]?.content).not.toContain("散落在各目录里的 `_README.md`");
	});

	it("cleans legacy nested _README files after creating the merged readme", async () => {
		const { adapter, writes, removed } = createAdapter([
			"weave",
			"weave/_README.md",
			"weave/memory/_README.md",
			"weave/memory/learning/_README.md",
		]);

		await ensureExistingWeaveDataReadmes(adapter);

		expect(writes.map((item) => item.path)).toEqual([`weave/${WEAVE_DATA_README_NAME}`]);
		expect(removed).toEqual(
			expect.arrayContaining([
				"weave/_README.md",
				"weave/memory/_README.md",
				"weave/memory/learning/_README.md",
			])
		);
	});

	it("writes only the merged root readme for touched weave directories", async () => {
		const { adapter, writes } = createAdapter(["weave"]);

		await ensureWeaveDataReadmesForPath(adapter, "weave/memory/learning/sessions");

		expect(writes.map((item) => item.path)).toEqual([`weave/${WEAVE_DATA_README_NAME}`]);
	});

	it("uses a tree block and tables, and documents that sessions are not resume state", () => {
		const descriptor = getWeaveDataReadmeDescriptors()[0];

		expect(descriptor?.content).toContain("```text");
		expect(descriptor?.content).toContain("| 路径 | 作用 | 是否随 vault 同步 | 备注 |");
		expect(descriptor?.content).toContain("ai-assistant/");
		expect(descriptor?.content).toContain("editor/");
		expect(descriptor?.content).toContain("user-prompts/");
		expect(descriptor?.content).toContain("topics/");
		expect(descriptor?.content).toContain("profiles/");
		expect(descriptor?.content).toContain("relations/");
		expect(descriptor?.content).toContain("study-session.json");
		expect(descriptor?.content).toContain("不在 `weave/` 内");
		expect(descriptor?.content).toContain("Obsidian 默认新建笔记位置");
		expect(descriptor?.content).toContain("只展示推荐正常结构");
		expect(descriptor?.content).not.toContain("| `temp/` |");
		expect(descriptor?.content).not.toContain("_migration_conflicts/");
		expect(descriptor?.content).not.toContain("旧版牌组目录");
		expect(descriptor?.content).not.toContain("incremental-reading/IR/");
	});
});
