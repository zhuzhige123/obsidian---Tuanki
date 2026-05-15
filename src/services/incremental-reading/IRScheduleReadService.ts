import type { App } from "obsidian";
import {
	IRSchedulingFacade,
	type StudyQueueResult,
} from "./IRSchedulingFacade";

/**
 * 仅负责调度读取的轻量读服务。
 *
 * 让调度队列、统计摘要与点数据读取脱钩，
 * 为后续插件协作改造成显式桥接接口做准备。
 */
export class IRScheduleReadService {
	private readonly schedulingFacade: IRSchedulingFacade;
	private initialized = false;

	constructor(private readonly app: App) {
		this.schedulingFacade = new IRSchedulingFacade(app);
	}

	async initialize(): Promise<void> {
		if (this.initialized) {
			return;
		}

		await this.schedulingFacade.initialize();
		this.initialized = true;
	}

	async getStudyQueue(deckId: string): Promise<StudyQueueResult> {
		await this.initialize();
		return await this.schedulingFacade.getStudyQueue(deckId);
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
		await this.initialize();
		return await this.schedulingFacade.getScheduleStats(deckId);
	}

	async getOverloadInfo(deckId: string): Promise<{
		isOverloaded: boolean;
		dueCount: number;
		budgetCount: number;
		overloadRatio: number;
		groupOverload: Record<string, { due: number; ratio: number }>;
	}> {
		await this.initialize();
		return await this.schedulingFacade.getOverloadInfo(deckId);
	}

	getSchedulingFacade(): IRSchedulingFacade {
		return this.schedulingFacade;
	}
}

export function createIRScheduleReadService(app: App): IRScheduleReadService {
	return new IRScheduleReadService(app);
}
