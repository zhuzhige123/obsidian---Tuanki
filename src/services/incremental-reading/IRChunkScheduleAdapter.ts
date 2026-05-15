/** 让文件化块的 YAML 状态与调度存储保持一致。 */

import { App, TFile } from "obsidian";
import type {
	ChunkFileStatus,
	IRBlockStatus,
	IRChunkFileData,
	IRChunkFileYAML,
} from "../../types/ir-types";
import { logger } from "../../utils/logger";
import { IRChunkFileService } from "./IRChunkFileService";
import { IRStorageService } from "./IRStorageService";

/** 将块文件状态映射到内部调度状态。 */
function mapChunkStatusToScheduleStatus(yamlStatus: ChunkFileStatus): IRBlockStatus {
	switch (yamlStatus) {
		case "active":
			return "queued";
		case "processing":
			return "active";
		case "done":
			return "done";
		case "archived":
			return "suspended";
		case "removed":
			return "removed";
		default:
			return "new";
	}
}

/** 将内部调度状态映射回块文件状态。 */
function mapScheduleStatusToChunkStatus(scheduleStatus: IRBlockStatus): ChunkFileStatus {
	switch (scheduleStatus) {
		case "new":
		case "queued":
		case "scheduled":
			return "active";
		case "active":
			return "processing";
		case "done":
			return "done";
		case "suspended":
			return "archived";
		case "removed":
			return "removed";
		default:
			return "active";
	}
}

type ChunkScheduleUpdates = Partial<
	Pick<
		IRChunkFileData,
		| "priorityUi"
		| "priorityEff"
		| "intervalDays"
		| "nextRepDate"
		| "scheduleStatus"
		| "doneReason"
		| "doneAt"
	>
>;

const TERMINAL_CHUNK_STATUSES = new Set<ChunkFileStatus>(["done", "archived", "removed"]);

export class IRChunkScheduleAdapter {
	private storage: IRStorageService;
	private chunkFileService: IRChunkFileService;

	constructor(app: App, storage: IRStorageService) {
		this.storage = storage;
		this.chunkFileService = new IRChunkFileService(app);
	}

	/** 返回可进入调度的块，并同步最新 YAML 状态。 */
	async getSchedulableChunks(): Promise<IRChunkFileData[]> {
		const allChunks = await this.storage.getAllChunkData();
		const schedulable: IRChunkFileData[] = [];

		for (const chunk of Object.values(allChunks)) {
			const yamlData = await this.chunkFileService.readChunkFileYAML(chunk.filePath);

			if (yamlData) {
				const { changed, isTerminal } = this.applyYamlStateToChunk(chunk, yamlData);

				if (changed) {
					chunk.updatedAt = Date.now();
					await this.storage.saveChunkData(chunk);
				}

				if (isTerminal) {
					continue;
				}
			}

			schedulable.push(chunk);
		}

		return schedulable;
	}

	/** 返回今天应进入学习队列的块。 */
	async getTodayDueChunks(): Promise<IRChunkFileData[]> {
		const schedulable = await this.getSchedulableChunks();
		const now = Date.now();

		return schedulable.filter((_chunk) => {
			if (_chunk.scheduleStatus === "new") return true;
			return _chunk.nextRepDate <= now;
		});
	}

	/** 更新单个块的调度字段，并同步回块文件。 */
	async updateChunkSchedule(chunkId: string, updates: ChunkScheduleUpdates): Promise<void> {
		const chunk = await this.storage.getChunkData(chunkId);
		if (!chunk) {
			logger.warn(`[IRChunkScheduleAdapter] 块不存在: ${chunkId}`);
			return;
		}

		this.applyChunkUpdates(chunk, updates);
		await this.storage.saveChunkData(chunk);
		await this.syncChunkYamlFields(chunk, updates);

		logger.debug(`[IRChunkScheduleAdapter] 更新块调度: ${chunkId}`);
	}

	/** 批量更新多个块的调度字段。 */
	async batchUpdateChunkSchedules(
		updates: Array<{
			chunkId: string;
			data: ChunkScheduleUpdates;
		}>
	): Promise<number> {
		if (updates.length === 0) return 0;

		const allChunks = await this.storage.getAllChunkData();
		const updatedChunks: IRChunkFileData[] = [];

		for (const { chunkId, data } of updates) {
			const chunk = allChunks[chunkId];
			if (!chunk) continue;

			this.applyChunkUpdates(chunk, data);
			updatedChunks.push(chunk);
		}

		if (updatedChunks.length > 0) {
			await this.storage.saveChunkDataBatch(updatedChunks);
		}

		for (const { chunkId, data } of updates) {
			const chunk = allChunks[chunkId];
			if (!chunk) continue;
			await this.syncChunkYamlFields(chunk, data);
		}

		logger.debug(`[IRChunkScheduleAdapter] 批量更新 ${updatedChunks.length} 个块调度`);
		return updatedChunks.length;
	}

	/** 将块标记为完成。 */
	async markChunkDone(chunkId: string): Promise<void> {
		const chunk = await this.storage.getChunkData(chunkId);
		if (!chunk) {
			logger.warn(`[IRChunkScheduleAdapter] 块不存在: ${chunkId}`);
			return;
		}

		chunk.scheduleStatus = "done";
		chunk.updatedAt = Date.now();
		await this.storage.saveChunkData(chunk);

		const yamlData = await this.chunkFileService.readChunkFileYAML(chunk.filePath);
		if (yamlData) {
			await this.chunkFileService.updateChunkFileYAML(chunk.filePath, { status: "done" });
		}

		logger.info(`[IRChunkScheduleAdapter] 块标记为完成: ${chunkId}`);
	}

