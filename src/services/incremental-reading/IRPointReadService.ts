import type { App } from "obsidian";
import type { IRPointFileCatalogEntry, IRPointSnapshot, IRPointStorageMigrationReport } from "../../types/ir-point-storage-types";
import type { IRDeck } from "../../types/ir-types";
import type { StudyQueueResult } from "./IRSchedulingFacade";
import { IRPointDataReadService } from "./IRPointDataReadService";
import { IRScheduleReadService } from "./IRScheduleReadService";

/**
 * 统一的 IR 读取外观。
 *
 * 目标不是替代所有旧读取实现，而是为后续独立插件拆分提供一个稳定的读边界：
 * - 点文件目录与点快照
 * - 专题牌组视图
 * - 调度队列与统计摘要
 * - 最新迁移报告
 */
export class IRPointReadService {
	private readonly pointDataReadService: IRPointDataReadService;
	private readonly scheduleReadService: IRScheduleReadService;
	private initialized = false;

	constructor(private readonly app: App) {
		this.pointDataReadService = new IRPointDataReadService(app);
		this.scheduleReadService = new IRScheduleReadService(app);
	}

	async initialize(): Promise<void> {
		if (this.initialized) {
			return;
		}

		await this.pointDataReadService.initialize();
		await this.scheduleReadService.initialize();
		this.initialized = true;
	}

	async listPointFileCatalogEntries(): Promise<IRPointFileCatalogEntry[]> {
		return await this.pointDataReadService.listPointFileCatalogEntries();
	}

	async listPointDecks(): Promise<Record<string, IRDeck>> {
		return await this.pointDataReadService.listPointDecks();
	}

	async listPointSnapshots(): Promise<IRPointSnapshot[]> {
		return await this.pointDataReadService.listPointSnapshots();
	}

	async getPointSnapshotById(pointId: string): Promise<IRPointSnapshot | null> {
		return await this.pointDataReadService.getPointSnapshotById(pointId);
	}

	async getPointTopicIds(pointId: string): Promise<string[]> {
		return await this.pointDataReadService.getPointTopicIds(pointId);
	}

	async getStudyQueue(deckId: string): Promise<StudyQueueResult> {
		return await this.scheduleReadService.getStudyQueue(deckId);
	}

	async getScheduleStats(deckId: string): Promise<{
		newCount: number;
		learningCount: number;
		reviewCount: number;
		suspendedCount: number;
		dueToday: number;
		overdue: number;
		upcoming7Days: number;
		reachedDailyLimit: number;
	}> {
		return await this.scheduleReadService.getScheduleStats(deckId);
	}

	async getOverloadInfo(deckId: string): Promise<{
		isOverloaded: boolean;
		dueCount: number;
		budgetCount: number;
		overloadRatio: number;
		groupOverload: Record<string, { due: number; ratio: number }>;
	}> {
		return await this.scheduleReadService.getOverloadInfo(deckId);
	}

	async getLatestMigrationReport(): Promise<IRPointStorageMigrationReport | null> {
		return await this.pointDataReadService.getLatestMigrationReport();
	}

	getPointDataReadService(): IRPointDataReadService {
		return this.pointDataReadService;
	}

	getScheduleReadService(): IRScheduleReadService {
		return this.scheduleReadService;
	}
}

export function createIRPointReadService(app: App): IRPointReadService {
	return new IRPointReadService(app);
}
