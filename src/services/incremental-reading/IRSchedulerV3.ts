/**
 * 增量阅读调度服务 v3.0
 *
 * 基于连续优先级轴 + 隐式反馈的新调度算法：
 * - 使用 EWMA 平滑优先级，避免抖动
 * - 双时间尺度：会话内分钟级 + 跨日小时/天级
 * - 防刷屏机制：同块每日出现上限
 * - TagGroup 类型先验：材料类型影响间隔增长因子
 *
 * 核心设计原则：
 * - 稳定性优先：有界权重 + 慢学习 + 小样本收缩
 * - 过载治理为 P0：预算控制 + 公平分配
 * - 增量阅读 ≠ FSRS：以优先级队列 + 效用驱动
 *
 * @module services/incremental-reading/IRSchedulerV3
 * @version 3.0.0
 */

import type { App } from "obsidian";
import type {
	IRAdvancedScheduleSettings,
	IRBlock,
	IRBlockState,
	IRScheduleStrategy,
	IRSession,
	IRTagGroupProfile,
} from "../../types/ir-types";
import {
	DEFAULT_ADVANCED_SCHEDULE_SETTINGS,
	DEFAULT_TAG_GROUP_PROFILE,
	PROCESSING_STRATEGY,
	READING_LIST_STRATEGY,
} from "../../types/ir-types";
import { logger } from "../../utils/logger";
import { IRStorageService } from "./IRStorageService";

// ============================================
// 常量与配置
// ============================================

/** 默认调度配置 */
export const DEFAULT_SCHEDULE_CONFIG_V3 = {
	/** 初始间隔（天）- 加工流默认 0.25 = 6小时 */
	initialIntervalDays: 0.25,
	/** 达到 review 状态的阈值（天） */
	reviewThresholdDays: 3,
	/** 最大间隔（天） */
	maxIntervalDays: 365,
	/** 全局基线 intervalFactor */
	globalIntervalFactorBase: 1.5,
};

/** 优先级倍率计算的 k 值 */
const PRIORITY_MULTIPLIER_K = 1.0;

// ============================================
// 核心算法函数
// ============================================

/**
 * 计算 time-aware EWMA
 *
 * @param priorityUi 本次滑条值 (0-10)
 * @param priorityEffOld 旧有效优先级 (0-10)
 * @param lastUpdatedAt 上次更新时间 (ISO字符串)
 * @param halfLifeDays 半衰期（天），默认 7
 * @returns 新的有效优先级 (0-10)
 */
export function calculatePriorityEWMA(
	priorityUi: number,
	priorityEffOld: number,
	lastUpdatedAt: string | null,
	halfLifeDays = 7
): number {
	const now = Date.now();
	const lastUpdated = lastUpdatedAt ? new Date(lastUpdatedAt).getTime() : now;

	// 计算时间差（天）
	const deltaTimeDays = (now - lastUpdated) / (1000 * 60 * 60 * 24);

	// 计算衰减因子: decay = 2^(-Δt / H)
	const decay = 2 ** (-deltaTimeDays / halfLifeDays);

	// EWMA: p_eff_new = (1 - decay) * p_ui + decay * p_eff_old
	const priorityEffNew = (1 - decay) * priorityUi + decay * priorityEffOld;

	// clamp 到 [0, 10]
	return Math.max(0, Math.min(10, priorityEffNew));
}

/**
 * 计算优先级倍率 Pm
 * 越重要（高优先级）间隔越短
 *
 * @param priorityEff 有效优先级 (0-10)
 * @returns 优先级倍率 (0.6-1.6)
 */
export function calculatePriorityMultiplier(priorityEff: number): number {
	// 归一化到 0-1
	const p = priorityEff / 10;

	// Pm = clamp(exp(-k*(p - 0.5)), 0.6, 1.6)
	// p > 0.5 (更重要) → Pm < 1 (间隔缩短)
	// p < 0.5 (不重要) → Pm > 1 (间隔拉长)
	const pm = Math.exp(-PRIORITY_MULTIPLIER_K * (p - 0.5));

	return Math.max(0.6, Math.min(1.6, pm));
}

/**
 * 计算隐式负载/产出信号 L
 *
 * @param readingTimeSeconds 阅读时长（秒）
 * @param createdCardCount 本次创建卡片数
 * @param createdExtractCount 本次创建摘录数
 * @param createdNoteCount 本次创建笔记数
 * @returns 负载信号 L (0-1)
 */
