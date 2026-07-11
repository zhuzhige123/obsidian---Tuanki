/**
 * Queue Optimization Factory
 *
 * 队列优化系统工厂类
 *
 * 负责创建和配置所有队列优化组件
 *
 * @version 1.0.0
 * @since 2025-12-04
 */

import type { QueueOptimizationSettings } from "../../types/queue-optimization-types";
import { DEFAULT_QUEUE_OPTIMIZATION_SETTINGS } from "../../types/queue-optimization-types";
import { logger } from "../../utils/logger";
import { DifficultyTracker } from "./DifficultyTracker";
import { InterleavingEngine } from "./InterleavingEngine";
import { LearningStepsManager } from "./LearningStepsManager";
import { PriorityCalculator } from "./PriorityCalculator";
import { QueueOptimizationCoordinator } from "./QueueOptimizationCoordinator";

/**
 * 队列优化系统实例
 */
export interface QueueOptimizationSystem {
	learningStepsManager: LearningStepsManager;
	priorityCalculator: PriorityCalculator;
	difficultyTracker: DifficultyTracker;
	interleavingEngine: InterleavingEngine;
	coordinator: QueueOptimizationCoordinator;
}

export class QueueOptimizationFactory {
	/**
	 * 创建队列优化系统
	 *
	 * @param settings 配置（可选，不提供则使用默认配置）
	 * @returns 完整的队列优化系统实例
	 */
	static create(settings?: Partial<QueueOptimizationSettings>): QueueOptimizationSystem {
		logger.debug("[QueueFactory] Creating queue optimization system");

		// 合并默认配置
		const finalSettings: QueueOptimizationSettings = {
			...DEFAULT_QUEUE_OPTIMIZATION_SETTINGS,
			...settings,
			learningSteps: {
				...DEFAULT_QUEUE_OPTIMIZATION_SETTINGS.learningSteps,
				...settings?.learningSteps,
			},
			interleaving: {
				...DEFAULT_QUEUE_OPTIMIZATION_SETTINGS.interleaving,
				...settings?.interleaving,
			},
			difficultyTracking: {
				...DEFAULT_QUEUE_OPTIMIZATION_SETTINGS.difficultyTracking,
				...settings?.difficultyTracking,
			},
			priority: {
				...DEFAULT_QUEUE_OPTIMIZATION_SETTINGS.priority,
				...settings?.priority,
			},
		};

		logger.debug("[QueueFactory] Final settings", { settings: finalSettings });

		// 创建各个组件
		const learningStepsManager = new LearningStepsManager(finalSettings.learningSteps);
		const priorityCalculator = new PriorityCalculator(finalSettings.priority);
		const difficultyTracker = new DifficultyTracker(finalSettings.difficultyTracking);
		const interleavingEngine = new InterleavingEngine(finalSettings.interleaving);

		// 创建协调器
		const coordinator = new QueueOptimizationCoordinator(
			interleavingEngine,
			priorityCalculator,
			finalSettings
		);

		logger.debug("[QueueFactory] Queue optimization system created successfully");

		return {
			learningStepsManager,
			priorityCalculator,
			difficultyTracker,
			interleavingEngine,
			coordinator,
		};
	}

	/**
	 * 创建默认系统（使用最优配置）
	 */
	static createDefault(): QueueOptimizationSystem {
		return this.create();
	}

	/**
	 * 从插件设置创建
	 *
	 * @param pluginSettings 插件的完整设置对象
	 */
	static createFromPluginSettings(pluginSettings: unknown): QueueOptimizationSystem {
		// 从插件设置中提取队列优化配置
		const queueSettings =
			pluginSettings && typeof pluginSettings === "object"
				? (pluginSettings as Record<string, unknown>).queueOptimization
				: undefined;

		return this.create(
			queueSettings && typeof queueSettings === "object" ? queueSettings : undefined
		);
	}
}
