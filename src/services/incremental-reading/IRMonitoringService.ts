/**
 * IRMonitoringService - 增量阅读监控统计服务 v3.0
 *
 * 职责：
 * - 每日统计：dueCount / scheduledCount / postponedCount
 * - TagGroup 展示占比统计
 * - 个体优先级变化追踪
 * - 组参数变化监控
 *
 * @module services/incremental-reading/IRMonitoringService
 */

import { getPluginPaths, getV2PathsFromApp } from "../../config/paths";
import type { IRBlock, IRTagGroupProfile } from "../../types/ir-types";
import { DirectoryUtils } from "../../utils/directory-utils";
import { logger } from "../../utils/logger";

// ============================================
// 类型定义
// ============================================

/**
 * 每日统计数据
 */
export interface DailyStats {
	/** 统计日期 YYYY-MM-DD */
	date: string;
	/** 到期数量 */
	dueCount: number;
	/** 已安排数量 */
	scheduledCount: number;
	/** 已后推数量 */
	postponedCount: number;
	/** 预估总时长（分钟） */
	totalEstimatedMinutes: number;
	/** 实际阅读时长（秒） */
	totalActualReadingSeconds: number;
	/** 各 TagGroup 展示次数 */
	tagGroupAppearances: Record<string, number>;
	/** 新增块数 */
	newBlocksCount: number;
	/** 完成块数（理解度≥3） */
	completedBlocksCount: number;
}

/**
 * 优先级变更记录
 */
export interface PriorityChangeRecord {
	/** 块 ID */
	blockId: string;
	/** 变更时间 */
	timestamp: string;
	/** 旧的用户优先级 */
	oldPriorityUi: number;
	/** 新的用户优先级 */
	newPriorityUi: number;
	/** 旧的有效优先级 */
	oldPriorityEff: number;
	/** 新的有效优先级 */
	newPriorityEff: number;
}

/**
 * 组参数变更记录
 */
export interface GroupParamChangeRecord {
	/** 组 ID */
	groupId: string;
	/** 变更时间 */
	timestamp: string;
	/** 旧的间隔因子 */
	oldIntervalFactor: number;
	/** 新的间隔因子 */
	newIntervalFactor: number;
	/** 样本数量 */
	sampleCount: number;
}

/**
 * TagGroup 统计摘要
 */
export interface TagGroupSummary {
	/** 组 ID */
	groupId: string;
	/** 组名称 */
	groupName: string;
	/** 块数量 */
	blockCount: number;
	/** 到期数量 */
	dueCount: number;
	/** 展示占比 (0-1) */
	appearanceRatio: number;
	/** 当前间隔因子 */
	intervalFactorBase: number;
	/** 平均优先级 */
	avgPriority: number;
}

/**
 * 监控数据存储结构
 */
export interface IRMonitoringData {
	/** 版本号 */
	version: string;
	/** 每日统计记录（最近 30 天） */
	dailyStats: DailyStats[];
	/** 优先级变更记录（最近 100 条） */
	priorityChanges: PriorityChangeRecord[];
	/** 组参数变更记录（最近 100 条） */
	groupParamChanges: GroupParamChangeRecord[];
	/** 调度决策事件（最近 200 条） */
	decisionEvents: IRDecisionEventRecord[];
	decisionOutcomes: IRDecisionOutcomeRecord[];
	/** 最后更新时间 */
	lastUpdated: string;
}

export interface IRDecisionEventRecord {
	itemId: string;
	action: string;
	timestamp: string;
	beforeDate?: string;
	afterDate?: string;
	beforePriority?: number;
	afterPriority?: number;
	sourceType?: string;
}
export interface IRDecisionOutcomeRecord {
	itemId: string;
	outcomeType: string;
	timestamp: string;
	completionSource?: string;
	readingSeconds?: number;
	cardsCreated?: number;
	beforeDate?: string;
	afterDate?: string;
}

export interface IRDecisionCalibrationSummary {
	windowDays: number;
	decisionCount: number;
	outcomeCount: number;
	linkedOutcomeRate: number;
	averagePlannedShiftDays: number;
	averageCompletionLagDays: number;
	averageReadingSeconds: number;
	averageCardsCreated: number;
	actionDistribution: Record<string, number>;
	outcomeDistribution: Record<string, number>;
}

