/**
 * Difficulty Tracker
 *
 * 负责追踪和分析卡片难度变化趋势
 *
 * 核心功能：
 * 1. 追踪难度历史
 * 2. 分析难度趋势
 * 3. 计算干预等级
 * 4. 自动标记困难卡片
 *
 * @version 1.0.0
 * @since 2025-12-04
 */

import { Rating } from "../../data/types";
import type { Card } from "../../data/types";
import type {
	CardWithQueueOptimization,
	DifficultyHistoryEntry,
	DifficultyLevel,
	DifficultyTracking,
	DifficultyTrackingConfig,
} from "../../types/queue-optimization-types";
import { logger } from "../../utils/logger";

export class DifficultyTracker {
	private config: DifficultyTrackingConfig;
	private eventListeners: Map<string, ((...args: unknown[]) => void)[]> = new Map();

	constructor(config: DifficultyTrackingConfig) {
		this.config = config;
		logger.debug("[DifficultyTracker] Initialized", { config });
	}

	/**
	 * 更新难度追踪
	 *
	 * @param card 卡片
	 * @param rating 评分
	 */
	update(card: CardWithQueueOptimization, rating: Rating): void {
		if (!this.config.enabled) {
			return;
		}

		// 防御性检查：确保fsrs数据存在
		if (!card.fsrs) {
			logger.warn("[DifficultyTracker] Card missing fsrs data", { cardId: card.uuid });
			return;
		}

		// 确保metadata存在
		if (!card.metadata) {
			card.metadata = {};
		}

		// 初始化difficultyTracking
		if (!card.metadata.difficultyTracking) {
			card.metadata.difficultyTracking = this.initializeTracking(card);
		}

		const tracking = card.metadata.difficultyTracking;

		// 1. 记录历史
		this.recordHistory(tracking, card.fsrs.difficulty, rating);

		// 2. 更新当前等级
		tracking.currentLevel = this.calculateLevel(card.fsrs.difficulty);

		// 3. 分析趋势
		tracking.trend = this.analyzeTrend(tracking.difficultyHistory);

		// 4. 更新连续Hard计数
		this.updateConsecutiveHard(tracking, rating);

		// 5. 计算干预等级
		tracking.interventionLevel = this.calculateInterventionLevel(tracking);

		logger.debug("[DifficultyTracker] Updated", {
			cardId: card.uuid,
			level: tracking.currentLevel,
			trend: tracking.trend,
			interventionLevel: tracking.interventionLevel,
		});

		// 6. 应用干预（如果需要）
		if (tracking.interventionLevel >= this.config.interventionThreshold) {
			this.applyIntervention(card, tracking.interventionLevel);
		}
	}

	/**
	 * 初始化追踪数据
	 *
	 * 注意：调用方（update方法）已确保fsrs存在
	 */
	private initializeTracking(card: Card): DifficultyTracking {
		return {
			currentLevel: this.calculateLevel(card.fsrs?.difficulty ?? 5),
			difficultyHistory: [],
			trend: "stable",
			consecutiveHard: 0,
			interventionLevel: 0,
		};
	}

	/**
	 * 记录难度历史
	 */
	private recordHistory(tracking: DifficultyTracking, difficulty: number, rating: Rating): void {
		tracking.difficultyHistory.push({
			timestamp: new Date().toISOString(),
			difficulty,
			rating,
		});

		// 保留最近20条
		if (tracking.difficultyHistory.length > 20) {
			tracking.difficultyHistory.shift();
		}
	}

	/**
	 * 计算难度等级
	 */
	private calculateLevel(difficulty: number): DifficultyLevel {
		if (difficulty < 6.0) return "easy";
		if (difficulty < 8.0) return "medium";
		if (difficulty < 9.0) return "hard";
		return "very_hard";
	}

	/**
	 * 分析难度趋势
	 *
	 * 使用简单线性回归计算斜率
	 */
	private analyzeTrend(history: DifficultyHistoryEntry[]): "rising" | "stable" | "falling" {
		if (history.length < 3) {
			return "stable";
		}

		// 取最近N条记录
		const windowSize = Math.min(this.config.trendAnalysisWindow, history.length);
		const recent = history.slice(-windowSize);
		const n = recent.length;

		// 简单线性回归：y = ax + b
		let sumX = 0;
		let sumY = 0;
		let sumXY = 0;
		let sumX2 = 0;

		recent.forEach((entry, i) => {
			sumX += i;
			sumY += entry.difficulty;
			sumXY += i * entry.difficulty;
			sumX2 += i * i;
		});

		// 计算斜率 a = (n*ΣXY - ΣX*ΣY) / (n*ΣX² - (ΣX)²)
		const denominator = n * sumX2 - sumX * sumX;
		if (denominator === 0) {
			return "stable";
		}

		const slope = (n * sumXY - sumX * sumY) / denominator;

		// 判断趋势
		if (slope > 0.3) return "rising";
		if (slope < -0.3) return "falling";
		return "stable";
	}

