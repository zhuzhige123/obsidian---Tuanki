import { logger } from "../utils/logger";
/**
 * 批量操作服务
 * 提供统一的批量更新、事务处理、进度跟踪功能
 */

import type { WeaveDataStorage } from "../data/storage";
import type { Card } from "../data/types";
import type {
	BatchOperationResult,
	BatchUpdateCardsOptions,
	BatchUpdateFunction,
} from "../types/batch-operation-types";
import { getCardFront } from "../utils/card-field-helper";
import { createGlobalOperationController } from "../utils/global-operation-progress";

/**
 * 批量更新卡片
 * @param cards 要更新的卡片数组
 * @param updateFn 更新函数，接收旧卡片返回新卡片
 * @param dataStorage 数据存储实例
 * @param onProgress 进度回调函数
 * @returns 批量操作结果
 */
export async function batchUpdateCards(
	cards: Card[],
	updateFn: BatchUpdateFunction,
	dataStorage: WeaveDataStorage,
	options?: BatchUpdateCardsOptions
): Promise<BatchOperationResult> {
	const startTime = Date.now();
	const result: BatchOperationResult = {
		total: cards.length,
		success: 0,
		failed: 0,
		errors: [],
		duration: 0,
	};
	const updatedCards: Card[] = [];
	if (cards.length === 0) {
		return result;
	}

	const progress = createGlobalOperationController({
		title: options?.progressTitle || "正在批量处理卡片",
		total: cards.length,
		detail: options?.progressDetail || `正在准备处理 ${cards.length} 张卡片`,
		allowNavigation: options?.allowNavigation ?? false,
		navigationMessage:
			options?.navigationMessage || "正在批量处理卡片，请暂时留在当前页面，完成后会自动刷新。",
	});

	try {
		for (let i = 0; i < cards.length; i++) {
			const card = cards[i];
			try {
				updatedCards.push(updateFn(card));
			} catch (error) {
				result.failed++;
				result.errors.push({
					cardId: card.uuid,
					cardTitle: getCardTitle(card),
					error: error instanceof Error ? error.message : "未知错误",
				});
				logger.error(`[BatchOperation] 更新卡片失败: ${card.uuid}`, error);
			}

			const current = i + 1;
			options?.onProgress?.(current, cards.length);
			progress.update({
				status: "running",
				current,
				detail: `正在处理第 ${current} / ${cards.length} 张卡片`,
			});

			if (current % 10 === 0) {
				await new Promise((resolve) => setTimeout(resolve, 0));
			}
		}

		if (updatedCards.length > 0) {
			progress.update({
				status: "running",
				current: cards.length,
				detail: `正在保存 ${updatedCards.length} 张已处理卡片`,
			});

			try {
				await dataStorage.saveCardsBatch(updatedCards);
				result.success += updatedCards.length;
			} catch (error) {
				result.failed += updatedCards.length;
				for (const card of updatedCards) {
					result.errors.push({
						cardId: card.uuid,
						cardTitle: getCardTitle(card),
						error: error instanceof Error ? error.message : "批量保存失败",
					});
				}
				logger.error("[BatchOperation] 批量保存卡片失败", error);
			}
		}
	} catch (error) {
		logger.error("[BatchOperation] 批量操作执行失败", error);
		progress.finish({
			status: "error",
			current: result.total,
			detail: error instanceof Error ? error.message : "批量操作失败",
		}, 2500);
		throw error;
	}

	result.duration = Date.now() - startTime;
	progress.finish({
		status: result.failed > 0 ? "error" : "success",
		current: result.total,
		detail:
			result.failed > 0
				? `批量处理完成：成功 ${result.success} 张，失败 ${result.failed} 张`
				: `批量处理完成：共处理 ${result.success} 张卡片`,
	}, result.failed > 0 ? 2500 : 1500);

	logger.debug("[BatchOperation] 批量操作完成:", result);

	return result;
}

/**
 * 获取卡片标题（用于错误报告）
 */
function getCardTitle(card: Card): string {
	return (
		getCardFront(card) ||
		card.fields?.word ||
		card.fields?.term ||
		`卡片 ${card.uuid.substring(0, 8)}`
	);
}

/**
 * 合并未映射字段到目标字段
 * @param card 卡片
 * @param unmappedFields 未映射的字段名数组
 * @param targetField 目标字段名
 * @returns 合并后的内容
 */
export function mergeUnmappedFields(
	card: Card,
	unmappedFields: string[],
	targetField: string
): string {
	const mergedContent = unmappedFields
		.map((_fieldKey) => {
			const value = card.fields?.[_fieldKey];
			if (!value || !value.trim()) return null;
			return `**${_fieldKey}**: ${value}`;
		})
		.filter((line): line is string => line !== null)
		.join("\n\n");

	// 如果目标字段已有内容，追加到末尾
	const existingContent = card.fields?.[targetField] || "";

	if (!mergedContent) {
		return existingContent;
	}

	if (!existingContent) {
		return mergedContent;
	}

	return `${existingContent}\n\n---\n\n${mergedContent}`;
}

/**
 * 删除指定字段
 * @param card 卡片
 * @param fieldsToDelete 要删除的字段名数组
 * @returns 新的fields对象
 */
export function deleteFields(card: Card, fieldsToDelete: string[]): Record<string, string> {
	const newFields = { ...card.fields };

	for (const fieldKey of fieldsToDelete) {
		delete newFields[fieldKey];
	}

	return newFields;
}
