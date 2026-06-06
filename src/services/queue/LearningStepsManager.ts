import type { TimerHandle } from "../../types/timer";
/**
 * Learning Steps Manager
 *
 * 负责管理会话内重复学习逻辑
 *
 * 核心功能：
 * 1. 判断卡片是否需要进入Learning Steps
 * 2. 管理Learning Steps状态
 * 3. 计算下次复习时间
 * 4. 处理毕业逻辑
 *
 * @version 1.0.0
 * @since 2025-12-04
 */

import { CardState, Rating } from "../../data/types";
import type {
	CardWithQueueOptimization,
	LearningStepsConfig,
	LearningStepsResult,
} from "../../types/queue-optimization-types";
import { logger } from "../../utils/logger";

export class LearningStepsManager {
	private config: LearningStepsConfig;
	private timers: Map<string, TimerHandle> = new Map();
	private eventListeners: Map<string, ((...args: unknown[]) => void)[]> = new Map();

	constructor(config: LearningStepsConfig) {
		this.config = config;
		logger.debug("[LearningSteps] Manager initialized", { config });
	}

	/**
	 * 处理卡片评分
	 *
	 * @param card 卡片
	 * @param rating 评分
	 * @param prevState 之前的状态
	 * @returns Learning Steps处理结果
	 */
	process(
		card: CardWithQueueOptimization,
		rating: Rating,
		prevState: CardState
	): LearningStepsResult {
		if (!this.config.enabled) {
			return {
				shouldStayInQueue: false,
				insertPosition: null,
			};
		}

		// 防御性检查：确保fsrs数据存在
		if (!card.fsrs) {
			logger.warn("[LearningSteps] Card missing fsrs data", { cardId: card.uuid });
			return {
				shouldStayInQueue: false,
				insertPosition: null,
			};
		}

		logger.debug("[LearningSteps] Processing card", {
			cardId: card.uuid,
			rating,
			prevState,
			currentState: card.fsrs.state,
		});

		// 情况1：新卡片首次遗忘
		if (prevState === CardState.New && rating <= Rating.Hard) {
			return this.enterLearning(card);
		}

		// 情况2：已在Learning状态
		if (card.metadata?.learningSteps) {
			return this.handleLearningCard(card, rating);
		}

		// 情况3：不需要Learning Steps
		return {
			shouldStayInQueue: false,
			insertPosition: null,
		};
	}

	/**
	 * 进入Learning状态
	 */
	private enterLearning(card: CardWithQueueOptimization): LearningStepsResult {
		logger.debug("[LearningSteps] Entering learning", { cardId: card.uuid });

		// 设置FSRS状态（调用方已检查fsrs存在性）
		card.fsrs!.state = CardState.Learning;

		// 初始化Learning Steps数据
		if (!card.metadata) {
			card.metadata = {};
		}

		card.metadata.learningSteps = {
			currentStep: 0,
			steps: this.config.steps,
			startedAt: new Date().toISOString(),
			failureCount: 1,
		};

		// 计算下次due时间（第一步）
		const nextDue = new Date();
		nextDue.setMinutes(nextDue.getMinutes() + this.config.steps[0]);
		card.fsrs!.due = nextDue.toISOString();

		// 设置定时器
		this.scheduleReview(card);

		return {
			shouldStayInQueue: true,
			insertPosition: "short-term",
			nextDue: nextDue.toISOString(),
		};
	}

	/**
	 * 处理Learning卡片
	 */
	private handleLearningCard(card: CardWithQueueOptimization, rating: Rating): LearningStepsResult {
		const steps = card.metadata?.learningSteps;
		if (!steps) {
			logger.warn("[LearningSteps] Missing learning steps metadata", {
				cardId: card.uuid,
				rating,
			});
			return {
				shouldStayInQueue: false,
				insertPosition: null,
			};
		}

		logger.debug("[LearningSteps] Handling learning card", {
			cardId: card.uuid,
			rating,
			currentStep: steps.currentStep,
			failureCount: steps.failureCount,
		});

		// Again：重置到第1步
		if (rating === Rating.Again) {
			steps.currentStep = 0;
			steps.failureCount++;

			// 检查是否超过最大失败次数
			if (steps.failureCount >= this.config.maxFailures) {
				logger.warn("[LearningSteps] Max failures reached", {
					cardId: card.uuid,
					failureCount: steps.failureCount,
				});

				this.emit("max-failures-reached", {
					cardId: card.uuid,
					failureCount: steps.failureCount,
				});
			}

			const nextDue = new Date();
			nextDue.setMinutes(nextDue.getMinutes() + steps.steps[0]);
			card.fsrs!.due = nextDue.toISOString();

			this.scheduleReview(card);

			return {
				shouldStayInQueue: true,
				insertPosition: "immediate",
				nextDue: nextDue.toISOString(),
			};
		}

		// Hard：进入下一步（如果有）
		if (rating === Rating.Hard) {
			if (steps.currentStep < steps.steps.length - 1) {
				steps.currentStep++;

				const nextStepInterval = steps.steps[steps.currentStep];
				const nextDue = new Date();
				nextDue.setMinutes(nextDue.getMinutes() + nextStepInterval);
				card.fsrs!.due = nextDue.toISOString();

				this.scheduleReview(card);

				return {
					shouldStayInQueue: true,
					insertPosition: "short-term",
					nextDue: nextDue.toISOString(),
				};
			}
			// 已是最后一步，毕业
		}

		// Good/Easy：毕业到Review
		if (rating >= Rating.Good) {
			return this.graduate(card);
		}

		// 默认不留在队列
		return {
			shouldStayInQueue: false,
			insertPosition: null,
		};
	}

