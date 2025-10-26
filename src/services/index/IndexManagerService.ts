/**
 * 索引管理服务
 * 为高频查询建立索引，提升性能
 */

import type { Plugin } from 'obsidian';
import type { Card } from '../../data/types';

interface CardBySourceIndex {
  [sourceFile: string]: {
    cardIds: string[];
    lastUpdated: string;
  };
}

interface MediaByHashIndex {
  [hash: string]: string; // mediaId
}

/**
 * 索引管理服务
 * 
 * 核心功能：
 * - sourceFile → cardIds 索引（快速查询源文档的卡片）
 * - hash → mediaId 索引（快速去重媒体文件）
 * - 自动维护索引一致性
 * - 支持索引重建
 */
export class IndexManagerService {
  private plugin: Plugin;
  private basePath = 'tuanki/indices';
  
  private cardBySourceIndex: CardBySourceIndex = {};
  private mediaByHashIndex: MediaByHashIndex = {};

  constructor(plugin: Plugin) {
    this.plugin = plugin;
  }

  /**
   * 初始化索引系统
   */
  async initialize(): Promise<void> {
    console.log('Initializing index manager...');
    
    await this.ensureDir(this.basePath);
    await this.loadIndices();
    
    console.log('✅ Index manager initialized');
  }

  /**
   * 更新卡片索引
   * 
   * @param card - 卡片对象
   */
  async updateCardIndex(card: Card): Promise<void> {
    if (!card.sourceFile) return;

    // 初始化索引条目
    if (!this.cardBySourceIndex[card.sourceFile]) {
      this.cardBySourceIndex[card.sourceFile] = {
        cardIds: [],
        lastUpdated: ''
      };
    }

    const index = this.cardBySourceIndex[card.sourceFile];
    
    // 添加卡片ID（避免重复）
    if (!index.cardIds.includes(card.id)) {
      index.cardIds.push(card.id);
    }
    
    index.lastUpdated = new Date().toISOString();

    // 保存索引
    await this.saveIndex('card-by-source', this.cardBySourceIndex);
  }

  /**
   * 删除卡片索引
   * 
   * @param cardId - 卡片ID
   * @param sourceFile - 源文件路径
   */
  async removeCardIndex(cardId: string, sourceFile?: string): Promise<void> {
    if (!sourceFile) return;

    const index = this.cardBySourceIndex[sourceFile];
    if (index) {
      index.cardIds = index.cardIds.filter(id => id !== cardId);
      
      // 如果没有卡片了，删除整个索引条目
      if (index.cardIds.length === 0) {
        delete this.cardBySourceIndex[sourceFile];
      } else {
        index.lastUpdated = new Date().toISOString();
      }
      
      await this.saveIndex('card-by-source', this.cardBySourceIndex);
    }
  }

  /**
   * 按源文件快速查询卡片IDs
   * 
   * @param sourceFile - 源文件路径
   * @returns 卡片ID数组
   */
  getCardIdsBySourceFile(sourceFile: string): string[] {
    return this.cardBySourceIndex[sourceFile]?.cardIds || [];
  }

  /**
   * 获取所有索引的源文件
   */
  getAllIndexedSourceFiles(): string[] {
    return Object.keys(this.cardBySourceIndex);
  }

  /**
   * 更新媒体哈希索引
   * 
   * @param hash - 文件哈希
   * @param mediaId - 媒体ID
   */
  async updateMediaHashIndex(hash: string, mediaId: string): Promise<void> {
    this.mediaByHashIndex[hash] = mediaId;
    await this.saveIndex('media-by-hash', this.mediaByHashIndex);
  }

  /**
   * 删除媒体哈希索引
   * 
   * @param hash - 文件哈希
   */
  async removeMediaHashIndex(hash: string): Promise<void> {
    delete this.mediaByHashIndex[hash];
    await this.saveIndex('media-by-hash', this.mediaByHashIndex);
  }

  /**
   * 按哈希查询媒体ID
   * 
   * @param hash - 文件哈希
   * @returns 媒体ID或undefined
   */
  getMediaIdByHash(hash: string): string | undefined {
    return this.mediaByHashIndex[hash];
  }