	/** 记录块的阅读和产出统计。 */
	async recordChunkInteraction(
		chunkId: string,
		readingTimeSec: number,
		actions: { extracts?: number; cardsCreated?: number; notesWritten?: number } = {}
	): Promise<void> {
		const chunk = await this.storage.getChunkData(chunkId);
		if (!chunk) return;

		chunk.stats.impressions++;
		chunk.stats.totalReadingTimeSec += readingTimeSec;
		chunk.stats.effectiveReadingTimeSec += Math.min(readingTimeSec, 600); // 最多计10分钟
		chunk.stats.extracts += actions.extracts || 0;
		chunk.stats.cardsCreated += actions.cardsCreated || 0;
		chunk.stats.notesWritten += actions.notesWritten || 0;
		chunk.stats.lastInteraction = Date.now();
		chunk.stats.lastShownAt = Date.now();
		chunk.updatedAt = Date.now();

		const todayStr = new Date().toISOString().slice(0, 10);
		if (chunk.stats.todayShownDate === todayStr) {
			chunk.stats.todayShownCount = (chunk.stats.todayShownCount || 0) + 1;
		} else {
			chunk.stats.todayShownDate = todayStr;
			chunk.stats.todayShownCount = 1;
		}

		await this.storage.saveChunkData(chunk);
	}

	/** 在用户直接改 YAML 后，把变化同步回调度存储。 */
	async syncFromYAML(chunkId: string): Promise<boolean> {
		const chunk = await this.storage.getChunkData(chunkId);
		if (!chunk) return false;

		const yaml = await this.chunkFileService.readChunkFileYAML(chunk.filePath);
		if (!yaml) return false;

		const { changed } = this.applyYamlStateToChunk(chunk, yaml);

		if (changed) {
			chunk.updatedAt = Date.now();
			await this.storage.saveChunkData(chunk);
		}

		return changed;
	}

	/** 把 YAML 中用户可编辑的调度字段合并回块数据。 */
	private applyYamlStateToChunk(
		chunk: IRChunkFileData,
		yaml: IRChunkFileYAML
	): { changed: boolean; isTerminal: boolean } {
		let changed = false;

		const expectedScheduleStatus = mapChunkStatusToScheduleStatus(yaml.status);
		if (chunk.scheduleStatus !== expectedScheduleStatus) {
			chunk.scheduleStatus = expectedScheduleStatus;
			changed = true;
		}

		if (
			yaml.priority_ui !== undefined &&
			(chunk.priorityUi === undefined || Math.abs(chunk.priorityUi - yaml.priority_ui) > 0.1)
		) {
			chunk.priorityUi = yaml.priority_ui;
			changed = true;
		}

		return {
			changed,
			isTerminal: TERMINAL_CHUNK_STATUSES.has(yaml.status),
		};
	}

	/** 批量同步所有块的 YAML 状态。 */
	async syncAllFromYAML(): Promise<number> {
		const allChunks = await this.storage.getAllChunkData();
		let syncedCount = 0;

		for (const chunk of Object.values(allChunks)) {
			const changed = await this.syncFromYAML(chunk.chunkId);
			if (changed) syncedCount++;
		}

		if (syncedCount > 0) {
			logger.info(`[IRChunkScheduleAdapter] 从 YAML 同步了 ${syncedCount} 个块的状态`);
		}

		return syncedCount;
	}

	/** 把更新字段写回块数据对象。 */
	private applyChunkUpdates(chunk: IRChunkFileData, updates: ChunkScheduleUpdates): void {
		if (updates.priorityUi !== undefined) chunk.priorityUi = updates.priorityUi;
		if (updates.priorityEff !== undefined) chunk.priorityEff = updates.priorityEff;
		if (updates.intervalDays !== undefined) chunk.intervalDays = updates.intervalDays;
		if (updates.nextRepDate !== undefined) chunk.nextRepDate = updates.nextRepDate;
		if (updates.scheduleStatus !== undefined) chunk.scheduleStatus = updates.scheduleStatus;
		if (updates.doneReason !== undefined) chunk.doneReason = updates.doneReason;
		if (updates.doneAt !== undefined) chunk.doneAt = updates.doneAt;
		chunk.updatedAt = Date.now();
	}

	/** 把可落在 YAML 的字段同步回块文件。 */
	private async syncChunkYamlFields(
		chunk: IRChunkFileData,
		updates: ChunkScheduleUpdates
	): Promise<void> {
		const yamlData = await this.chunkFileService.readChunkFileYAML(chunk.filePath);
		if (!yamlData) {
			logger.debug(
				`[IRChunkScheduleAdapter] 跳过 YAML 同步（非 chunk 文件或无法读取）: ${chunk.chunkId}`
			);
			return;
		}

		if (updates.scheduleStatus !== undefined) {
			const yamlStatus = mapScheduleStatusToChunkStatus(updates.scheduleStatus);
			await this.chunkFileService.updateChunkFileYAML(chunk.filePath, { status: yamlStatus });
		}

		if (updates.priorityUi !== undefined) {
			await this.chunkFileService.updateChunkFileYAML(chunk.filePath, {
				priority_ui: updates.priorityUi,
			});
		}
	}
}
