import { logger } from "../../utils/logger";
/**
 * 三方合并引擎
 *
 * 核心功能：
 * 1. 对比源文件、数据库、最后扫描快照三个版本
 * 2. 智能决策：跳过、更新、保留、冲突
 * 3. 保护用户在Weave中的修改
 *
 * 设计理念：
 * - 源文件是"学习材料源头"
 * - 数据库是"学习记录载体"
 * - 快照是"版本对比基准"
 */

import type { WeaveDataStorage } from "../../data/storage";
import type { Card } from "../../data/types";
import type WeavePlugin from "../../main";
import type { DirectFileCardReader } from "../data/DirectFileCardReader";
import { logDebugWithTag } from "../../utils/logger";

/**
 * 同步结果
 */
export interface SyncResult {
	action: "skipped" | "created" | "updated" | "conflict" | "kept";
	cardId?: string;
	uuid?: string;
	reason?: string;
	changes?: {
		contentChanged?: boolean;
		deckChanged?: boolean;
	};
	conflict?: ConflictInfo;
}

/**
 * 冲突信息
 */
export interface ConflictInfo {
	type: "both-modified";
	sourceContent: string;
	dbContent: string;
	lastScanned: string;
	sourceChanges: string; // 源文件的变化描述
	dbChanges: string; // 数据库的变化描述
	uuid: string;
	cardId: string;
}

/**
 * 合并决策
 */
export interface MergeDecision {
	action: "skip" | "update-from-source" | "keep-database" | "conflict";
	reason: string;
}

/**
 * 三方合并引擎
 */
export class ThreeWayMergeEngine {
	private dataStorage: WeaveDataStorage;
	private plugin: WeavePlugin | undefined;

	constructor(dataStorage: WeaveDataStorage, plugin?: WeavePlugin) {
		this.dataStorage = dataStorage;
		this.plugin = plugin;
	}

	/**
	 * 动态获取 DirectFileReader（解决初始化时序问题）
	 */
	private getDirectFileReader(): DirectFileCardReader | undefined {
		return this.plugin?.directFileReader;
	}

	/**
	 * 智能同步卡片
	 *
	 * @param sourceContent - 源文件当前内容
	 * @param uuid - 卡片UUID
	 * @param deckId - 目标牌组ID
	 * @returns 同步结果
	 */
	async smartSync(sourceContent: string, uuid: string, deckId: string): Promise<SyncResult> {
		logDebugWithTag("ThreeWayMerge", `开始同步卡片: ${uuid.substring(0, 8)}...`);

		// 动态获取 DirectFileReader（每次使用时获取，避免初始化时序问题）
		const directFileReader = this.getDirectFileReader();

		//  防御性检查：确保directFileReader已初始化
		if (!directFileReader) {
			logger.warn("[ThreeWayMergeEngine] ⚠️ DirectFileReader未初始化，无法查询现有卡片");
			// 降级方案：假设是新卡片
			logDebugWithTag("ThreeWayMerge", "DirectFileReader不可用，默认为新卡片");
			return await this.createNewCard(sourceContent, uuid, deckId);
		}

		// 步骤1：使用DirectFileCardReader查询现有卡片
		const existingCard = await directFileReader.getCardByUUID(uuid);

		// 情况1：UUID不存在 → 新卡片
		if (!existingCard) {
			logDebugWithTag("ThreeWayMerge", "UUID不存在，创建新卡片");
			return await this.createNewCard(sourceContent, uuid, deckId);
		}

		// 情况2：UUID存在 → 三方对比
		logDebugWithTag("ThreeWayMerge", `找到现有卡片: ${existingCard.uuid}`);
		const decision = await this.checkNeedsUpdate(sourceContent, existingCard);

		switch (decision.action) {
			case "skip":
				logDebugWithTag("ThreeWayMerge", `跳过：${decision.reason}`);
				return {
					action: "skipped",
					cardId: existingCard.uuid,
					uuid,
					reason: decision.reason,
				};

			case "update-from-source":
				logDebugWithTag("ThreeWayMerge", `更新：${decision.reason}`);
				return await this.updateExistingCard(existingCard, sourceContent, deckId);

			case "keep-database":
				logDebugWithTag("ThreeWayMerge", `保留数据库：${decision.reason}`);
				return {
					action: "kept",
					cardId: existingCard.uuid,
					uuid,
					reason: decision.reason,
				};

			case "conflict": {
				logDebugWithTag("ThreeWayMerge", "检测到冲突！");
				const conflict = await this.detectConflict(sourceContent, existingCard);
				return {
					action: "conflict",
					cardId: existingCard.uuid,
					uuid,
					conflict,
				};
			}

			default:
				return {
					action: "skipped",
					reason: "unknown-decision",
				};
		}
	}