export function calculateLoadSignal(
	readingTimeSeconds: number,
	createdCardCount = 0,
	createdExtractCount = 0,
	createdNoteCount = 0
): number {
	// L_time = clamp(log(1+t) / log(1+t_ref), 0, 1), t_ref = 120s
	const tRef = 120;
	const lTime = Math.max(0, Math.min(1, Math.log(1 + readingTimeSeconds) / Math.log(1 + tRef)));

	// L_actions = clamp(w_card*cards + w_extract*extracts + w_note*notes, 0, 1)
	const wCard = 0.35;
	const wExtract = 0.25;
	const wNote = 0.4;
	const lActions = Math.max(
		0,
		Math.min(
			1,
			wCard * createdCardCount + wExtract * createdExtractCount + wNote * createdNoteCount
		)
	);

	// L = 0.5 * L_time + 0.5 * L_actions
	return 0.5 * lTime + 0.5 * lActions;
}

/**
 * 计算下次复习间隔
 *
 * @param currentIntervalDays 当前间隔（天）
 * @param intervalFactor 间隔增长因子
 * @param priorityEff 有效优先级 (0-10)
 * @param strategy 调度策略
 * @param config 调度配置
 * @returns 下次间隔（天）
 */
export function calculateNextInterval(
	currentIntervalDays: number,
	intervalFactor: number,
	priorityEff: number,
	strategy: IRScheduleStrategy,
	config: typeof DEFAULT_SCHEDULE_CONFIG_V3 = DEFAULT_SCHEDULE_CONFIG_V3
): number {
	// 基础间隔
	const base = Math.max(currentIntervalDays, config.initialIntervalDays);

	// 优先级倍率
	const pm = calculatePriorityMultiplier(priorityEff);

	// 计算新间隔
	let intervalNext = base * intervalFactor * pm;

	// 根据策略确定最小间隔
	let minIntervalDays: number;
	if (strategy.type === "processing") {
		// 加工流：允许会话内分钟级，但跨日需满足 crossDayMinIntervalHours
		if (strategy.sessionMinIntervalMinutes !== null) {
			minIntervalDays = strategy.sessionMinIntervalMinutes / (60 * 24);
		} else {
			minIntervalDays = strategy.crossDayMinIntervalHours / 24;
		}
	} else {
		// 阅读清单：强制至少 1 天
		minIntervalDays = Math.max(1, strategy.crossDayMinIntervalHours / 24);
	}

	// clamp 到 [minInterval, maxInterval]
	intervalNext = Math.max(minIntervalDays, Math.min(config.maxIntervalDays, intervalNext));

	return intervalNext;
}

/**
 * 计算下次复习时间
 *
 * @param intervalDays 间隔（天）
 * @returns ISO 字符串
 */
export function calculateNextReviewDate(intervalDays: number): string {
	const now = new Date();
	const nextReview = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
	return nextReview.toISOString();
}

/**
 * 检查是否达到每日出现上限
 *
 * @param block 内容块
 * @param maxAppearances 每日上限
 * @returns 是否达到上限
 */
export function hasReachedDailyLimit(block: IRBlock, maxAppearances: number): boolean {
	const today = new Date().toISOString().split("T")[0];
	const appearances = block.dailyAppearances?.[today] ?? 0;
	return appearances >= maxAppearances;
}

/**
 * 增加每日出现计数
 *
 * @param block 内容块
 * @returns 更新后的 dailyAppearances
 */
export function incrementDailyAppearance(block: IRBlock): Record<string, number> {
	const today = new Date().toISOString().split("T")[0];
	const dailyAppearances = { ...block.dailyAppearances };
	dailyAppearances[today] = (dailyAppearances[today] ?? 0) + 1;

	// 清理过期数据（保留最近 7 天）
	const sevenDaysAgo = new Date();
	sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
	const cutoffDate = sevenDaysAgo.toISOString().split("T")[0];

	for (const date of Object.keys(dailyAppearances)) {
		if (date < cutoffDate) {
			delete dailyAppearances[date];
		}
	}

	return dailyAppearances;
}

/**
 * 估算内容块阅读时间（分钟）
 *
 * @param block 内容块
 * @returns 预估时间（分钟）
 */
export function estimateReadingTime(block: IRBlock): number {
	// 如果有历史数据，使用平均值
	if (block.totalReadingTime > 0 && block.reviewCount > 0) {
		return block.totalReadingTime / block.reviewCount / 60;
	}
	// 默认 2 分钟
	return 2;
}

// ============================================
// IRSchedulerV3 类
// ============================================

