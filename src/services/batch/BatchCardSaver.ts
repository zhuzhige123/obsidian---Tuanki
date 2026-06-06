import { logger } from "../../utils/logger";
/**
 * 批量卡片保存器
 * 负责将卡片批量保存到数据库
 */

import { Notice } from "obsidian";
import type { WeaveDataStorage } from "../../data/storage";
import type { Card } from "../../data/types";
import type { BatchSaveResult, SaveOptions, SaveResult } from "../../types/converter-types";
import { getCardMetadataService } from "../CardMetadataService";
import type { GlobalDataCache } from "../GlobalDataCache";

/**
 * 批量卡片保存器
 */
export class BatchCardSaver {
	private storage: WeaveDataStorage;
	private globalCache: GlobalDataCache;

	constructor(storage: WeaveDataStorage, globalCache: GlobalDataCache) {
		this.storage = storage;
		this.globalCache = globalCache;
	}

	/**
	 * 保存单张卡片
	 */
	async saveCard(card: Card): Promise<SaveResult> {
		try {
			logger.debug(`[BatchCardSaver] 保存卡片: ${card.uuid}`);

			// 调用数据存储的保存方法
			const response = await this.storage.saveCard(card);

			if (response.success && response.data) {
				// v2.2: 优先从 content YAML 的 we_decks 获取牌组ID
				const primaryDeckId = getCardMetadataService().getCardDeckIds(card)[0];
				this.globalCache.invalidateCardCache(primaryDeckId || card.deckId || "");

				return {
					success: true,
					card: response.data,
				};
			} else {
				return {
					success: false,
					error: response.error || "保存失败",
				};
			}
		} catch (error) {
			logger.error("[BatchCardSaver] 保存卡片失败:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : "未知保存错误",
			};
		}
	}

	/**
	 * 批量保存卡片
	 */
	async saveBatch(cards: Card[], options: SaveOptions = {}): Promise<BatchSaveResult> {
		const startTime = Date.now();
		const savedCards: Card[] = [];
		const errors: BatchSaveResult["errors"] = [];
		let successCount = 0;
		let failureCount = 0;

		logger.debug(`[BatchCardSaver] 开始批量保存 ${cards.length} 张卡片`);

		for (let i = 0; i < cards.length; i++) {
			const card = cards[i];

			try {
				// 进度回调
				if (options.onProgress) {
					options.onProgress(i + 1, cards.length);
				}

				// 保存单张卡片
				const result = await this.saveCard(card);

				if (result.success && result.card) {
					savedCards.push(result.card);
					successCount++;
					logger.debug(`[BatchCardSaver] ✅ 卡片 ${i + 1}/${cards.length} 保存成功`);
				} else {
					failureCount++;
					errors.push({
						cardId: card.uuid,
						error: result.error || "未知错误",
					});
					logger.error(`[BatchCardSaver] ❌ 卡片 ${i + 1}/${cards.length} 保存失败:`, result.error);

					// 如果不允许继续，则中断
					if (!options.continueOnError) {
						break;
					}
				}
			} catch (error) {
				failureCount++;
				const errorMessage = error instanceof Error ? error.message : "未知错误";
				errors.push({
					cardId: card.uuid,
					error: errorMessage,
					originalError: error instanceof Error ? error : undefined,
				});
				logger.error(`[BatchCardSaver] ❌ 卡片 ${i + 1}/${cards.length} 保存异常:`, error);

				// 如果不允许继续，则中断
				if (!options.continueOnError) {
					break;
				}
			}
		}

		const duration = Date.now() - startTime;

		logger.debug(
			`[BatchCardSaver] 批量保存完成: 成功 ${successCount}/${cards.length}, 失败 ${failureCount}, 耗时 ${duration}ms`
		);

		return {
			success: failureCount === 0,
			successCount,
			failureCount,
			savedCards,
			errors,
			duration,
		};
	}

	/**
	 * 批量保存并显示进度通知
	 */
	async saveBatchWithNotice(cards: Card[], options: SaveOptions = {}): Promise<BatchSaveResult> {
		let progressNotice: Notice | null = null;

		try {
			// 显示初始通知
			progressNotice = new Notice(`正在保存 ${cards.length} 张卡片...`, 0);

			// 带进度回调的保存
			const result = await this.saveBatch(cards, {
				...options,
				continueOnError: true, // 批量操作时继续处理其他卡片
				onProgress: (current, total) => {
					if (progressNotice) {
						progressNotice.setMessage(`正在保存卡片 ${current}/${total}...`);
					}
				},
			});

			// 隐藏进度通知
			if (progressNotice) {
				progressNotice.hide();
				progressNotice = null;
			}

			// 显示结果通知
			if (result.success) {
				new Notice(`成功保存 ${result.successCount} 张卡片`, 3000);
			} else {
				new Notice(`保存完成: ${result.successCount} 成功, ${result.failureCount} 失败`, 5000);
			}

			return result;
		} catch (error) {
			// 隐藏进度通知
			if (progressNotice) {
				progressNotice.hide();
			}

			// 显示错误通知
			new Notice(`批量保存失败: ${error instanceof Error ? error.message : "未知错误"}`, 5000);

			throw error;
		}
	}
}
