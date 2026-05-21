/**
 * StudyInterface 辅助函数
 * 集中管理重复的业务逻辑，避免代码重复
 */

import { Notice } from "obsidian";
import type { Card } from "../../data/types";
import type { WeavePlugin } from "../../main";
import { saveMemoryCard } from "../../services/weave-domain";
import { t } from "../../utils/i18n";
import { logger } from "../../utils/logger";
import { LOG_PREFIX } from "./study-interface-constants";

// ============================================
// 卡片保存相关
// ============================================

/**
 * 卡片保存结果
 */
export interface SaveCardResult {
	success: boolean;
	error?: string;
	card?: Card;
}

/**
 * 统一的卡片保存函数
 *
 * @param card - 要保存的卡片
 * @param plugin - Weave 插件实例（经官方 Domain API 写入）
 * @param options - 可选配置
 * @returns 保存结果
 */
export async function saveCardUnified(
	card: Card,
	plugin: WeavePlugin,
	options: {
		/** 操作类型（用于日志和通知） */
		operation?: string;
		/** 是否显示成功通知 */
		showSuccessNotice?: boolean;
		/** 自定义成功消息 */
		successMessage?: string;
		/** 是否显示错误通知 */
		showErrorNotice?: boolean;
		/** 自定义错误消息 */
		errorMessage?: string;
	} = {}
): Promise<SaveCardResult> {
	const {
		operation = t("studyInterface.helpers.defaultOperation"),
		showSuccessNotice = false,
		successMessage,
		showErrorNotice = true,
		errorMessage,
	} = options;

	try {
		const result = await saveMemoryCard(plugin, card, "update");

		if (result.success) {
			if (showSuccessNotice && successMessage) {
				new Notice(successMessage);
			}

			if (import.meta.env.DEV) {
				logger.debug(`${LOG_PREFIX.CARD_OPERATION} ${operation}成功:`, card.uuid);
			}

			return { success: true, card };
		} else {
			const error = result.error || t("study.view.unknownError");

			if (showErrorNotice) {
				new Notice(errorMessage || t("studyInterface.helpers.operationFailedWithError", { operation, error }));
			}

			logger.error(`${LOG_PREFIX.CARD_OPERATION} ${operation}失败:`, error);

			return { success: false, error };
		}
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);

		if (showErrorNotice) {
			new Notice(errorMessage || t("studyInterface.helpers.operationFailed", { operation }));
		}

		logger.error(`${LOG_PREFIX.CARD_OPERATION} ${operation}异常:`, error);

		return { success: false, error: errorMsg };
	}
}

// ============================================
// 🔄 数组更新相关
// ============================================

/**
 * 触发数组响应式更新的统一函数
 *
 * 注意：在Svelte 5中，直接赋值新数组会触发响应式更新
 * 这个函数主要用于代码可读性和未来可能的优化
 *
 * @param cards - 卡片数组
 * @returns 新的卡片数组引用
 */
export function triggerArrayUpdate<T>(array: T[]): T[] {
	return [...array];
}

/**
 * 更新数组中的单个元素并触发响应式更新
 *
 * @param array - 原数组
 * @param index - 要更新的元素索引
 * @param newItem - 新元素
 * @returns 新的数组引用
 */
export function updateArrayItem<T>(array: T[], index: number, newItem: T): T[] {
	if (index < 0 || index >= array.length) {
		logger.warn(`${LOG_PREFIX.CARD_OPERATION} 索引越界: ${index}, 数组长度: ${array.length}`);
		return array;
	}

	const newArray = [...array];
	newArray[index] = newItem;
	return newArray;
}

// ============================================
// 错误处理相关
// ============================================

/**
 * 统一的错误处理函数
 *
 * @param error - 错误对象
 * @param context - 错误上下文（操作名称）
 * @param options - 可选配置
 */
export function handleError(
	error: unknown,
	context: string,
	options: {
		/** 是否显示用户通知 */
		showNotice?: boolean;
		/** 自定义通知消息 */
		noticeMessage?: string;
		/** 日志前缀 */
		logPrefix?: string;
	} = {}
): void {
	const { showNotice = true, noticeMessage, logPrefix = LOG_PREFIX.CARD_OPERATION } = options;

	// 记录错误日志
	logger.error(`${logPrefix} ${context}失败:`, error);

	// 显示用户通知
	if (showNotice) {
		const message = noticeMessage || t("studyInterface.helpers.operationFailed", { operation: context });
		new Notice(message);
	}
}

// ============================================
// 📊 统计初始化相关
// ============================================

/**
 * 初始化选择题统计对象
 *
 * @returns 初始化的选择题统计
 */
export function initializeChoiceStats() {
	return {
		totalAttempts: 0,
		correctAttempts: 0,
		accuracy: 0,
		averageResponseTime: 0,
		recentAttempts: [],
		isInErrorBook: false,
		errorCount: 0,
	};
}

/**
 * 初始化卡片统计对象
 *
 * @returns 初始化的卡片统计
 */
export function initializeCardStats() {
	return {
		totalReviews: 0,
		totalTime: 0,
		averageTime: 0,
		memoryRate: 0,
	};
}

// ============================================
// 卡片内容验证
// ============================================

/**
 * 验证卡片是否有效
 *
 * @param card - 卡片对象
 * @returns 是否有效
 */
export function isValidCard(card: unknown): card is Card {
	if (!card || typeof card !== "object") {
		logger.warn(`${LOG_PREFIX.CARD_OPERATION} 卡片为null或undefined`);
		return false;
	}

	const candidate = card as Partial<Card>;
	if (!candidate.uuid) {
		logger.warn(`${LOG_PREFIX.CARD_OPERATION} 卡片缺少uuid`, card);
		return false;
	}

	return true;
}

/**
 * 确保卡片字段存在
 *
 * @param card - 卡片对象
 * @returns 字段对象（确保存在）
 */
export function ensureCardFields(card: Card): Record<string, string> {
	if (!card.fields || typeof card.fields !== "object" || Array.isArray(card.fields)) {
		logger.warn(`${LOG_PREFIX.CARD_OPERATION} 卡片字段无效，初始化为空对象`, card.uuid);
		return {};
	}

	return card.fields;
}

// ============================================
// 🔍 开发环境检测
// ============================================

/**
 * 是否为开发环境
 */
export const isDevelopment = import.meta.env.DEV;

/**
 * 条件性日志记录（仅开发环境）
 *
 * @param level - 日志级别
 * @param message - 消息
 * @param data - 数据
 */
export function devLog(
	level: "debug" | "info" | "warn" | "error",
	message: string,
	...data: unknown[]
): void {
	if (!isDevelopment) return;

	switch (level) {
		case "debug":
			logger.debug(message, ...data);
			break;
		case "info":
			logger.info(message, ...data);
			break;
		case "warn":
			logger.warn(message, ...data);
			break;
		case "error":
			logger.error(message, ...data);
			break;
	}
}
