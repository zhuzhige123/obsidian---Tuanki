import { logger } from "../../utils/logger";
/**
 * 单文件单卡片同步决策引擎
 * 职责：基于文件 mtime 判断是否需要同步卡片
 *
 * 决策逻辑：
 * 1. 如果卡片不存在 → 创建新卡片
 * 2. 如果文件 mtime > 数据库 modified → 更新卡片
 * 3. 如果文件 mtime <= 数据库 modified → 跳过（保护插件内编辑）
 *
 * @author Weave Team
 * @date 2025-11-03
 */

import type { WeaveDataStorage } from "../../data/storage";
import type { Card } from "../../data/types";
import type { ParsedCard } from "../../types/newCardParsingTypes";
import type { DirectFileCardReader } from "../data/DirectFileCardReader";

interface SingleCardSyncPluginHost {
	directFileReader?: DirectFileCardReader;
}

/**
 * 同步动作类型
 */
export type SyncAction = "create" | "update" | "skip";

/**
 * 同步决策结果
 */
export interface SyncDecision {
	action: SyncAction;
	reason: string;
	card?: ParsedCard; // 如果动作是 create 或 update，返回卡片数据
	existingCard?: Card; // 如果动作是 update，返回现有卡片
}

/**
 * 单文件单卡片同步决策引擎
 */
export class SingleCardSyncEngine {
	constructor(private dataStorage: WeaveDataStorage, private plugin?: SingleCardSyncPluginHost) {}

	/**
	 * 决策同步动作
	 * @param parsedCard 解析后的卡片
	 * @returns 同步决策
	 */
	async decideSyncAction(parsedCard: ParsedCard): Promise<SyncDecision> {
		try {
			// 1. 检查卡片是否存在
			const uuid = parsedCard.metadata?.uuid;
			if (!uuid) {
				logger.error("[SingleCardSyncEngine] 卡片缺少 UUID，无法决策");
				return {
					action: "skip",
					reason: "卡片缺少 UUID",
				};
			}

			// 2. 查询数据库中的现有卡片
			const existingCard = await this.findCardByUUID(uuid);

			if (!existingCard) {
				// 新卡片 → 创建
				return {
					action: "create",
					reason: "数据库中不存在此卡片",
					card: parsedCard,
				};
			}

			// 3. 对比修改时间
			const fileMtime = parsedCard.metadata?.fileMtime;
			const dbModified = existingCard.modified ? new Date(existingCard.modified).getTime() : 0;

			if (!fileMtime) {
				logger.warn("[SingleCardSyncEngine] 卡片缺少文件 mtime，跳过同步");
				return {
					action: "skip",
					reason: "卡片缺少文件修改时间",
					existingCard,
				};
			}

			if (fileMtime > dbModified) {
				// 文件更新了 → 更新卡片
				return {
					action: "update",
					reason: `文件修改时间 (${new Date(fileMtime).toISOString()}) 晚于数据库 (${new Date(
						dbModified
					).toISOString()})`,
					card: parsedCard,
					existingCard,
				};
			} else {
				// 文件未更新 → 跳过（保护插件内的编辑）
				return {
					action: "skip",
					reason: `文件修改时间 (${new Date(fileMtime).toISOString()}) 早于或等于数据库 (${new Date(
						dbModified
					).toISOString()})，保护插件内编辑`,
					existingCard,
				};
			}
		} catch (error) {
			logger.error("[SingleCardSyncEngine] 决策同步动作失败:", error);
			return {
				action: "skip",
				reason: `决策失败: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	/**
	 * 🆕 动态获取 DirectFileReader（解决初始化时序问题）
	 */
	private getDirectFileReader(): DirectFileCardReader | undefined {
		return this.plugin?.directFileReader;
	}

	/**
	 * 根据 UUID 查找卡片
	 * @param uuid 卡片 UUID
	 * @returns 卡片对象或 null
	 */
	private async findCardByUUID(uuid: string): Promise<Card | null> {
		try {
			// 🆕 动态获取 DirectFileReader（每次使用时获取，避免初始化时序问题）
			const directFileReader = this.getDirectFileReader();

			//  防御性检查：确保directFileReader已初始化
			if (!directFileReader) {
				logger.warn("[SingleCardSyncEngine] ⚠️ DirectFileReader未初始化，无法查找卡片");
				return null;
			}

			// 使用DirectFileCardReader查找卡片（更高效且准确）
			return await directFileReader.getCardByUUID(uuid);
		} catch (error) {
			logger.error("[SingleCardSyncEngine] 查找卡片失败:", error);
			return null;
		}
	}

	/**
	 * 批量决策同步动作
	 * @param parsedCards 解析后的卡片数组
	 * @returns 同步决策数组
	 */
	async decideSyncActions(parsedCards: ParsedCard[]): Promise<SyncDecision[]> {
		const decisions: SyncDecision[] = [];

		for (const parsedCard of parsedCards) {
			const decision = await this.decideSyncAction(parsedCard);
			decisions.push(decision);
		}

		return decisions;
	}

	/**
	 * 获取同步统计信息
	 * @param decisions 同步决策数组
	 * @returns 统计对象
	 */
	getSyncStatistics(decisions: SyncDecision[]): {
		createCount: number;
		updateCount: number;
		skipCount: number;
	} {
		return {
			createCount: decisions.filter((d) => d.action === "create").length,
			updateCount: decisions.filter((d) => d.action === "update").length,
			skipCount: decisions.filter((d) => d.action === "skip").length,
		};
	}

	/**
	 * 过滤出需要处理的卡片（排除 skip）
	 * @param decisions 同步决策数组
	 * @returns 需要处理的卡片数组
	 */
	filterCardsToProcess(decisions: SyncDecision[]): ParsedCard[] {
		return decisions.filter((d) => d.action !== "skip" && d.card).map((d) => d.card!);
	}

	/**
	 * 强制同步模式（忽略 mtime 对比）
	 * 用于"完全同步模式"
	 * @param parsedCard 解析后的卡片
	 * @returns 同步决策
	 */
	async forceSync(parsedCard: ParsedCard): Promise<SyncDecision> {
		try {
			const uuid = parsedCard.metadata?.uuid;
			if (!uuid) {
				return {
					action: "skip",
					reason: "卡片缺少 UUID",
				};
			}

			const existingCard = await this.findCardByUUID(uuid);

			if (!existingCard) {
				return {
					action: "create",
					reason: "强制同步：新卡片",
					card: parsedCard,
				};
			} else {
				return {
					action: "update",
					reason: "强制同步：覆盖现有卡片",
					card: parsedCard,
					existingCard,
				};
			}
		} catch (error) {
			logger.error("[SingleCardSyncEngine] 强制同步失败:", error);
			return {
				action: "skip",
				reason: `强制同步失败: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}
}
