/**
 * 导入映射管理器
 * 
 * 管理Anki卡片与Tuanki卡片之间的映射关系
 * 用于增量同步、UUID追踪和冲突检测
 * 
 * @module services/ankiconnect
 */

import type AnkiPlugin from '../../main';
import type { ImportMapping, ConflictResolution } from '../../data/types';
import * as crypto from 'crypto';

/**
 * 导入映射管理器
 */
export class ImportMappingManager {
  private plugin: AnkiPlugin;
  private mappings: Map<string, ImportMapping>; // key: uuid
  private ankiNoteIndex: Map<number, string>; // ankiNoteId -> uuid
  private tuankiCardIndex: Map<string, string>; // tuankiCardId -> uuid

  constructor(plugin: AnkiPlugin) {
    this.plugin = plugin;
    this.mappings = new Map();
    this.ankiNoteIndex = new Map();
    this.tuankiCardIndex = new Map();
    
    // 加载现有映射
    this.loadFromStorage();
  }

  /**
   * 记录新的导入映射
   */
  async recordMapping(
    tuankiCardId: string,
    ankiNoteId: number,
    uuid: string,
    contentHash: string = '',
    ankiModelId?: number,
    ankiModelName?: string
  ): Promise<void> {
    const now = new Date().toISOString();
    
    const mapping: ImportMapping = {
      id: uuid,
      tuankiCardId,
      ankiNoteId,
      uuid,
      lastSyncTime: now,
      lastModifiedInTuanki: now,
      lastModifiedInAnki: now,
      syncVersion: 1,
      contentHash: contentHash || '',
      isBidirectional: false,
      ankiModelId,
      ankiModelName,
      syncStatus: 'synced'
    };

    this.mappings.set(uuid, mapping);
    this.ankiNoteIndex.set(ankiNoteId, uuid);
    this.tuankiCardIndex.set(tuankiCardId, uuid);

    await this.saveToStorage();
    
    console.log(`✓ 记录导入映射: Anki Note ${ankiNoteId} -> Tuanki Card ${tuankiCardId} (UUID: ${uuid})`);
  }

  /**
   * 更新现有映射
   */
  async updateMapping(
    uuid: string,
    updates: Partial<ImportMapping>
  ): Promise<void> {
    const mapping = this.mappings.get(uuid);
    if (!mapping) {
      throw new Error(`映射不存在: ${uuid}`);
    }

    // 合并更新
    const updated: ImportMapping = {
      ...mapping,
      ...updates,
      uuid, // 确保uuid不被修改
      id: uuid
    };

    this.mappings.set(uuid, updated);
    await this.saveToStorage();
    
    console.log(`✓ 更新映射: ${uuid}`);
  }

  /**
   * 通过Anki Note ID查找映射
   */
  findByAnkiNoteId(ankiNoteId: number): ImportMapping | undefined {
    const uuid = this.ankiNoteIndex.get(ankiNoteId);
    if (!uuid) {
      return undefined;
    }
    return this.mappings.get(uuid);
  }

  /**
   * 通过Tuanki卡片ID查找映射
   */
  findByTuankiCardId(tuankiCardId: string): ImportMapping | undefined {
    const uuid = this.tuankiCardIndex.get(tuankiCardId);
    if (!uuid) {
      return undefined;
    }
    return this.mappings.get(uuid);
  }

  /**
   * 通过UUID查找映射
   */
  findByUUID(uuid: string): ImportMapping | undefined {
    return this.mappings.get(uuid);
  }

  /**
   * 删除映射
   */
  async removeMapping(uuid: string): Promise<void> {
    const mapping = this.mappings.get(uuid);
    if (!mapping) {
      return;
    }

    this.mappings.delete(uuid);
    this.ankiNoteIndex.delete(mapping.ankiNoteId);
    this.tuankiCardIndex.delete(mapping.tuankiCardId);

    await this.saveToStorage();
    
    console.log(`✓ 删除映射: ${uuid}`);
  }

  /**
   * 获取所有映射
   */
  getAllMappings(): ImportMapping[] {
    return Array.from(this.mappings.values());
  }

