import { IRChunkScheduleAdapter } from "../IRChunkScheduleAdapter";
import { createDefaultChunkFileData, type IRChunkFileYAML } from "../../../types/ir-types";

describe("IRChunkScheduleAdapter", () => {
	it("在跳过 archived/removed/done 块前应先把 YAML 状态同步回存储", async () => {
		const chunk = createDefaultChunkFileData("chunk-1", "src-1", "chunks/1.md");
		chunk.scheduleStatus = "queued";
		chunk.priorityUi = 2;

		const saveChunkData = vi.fn(async () => {});
		const storage = {
			getAllChunkData: vi.fn(async () => ({ [chunk.chunkId]: chunk })),
			saveChunkData,
		};

		const adapter = new IRChunkScheduleAdapter({} as any, storage as any);
		const yaml: IRChunkFileYAML = {
			chunk_id: chunk.chunkId,
			source_id: chunk.sourceId,
			status: "archived",
			priority_ui: 7,
			tags: [],
			weave_type: "ir-chunk",
		};

		(adapter as any).chunkFileService = {
			readChunkFileYAML: vi.fn(async () => yaml),
		};

		const schedulable = await adapter.getSchedulableChunks();

		expect(schedulable).toEqual([]);
		expect(saveChunkData).toHaveBeenCalledTimes(1);
		expect(saveChunkData).toHaveBeenCalledWith(
			expect.objectContaining({
				chunkId: chunk.chunkId,
				scheduleStatus: "suspended",
				priorityUi: 7,
			})
		);
	});

	it("syncFromYAML 会在旧块缺少 priorityUi 时从 YAML 补全用户优先级", async () => {
		const chunk = createDefaultChunkFileData("chunk-2", "src-2", "chunks/2.md");
		chunk.priorityUi = undefined;
		chunk.priorityEff = 5;

		const saveChunkData = vi.fn(async () => {});
		const storage = {
			getChunkData: vi.fn(async () => chunk),
			saveChunkData,
		};

		const adapter = new IRChunkScheduleAdapter({} as any, storage as any);
		const yaml: IRChunkFileYAML = {
			chunk_id: chunk.chunkId,
			source_id: chunk.sourceId,
			status: "active",
			priority_ui: 5,
			tags: [],
			weave_type: "ir-chunk",
		};

		(adapter as any).chunkFileService = {
			readChunkFileYAML: vi.fn(async () => yaml),
		};

		const changed = await adapter.syncFromYAML(chunk.chunkId);

		expect(changed).toBe(true);
		expect(saveChunkData).toHaveBeenCalledTimes(1);
		expect(saveChunkData).toHaveBeenCalledWith(
			expect.objectContaining({
				chunkId: chunk.chunkId,
				scheduleStatus: "queued",
				priorityUi: 5,
			})
		);
	});
});
