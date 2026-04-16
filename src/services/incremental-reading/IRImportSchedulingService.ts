/** 根据每日负载为导入内容分配阅读日期。 */

import type { ContentBlock } from "../../types/content-split-types";
import type {
	DailyLoad,
	SchedulingConfig,
	SchedulingImpact,
	SchedulingStrategy,
} from "../../types/ir-import-scheduling";
import type { IRBlock } from "../../types/ir-types";
import type { IRProjectedScheduleItem } from "./IRProjectedScheduleSummary";
import type { IRPlannedScheduleItem } from "./IRScheduleKernel";

export type IRLoadBlock = IRBlock | ContentBlock | IRPlannedScheduleItem | IRProjectedScheduleItem;

export interface IRLoadInfo {
	/** 每日时间预算（分钟） */
	dailyBudgetMinutes: number;
	/** 获取指定日期的已有块 */
	getBlocksForDate: (date: Date) => IRLoadBlock[] | Promise<IRLoadBlock[]>;
	/** 预估块的阅读时间（分钟） */
	estimateBlockMinutes: (block: IRLoadBlock) => number;
}

export class IRImportSchedulingService {
	private loadInfo: IRLoadInfo;

	constructor(loadInfo: IRLoadInfo) {
		this.loadInfo = loadInfo;
	}

	/** 计算导入内容的分散计划。 */
	async calculateScheduling(
		contentBlocks: ContentBlock[],
		config: SchedulingConfig,
		startDate: Date = new Date()
	): Promise<SchedulingImpact> {
		const normalizedConfig = this.normalizeConfig(config);
		const dailyLoads = await this.initializeDailyLoads(
			normalizedConfig.distributionDays,
			startDate
		);

		switch (normalizedConfig.strategy) {
			case "even":
				this.distributeEvenly(contentBlocks, dailyLoads, normalizedConfig);
				break;
			case "balanced":
				this.distributeBalanced(contentBlocks, dailyLoads, normalizedConfig);
				break;
			case "front-loaded":
				this.distributeFrontLoaded(contentBlocks, dailyLoads, normalizedConfig);
				break;
		}

		return this.calculateImpact(dailyLoads, contentBlocks);
	}

	/** 归一化导入分散配置，避免空计划或异常负载率。 */
	private normalizeConfig(config: SchedulingConfig): SchedulingConfig {
		const distributionDays = Math.max(1, Math.floor(config.distributionDays || 0));
		const targetLoadRate = Math.max(0, Number.isFinite(config.targetLoadRate) ? config.targetLoadRate : 0);

		return {
			...config,
			distributionDays,
			targetLoadRate,
		};
	}

	/** 返回可用于负载计算的每日预算分钟数。 */
	private getSafeDailyBudgetMinutes(): number {
		return Math.max(1, this.loadInfo.dailyBudgetMinutes);
	}

	/** 初始化每一天的已有负载。 */
	private async initializeDailyLoads(days: number, startDate: Date): Promise<DailyLoad[]> {
		const loads: DailyLoad[] = [];
		const today = new Date(startDate);
		today.setHours(0, 0, 0, 0);

		for (let i = 0; i < days; i++) {
			const date = new Date(today);
			date.setDate(today.getDate() + i);
			const existingBlocks = await this.loadInfo.getBlocksForDate(date);
			const existingMinutes = existingBlocks.reduce(
				(sum, block) => sum + this.loadInfo.estimateBlockMinutes(block),
				0
			);

			loads.push({
				date,
				existingCount: existingBlocks.length,
				existingMinutes,
				newCount: 0,
				newMinutes: 0,
				loadRate: existingMinutes / this.getSafeDailyBudgetMinutes(),
				isOverloaded: existingMinutes >= this.getSafeDailyBudgetMinutes(),
			});
		}

		return loads;
	}

	/** 按天数平均分配，不考虑已有负载。 */
	private distributeEvenly(
		blocks: ContentBlock[],
		dailyLoads: DailyLoad[],
		_config: SchedulingConfig
	): void {
		const blocksPerDay = Math.ceil(blocks.length / dailyLoads.length);
		let blockIndex = 0;

		for (const load of dailyLoads) {
			let dayCount = 0;
			while (blockIndex < blocks.length && dayCount < blocksPerDay) {
				const block = blocks[blockIndex];
				const minutes = this.loadInfo.estimateBlockMinutes(block);

				load.newCount++;
				load.newMinutes += minutes;
				blockIndex++;
				dayCount++;
			}

			this.updateLoadRate(load);
		}
	}