// ============================================
// 默认值
// ============================================

const DEFAULT_MONITORING_DATA: IRMonitoringData = {
	version: "3.0.0",
	dailyStats: [],
	priorityChanges: [],
	groupParamChanges: [],
	decisionEvents: [],
	decisionOutcomes: [],
	lastUpdated: new Date().toISOString(),
};

const MAX_DAILY_STATS_DAYS = 30;
const MAX_PRIORITY_CHANGES = 100;
const MAX_GROUP_PARAM_CHANGES = 100;
const MAX_DECISION_EVENTS = 200;
const MAX_DECISION_OUTCOMES = 200;

// ============================================
// 工具函数
// ============================================

/**
 * 获取今日日期字符串
 */
function getTodayDateString(): string {
	return new Date().toISOString().split("T")[0];
}

/**
 * 创建空的每日统计
 */
function createEmptyDailyStats(date: string): DailyStats {
	return {
		date,
		dueCount: 0,
		scheduledCount: 0,
		postponedCount: 0,
		totalEstimatedMinutes: 0,
		totalActualReadingSeconds: 0,
		tagGroupAppearances: {},
		newBlocksCount: 0,
		completedBlocksCount: 0,
	};
}

// ============================================
// 服务实现
// ============================================

/**
 * 增量阅读监控服务
 */
export class IRMonitoringService {
	private data: IRMonitoringData;
	private readonly storagePath: string;
	private readonly legacyStoragePath: string;
	private vault: any; // Obsidian Vault

	constructor(vault: any, basePath?: string) {
		this.vault = vault;
		const resolvedBasePath =
			basePath || getPluginPaths(vault?.app as any).state.incrementalReading.root;
		this.storagePath = `${resolvedBasePath}/monitoring.json`;
		this.legacyStoragePath = `${getV2PathsFromApp(vault?.app).ir.root}/monitoring.json`;
		this.data = { ...DEFAULT_MONITORING_DATA };
	}

	// ============================================
	// 初始化与持久化
	// ============================================

	/**
	 * 加载监控数据
	 */
	async load(): Promise<void> {
		const candidatePaths = [this.storagePath];
		if (this.legacyStoragePath !== this.storagePath) {
			candidatePaths.push(this.legacyStoragePath);
		}

		for (const path of candidatePaths) {
			try {
				if (!(await this.vault.adapter.exists(path))) {
					continue;
				}
				const content = await this.vault.adapter.read(path);
				const parsed = JSON.parse(content);
				this.data = { ...DEFAULT_MONITORING_DATA, ...parsed };
				return;
			} catch (error) {
				logger.warn(`[IRMonitoringService] 加载监控数据失败，已尝试回退: ${path}`, error);
			}
		}

		this.data = { ...DEFAULT_MONITORING_DATA };
	}

	/**
	 * 保存监控数据
	 */
	async save(): Promise<void> {
		try {
			this.data.lastUpdated = new Date().toISOString();

			// 清理过期数据
			this.cleanupOldData();

			const content = JSON.stringify(this.data);

			await DirectoryUtils.ensureDirForFile(this.vault.adapter as any, this.storagePath);
			await this.vault.adapter.write(this.storagePath, content);
		} catch (error) {
			logger.error("[IRMonitoringService] 保存监控数据失败:", error);
		}
	}

	/**
	 * 清理过期数据
	 */
	private cleanupOldData(): void {
		// 保留最近 N 天的每日统计
		if (this.data.dailyStats.length > MAX_DAILY_STATS_DAYS) {
			this.data.dailyStats = this.data.dailyStats.slice(-MAX_DAILY_STATS_DAYS);
		}

		// 保留最近 N 条优先级变更
		if (this.data.priorityChanges.length > MAX_PRIORITY_CHANGES) {
			this.data.priorityChanges = this.data.priorityChanges.slice(-MAX_PRIORITY_CHANGES);
		}

		// 保留最近 N 条组参数变更
		if (this.data.groupParamChanges.length > MAX_GROUP_PARAM_CHANGES) {
			this.data.groupParamChanges = this.data.groupParamChanges.slice(-MAX_GROUP_PARAM_CHANGES);
		}
		if (this.data.decisionEvents.length > MAX_DECISION_EVENTS) {
			this.data.decisionEvents = this.data.decisionEvents.slice(-MAX_DECISION_EVENTS);
		}
		if (this.data.decisionOutcomes.length > MAX_DECISION_OUTCOMES) {
			this.data.decisionOutcomes = this.data.decisionOutcomes.slice(-MAX_DECISION_OUTCOMES);
		}
	}

