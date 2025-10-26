/**
 * 同步状态跟踪器
 * 负责管理卡片同步元数据，支持增量同步
 */

import type { CardSyncMetadata } from '../../components/settings/types/settings-types';
import type { Card } from '../../data/types';

export interface SyncChange {
  cardId: string;
  changeType: 'content' | 'media' | 'both';
  hasConflict: boolean;
}

export class SyncStateTracker {
  private metadata: Map<string, CardSyncMetadata>;

  constructor(initialMetadata?: Record<string, CardSyncMetadata>) {
    this.metadata = new Map();
    
    if (initialMetadata) {
      Object.entries(initialMetadata).forEach(([key, value]) => {
        this.metadata.set(key, value);
      });
    }
  }

  /**
   * 计算卡片内容哈希
   */
  private calculateContentHash(card: Card): string {
    const content = JSON.stringify({
      front: card.fields?.front || card.fields?.question || '',
      back: card.fields?.back || card.fields?.answer || '',
      extra: card.extra || '',
      tags: card.tags || []
    });
    
    return this.hash(content);
  }

  /**
   * 计算媒体文件哈希
   */
  private calculateMediaHash(card: Card): string | undefined {
    const mediaFields = [
      card.fields?.front || card.fields?.question || '', 
      card.fields?.back || card.fields?.answer || '', 
      card.extra || ''
    ].filter(Boolean);
    const mediaReferences = mediaFields
      .flatMap(field => this.extractMediaReferences(field))
      .sort()
      .join('|');
    
    return mediaReferences ? this.hash(mediaReferences) : undefined;
  }

  /**
   * 提取媒体文件引用
   */
  private extractMediaReferences(content: string): string[] {
    const references: string[] = [];
    
    // 匹配 Markdown 图片: ![alt](path)
    const mdImages = content.match(/!\[.*?\]\((.*?)\)/g) || [];
    references.push(...mdImages.map(m => m.match(/\((.*?)\)/)?.[1] || ''));
    
    // 匹配 Obsidian 嵌入: ![[file]]
    const obsidianEmbeds = content.match(/!\[\[(.*?)\]\]/g) || [];
    references.push(...obsidianEmbeds.map(m => m.match(/\[\[(.*?)\]\]/)?.[1] || ''));
    
    // 匹配 HTML img 标签
    const htmlImages = content.match(/<img[^>]+src="([^">]+)"/g) || [];
    references.push(...htmlImages.map(m => m.match(/src="([^">]+)"/)?.[1] || ''));
    
    // 匹配音频和视频标签
    const audioVideo = content.match(/<(audio|video)[^>]+src="([^">]+)"/g) || [];
    references.push(...audioVideo.map(m => m.match(/src="([^">]+)"/)?.[1] || ''));
    
    return references.filter(Boolean);
  }

  /**
   * 简单哈希函数（用于内容比较）
   */
  private hash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * 初始化或更新卡片同步元数据
   */
  initializeMetadata(
    card: Card,
    ankiNoteId?: number,
    isBidirectional: boolean = false
  ): CardSyncMetadata {
    const now = new Date().toISOString();
    const contentHash = this.calculateContentHash(card);
    const mediaHash = this.calculateMediaHash(card);

    const metadata: CardSyncMetadata = {
      cardId: card.id,
      uuid: card.uuid || this.generateUUID(),
      lastSyncTime: now,
      lastModifiedInTuanki: card.lastModified || now,
      syncVersion: 1,
      contentHash,
      mediaHash,
      ankiNoteId,
      isBidirectional
    };

    this.metadata.set(card.id, metadata);
    return metadata;
  }

  /**
   * 更新同步元数据（同步成功后调用）
   */
  updateAfterSync(
    cardId: string,
    ankiNoteId?: number,
    ankiModTime?: string
  ): void {
    const existing = this.metadata.get(cardId);
    if (!existing) {
      throw new Error(`卡片 ${cardId} 的同步元数据不存在`);
    }

    existing.lastSyncTime = new Date().toISOString();
    existing.syncVersion += 1;
    
    if (ankiNoteId !== undefined) {
      existing.ankiNoteId = ankiNoteId;
    }
    
    if (ankiModTime) {
      existing.lastModifiedInAnki = ankiModTime;
    }

    this.metadata.set(cardId, existing);
  }

  /**
   * 检测卡片是否有变更
   */
  detectChanges(card: Card): SyncChange | null {
    const existing = this.metadata.get(card.id);
    
    if (!existing) {
      // 新卡片，需要同步
      return {
        cardId: card.id,
        changeType: 'both',
        hasConflict: false
      };
    }

    const currentContentHash = this.calculateContentHash(card);
    const currentMediaHash = this.calculateMediaHash(card);

    const contentChanged = currentContentHash !== existing.contentHash;
    const mediaChanged = currentMediaHash !== existing.mediaHash;

    if (!contentChanged && !mediaChanged) {
      return null; // 无变更
    }

    return {
      cardId: card.id,
      changeType: contentChanged && mediaChanged ? 'both' :
                 contentChanged ? 'content' : 'media',
      hasConflict: false  // 单向同步，无冲突
    };
  }

  /**
   * 批量检测变更
   */
  detectBatchChanges(cards: Card[]): SyncChange[] {
    return cards
      .map(card => this.detectChanges(card))
      .filter((change): change is SyncChange => change !== null);
  }

  /**
   * 获取需要同步的卡片（增量同步）
   */
  getCardsToSync(cards: Card[], maxCards?: number): Card[] {
    const changes = this.detectBatchChanges(cards);
    const cardsToSync = cards.filter(card =>
      changes.some(change => change.cardId === card.id)
    );

    // 按修改时间排序，优先同步最近修改的
    cardsToSync.sort((a, b) => {
      const timeA = new Date(a.lastModified || 0).getTime();
      const timeB = new Date(b.lastModified || 0).getTime();
      return timeB - timeA;
    });

    return maxCards ? cardsToSync.slice(0, maxCards) : cardsToSync;
  }

  /**
   * 获取卡片的同步元数据
   */
  getMetadata(cardId: string): CardSyncMetadata | undefined {
    return this.metadata.get(cardId);
  }

  /**
   * 获取所有同步元数据
   */
  getAllMetadata(): Record<string, CardSyncMetadata> {
    const result: Record<string, CardSyncMetadata> = {};
    this.metadata.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  /**
   * 删除卡片的同步元数据
   */
  removeMetadata(cardId: string): void {
    this.metadata.delete(cardId);
  }

  /**
   * 清除所有元数据
   */
  clearAllMetadata(): void {
    this.metadata.clear();
  }

  /**
   * 生成 UUID
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * 统计信息
   */
  getStatistics(): {
    totalCards: number;
    bidirectionalCards: number;
    withAnkiId: number;
    averageSyncVersion: number;
  } {
    const metadataArray = Array.from(this.metadata.values());
    
    return {
      totalCards: metadataArray.length,
      bidirectionalCards: metadataArray.filter(m => m.isBidirectional).length,
      withAnkiId: metadataArray.filter(m => m.ankiNoteId !== undefined).length,
      averageSyncVersion: metadataArray.length > 0
        ? metadataArray.reduce((sum, m) => sum + m.syncVersion, 0) / metadataArray.length
        : 0
    };
  }
}