/**
 * v3.0 调度器配置
 */
export interface IRSchedulerV3Config {
	strategy?: IRScheduleStrategy;
	advancedSettings?: IRAdvancedScheduleSettings;
	scheduleConfig?: typeof DEFAULT_SCHEDULE_CONFIG_V3;
}

/**
 * 阅读完成时的行为数据
 */
export interface ReadingCompletionData {
	rating?: number;
	readingTimeSeconds: number;
	priorityUi?: number;
	createdCardCount?: number;
	createdExtractCount?: number;
	createdNoteCount?: number;
}

/**
 * 增量阅读调度服务 v3.0
 */
export class IRSchedulerV3 {
	private storage: IRStorageService;
	private strategy: IRScheduleStrategy;
	private advancedSettings: IRAdvancedScheduleSettings;
	private scheduleConfig: typeof DEFAULT_SCHEDULE_CONFIG_V3;
	private app: App | null;

	constructor(storage: IRStorageService, config?: IRSchedulerV3Config, app?: App) {
		this.storage = storage;
		this.strategy = config?.strategy ?? PROCESSING_STRATEGY;
		this.advancedSettings = config?.advancedSettings ?? DEFAULT_ADVANCED_SCHEDULE_SETTINGS;
		this.scheduleConfig = config?.scheduleConfig ?? DEFAULT_SCHEDULE_CONFIG_V3;
		this.app = app ?? null;
	}

	/**
	 * 切换调度策略
	 */
	setStrategy(strategyType: "processing" | "reading-list"): void {
		this.strategy = strategyType === "processing" ? PROCESSING_STRATEGY : READING_LIST_STRATEGY;
		logger.info(`[IRSchedulerV3] 切换策略: ${strategyType}`);
	}

	/**
	 * 更新高级设置
	 */
	updateAdvancedSettings(settings: Partial<IRAdvancedScheduleSettings>): void {
		this.advancedSettings = { ...this.advancedSettings, ...settings };
	}

	/**
	 * 获取当前策略
	 */
	getStrategy(): IRScheduleStrategy {
		return this.strategy;
	}