	// ============================================
	// 每日统计
	// ============================================

	/**
	 * 获取或创建今日统计
	 */
	getTodayStats(): DailyStats {
		const today = getTodayDateString();
		let stats = this.data.dailyStats.find((s) => s.date === today);

		if (!stats) {
			stats = createEmptyDailyStats(today);
			this.data.dailyStats.push(stats);
		}

		return stats;
	}

	/**
	 * 记录到期数量
	 */
	recordDueCount(count: number): void {
		const stats = this.getTodayStats();
		stats.dueCount = count;
	}

	/**
	 * 记录已安排数量
	 */
	recordScheduledCount(count: number): void {
		const stats = this.getTodayStats();
		stats.scheduledCount = count;
	}

	/**
	 * 记录后推数量
	 */
	recordPostponedCount(count: number): void {
		const stats = this.getTodayStats();
		stats.postponedCount = count;
	}

	/**
	 * 记录预估时长
	 */
	recordEstimatedMinutes(minutes: number): void {
		const stats = this.getTodayStats();
		stats.totalEstimatedMinutes = minutes;
	}

	/**
	 * 累加实际阅读时长
	 */
	addActualReadingTime(seconds: number): void {
		const stats = this.getTodayStats();
		stats.totalActualReadingSeconds += seconds;
	}

	/**
	 * 记录 TagGroup 出现
	 */
	recordTagGroupAppearance(groupId: string): void {
		const stats = this.getTodayStats();
		stats.tagGroupAppearances[groupId] = (stats.tagGroupAppearances[groupId] || 0) + 1;
	}

	/**
	 * 记录新增块
	 */
	recordNewBlock(): void {
		const stats = this.getTodayStats();
		stats.newBlocksCount++;
	}

	/**
	 * 记录完成块
	 */
	recordCompletedBlock(): void {
		const stats = this.getTodayStats();
		stats.completedBlocksCount++;
	}

	// ============================================
	// 优先级追踪
	// ============================================

	/**
	 * 记录优先级变更
	 */
	recordPriorityChange(
		blockId: string,
		oldPriorityUi: number,
		newPriorityUi: number,
		oldPriorityEff: number,
		newPriorityEff: number
	): void {
		this.data.priorityChanges.push({
			blockId,
			timestamp: new Date().toISOString(),
			oldPriorityUi,
			newPriorityUi,
			oldPriorityEff,
			newPriorityEff,
		});
	}

	/**
	 * 获取块的优先级变更历史
	 */
	getPriorityHistory(blockId: string): PriorityChangeRecord[] {
		return this.data.priorityChanges.filter((r) => r.blockId === blockId);
	}

	// ============================================
	// 组参数监控
	// ============================================

	/**
	 * 记录组参数变更
	 */
	recordGroupParamChange(
		groupId: string,
		oldIntervalFactor: number,
		newIntervalFactor: number,
		sampleCount: number
	): void {
		this.data.groupParamChanges.push({
			groupId,
			timestamp: new Date().toISOString(),
			oldIntervalFactor,
			newIntervalFactor,
			sampleCount,
		});
	}

	/**
	 * 获取组的参数变更历史
	 */
	getGroupParamHistory(groupId: string): GroupParamChangeRecord[] {
		return this.data.groupParamChanges.filter((r) => r.groupId === groupId);
	}

	recordDecisionEvent(event: Omit<IRDecisionEventRecord, "timestamp">): void {
		this.data.decisionEvents.push({
			...event,
			timestamp: new Date().toISOString(),
		});
	}

	getRecentDecisionEvents(limit = 20): IRDecisionEventRecord[] {
		return this.data.decisionEvents.slice(-limit);
	}
	recordDecisionOutcome(event: Omit<IRDecisionOutcomeRecord, "timestamp">): void {
		this.data.decisionOutcomes.push({
			...event,
			timestamp: new Date().toISOString(),
		});
	}