	/**
	 * 检查是否需要更新（三方对比核心逻辑）
	 *
	 * @param sourceContent - 源文件当前内容
	 * @param card - 数据库中的卡片
	 * @returns 合并决策
	 */
	private async checkNeedsUpdate(sourceContent: string, card: Card): Promise<MergeDecision> {
		const dbContent = card.content || "";
		const lastScanned = card.lastScannedContent || "";

		logDebugWithTag("ThreeWayMerge", "三方对比", {
			sourceLength: sourceContent.length,
			dbLength: dbContent.length,
			snapshotLength: lastScanned.length,
		});

		// 判断各方是否变化
		const sourceChanged = sourceContent !== lastScanned;
		const dbChanged = dbContent !== lastScanned;

		logDebugWithTag("ThreeWayMerge", "变化检测", {
			sourceChanged,
			dbChanged,
		});

		// 场景1：两边都没变
		if (!sourceChanged && !dbChanged) {
			return {
				action: "skip",
				reason: "no-changes",
			};
		}

		// 场景2：仅源文件变化
		if (sourceChanged && !dbChanged) {
			return {
				action: "update-from-source",
				reason: "source-modified-only",
			};
		}

		// 场景3：仅数据库变化（用户在Weave中修改）
		if (!sourceChanged && dbChanged) {
			return {
				action: "keep-database",
				reason: "weave-modified-only",
			};
		}

		// 场景4：两边都变了 → 冲突
		if (sourceChanged && dbChanged) {
			return {
				action: "conflict",
				reason: "both-modified",
			};
		}

		return {
			action: "skip",
			reason: "unknown-state",
		};
	}

	/**
	 * 检测冲突详情
	 *
	 * @param sourceContent - 源文件内容
	 * @param card - 数据库卡片
	 * @returns 冲突信息
	 */
	private async detectConflict(sourceContent: string, card: Card): Promise<ConflictInfo> {
		const dbContent = card.content || "";
		const lastScanned = card.lastScannedContent || "";

		// 计算变化描述
		const sourceChanges = this.calculateDiff(lastScanned, sourceContent);
		const dbChanges = this.calculateDiff(lastScanned, dbContent);

		return {
			type: "both-modified",
			sourceContent,
			dbContent,
			lastScanned,
			sourceChanges,
			dbChanges,
			uuid: card.uuid,
			cardId: card.uuid,
		};
	}

	/**
	 * 计算内容差异描述
	 *
	 * @param oldContent - 旧内容
	 * @param newContent - 新内容
	 * @returns 差异描述
	 */
	private calculateDiff(oldContent: string, newContent: string): string {
		const oldLen = oldContent.length;
		const newLen = newContent.length;
		const diff = newLen - oldLen;

		if (diff > 0) {
			return `+${diff} 字符`;
		} else if (diff < 0) {
			return `${diff} 字符`;
		} else {
			return "内容重新组织";
		}
	}

