/**
 * 增量同步状态跟踪器
 * 记录每张卡片的同步时间戳，实现增量同步功能
 */

import type { Card } from '../../data/types';
import type AnkiPlugin from '../../main';

/**
 * 同步时间戳记录
 */
export interface SyncTimestamp {
  cardId: string;
  lastSyncTime: number;  // Unix 时间戳（毫秒）
  ankiNoteId?: number;  // Anki 笔记 ID（如果已同步到 Anki）
  direction: 'import' | 'export' | 'both';  // 同步方向
}

/**
 * 增量同步状态
 */
export interface IncrementalSyncState {
  timestamps: Record<string, SyncTimestamp>;
  lastFullSync: number;  // 上次全量同步时间
}

/**
 * 增量同步跟踪器
 */
export class IncrementalSyncTracker {
  private state: IncrementalSyncState = {
    timestamps: {},
    lastFullSync: 0
  };

  constructor(private plugin: AnkiPlugin) {
    this.load();
  }

  /**
   * 从插件数据中加载同步状态
   */
  private load(): void {
    const savedState = this.plugin.settings.ankiConnect?.incrementalSyncState;
    if (savedState) {
      this.state = savedState;
      console.log(
        '[IncrementalSyncTracker] 已加载同步状态，共',
        Object.keys(this.state.timestamps).length,
        '条记录'
      );
    } else {
      console.log('[IncrementalSyncTracker] 无已保存的同步状态，使用空状态');
    }
  }

  /**
   * 持久化同步状态到插件数据
   */
  async persist(): Promise<void> {
    if (!this.plugin.settings.ankiConnect) {
      console.error('[IncrementalSyncTracker] AnkiConnect 配置不存在，无法保存');
      return;
    }

    this.plugin.settings.ankiConnect.incrementalSyncState = this.state;
    await this.plugin.saveSettings();
    
    console.log(
      '[IncrementalSyncTracker] 已保存同步状态，共',
      Object.keys(this.state.timestamps).length,
      '条记录'
    );
  }

  /**
   * 筛选出需要同步的变更卡片
   * @param cards 所有卡片
   * @param ankiModMap Anki 端的修改时间映射 (cardId -> ankiMod)
   * @returns 需要同步的卡片列表
   */
  getChangedCards(
    cards: Card[],
    ankiModMap?: Map<string, number>
  ): Card[] {
    const changedCards: Card[] = [];

    for (const card of cards) {
      if (this.shouldSync(card, ankiModMap?.get(card.id))) {
        changedCards.push(card);
      }
    }

    console.log(
      '[IncrementalSyncTracker] 筛选结果:',
      changedCards.length,
      '/',
      cards.length,
      '张卡片需要同步'
    );

    return changedCards;
  }

  /**
   * 判断单张卡片是否需要同步
   */
  shouldSync(card: Card, ankiMod?: number): boolean {
    const timestamp = this.state.timestamps[card.id];
    
    // 如果没有同步记录，需要同步
    if (!timestamp) {
      return true;
    }

    const lastSyncTime = timestamp.lastSyncTime;

    // 检查本地卡片是否有修改
    const cardMod = card.lastModified || card.createdAt || 0;
    if (cardMod > lastSyncTime) {
      return true;
    }

    // 检查 Anki 端是否有修改
    if (ankiMod !== undefined && ankiMod > lastSyncTime) {
      return true;
    }

    return false;
  }

  /**
   * 更新卡片的同步时间戳
   */
  updateSyncTimestamp(
    cardId: string,
    options: {
      ankiNoteId?: number;
      direction: 'import' | 'export' | 'both';
      syncTime?: number;
    }
  ): void {
    const now = options.syncTime || Date.now();

    this.state.timestamps[cardId] = {
      cardId,
      lastSyncTime: now,
      ankiNoteId: options.ankiNoteId,
      direction: options.direction
    };
  }

  /**
   * 批量更新同步时间戳
   */
  updateBatchTimestamps(
    cards: Card[],
    options: {
      direction: 'import' | 'export' | 'both';
      ankiNoteIdMap?: Map<string, number>;
    }
  ): void {
    const now = Date.now();

    for (const card of cards) {
      this.updateSyncTimestamp(card.id, {
        ankiNoteId: options.ankiNoteIdMap?.get(card.id),
        direction: options.direction,
        syncTime: now
      });
    }

    console.log('[IncrementalSyncTracker] 已更新', cards.length, '张卡片的同步时间戳');
  }

  /**
   * 获取卡片的同步信息
   */
  getSyncInfo(cardId: string): SyncTimestamp | undefined {
    return this.state.timestamps[cardId];
  }

  /**
   * 标记为全量同步
   */
  markFullSync(): void {
    this.state.lastFullSync = Date.now();
    console.log('[IncrementalSyncTracker] 已标记全量同步时间');
  }

  /**
   * 获取上次全量同步时间
   */
  getLastFullSyncTime(): number {
    return this.state.lastFullSync;
  }

  /**
   * 清理过期的同步记录
   * @param maxAge 最大保留时间（毫秒），默认 90 天
   */
  cleanupOldRecords(maxAge: number = 90 * 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    const cutoffTime = now - maxAge;
    let cleanedCount = 0;

    const newTimestamps: Record<string, SyncTimestamp> = {};

    for (const [cardId, timestamp] of Object.entries(this.state.timestamps)) {
      if (timestamp.lastSyncTime >= cutoffTime) {
        newTimestamps[cardId] = timestamp;
      } else {
        cleanedCount++;
      }
    }

    this.state.timestamps = newTimestamps;

    if (cleanedCount > 0) {
      console.log('[IncrementalSyncTracker] 已清理', cleanedCount, '条过期记录');
    }

    return cleanedCount;
  }

  /**
   * 重置所有同步状态（强制全量同步）
   */
  reset(): void {
    this.state = {
      timestamps: {},
      lastFullSync: 0
    };
    console.log('[IncrementalSyncTracker] 同步状态已重置');
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalRecords: number;
    lastFullSync: number;
    importCount: number;
    exportCount: number;
    bothCount: number;
  } {
    const timestamps = Object.values(this.state.timestamps);
    
    return {
      totalRecords: timestamps.length,
      lastFullSync: this.state.lastFullSync,
      importCount: timestamps.filter(t => t.direction === 'import').length,
      exportCount: timestamps.filter(t => t.direction === 'export').length,
      bothCount: timestamps.filter(t => t.direction === 'both').length
    };
  }
}




