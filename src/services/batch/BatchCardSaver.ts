/**
 * 批量卡片保存器
 * 负责将卡片批量保存到数据库
 */

import { Notice } from 'obsidian';
import type { AnkiDataStorage } from '../../data/storage';
import type { GlobalDataCache } from '../GlobalDataCache';
import type { Card } from '../../types/card-types';
import type {
  SaveOptions,
  SaveResult,
  BatchSaveResult
} from '../../types/converter-types';

/**
 * 批量卡片保存器
 */
export class BatchCardSaver {
  private storage: AnkiDataStorage;
  private globalCache: GlobalDataCache;

  constructor(storage: AnkiDataStorage, globalCache: GlobalDataCache) {
    this.storage = storage;
    this.globalCache = globalCache;
  }

  /**
   * 保存单张卡片
   */
  async saveCard(card: Card): Promise<SaveResult> {
    try {
      console.log(`[BatchCardSaver] 保存卡片: ${card.id}`);
      
      // 调用数据存储的保存方法
      const response = await this.storage.saveCard(card);

      if (response.success && response.data) {
        // 更新全局缓存
        await this.globalCache.invalidateCardCache(card.deckId);
        
        return {
          success: true,
          card: response.data
        };
      } else {
        return {
          success: false,
          error: response.error || '保存失败'
        };
      }

    } catch (error) {
      console.error('[BatchCardSaver] 保存卡片失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知保存错误'
      };
    }
  }

  /**
   * 批量保存卡片
   */
  async saveBatch(
    cards: Card[],
    options: SaveOptions = {}
  ): Promise<BatchSaveResult> {
    const startTime = Date.now();
    const savedCards: Card[] = [];
    const errors: BatchSaveResult['errors'] = [];
    let successCount = 0;
    let failureCount = 0;

    console.log(`[BatchCardSaver] 开始批量保存 ${cards.length} 张卡片`);

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
          console.log(`[BatchCardSaver] ✅ 卡片 ${i + 1}/${cards.length} 保存成功`);
        } else {
          failureCount++;
          errors.push({
            cardId: card.id,
            error: result.error || '未知错误'
          });
          console.error(`[BatchCardSaver] ❌ 卡片 ${i + 1}/${cards.length} 保存失败:`, result.error);

          // 如果不允许继续，则中断
          if (!options.continueOnError) {
            break;
          }
        }

      } catch (error) {
        failureCount++;
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        errors.push({
          cardId: card.id,
          error: errorMessage,
          originalError: error instanceof Error ? error : undefined
        });
        console.error(`[BatchCardSaver] ❌ 卡片 ${i + 1}/${cards.length} 保存异常:`, error);

        // 如果不允许继续，则中断
        if (!options.continueOnError) {
          break;
        }
      }
    }

    const duration = Date.now() - startTime;

    console.log(`[BatchCardSaver] 批量保存完成: 成功 ${successCount}/${cards.length}, 失败 ${failureCount}, 耗时 ${duration}ms`);

    return {
      success: failureCount === 0,
      successCount,
      failureCount,
      savedCards,
      errors,
      duration
    };
  }

  /**
   * 批量保存并显示进度通知
   */
  async saveBatchWithNotice(
    cards: Card[],
    options: SaveOptions = {}
  ): Promise<BatchSaveResult> {
    let progressNotice: Notice | null = null;

    try {
      // 显示初始通知
      progressNotice = new Notice(`正在保存 ${cards.length} 张卡片...`, 0);

      // 带进度回调的保存
      const result = await this.saveBatch(cards, {
        ...options,
        continueOnError: true,  // 批量操作时继续处理其他卡片
        onProgress: (current, total) => {
          if (progressNotice) {
            progressNotice.setMessage(`正在保存卡片 ${current}/${total}...`);
          }
        }
      });

      // 隐藏进度通知
      if (progressNotice) {
        progressNotice.hide();
        progressNotice = null;
      }

      // 显示结果通知
      if (result.success) {
        new Notice(`✅ 成功保存 ${result.successCount} 张卡片`, 3000);
      } else {
        new Notice(
          `⚠️ 保存完成: ${result.successCount} 成功, ${result.failureCount} 失败`,
          5000
        );
      }

      return result;

    } catch (error) {
      // 隐藏进度通知
      if (progressNotice) {
        progressNotice.hide();
      }

      // 显示错误通知
      new Notice(`❌ 批量保存失败: ${error instanceof Error ? error.message : '未知错误'}`, 5000);

      throw error;
    }
  }
}