	/**
	 * 更新内容块优先级（使用 EWMA）
	 *
	 * @param block 内容块
	 * @param priorityUi 新的用户优先级 (0-10)
	 * @returns 更新后的内容块
	 */
	async updatePriority(block: IRBlock, priorityUi: number): Promise<IRBlock> {
		const priorityEffOld = block.priorityEff ?? 5;
		const priorityEffNew = calculatePriorityEWMA(
			priorityUi,
			priorityEffOld,
			block.priorityUpdatedAt ?? null,
			this.advancedSettings.priorityHalfLifeDays
		);

		const updatedBlock: IRBlock = {
			...block,
			priorityUi,
			priorityEff: priorityEffNew,
			priorityUpdatedAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		await this.storage.saveBlock(updatedBlock);

		logger.debug(
			`[IRSchedulerV3] 更新优先级 ${block.id}: ` +
				`UI=${priorityUi}, Eff=${priorityEffOld.toFixed(2)}->${priorityEffNew.toFixed(2)}`
		);

		return updatedBlock;
	}

	/**
	 * 完成内容块阅读后更新调度 (v3.0)
	 *
	 * @param block 内容块
	 * @param data 阅读完成数据
	 * @param deckId 牌组ID
	 * @param groupProfile 标签组参数（可选）
	 * @returns 更新后的内容块
	 */
	async completeBlock(
		block: IRBlock,
		data: ReadingCompletionData,
		deckId = "",
		groupProfile?: IRTagGroupProfile
	): Promise<IRBlock> {
		const now = new Date();
		let newState: IRBlockState = block.state;
		let newIntervalFactor = block.intervalFactor;

		// 1. 更新优先级（如果提供了新值）
		let currentPriorityEff = block.priorityEff ?? 5;
		let priorityUpdatedAt = block.priorityUpdatedAt;

		if (data.priorityUi !== undefined) {
			currentPriorityEff = calculatePriorityEWMA(
				data.priorityUi,
				currentPriorityEff,
				priorityUpdatedAt ?? null,
				this.advancedSettings.priorityHalfLifeDays
			);
			priorityUpdatedAt = now.toISOString();
		}

		// 2. 如果启用 TagGroup 先验，使用组的 intervalFactorBase
		if (this.advancedSettings.enableTagGroupPrior && groupProfile) {
			newIntervalFactor = groupProfile.intervalFactorBase;
		}

		// 3. 状态转换
		switch (block.state) {
			case "new":
				newState = "learning";
				break;
			case "learning": {
				// 检查是否达到 review 阈值
				const nextIntervalPreview = calculateNextInterval(
					block.interval || this.scheduleConfig.initialIntervalDays,
					newIntervalFactor,
					currentPriorityEff,
					this.strategy,
					this.scheduleConfig
				);
				if (nextIntervalPreview >= this.scheduleConfig.reviewThresholdDays) {
					newState = "review";
				}
				break;
			}
			case "review":
				// 保持 review 状态
				break;
			case "suspended":
				// 从 suspended 恢复
				newState = "learning";
				break;
		}

		// 4. 计算新间隔
		const currentInterval = block.interval || this.scheduleConfig.initialIntervalDays;
		const newInterval = calculateNextInterval(
			currentInterval,
			newIntervalFactor,
			currentPriorityEff,
			this.strategy,
			this.scheduleConfig
		);

		// 5. 增加每日出现计数
		const dailyAppearances = incrementDailyAppearance(block);

		// 6. 计算下次复习时间
		const nextReview = calculateNextReviewDate(newInterval);

		// 7. 构建更新后的内容块
		const updatedBlock: IRBlock = {
			...block,
			state: newState,
			interval: newInterval,
			intervalFactor: newIntervalFactor,
			nextReview,
			reviewCount: (block.reviewCount || 0) + 1,
			lastReview: now.toISOString(),
			totalReadingTime: (block.totalReadingTime || 0) + data.readingTimeSeconds,
			firstReadAt: block.firstReadAt || now.toISOString(),
			updatedAt: now.toISOString(),
			priorityUi: data.priorityUi ?? block.priorityUi,
			priorityEff: currentPriorityEff,
			priorityUpdatedAt,
			dailyAppearances,
		};

		await this.storage.saveBlock(updatedBlock);

		// 8. 同步更新阅读点调度投影视图
		// 修复：确保状态和复习记录同时更新到 point-backed chunk 投影
		try {
			const chunkData = await this.storage.getChunkData(block.id);
			if (chunkData) {
				// 状态映射：IRBlockState -> IRBlockStatus
				const statusMap: Record<string, import("../../types/ir-types").IRBlockStatus> = {
					new: "new",
					learning: "queued",
					review: "scheduled",
					suspended: "suspended",
				};
				const newStatus = statusMap[newState] || "queued";

				// 更新 chunk 调度数据
				chunkData.scheduleStatus = newStatus;
				chunkData.intervalDays = newInterval;
				chunkData.nextRepDate = new Date(nextReview).getTime();
				chunkData.priorityEff = currentPriorityEff;
				chunkData.updatedAt = Date.now();

				// 更新统计信息
				chunkData.stats = chunkData.stats || {
					impressions: 0,
					totalReadingTimeSec: 0,
					effectiveReadingTimeSec: 0,
					extracts: 0,
					cardsCreated: 0,
					notesWritten: 0,
					lastInteraction: 0,
					lastShownAt: 0,
				};
				chunkData.stats.impressions++;
				chunkData.stats.totalReadingTimeSec += data.readingTimeSeconds;
				chunkData.stats.effectiveReadingTimeSec += Math.min(data.readingTimeSeconds, 600);
				chunkData.stats.cardsCreated += data.createdCardCount || 0;
				chunkData.stats.lastInteraction = Date.now();
				chunkData.stats.lastShownAt = Date.now();

				await this.storage.saveChunkData(chunkData);
				logger.debug(`[IRSchedulerV3] 同步更新 chunk 投影视图: ${block.id}, status=${newStatus}`);
			}
		} catch (chunkError) {
			// chunk 更新失败不影响主流程
			logger.warn("[IRSchedulerV3] chunk 投影视图更新失败:", chunkError);
		}

		// 9. 记录会话
		const session: IRSession = {
			id: `session-${Date.now()}`,
			blockId: block.id,
			deckId,
			startTime: new Date(now.getTime() - data.readingTimeSeconds * 1000).toISOString(),
			endTime: now.toISOString(),
			duration: data.readingTimeSeconds,
			action: "completed",
		};
		await this.storage.addSession(session);

		logger.debug(
			`[IRSchedulerV3] 完成内容块 ${block.id}: ` +
				`${block.state}->${newState}, 间隔=${newInterval.toFixed(2)}天, ` +
				`优先级Eff=${currentPriorityEff.toFixed(2)}`
		);

		return updatedBlock;
	}

	/**
	 * 暂停/忽略内容块
	 */
	async suspendBlock(block: IRBlock, deckId = ""): Promise<IRBlock> {
		const now = new Date();

		const updatedBlock: IRBlock = {
			...block,
			state: "suspended",
			updatedAt: now.toISOString(),
		};

		await this.storage.saveBlock(updatedBlock);

		// 同步更新阅读点调度投影视图
		try {
			const chunkData = await this.storage.getChunkData(block.id);
			if (chunkData) {
				chunkData.scheduleStatus = "suspended";
				chunkData.updatedAt = Date.now();
				await this.storage.saveChunkData(chunkData);
				logger.debug(`[IRSchedulerV3] 同步暂停到 chunk 投影视图: ${block.id}`);
			}
		} catch (chunkError) {
			logger.warn("[IRSchedulerV3] chunk 投影视图暂停更新失败:", chunkError);
		}

		const session: IRSession = {
			id: `session-${Date.now()}`,
			blockId: block.id,
			deckId,
			startTime: now.toISOString(),
			endTime: now.toISOString(),
			duration: 0,
			action: "suspended",
		};
		await this.storage.addSession(session);

		logger.debug(`[IRSchedulerV3] 暂停内容块: ${block.id}`);
		return updatedBlock;
	}

	/**
	 * 恢复已暂停的内容块
	 */
	async unsuspendBlock(block: IRBlock): Promise<IRBlock> {
		if (block.state !== "suspended") {
			return block;
		}

		const newState = block.reviewCount > 0 ? "review" : "new";
		const updatedBlock: IRBlock = {
			...block,
			state: newState,
			updatedAt: new Date().toISOString(),
		};

		await this.storage.saveBlock(updatedBlock);

		// 同步更新阅读点调度投影视图
		try {
			const chunkData = await this.storage.getChunkData(block.id);
			if (chunkData) {
				// 状态映射：IRBlockState -> IRBlockStatus
				const statusMap: Record<string, import("../../types/ir-types").IRBlockStatus> = {
					new: "new",
					learning: "queued",
					review: "scheduled",
					suspended: "suspended",
				};
				chunkData.scheduleStatus = statusMap[newState] || "new";
				chunkData.updatedAt = Date.now();
				await this.storage.saveChunkData(chunkData);
				logger.debug(`[IRSchedulerV3] 同步恢复到 chunk 投影视图: ${block.id}`);
			}
		} catch (chunkError) {
			logger.warn("[IRSchedulerV3] chunk 投影视图恢复更新失败:", chunkError);
		}

		logger.debug(`[IRSchedulerV3] 恢复内容块: ${block.id}`);

		return updatedBlock;
	}

	/**
	 * 跳过内容块（不更新调度，只记录）
	 */
	async skipBlock(block: IRBlock, deckId = ""): Promise<void> {
		const now = new Date();

		const session: IRSession = {
			id: `session-${Date.now()}`,
			blockId: block.id,
			deckId,
			startTime: now.toISOString(),
			endTime: now.toISOString(),
			duration: 0,
			action: "skipped",
		};
		await this.storage.addSession(session);

		logger.debug(`[IRSchedulerV3] 跳过内容块: ${block.id}`);
	}

	/**
	 * 获取今日到期的内容块（过滤后）
	 *
	 * @param deckId 牌组ID
	 * @returns 过滤并排序后的到期内容块
	 */
	async getDueBlocks(deckId: string): Promise<IRBlock[]> {
		const allBlocks = await this.storage.getBlocksByDeck(deckId);
		const today = new Date().toISOString().split("T")[0];
		const todayDate = new Date();
		todayDate.setHours(0, 0, 0, 0);

		// 优先使用 advancedSettings 中的设置，否则回退到策略默认值
		const maxAppearances =
			this.advancedSettings.maxAppearancesPerDay ?? this.strategy.maxAppearancesPerBlockPerDay;

		// 1. 过滤到期内容块
		let dueBlocks = allBlocks.filter((_block) => {
			// 排除 suspended
			if (_block.state === "suspended") return false;

			// 排除达到每日上限的
			if (hasReachedDailyLimit(_block, maxAppearances)) {
				return false;
			}

			// new 状态视为到期
			if (_block.state === "new") return true;

			// 检查 nextReview
			if (!_block.nextReview) return true;

			const reviewDate = _block.nextReview.split("T")[0];
			return reviewDate <= today;
		});

		// 2. 排序
		dueBlocks = this.sortBlocks(dueBlocks, todayDate);

		logger.info(`[IRSchedulerV3] 获取到期块: deck=${deckId}, 到期=${dueBlocks.length}`);

		return dueBlocks;
	}

	/**
	 * 排序内容块
	 *
	 * 排序规则：
	 * 1. 有效优先级 (priorityEff 高优先)
	 * 2. 过期天数 (过期越久越优先)
	 * 3. 状态 (learning > review > new)
	 */
	private sortBlocks(blocks: IRBlock[], today: Date): IRBlock[] {
		return blocks.sort((a, b) => {
			// 1. 有效优先级（高优先级在前）
			const priorityA = a.priorityEff ?? 5;
			const priorityB = b.priorityEff ?? 5;
			if (priorityA !== priorityB) {
				return priorityB - priorityA; // 高优先级在前
			}

			// 2. 过期天数
			const overdueA = this.getOverdueDays(a, today);
			const overdueB = this.getOverdueDays(b, today);
			if (overdueA !== overdueB) {
				return overdueB - overdueA; // 过期越久越优先
			}

			// 3. 状态权重
			const stateOrder: Record<IRBlockState, number> = {
				learning: 0,
				review: 1,
				new: 2,
				suspended: 99,
			};
			return stateOrder[a.state] - stateOrder[b.state];
		});
	}

	/**
	 * 计算过期天数
	 */
	private getOverdueDays(block: IRBlock, today: Date): number {
		if (!block.nextReview) return 0;

		const reviewDate = new Date(block.nextReview);
		reviewDate.setHours(0, 0, 0, 0);

		const diffTime = today.getTime() - reviewDate.getTime();
		return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
	}

	/**
	 * 生成学习队列（应用预算控制）
	 *
	 * @param deckId 牌组ID
	 * @returns 学习队列
	 */
	async getStudyQueue(deckId: string): Promise<IRBlock[]> {
		const dueBlocks = await this.getDueBlocks(deckId);

		// 应用预算控制
		const queue: IRBlock[] = [];
		let totalMinutes = 0;

		for (const block of dueBlocks) {
			// 检查时间预算
			const estimatedMinutes = estimateReadingTime(block);
			if (totalMinutes + estimatedMinutes > this.strategy.dailyTimeBudgetMinutes) {
				break;
			}

			// 检查数量预算
			if (queue.length >= this.strategy.dailyReviewLimit) {
				break;
			}

			queue.push(block);
			totalMinutes += estimatedMinutes;
		}

		logger.info(
			`[IRSchedulerV3] 生成学习队列: deck=${deckId}, ` +
				`队列=${queue.length}/${dueBlocks.length}, 预估时间=${totalMinutes.toFixed(1)}min`
		);

		return queue;
	}

	/**
	 * 获取调度统计
	 */
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
		const blocks = await this.storage.getBlocksByDeck(deckId, true);
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const todayStr = today.toISOString().split("T")[0];

		const next7Days = new Date(today);
		next7Days.setDate(next7Days.getDate() + 7);

		let newCount = 0;
		let learningCount = 0;
		let reviewCount = 0;
		let suspendedCount = 0;
		let dueToday = 0;
		let overdue = 0;
		let upcoming7Days = 0;
		let reachedDailyLimit = 0;

		for (const block of blocks) {
			// 状态统计
			switch (block.state) {
				case "new":
					newCount++;
					break;
				case "learning":
					learningCount++;
					break;
				case "review":
					reviewCount++;
					break;
				case "suspended":
					suspendedCount++;
					break;
			}

			// 检查每日上限
			const maxAppearances =
				this.advancedSettings.maxAppearancesPerDay ?? this.strategy.maxAppearancesPerBlockPerDay;
			if (hasReachedDailyLimit(block, maxAppearances)) {
				reachedDailyLimit++;
			}

			// 到期统计
			if (block.state !== "suspended") {
				if (block.state === "new") {
					dueToday++;
				} else if (block.nextReview) {
					const reviewDate = new Date(block.nextReview);
					reviewDate.setHours(0, 0, 0, 0);
					const reviewDateStr = reviewDate.toISOString().split("T")[0];

					if (reviewDate < today) {
						overdue++;
						dueToday++;
					} else if (reviewDateStr === todayStr) {
						dueToday++;
					} else if (reviewDate <= next7Days) {
						upcoming7Days++;
					}
				}
			}
		}

		return {
			newCount,
			learningCount,
			reviewCount,
			suspendedCount,
			dueToday,
			overdue,
			upcoming7Days,
			reachedDailyLimit,
		};
	}
}