	/** 优先把块分给剩余容量最大的日期。 */
	private distributeBalanced(
		blocks: ContentBlock[],
		dailyLoads: DailyLoad[],
		config: SchedulingConfig
	): void {
		const targetMinutes = this.getSafeDailyBudgetMinutes() * config.targetLoadRate;

		for (const block of blocks) {
			const blockMinutes = this.loadInfo.estimateBlockMinutes(block);

			let bestDay: DailyLoad | null = null;
			let maxSlack = -Infinity;

			for (const load of dailyLoads) {
				const currentTotal = load.existingMinutes + load.newMinutes;
				const slack = targetMinutes - currentTotal;

				if (slack >= blockMinutes && slack > maxSlack) {
					maxSlack = slack;
					bestDay = load;
				}
			}

			if (!bestDay) {
				bestDay = dailyLoads.reduce((min, load) => {
					const minTotal = min.existingMinutes + min.newMinutes;
					const loadTotal = load.existingMinutes + load.newMinutes;
					return loadTotal < minTotal ? load : min;
				});
			}

			bestDay.newCount++;
			bestDay.newMinutes += blockMinutes;
			this.updateLoadRate(bestDay);
		}

		if (config.dailyMinimum) {
			this.ensureDailyMinimum(dailyLoads);
		}
	}

	/** 尽量把内容排到更靠前的日期，但不主动冲破目标负载。 */
	private distributeFrontLoaded(
		blocks: ContentBlock[],
		dailyLoads: DailyLoad[],
		config: SchedulingConfig
	): void {
		const targetMinutes = this.getSafeDailyBudgetMinutes() * config.targetLoadRate;
		let blockIndex = 0;

		for (const load of dailyLoads) {
			if (blockIndex >= blocks.length) break;

			let dayMinutes = load.existingMinutes + load.newMinutes;

			while (blockIndex < blocks.length) {
				const block = blocks[blockIndex];
				const blockMinutes = this.loadInfo.estimateBlockMinutes(block);

				if (dayMinutes + blockMinutes > targetMinutes) {
					break;
				}

				load.newCount++;
				load.newMinutes += blockMinutes;
				dayMinutes += blockMinutes;
				blockIndex++;
			}

			this.updateLoadRate(load);
		}

		if (blockIndex < blocks.length) {
			const remainingBlocks = blocks.slice(blockIndex);
			this.distributeBalanced(remainingBlocks, dailyLoads, config);
		}
	}

	/** 尽量保证每天至少有一个新块。 */
	private ensureDailyMinimum(dailyLoads: DailyLoad[]): void {
		for (const load of dailyLoads) {
			if (load.newCount === 0) {
				const sourceDay = dailyLoads
					.filter((l) => l.newCount > 1)
					.sort((a, b) => b.loadRate - a.loadRate)[0];

				if (sourceDay) {
					const avgMinutes = sourceDay.newMinutes / sourceDay.newCount;
					sourceDay.newCount--;
					sourceDay.newMinutes -= avgMinutes;
					load.newCount++;
					load.newMinutes += avgMinutes;

					this.updateLoadRate(sourceDay);
					this.updateLoadRate(load);
				}
			}
		}
	}

	/** 刷新某一天的负载率和过载标记。 */
	private updateLoadRate(load: DailyLoad): void {
		const totalMinutes = load.existingMinutes + load.newMinutes;
		load.loadRate = totalMinutes / this.getSafeDailyBudgetMinutes();
		load.isOverloaded = load.loadRate >= 1.0;
	}

	/** 汇总分散计划的影响指标。 */
	private calculateImpact(
		dailyLoads: DailyLoad[],
		_contentBlocks: ContentBlock[]
	): SchedulingImpact {
		if (dailyLoads.length === 0) {
			return {
				dailyLoads: [],
				overloadedDays: 0,
				peakLoadRate: 0,
				averageLoadRate: 0,
				totalNewHours: 0,
				suggestions: [],
			};
		}

		const overloadedDays = dailyLoads.filter((l) => l.isOverloaded).length;
		const peakLoadRate = Math.max(...dailyLoads.map((l) => l.loadRate));
		const averageLoadRate = dailyLoads.reduce((sum, l) => sum + l.loadRate, 0) / dailyLoads.length;
		const totalNewHours = dailyLoads.reduce((sum, l) => sum + l.newMinutes, 0) / 60;

		const suggestions: string[] = [];

		if (overloadedDays > dailyLoads.length * 0.3) {
			suggestions.push("建议延长分散天数或降低导入优先级");
		}
		if (peakLoadRate > 1.5) {
			suggestions.push(`峰值负载过高(${Math.round(peakLoadRate * 100)}%)，建议调整策略`);
		}
		if (averageLoadRate < 0.3) {
			suggestions.push("平均负载较低，可以缩短分散天数");
		}

		return {
			dailyLoads,
			overloadedDays,
			peakLoadRate,
			averageLoadRate,
			totalNewHours,
			suggestions,
		};
	}

	/** 把分散计划映射回具体内容块。 */
	applyScheduling(
		contentBlocks: ContentBlock[],
		impact: SchedulingImpact
	): Map<ContentBlock, Date> {
		const assignments = new Map<ContentBlock, Date>();
		let blockIndex = 0;

		for (const load of impact.dailyLoads) {
			for (let i = 0; i < load.newCount && blockIndex < contentBlocks.length; i++) {
				assignments.set(contentBlocks[blockIndex], load.date);
				blockIndex++;
			}
		}

		return assignments;
	}
}