	/**
	 * 更新连续Hard计数
	 */
	private updateConsecutiveHard(tracking: DifficultyTracking, rating: Rating): void {
		if (rating === Rating.Hard) {
			tracking.consecutiveHard++;
		} else if (rating >= Rating.Good) {
			tracking.consecutiveHard = 0;
		}
	}

	/**
	 * 计算干预等级
	 *
	 * 等级0-3：
	 * - 0: 无需干预
	 * - 1: 轻度干预（标记"需关注"）
	 * - 2: 中度干预（标记"困难" + 优先级微调）
	 * - 3: 重度干预（建议改进）
	 */
	private calculateInterventionLevel(tracking: DifficultyTracking): number {
		let level = 0;

		// 因素1：当前难度等级
		if (tracking.currentLevel === "hard") {
			level += 1;
		} else if (tracking.currentLevel === "very_hard") {
			level += 2;
		}

		// 因素2：趋势
		if (tracking.trend === "rising") {
			level += 1;
		}

		// 因素3：连续Hard
		if (tracking.consecutiveHard >= 3) {
			level += 1;
		}

		// 限制在0-3范围
		return Math.min(level, 3);
	}

	/**
	 * 应用干预措施
	 */
	private applyIntervention(card: CardWithQueueOptimization, level: number): void {
		logger.debug("[DifficultyTracker] Applying intervention", {
			cardId: card.uuid,
			level,
		});

		switch (level) {
			case 1:
				// 轻度干预：标记"需关注"
				if (this.config.autoTag) {
					this.addTag(card, "#需关注");
				}
				break;

			case 2:
				// 中度干预：标记"困难"
				if (this.config.autoTag) {
					this.addTag(card, "#困难");
				}
				// 优先级微调由PriorityCalculator处理
				break;

			case 3:
				// 重度干预：建议改进
				if (this.config.autoTag) {
					this.addTag(card, "#困难");
				}
				this.emitImprovementNeeded(card);
				break;
		}
	}

	/**
	 * 添加标签
	 */
	private addTag(card: Card, tag: string): void {
		if (!card.tags) {
			card.tags = [];
		}

		if (!card.tags.includes(tag)) {
			card.tags.push(tag);
			logger.debug("[DifficultyTracker] Tag added", {
				cardId: card.uuid,
				tag,
			});
		}
	}

	/**
	 * 触发改进建议事件
	 */
	private emitImprovementNeeded(card: Card): void {
		this.emit("improvement-needed", {
			cardId: card.uuid,
			suggestions: ["拆分为多张简单卡片", "添加助记提示或图片", "检查是否缺少背景知识"],
		});
	}

	/**
	 * 获取统计信息
	 */
	getStatistics(cards: CardWithQueueOptimization[]): {
		easy: number;
		medium: number;
		hard: number;
		veryHard: number;
		total: number;
	} {
		const stats = {
			easy: 0,
			medium: 0,
			hard: 0,
			veryHard: 0,
			total: cards.length,
		};

		cards.forEach((_card) => {
			const level = _card.metadata?.difficultyTracking?.currentLevel;

			switch (level) {
				case "easy":
					stats.easy++;
					break;
				case "medium":
					stats.medium++;
					break;
				case "hard":
					stats.hard++;
					break;
				case "very_hard":
					stats.veryHard++;
					break;
			}
		});

		return stats;
	}

	/**
	 * 更新配置
	 */
	updateConfig(config: Partial<DifficultyTrackingConfig>): void {
		this.config = { ...this.config, ...config };
		logger.debug("[DifficultyTracker] Config updated", { config: this.config });
	}

	/**
	 * 获取配置
	 */
	getConfig(): DifficultyTrackingConfig {
		return { ...this.config };
	}

	// ============================================
	// 事件系统
	// ============================================

	on(event: string, callback: (...args: unknown[]) => void): void {
		if (!this.eventListeners.has(event)) {
			this.eventListeners.set(event, []);
		}
		this.eventListeners.get(event)?.push(callback);
	}

	off(event: string, callback: (...args: unknown[]) => void): void {
		const listeners = this.eventListeners.get(event);
		if (listeners) {
			const index = listeners.indexOf(callback);
			if (index > -1) {
				listeners.splice(index, 1);
			}
		}
	}

	private emit(event: string, data?: unknown): void {
		const listeners = this.eventListeners.get(event);
		if (listeners) {
			listeners.forEach((_callback) => {
				try {
					_callback(data);
				} catch (error) {
					logger.error("[DifficultyTracker] Event listener error", { event, error });
				}
			});
		}
	}
}