  /**
   * 重建所有索引
   * 
   * @param allCards - 所有卡片
   * @param getAllMedia - 获取所有媒体的函数
   */
  async rebuildIndices(
    allCards: Card[],
    getAllMedia: () => Promise<Array<{ id: string; hash: string }>>
  ): Promise<void> {
    console.log('Rebuilding all indices...');

    // 重建卡片索引
    this.cardBySourceIndex = {};
    
    for (const card of allCards) {
      if (card.sourceFile) {
        if (!this.cardBySourceIndex[card.sourceFile]) {
          this.cardBySourceIndex[card.sourceFile] = {
            cardIds: [],
            lastUpdated: ''
          };
        }
        
        this.cardBySourceIndex[card.sourceFile].cardIds.push(card.id);
        this.cardBySourceIndex[card.sourceFile].lastUpdated = new Date().toISOString();
      }
    }
    
    await this.saveIndex('card-by-source', this.cardBySourceIndex);
    console.log(`✅ Rebuilt card-by-source index (${Object.keys(this.cardBySourceIndex).length} files)`);

    // 重建媒体哈希索引
    this.mediaByHashIndex = {};
    
    try {
      const allMedia = await getAllMedia();
      
      for (const media of allMedia) {
        this.mediaByHashIndex[media.hash] = media.id;
      }
      
      await this.saveIndex('media-by-hash', this.mediaByHashIndex);
      console.log(`✅ Rebuilt media-by-hash index (${Object.keys(this.mediaByHashIndex).length} files)`);
    } catch (error) {
      console.error('Failed to rebuild media index:', error);
    }

    console.log('✅ All indices rebuilt successfully');
  }

  /**
   * 验证索引完整性
   * 
   * @param allCards - 所有卡片
   * @returns 验证结果
   */
  validateIndices(allCards: Card[]): {
    isValid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // 验证卡片索引
    const indexedCardIds = new Set<string>();
    for (const entry of Object.values(this.cardBySourceIndex)) {
      entry.cardIds.forEach(id => indexedCardIds.add(id));
    }

    const actualCardIds = new Set(
      allCards.filter(c => c.sourceFile).map(c => c.id)
    );

    // 检查缺失的索引
    for (const cardId of actualCardIds) {
      if (!indexedCardIds.has(cardId)) {
        issues.push(`Card ${cardId} is missing from index`);
      }
    }

    // 检查多余的索引
    for (const cardId of indexedCardIds) {
      if (!actualCardIds.has(cardId)) {
        issues.push(`Card ${cardId} in index but not in actual cards`);
      }
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }

  /**
   * 获取索引统计信息
   */
  getStats(): {
    cardBySourceCount: number;
    mediaByHashCount: number;
    totalIndexedCards: number;
  } {
    const totalIndexedCards = Object.values(this.cardBySourceIndex)
      .reduce((sum, entry) => sum + entry.cardIds.length, 0);

    return {
      cardBySourceCount: Object.keys(this.cardBySourceIndex).length,
      mediaByHashCount: Object.keys(this.mediaByHashIndex).length,
      totalIndexedCards
    };
  }

  /**
   * 清空所有索引
   */
  async clearAllIndices(): Promise<void> {
    console.log('Clearing all indices...');
    
    this.cardBySourceIndex = {};
    this.mediaByHashIndex = {};
    
    await this.saveIndex('card-by-source', this.cardBySourceIndex);
    await this.saveIndex('media-by-hash', this.mediaByHashIndex);
    
    console.log('✅ All indices cleared');
  }

  // ===== 私有辅助方法 =====

  /**
   * 加载所有索引
   */
  private async loadIndices(): Promise<void> {
    // 加载卡片索引
    try {
      const cardBySourceContent = await this.plugin.app.vault.adapter.read(
        `${this.basePath}/card-by-source.json`
      );
      this.cardBySourceIndex = JSON.parse(cardBySourceContent);
      console.log(`Loaded card-by-source index (${Object.keys(this.cardBySourceIndex).length} files)`);
    } catch {
      this.cardBySourceIndex = {};
      console.log('No existing card-by-source index found');
    }

    // 加载媒体哈希索引
    try {
      const mediaByHashContent = await this.plugin.app.vault.adapter.read(
        `${this.basePath}/media-by-hash.json`
      );
      this.mediaByHashIndex = JSON.parse(mediaByHashContent);
      console.log(`Loaded media-by-hash index (${Object.keys(this.mediaByHashIndex).length} files)`);
    } catch {
      this.mediaByHashIndex = {};
      console.log('No existing media-by-hash index found');
    }
  }

  /**
   * 保存索引
   */
  private async saveIndex(name: string, data: any): Promise<void> {
    const filePath = `${this.basePath}/${name}.json`;
    await this.plugin.app.vault.adapter.write(
      filePath,
      JSON.stringify(data, null, 2)
    );
  }

  /**
   * 确保目录存在
   */
  private async ensureDir(path: string): Promise<void> {
    try {
      await this.plugin.app.vault.createFolder(path);
    } catch {
      // 目录已存在
    }
  }
}