	/**
	 * 创建新卡片
	 *
	 * @param content - 卡片内容
	 * @param uuid - UUID
	 * @param deckId - 牌组ID
	 * @returns 同步结果
	 */
	private async createNewCard(
		_content: string,
		uuid: string,
		_deckId: string
	): Promise<SyncResult> {
		try {
			// 这里只返回结果，实际创建由批量解析服务处理
			return {
				action: "created",
				uuid,
				reason: "new-card",
			};
		} catch (error) {
			logger.error("[ThreeWayMerge] 创建卡片失败:", error);
			throw error;
		}
	}

	/**
	 * 更新已存在的卡片
	 *
	 * @param card - 现有卡片
	 * @param newContent - 新内容
	 * @param newDeckId - 新牌组ID
	 * @returns 同步结果
	 */
	private async updateExistingCard(
		card: Card,
		newContent: string,
		newDeckId: string
	): Promise<SyncResult> {
		try {
			const oldContent = card.content;
			const oldDeckId = card.deckId;

			// 更新内容
			card.content = newContent;
			card.modified = new Date().toISOString();

			// 更新快照
			card.lastScannedContent = newContent;
			card.lastScannedAt = new Date().toISOString();

			// 标记为批量扫描
			card.isBatchScanned = true;

			// 重置 modifiedInWeave 标记（因为源文件优先）
			card.modifiedInWeave = false;

			// 检查牌组是否变化
			let deckChanged = false;
			if (oldDeckId !== newDeckId) {
				card.deckId = newDeckId;
				deckChanged = true;
			}

			// 保存到数据库
			await this.dataStorage.updateCard(card);

			return {
				action: "updated",
				cardId: card.uuid,
				uuid: card.uuid,
				changes: {
					contentChanged: oldContent !== newContent,
					deckChanged,
				},
			};
		} catch (error) {
			logger.error("[ThreeWayMerge] 更新卡片失败:", error);
			throw error;
		}
	}

	/**
	 * 解决冲突（手动选择）
	 *
	 * @param card - 卡片
	 * @param choice - 选择（'use-source' | 'use-weave'）
	 * @param sourceContent - 源文件内容
	 * @returns 同步结果
	 */
	async resolveConflict(
		card: Card,
		choice: "use-source" | "use-weave",
		sourceContent: string
	): Promise<SyncResult> {
		logDebugWithTag("ThreeWayMerge", `解决冲突: ${choice}`);

		if (choice === "use-source") {
			// 使用源文件版本
			const oldContent = card.content;
			card.content = sourceContent;
			card.modified = new Date().toISOString();

			// 更新快照为源文件内容
			card.lastScannedContent = sourceContent;
			card.lastScannedAt = new Date().toISOString();
			card.modifiedInWeave = false;

			await this.dataStorage.updateCard(card);

			return {
				action: "updated",
				cardId: card.uuid,
				uuid: card.uuid,
				reason: "conflict-resolved-use-source",
				changes: {
					contentChanged: oldContent !== sourceContent,
				},
			};
		} else {
			// 保留Weave版本
			// 更新快照为当前数据库内容
			card.lastScannedContent = card.content;
			card.lastScannedAt = new Date().toISOString();
			card.modifiedInWeave = true; // 标记为在Weave中修改

			await this.dataStorage.updateCard(card);

			return {
				action: "kept",
				cardId: card.uuid,
				uuid: card.uuid,
				reason: "conflict-resolved-keep-weave",
			};
		}
	}

	/**
	 * 根据 UUID 查找卡片（供外部调用）
	 * @param uuid 卡片 UUID
	 * @returns 卡片对象或 null
	 */
	async findCardByUUID(uuid: string): Promise<Card | null> {
		if (!this.dataStorage) {
			return null;
		}

		try {
			const allCards = await this.dataStorage.getAllCards();
			return allCards.find((c: Card) => c.uuid === uuid) || null;
		} catch (error) {
			logger.error("[ThreeWayMergeEngine] 查找卡片失败:", error);
			return null;
		}
	}
}
