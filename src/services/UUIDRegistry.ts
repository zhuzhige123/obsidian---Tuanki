/**
 * UUID注册表
 * 维护UUID到卡片和标注块的映射关系，支持双向同步
 */

import { Card, AnnotationSource } from '../data/types';

/**
 * UUID注册表类
 * 提供UUID的快速查询和管理功能
 */
export class UUIDRegistry {
  private static instance: UUIDRegistry;

  // UUID → 卡片映射（懒加载缓存）
  private uuidToCard: Map<string, Card> = new Map();

  // UUID → 标注源列表
  private uuidToSources: Map<string, AnnotationSource[]> = new Map();

  // 数据存储服务（需要注入）
  private dataStorage: any;

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): UUIDRegistry {
    if (!UUIDRegistry.instance) {
      UUIDRegistry.instance = new UUIDRegistry();
    }
    return UUIDRegistry.instance;
  }

  /**
   * 注入数据存储依赖
   */
  public injectDataStorage(dataStorage: any): void {
    this.dataStorage = dataStorage;
  }

  /**
   * 通过UUID查找卡片（懒加载）
   * @param uuid 卡片UUID
   * @returns 卡片对象，如果不存在则返回null
   */
  public async findCardByUUID(uuid: string): Promise<Card | null> {
    // 1. 先查内存缓存
    if (this.uuidToCard.has(uuid)) {
      console.log(`✅ [UUIDRegistry] 从缓存中找到卡片: ${uuid}`);
      return this.uuidToCard.get(uuid)!;
    }

    // 2. 缓存未命中，查询数据库
    if (!this.dataStorage) {
      console.warn('⚠️ [UUIDRegistry] DataStorage未注入');
      return null;
    }

    try {
      console.log(`🔍 [UUIDRegistry] 从数据库查询UUID: ${uuid}`);
      const card = await this.dataStorage.getCardByUUID(uuid);
      
      if (card) {
        // 更新缓存
        this.uuidToCard.set(uuid, card);
        console.log(`✅ [UUIDRegistry] 找到卡片并缓存: ${uuid}`);
      } else {
        console.log(`ℹ️ [UUIDRegistry] UUID不存在: ${uuid}`);
      }
      
      return card;
    } catch (error) {
      console.error(`❌ [UUIDRegistry] 查询卡片失败:`, error);
      return null;
    }
  }

  /**
   * 注册标注块位置
   * @param uuid 标注块的UUID
   * @param source 标注源信息
   */
  public registerAnnotation(uuid: string, source: AnnotationSource): void {
    if (!uuid) {
      console.warn('⚠️ [UUIDRegistry] 尝试注册空UUID');
      return;
    }

    // 初始化UUID的源列表
    if (!this.uuidToSources.has(uuid)) {
      this.uuidToSources.set(uuid, []);
    }

    const sources = this.uuidToSources.get(uuid)!;

    // 去重：同一文件+blockId只保留一个
    const existingIndex = sources.findIndex(s => 
      s.filePath === source.filePath && s.blockId === source.blockId
    );

    if (existingIndex >= 0) {
      // 更新现有记录
      sources[existingIndex] = source;
      console.log(`🔄 [UUIDRegistry] 更新标注位置: ${uuid} @ ${source.filePath}`);
    } else {
      // 新增记录
      sources.push(source);
      console.log(`📌 [UUIDRegistry] 注册标注位置: ${uuid} @ ${source.filePath}`);
    }
  }

  /**
   * 通过UUID查找所有标注块位置
   * @param uuid 卡片UUID
   * @returns 标注源列表
   */
  public findAnnotationsByUUID(uuid: string): AnnotationSource[] {
    return this.uuidToSources.get(uuid) || [];
  }

  /**
   * 移除标注块位置
   * @param uuid 标注块UUID
   * @param filePath 文件路径
   * @param blockId 块ID
   */
  public unregisterAnnotation(uuid: string, filePath: string, blockId: string): void {
    const sources = this.uuidToSources.get(uuid);
    if (!sources) return;

    const filtered = sources.filter(s => 
      !(s.filePath === filePath && s.blockId === blockId)
    );

    if (filtered.length === 0) {
      this.uuidToSources.delete(uuid);
      console.log(`🗑️ [UUIDRegistry] UUID已无标注: ${uuid}`);
    } else {
      this.uuidToSources.set(uuid, filtered);
      console.log(`🗑️ [UUIDRegistry] 移除标注位置: ${uuid} @ ${filePath}`);
    }
  }

  /**
   * 更新文件路径（处理文件重命名）
   * @param oldPath 旧路径
   * @param newPath 新路径
   */
  public updateFilePath(oldPath: string, newPath: string): void {
    console.log(`🔄 [UUIDRegistry] 更新文件路径: ${oldPath} → ${newPath}`);
    
    let updateCount = 0;
    
    for (const [uuid, sources] of this.uuidToSources) {
      for (const source of sources) {
        if (source.filePath === oldPath) {
          source.filePath = newPath;
          updateCount++;
        }
      }
    }
    
    console.log(`✅ [UUIDRegistry] 更新了 ${updateCount} 个标注位置`);
  }

  /**
   * 更新卡片缓存
   * @param card 卡片对象
   */
  public updateCardCache(card: Card): void {
    if (card.uuid) {
      this.uuidToCard.set(card.uuid, card);
      console.log(`🔄 [UUIDRegistry] 更新卡片缓存: ${card.uuid}`);
    }
  }

  /**
   * 从缓存中移除卡片
   * @param uuid 卡片UUID
   */
  public removeCardFromCache(uuid: string): void {
    if (this.uuidToCard.has(uuid)) {
      this.uuidToCard.delete(uuid);
      console.log(`🗑️ [UUIDRegistry] 移除卡片缓存: ${uuid}`);
    }
  }

  /**
   * 清空所有缓存
   */
  public clearCache(): void {
    this.uuidToCard.clear();
    this.uuidToSources.clear();
    console.log('🧹 [UUIDRegistry] 缓存已清空');
  }

  /**
   * 获取统计信息
   */
  public getStats(): {
    cachedCards: number;
    registeredUUIDs: number;
    totalAnnotationSources: number;
  } {
    const totalAnnotationSources = Array.from(this.uuidToSources.values())
      .reduce((sum, sources) => sum + sources.length, 0);

    return {
      cachedCards: this.uuidToCard.size,
      registeredUUIDs: this.uuidToSources.size,
      totalAnnotationSources
    };
  }
}