	getRecentDecisionOutcomes(limit = 20): IRDecisionOutcomeRecord[] {
		return this.data.decisionOutcomes.slice(-limit);
	}

	getDecisionCalibrationSummary(windowDays = 30): IRDecisionCalibrationSummary {
		const cutoffMs = Date.now() - windowDays * 24 * 60 * 60 * 1000;
		const recentEvents = this.data.decisionEvents.filter(
			(event) => Date.parse(event.timestamp) >= cutoffMs
		);
		const recentOutcomes = this.data.decisionOutcomes.filter(
			(event) => Date.parse(event.timestamp) >= cutoffMs
		);
		const latestOutcomeByItem = new Map<string, IRDecisionOutcomeRecord>();
		for (const outcome of recentOutcomes) {
			latestOutcomeByItem.set(outcome.itemId, outcome);
		}

		let linkedOutcomeCount = 0;
		let plannedShiftDaysTotal = 0;
		let plannedShiftCount = 0;
		let completionLagDaysTotal = 0;
		let completionLagCount = 0;
		let readingSecondsTotal = 0;
		let readingSecondsCount = 0;
		let cardsCreatedTotal = 0;
		let cardsCreatedCount = 0;
		const actionDistribution: Record<string, number> = {};
		const outcomeDistribution: Record<string, number> = {};

		for (const event of recentEvents) {
			actionDistribution[event.action] = (actionDistribution[event.action] || 0) + 1;

			if (event.beforeDate && event.afterDate) {
				const beforeMs = Date.parse(event.beforeDate);
				const afterMs = Date.parse(event.afterDate);
				if (!Number.isNaN(beforeMs) && !Number.isNaN(afterMs)) {
					plannedShiftDaysTotal += Math.abs(afterMs - beforeMs) / (24 * 60 * 60 * 1000);
					plannedShiftCount += 1;
				}
			}

			const outcome = latestOutcomeByItem.get(event.itemId);
			if (outcome) {
				linkedOutcomeCount += 1;
			}
		}

		for (const outcome of recentOutcomes) {
			outcomeDistribution[outcome.outcomeType] =
				(outcomeDistribution[outcome.outcomeType] || 0) + 1;

			if (typeof outcome.readingSeconds === "number") {
				readingSecondsTotal += outcome.readingSeconds;
				readingSecondsCount += 1;
			}
			if (typeof outcome.cardsCreated === "number") {
				cardsCreatedTotal += outcome.cardsCreated;
				cardsCreatedCount += 1;
			}
			if (outcome.afterDate) {
				const afterMs = Date.parse(outcome.afterDate);
				const outcomeMs = Date.parse(outcome.timestamp);
				if (!Number.isNaN(afterMs) && !Number.isNaN(outcomeMs)) {
					completionLagDaysTotal += (outcomeMs - afterMs) / (24 * 60 * 60 * 1000);
					completionLagCount += 1;
				}
			}
		}

		return {
			windowDays,
			decisionCount: recentEvents.length,
			outcomeCount: recentOutcomes.length,
			linkedOutcomeRate: recentEvents.length > 0 ? linkedOutcomeCount / recentEvents.length : 0,
			averagePlannedShiftDays:
				plannedShiftCount > 0 ? plannedShiftDaysTotal / plannedShiftCount : 0,
			averageCompletionLagDays:
				completionLagCount > 0 ? completionLagDaysTotal / completionLagCount : 0,
			averageReadingSeconds:
				readingSecondsCount > 0 ? readingSecondsTotal / readingSecondsCount : 0,
			averageCardsCreated: cardsCreatedCount > 0 ? cardsCreatedTotal / cardsCreatedCount : 0,
			actionDistribution,
			outcomeDistribution,
		};
	}

	// ============================================
	// 统计查询
	// ============================================

	/**
	 * 获取最近 N 天的统计
	 */
	getRecentStats(days = 7): DailyStats[] {
		return this.data.dailyStats.slice(-days);
	}