	/**
	 * 毕业到Review状态
	 */
	private graduate(card: CardWithQueueOptimization): LearningStepsResult {
		logger.debug("[LearningSteps] Graduating card", { cardId: card.uuid });

		// 设置FSRS状态为Review（调用方已检查fsrs存在性）
		card.fsrs!.state = CardState.Review;

		// 清除Learning Steps数据
		if (card.metadata) {
			card.metadata.learningSteps = undefined;
		}

		// 清除定时器
		this.clearTimer(card.uuid);

		return {
			shouldStayInQueue: false,
			insertPosition: null,
		};
	}

	/**
	 * 调度复习定时器
	 *
	 * 注意：定时器只用于提醒，实际判断依然基于due时间
	 */
	private scheduleReview(card: CardWithQueueOptimization): void {
		// 清除旧定时器
		this.clearTimer(card.uuid);

		const dueValue = card.fsrs?.due;
		if (!dueValue) {
			return;
		}

		const dueTime = new Date(dueValue).getTime();
		if (Number.isNaN(dueTime)) {
			return;
		}

		const now = Date.now();
		const delay = Math.max(0, dueTime - now);

		// 设置新定时器
		const timer = window.setTimeout(() => {
			logger.debug("[LearningSteps] Card is due", { cardId: card.uuid });
			this.emit("card-due", card.uuid);
			this.timers.delete(card.uuid);
		}, delay);

		this.timers.set(card.uuid, timer);
	}

	/**
	 * 清除定时器
	 */
	private clearTimer(cardId: string): void {
		const oldTimer = this.timers.get(cardId);
		if (oldTimer) {
			window.clearTimeout(oldTimer);
			this.timers.delete(cardId);
		}
	}

	/**
	 * 初始化会话
	 *
	 * @param cards 队列中的所有卡片
	 */
	initializeSession(cards: CardWithQueueOptimization[]): void {
		logger.debug("[LearningSteps] Initializing session", { cardCount: cards.length });

		// 为所有Learning卡片设置定时器
		cards.forEach((_card) => {
			if (_card.metadata?.learningSteps) {
				this.scheduleReview(_card);
			}
		});
	}

	/**
	 * 清理会话（会话结束时调用）
	 */
	cleanup(): void {
		logger.debug("[LearningSteps] Cleaning up", { timerCount: this.timers.size });

		// 清除所有定时器
		this.timers.forEach((timer) => window.clearTimeout(timer));
		this.timers.clear();
	}

	/**
	 * 更新配置
	 */
	updateConfig(config: Partial<LearningStepsConfig>): void {
		this.config = { ...this.config, ...config };
		logger.debug("[LearningSteps] Config updated", { config: this.config });
	}

	/**
	 * 获取配置
	 */
	getConfig(): LearningStepsConfig {
		return { ...this.config };
	}

	// ============================================
	// 事件系统
	// ============================================

	/**
	 * 添加事件监听器
	 */
	on(event: string, callback: (...args: unknown[]) => void): void {
		if (!this.eventListeners.has(event)) {
			this.eventListeners.set(event, []);
		}
		this.eventListeners.get(event)?.push(callback);
	}

	/**
	 * 移除事件监听器
	 */
	off(event: string, callback: (...args: unknown[]) => void): void {
		const listeners = this.eventListeners.get(event);
		if (listeners) {
			const index = listeners.indexOf(callback);
			if (index > -1) {
				listeners.splice(index, 1);
			}
		}
	}

	/**
	 * 触发事件
	 */
	private emit(event: string, data?: unknown): void {
		const listeners = this.eventListeners.get(event);
		if (listeners) {
			listeners.forEach((_callback) => {
				try {
					_callback(data);
				} catch (error) {
					logger.error("[LearningSteps] Event listener error", { event, error });
				}
			});
		}
	}
}
