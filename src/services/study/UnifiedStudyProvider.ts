/**
 * UnifiedStudyProvider - 统一学习数据提供者
 *
 * 核心设计理念（参考Anki架构）：
 * - 统计数据直接来源于学习队列，而非独立计算
 * - 保证牌组统计显示与实际学习队列 100% 一致
 * - 单一数据源（Single Source of Truth）
 *
 * @module services/study/UnifiedStudyProvider
 * @version 1.0.0
 */

import type { WeaveDataStorage } from "../../data/storage";
import type { Card, DeckStats } from "../../data/types";
import { CardState } from "../../data/types";
import { isProgressiveClozeParent } from "../../types/progressive-cloze-v2";
import { logger } from "../../utils/logger";
import { filterRecycledCards } from "../../utils/recycle-utils";
import {
	filterProgressiveSiblings,
	getLearnedNewCardsCountToday,
	selectNewCardsForStudyQueue,
} from "../../utils/study/studyCompletionHelper";
import { CardInstanceProvider } from "./CardInstanceProvider";

/**
 * 统一学习数据结果
 */
export interface UnifiedStudyData {
	/** 学习队列（已应用所有过滤和限制） */
	queue: Card[];
	/** 统计数据（直接从队列派生，保证一致） */
	stats: DeckStats;
	/** 调试信息 */
	debug?: {
		totalCards: number;
		afterRecycleFilter: number;
		afterInstanceFilter: number;
		afterSiblingFilter: number;
		afterNewCardLimit: number;
	};
}

/**
 * 统一学习数据提供者配置
 */
export interface UnifiedStudyProviderOptions {
	/** 每日新卡片限额 */
	newCardsPerDay: number;
	/** 每日复习限制 */
	reviewsPerDay: number;
	/** 是否过滤兄弟卡片 */
	filterSiblings: boolean;
	/** 是否只获取到期卡片 */
	onlyDue: boolean;
	/** 今天已学习的新卡数（可选，调用方可预先计算避免重复读取学习会话） */
	learnedNewCardsToday?: number;
}

const DEFAULT_OPTIONS: UnifiedStudyProviderOptions = {
	newCardsPerDay: 20,
	reviewsPerDay: 200,
	filterSiblings: true,
	onlyDue: true,
};

/**
 * 统一学习数据提供者
 *
 * 核心职责：
 * 1. 构建学习队列（应用所有过滤规则）
 * 2. 从队列派生统计数据（保证一致性）
 */
export class UnifiedStudyProvider {
	private dataStorage: WeaveDataStorage;
	private provider: CardInstanceProvider;

	constructor(dataStorage: WeaveDataStorage) {
		this.dataStorage = dataStorage;
		this.provider = new CardInstanceProvider();
	}

	/**
	 * 获取牌组的统一学习数据
	 *
	 * 关键：统计数据直接从队列派生，保证 100% 一致
	 *
	 * @param deckId 牌组ID
	 * @param options 配置选项
	 * @returns 统一学习数据（队列 + 统计）
	 */
	async getStudyData(
		deckId: string,
		options: Partial<UnifiedStudyProviderOptions> = {}
	): Promise<UnifiedStudyData> {
		const allDeckCards = await this.dataStorage.getDeckCards(deckId);
		return this.getStudyDataFromDeckCards(deckId, allDeckCards, options);
	}

	/**
	 * 基于已加载的牌组卡片生成统一学习数据
	 *
	 * 适用于调用方已经预先完成卡片分桶的场景，避免重复读取全库卡片。
	 */
	async getStudyDataFromDeckCards(
		deckId: string,
		allDeckCards: Card[],
		options: Partial<UnifiedStudyProviderOptions> = {}
	): Promise<UnifiedStudyData> {
		const opts = { ...DEFAULT_OPTIONS, ...options };

		try {
			// 1. 构建学习队列
			const { queue, debug } = await this.buildQueueFromDeckCards(deckId, allDeckCards, opts);

			// 2. 从队列派生统计（保证一致）
			const stats = this.deriveStatsFromQueue(queue);

			return { queue, stats, debug };
		} catch (error) {
			logger.error("[UnifiedStudyProvider] 获取学习数据失败:", error);
			return {
				queue: [],
				stats: this.emptyStats(),
			};
		}
	}

	/**
	 * 构建学习队列（核心逻辑）
	 *
	 * 处理流程：
	 * 1. 获取牌组卡片
	 * 2. 过滤回收站卡片
	 * 3. 使用 CardInstanceProvider 过滤（父卡片、到期状态、Bury Siblings）
	 * 4. 按状态分类
	 * 5. 应用每日新卡片限制
	 * 6. 应用兄弟卡片过滤（可选）
	 * 7. 合并队列
	 */
	private async buildQueue(
		deckId: string,
		opts: UnifiedStudyProviderOptions
	): Promise<{ queue: Card[]; debug: UnifiedStudyData["debug"] }> {
		const allDeckCards = await this.dataStorage.getDeckCards(deckId);
		return this.buildQueueFromDeckCards(deckId, allDeckCards, opts);
	}