  /**
   * 获取指定牌组的映射
   */
  getMappingsByDeck(deckId: string): ImportMapping[] {
    // 需要访问DataStorage获取卡片信息
    // 暂时返回所有映射，后续可优化
    return this.getAllMappings();
  }

  /**
   * 计算内容哈希
   */
  static calculateContentHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * 清理无效映射
   */
  async cleanup(): Promise<number> {
    const dataStorage = this.plugin.dataStorage;
    if (!dataStorage) {
      return 0;
    }

    let cleanedCount = 0;
    const validMappings = new Map<string, ImportMapping>();

    // 获取所有现有卡片ID
    const allDecks = await dataStorage.getAllDecks();
    const allCardIds = new Set<string>();
    
    for (const deck of allDecks) {
      const cards = await dataStorage.getCardsByDeck(deck.id);
      cards.forEach(card => allCardIds.add(card.id));
    }

    // 检查每个映射的有效性
    for (const [uuid, mapping] of this.mappings) {
      if (allCardIds.has(mapping.tuankiCardId)) {
        validMappings.set(uuid, mapping);
      } else {
        cleanedCount++;
        console.log(`清理无效映射: ${uuid} (卡片 ${mapping.tuankiCardId} 不存在)`);
      }
    }

    this.mappings = validMappings;
    this.rebuildIndices();
    await this.saveToStorage();

    console.log(`✓ 清理完成: 移除 ${cleanedCount} 个无效映射`);
    return cleanedCount;
  }

  /**
   * 重建索引
   */
  private rebuildIndices(): void {
    this.ankiNoteIndex.clear();
    this.tuankiCardIndex.clear();

    for (const mapping of this.mappings.values()) {
      this.ankiNoteIndex.set(mapping.ankiNoteId, mapping.uuid);
      this.tuankiCardIndex.set(mapping.tuankiCardId, mapping.uuid);
    }
  }

  /**
   * 保存到存储
   */
  private async saveToStorage(): Promise<void> {
    try {
      const mappingsArray = Array.from(this.mappings.values());
      const mappingsData = {
        version: '1.0',
        lastUpdated: new Date().toISOString(),
        mappings: mappingsArray
      };

      // 保存到独立文件 importMappings.json
      const dataPath = this.plugin.manifest.dir;
      const filePath = `${dataPath}/importMappings.json`;
      
      await this.plugin.app.vault.adapter.write(
        filePath,
        JSON.stringify(mappingsData, null, 2)
      );
      
      console.log(`✓ 导入映射已保存: ${mappingsArray.length} 条记录`);
    } catch (error) {
      console.error('❌ 保存导入映射失败:', error);
      throw error;
    }
  }

  /**
   * 从存储加载
   */
  private async loadFromStorage(): Promise<void> {
    try {
      const dataPath = this.plugin.manifest.dir;
      const filePath = `${dataPath}/importMappings.json`;
      
      // 检查文件是否存在
      const exists = await this.plugin.app.vault.adapter.exists(filePath);
      if (!exists) {
        console.log('导入映射文件不存在，创建新映射');
        return;
      }

      const content = await this.plugin.app.vault.adapter.read(filePath);
      const data = JSON.parse(content);

      // 加载映射
      if (data.mappings && Array.isArray(data.mappings)) {
        for (const mapping of data.mappings) {
          this.mappings.set(mapping.uuid, mapping);
        }
        
        this.rebuildIndices();
        
        console.log(`✓ 已加载 ${this.mappings.size} 条导入映射`);
      }
    } catch (error) {
      console.error('❌ 加载导入映射失败:', error);
      // 不抛出错误，允许继续运行
    }
  }

  /**
   * 统计信息
   */
  getStats(): {
    totalMappings: number;
    syncedMappings: number;
    conflictMappings: number;
    bidirectionalMappings: number;
  } {
    const all = Array.from(this.mappings.values());
    
    return {
      totalMappings: all.length,
      syncedMappings: all.filter(m => m.syncStatus === 'synced').length,
      conflictMappings: all.filter(m => m.syncStatus === 'conflict').length,
      bidirectionalMappings: all.filter(m => m.isBidirectional).length
    };
  }
}