	/**
	 * 计算 TagGroup 展示占比
	 */
	calculateTagGroupRatios(
		blocks: IRBlock[],
		profiles: Map<string, IRTagGroupProfile>
	): TagGroupSummary[] {
		const today = getTodayDateString();
		const todayStats = this.data.dailyStats.find((s) => s.date === today);
		const totalAppearances = todayStats
			? Object.values(todayStats.tagGroupAppearances).reduce((a, b) => a + b, 0)
			: 0;

		const summaries: TagGroupSummary[] = [];

		profiles.forEach((profile, groupId) => {
			const groupBlocks = blocks.filter((b) => b.tagGroupId === groupId);
			const now = new Date();
			const dueBlocks = groupBlocks.filter((_b) => {
				if (!_b.nextReview) return false;
				return new Date(_b.nextReview) <= now;
			});

			const appearances = todayStats?.tagGroupAppearances[groupId] || 0;
			const avgPriority =
				groupBlocks.length > 0
					? groupBlocks.reduce((sum, b) => sum + (b.priorityEff ?? 5), 0) / groupBlocks.length
					: 5;

			summaries.push({
				groupId,
				groupName: profile.groupId, // 可以从 TagGroup 定义中获取名称
				blockCount: groupBlocks.length,
				dueCount: dueBlocks.length,
				appearanceRatio: totalAppearances > 0 ? appearances / totalAppearances : 0,
				intervalFactorBase: profile.intervalFactorBase,
				avgPriority,
			});
		});

		return summaries.sort((a, b) => b.appearanceRatio - a.appearanceRatio);
	}

	/**
	 * 获取汇总报告
	 */
	getSummaryReport(): {
		today: DailyStats | null;
		weeklyAvg: {
			dueCount: number;
			scheduledCount: number;
			completedCount: number;
			readingMinutes: number;
		};
		trends: {
			dueCountTrend: number; // 正数表示增长
			completionRateTrend: number;
		};
	} {
		const recentStats = this.getRecentStats(7);
		const today = this.data.dailyStats.find((s) => s.date === getTodayDateString()) || null;

		// 计算周平均
		const weeklyAvg = {
			dueCount: 0,
			scheduledCount: 0,
			completedCount: 0,
			readingMinutes: 0,
		};

		if (recentStats.length > 0) {
			weeklyAvg.dueCount = recentStats.reduce((sum, s) => sum + s.dueCount, 0) / recentStats.length;
			weeklyAvg.scheduledCount =
				recentStats.reduce((sum, s) => sum + s.scheduledCount, 0) / recentStats.length;
			weeklyAvg.completedCount =
				recentStats.reduce((sum, s) => sum + s.completedBlocksCount, 0) / recentStats.length;
			weeklyAvg.readingMinutes =
				recentStats.reduce((sum, s) => sum + s.totalActualReadingSeconds / 60, 0) /
				recentStats.length;
		}

		// 计算趋势（比较前3天和后3天）
		let dueCountTrend = 0;
		let completionRateTrend = 0;

		if (recentStats.length >= 6) {
			const firstHalf = recentStats.slice(0, 3);
			const secondHalf = recentStats.slice(-3);

			const firstAvgDue = firstHalf.reduce((sum, s) => sum + s.dueCount, 0) / 3;
			const secondAvgDue = secondHalf.reduce((sum, s) => sum + s.dueCount, 0) / 3;
			dueCountTrend = secondAvgDue - firstAvgDue;

			const firstCompletionRate =
				firstHalf.reduce((sum, s) => {
					return sum + (s.scheduledCount > 0 ? s.completedBlocksCount / s.scheduledCount : 0);
				}, 0) / 3;
			const secondCompletionRate =
				secondHalf.reduce((sum, s) => {
					return sum + (s.scheduledCount > 0 ? s.completedBlocksCount / s.scheduledCount : 0);
				}, 0) / 3;
			completionRateTrend = secondCompletionRate - firstCompletionRate;
		}

		return {
			today,
			weeklyAvg,
			trends: {
				dueCountTrend,
				completionRateTrend,
			},
		};
	}

	// ============================================
	// 数据导出
	// ============================================

	/**
	 * 导出所有监控数据
	 */
	exportData(): IRMonitoringData {
		return { ...this.data };
	}

	/**
	 * 重置监控数据
	 */
	reset(): void {
		this.data = { ...DEFAULT_MONITORING_DATA };
	}
}

/**
 * 创建监控服务实例
 */
export function createIRMonitoringService(vault: any, basePath?: string): IRMonitoringService {
	return new IRMonitoringService(vault, basePath);
}
