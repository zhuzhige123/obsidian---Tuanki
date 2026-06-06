/**
 * Learning Step Index 计算器
 *
 * 核心设计理念：
 * - stepIndex是派生状态，从FSRS数据实时计算
 * - FSRS的scheduledDays是唯一真相源
 * - 不需要单独存储stepIndex，避免数据不一致
 *
 * @version 1.0.0
 * @since 2025-12-06
 */

import type { Card, Rating } from "../../data/types";
import { CardState, Rating as RatingEnum } from "../../data/types";
import { logger } from "../logger";

/**
 * Learning Step Index 计算器
 */
export class StepIndexCalculator {
	/**
	 * 从FSRS数据精确计算stepIndex
	 *
	 * 原理：
	 * - Learning/Relearning状态下，scheduledDays对应某个learningStep
	 * - 通过匹配scheduledDays与learningSteps，反推当前stepIndex
	 *
	 * @param card 卡片对象
	 * @param learningSteps 学习步骤配置（分钟）
	 * @param relearningSteps 重学步骤配置（分钟）
	 * @returns 当前stepIndex（0-based）
	 */
	public static calculate(
		card: Card,
		learningSteps: number[],
		relearningSteps: number[] = []
	): number {
		// 1. 验证输入
		if (!card.fsrs) {
			logger.warn("[StepIndexCalculator] 卡片缺少FSRS数据，返回stepIndex=0");
			return 0;
		}

		// 2. 非Learning/Relearning状态，stepIndex无意义
		const state = card.fsrs.state;
		if (state !== CardState.Learning && state !== CardState.Relearning) {
			return 0;
		}

		// 3. 确定使用哪组步骤
		const steps = state === CardState.Relearning ? relearningSteps : learningSteps;

		if (steps.length === 0) {
			logger.warn("[StepIndexCalculator] learningSteps为空，返回stepIndex=0");
			return 0;
		}

		// 4. 从scheduledDays反推stepIndex
		const scheduledMinutes = (card.fsrs.scheduledDays || 0) * 24 * 60;

		// 5. 精确匹配算法
		const stepIndex = this.findMatchingStepIndex(scheduledMinutes, steps);

		logger.debug("[StepIndexCalculator] 计算stepIndex:", {
			cardId: card.uuid.slice(0, 8),
			state: CardState[state],
			scheduledDays: card.fsrs.scheduledDays,
			scheduledMinutes: scheduledMinutes.toFixed(2),
			steps,
			calculatedIndex: stepIndex,
			matchedStep: steps[stepIndex],
		});

		return stepIndex;
	}

	/**
	 * 查找与scheduledMinutes最匹配的stepIndex
	 *
	 * 算法：
	 * 1. 精确匹配（±10%容差）
	 * 2. 最近邻匹配
	 * 3. 边界处理（防止越界）
	 *
	 * @param scheduledMinutes 已调度的分钟数
	 * @param steps 学习步骤数组（分钟）
	 * @returns 匹配的stepIndex
	 */
	private static findMatchingStepIndex(scheduledMinutes: number, steps: number[]): number {
		if (steps.length === 0) return 0;

		// Hard 在第一步会产生介于前两步之间的中间值（例如 1m/10m -> 6m），
		// 这种情况仍然应视为停留在第一步，而不是误判为第二步。
		if (steps.length >= 2) {
			const hardFirstStepMinutes = Math.round((steps[0] + steps[1]) / 2);
			if (Math.abs(scheduledMinutes - hardFirstStepMinutes) <= 1) {
				logger.debug(
					`[StepIndexCalculator] 检测到第一步 Hard 间隔: ${scheduledMinutes.toFixed(
						2
					)}分钟 -> stepIndex=0`
				);
				return 0;
			}
		}

		let closestIndex = 0;
		let minDiff = Infinity;

		for (let i = 0; i < steps.length; i++) {
			const stepMinutes = steps[i];
			const diff = Math.abs(scheduledMinutes - stepMinutes);
			const tolerance = stepMinutes * 0.1; // 10%容差

			// 精确匹配：在容差范围内，直接返回
			if (diff <= tolerance) {
				logger.debug(
					`[StepIndexCalculator] 精确匹配: index=${i}, step=${stepMinutes}分钟, diff=${diff.toFixed(
						2
					)}分钟`
				);
				return i;
			}

			// 记录最近邻
			if (diff < minDiff) {
				minDiff = diff;
				closestIndex = i;
			}
		}

		// 最近邻匹配
		logger.debug(
			`[StepIndexCalculator] 最近邻匹配: index=${closestIndex}, step=${
				steps[closestIndex]
			}分钟, diff=${minDiff.toFixed(2)}分钟`
		);
		return closestIndex;
	}

	/**
	 * 计算下一步的stepIndex（用于按钮间隔预测）
	 *
	 * @param currentStepIndex 当前stepIndex
	 * @param rating 用户评分
	 * @param steps 学习步骤数组
	 * @returns 下一步的stepIndex，-1表示毕业
	 */
	public static calculateNext(currentStepIndex: number, rating: Rating, steps: number[]): number {
		switch (rating) {
			case RatingEnum.Again:
				// 重置到第一步
				return 0;

			case RatingEnum.Hard:
				// 保持当前步骤（重复当前步）
				return currentStepIndex;

			case RatingEnum.Good: {
				// 进入下一步
				const nextIndex = currentStepIndex + 1;
				// 如果超出步骤数组，返回-1表示毕业
				return nextIndex < steps.length ? nextIndex : -1;
			}

			case RatingEnum.Easy:
				// 直接毕业
				return -1;

			default:
				logger.warn(`[StepIndexCalculator] 未知评分: ${rating}`);
				return currentStepIndex;
		}
	}

	/**
	 * 验证FSRS数据与stepIndex的一致性（调试用）
	 *
	 * @param card 卡片对象
	 * @param expectedStepIndex 期望的stepIndex
	 * @param steps 学习步骤配置
	 * @returns 是否一致
	 */
	public static validate(card: Card, expectedStepIndex: number, steps: number[]): boolean {
		const calculatedIndex = this.calculate(card, steps);
		const isValid = calculatedIndex === expectedStepIndex;

		if (!isValid) {
			logger.warn("[StepIndexCalculator] 一致性验证失败:", {
				cardId: card.uuid.slice(0, 8),
				expected: expectedStepIndex,
				calculated: calculatedIndex,
				scheduledDays: card.fsrs?.scheduledDays,
				steps,
			});
		}

		return isValid;
	}

	/**
	 * 获取当前步骤的详细信息（调试用）
	 */
	public static getStepInfo(
		card: Card,
		learningSteps: number[],
		relearningSteps: number[] = []
	): {
		stepIndex: number;
		currentStep: number | null;
		nextStep: number | null;
		isLastStep: boolean;
		willGraduate: boolean;
	} {
		const stepIndex = this.calculate(card, learningSteps, relearningSteps);
		const steps = card.fsrs?.state === CardState.Relearning ? relearningSteps : learningSteps;

		return {
			stepIndex,
			currentStep: steps[stepIndex] ?? null,
			nextStep: steps[stepIndex + 1] ?? null,
			isLastStep: stepIndex === steps.length - 1,
			willGraduate: stepIndex >= steps.length - 1,
		};
	}
}