	private async buildQueueFromDeckCards(
		deckId: string,
		allDeckCards: Card[],
		opts: UnifiedStudyProviderOptions
	): Promise<{ queue: Card[]; debug: UnifiedStudyData["debug"] }> {
		const debug: UnifiedStudyData["debug"] = {
			totalCards: allDeckCards.length,
			afterRecycleFilter: 0,
			afterInstanceFilter: 0,
			afterSiblingFilter: 0,
			afterNewCardLimit: 0,
		};

		// Step 1: 过滤回收站卡片
		const activeCards = filterRecycledCards(allDeckCards);
		debug.afterRecycleFilter = activeCards.length;
		const deckCards = activeCards;

		// Step 4: 使用 CardInstanceProvider 过滤并分类
		const learningCards: Card[] = [];
		const relearningCards: Card[] = [];
		const reviewCards: Card[] = [];
		const newCards: Card[] = [];

		for (const card of deckCards) {
			// 跳过父卡片
			if (isProgressiveClozeParent(card)) {
				continue;
			}

			// 使用 Provider 获取今日学习实例
			const instances = this.provider.getTodaysInstances(card, {
				onlyDue: opts.onlyDue,
			});

			if (instances.length === 0) {
				continue;
			}

			const instance = instances[0];
			const fsrs = instance.fsrs;

			if (!fsrs) {
				continue;
			}

			// 按 FSRS 状态分类
			switch (fsrs.state) {
				case CardState.New:
					newCards.push(card);
					break;
				case CardState.Learning:
					learningCards.push(card);
					break;
				case CardState.Review:
					reviewCards.push(card);
					break;
				case CardState.Relearning:
					relearningCards.push(card);
					break;
			}
		}

		debug.afterInstanceFilter =
			learningCards.length + relearningCards.length + reviewCards.length + newCards.length;

		// Step 5: 应用每日新卡片限制
		const learnedNewCardsToday =
			typeof opts.learnedNewCardsToday === "number"
				? opts.learnedNewCardsToday
				: await getLearnedNewCardsCountToday(this.dataStorage, deckId);
		const limitedNewCards = selectNewCardsForStudyQueue(
			newCards,
			opts.newCardsPerDay,
			learnedNewCardsToday
		);

		// Step 6: 合并队列（优先级：学习中 > 重新学习 > 复习 > 新卡片）
		let combined = [...learningCards, ...relearningCards, ...reviewCards, ...limitedNewCards];

		debug.afterNewCardLimit = combined.length;

		// Step 7: 应用兄弟卡片过滤（可选）
		if (opts.filterSiblings) {
			combined = filterProgressiveSiblings(combined);
		}

		debug.afterSiblingFilter = combined.length;

		// Step 8: 应用每日复习限制
		const finalQueue = combined.slice(0, opts.reviewsPerDay);

		return { queue: finalQueue, debug };
	}

	/**
	 * 从队列派生统计数据
	 *
	 * 关键：这确保统计与队列 100% 一致
	 */
	private deriveStatsFromQueue(queue: Card[]): DeckStats {
		let newCards = 0;
		let learningCards = 0;
		let reviewCards = 0;

		for (const card of queue) {
			const state = card.fsrs?.state;

			switch (state) {
				case CardState.New:
					newCards++;
					break;
				case CardState.Learning:
				case CardState.Relearning:
					learningCards++;
					break;
				case CardState.Review:
					reviewCards++;
					break;
			}
		}

		return {
			totalCards: queue.length,
			newCards,
			learningCards,
			reviewCards,
			todayNew: 0,
			todayReview: 0,
			todayTime: 0,
			totalReviews: 0,
			totalTime: 0,
			memoryRate: 0,
			averageEase: 0,
			forecastDays: {},
		};
	}

	/**
	 * 返回空统计对象
	 */
	private emptyStats(): DeckStats {
		return {
			totalCards: 0,
			newCards: 0,
			learningCards: 0,
			reviewCards: 0,
			todayNew: 0,
			todayReview: 0,
			todayTime: 0,
			totalReviews: 0,
			totalTime: 0,
			memoryRate: 0,
			averageEase: 0,
			forecastDays: {},
		};
	}
}

/**
 * 创建 UnifiedStudyProvider 实例
 */
export function createUnifiedStudyProvider(dataStorage: WeaveDataStorage): UnifiedStudyProvider {
	return new UnifiedStudyProvider(dataStorage);
}
