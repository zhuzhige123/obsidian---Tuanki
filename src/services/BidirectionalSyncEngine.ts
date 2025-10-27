/**
 * 双向同步引擎
 * 实现标注块↔卡片的双向内容同步
 * 设计原则：单用户本地环境，简化冲突处理
 */

import { TFile, Vault } from 'obsidian';
import { TuankiAnnotation } from '../types/annotation-types';
import { Card, AnnotationSource } from '../data/types';
import { UUIDRegistry } from './UUIDRegistry';
import { DocumentModifier } from './DocumentModifier';
import { showNotification } from '../utils/notifications'; // 🆕 通知工具

/**
 * 同步选项
 */
export interface SyncOptions {
  /** 防抖延迟（毫秒） */
  debounceDelay?: number;
  /** 是否强制同步（忽略内容比较） */
  forceSync?: boolean;
}

/**
 * 双向同步引擎类
 */
export class BidirectionalSyncEngine {
  private static instance: BidirectionalSyncEngine;

  // 依赖服务
  private registry: UUIDRegistry;
  private documentModifier: DocumentModifier;
  private vault: Vault | null = null;
  private dataStorage: any;

  // 防抖定时器：UUID → Timer
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  // 同步中标记：防止循环同步
  private syncing: Set<string> = new Set();

  // 配置
  private options: SyncOptions = {
    debounceDelay: 3000
  };

  private constructor() {
    this.registry = UUIDRegistry.getInstance();
    this.documentModifier = DocumentModifier.getInstance();
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): BidirectionalSyncEngine {
    if (!BidirectionalSyncEngine.instance) {
      BidirectionalSyncEngine.instance = new BidirectionalSyncEngine();
    }
    return BidirectionalSyncEngine.instance;
  }

  /**
   * 初始化同步引擎
   */
  public initialize(vault: Vault, dataStorage: any, options?: Partial<SyncOptions>): void {
    this.vault = vault;
    this.dataStorage = dataStorage;
    
    if (options) {
      this.options = { ...this.options, ...options };
    }

    console.log('🔄 [BidirectionalSyncEngine] 初始化完成', this.options);
  }

  /**
   * 标注块变更处理（入口 + 防抖）
   * @param annotation 变更的标注块
   */
  public onAnnotationChanged(annotation: TuankiAnnotation): void {
    const uuid = annotation.metadata.uuid;
    
    if (!uuid) {
      console.warn('⚠️ [BidirectionalSyncEngine] 标注块缺少UUID，无法同步');
      return;
    }

    console.log(`📝 [BidirectionalSyncEngine] 检测到标注块变更: ${uuid}`);
    console.log(`🔍 [BidirectionalSyncEngine] 标注块牌组信息:`, {
      deckName: annotation.deckTemplate?.deckName || '无',
      hasContent: !!annotation.cardContent,
      contentPreview: annotation.cardContent?.substring(0, 30)
    });

    // 清除旧的防抖定时器
    if (this.debounceTimers.has(uuid)) {
      clearTimeout(this.debounceTimers.get(uuid)!);
    }

    // 设置新的防抖定时器
    const timer = setTimeout(async () => {
      await this.syncAnnotationToCard(annotation);
      this.debounceTimers.delete(uuid);
    }, this.options.debounceDelay);

    this.debounceTimers.set(uuid, timer);
  }

  /**
   * 卡片编辑处理（卡片→标注方向）
   * @param card 编辑后的卡片
   */
  public async onCardEdited(card: Card): Promise<void> {
    const uuid = card.uuid;
    
    if (!uuid) {
      console.warn('⚠️ [BidirectionalSyncEngine] 卡片缺少UUID');
      return;
    }

    console.log(`📝 [BidirectionalSyncEngine] 检测到卡片编辑: ${uuid}`);

    // 防止循环同步
    if (this.syncing.has(uuid)) {
      console.log(`⏭️ [BidirectionalSyncEngine] 跳过循环同步: ${uuid}`);
      return;
    }

    await this.syncCardToAnnotations(card);
  }

  /**
   * 同步标注块到卡片（核心逻辑）
   * @param annotation 标注块
   */
  private async syncAnnotationToCard(annotation: TuankiAnnotation): Promise<void> {
    const uuid = annotation.metadata.uuid!;

    // 防止循环同步
    if (this.syncing.has(uuid)) {
      console.log(`⏭️ [BidirectionalSyncEngine] 跳过循环同步: ${uuid}`);
      return;
    }

    this.syncing.add(uuid);

    try {
      console.log(`🔄 [BidirectionalSyncEngine] 开始同步标注→卡片: ${uuid}`);

      // 1. 查找对应的卡片
      const card = await this.registry.findCardByUUID(uuid);

      if (!card) {
        console.log(`ℹ️ [BidirectionalSyncEngine] 卡片不存在，跳过同步（将由创建流程处理）`);
        return;
      }

      // 2. 判断是否需要更新
      const needUpdate = await this.shouldUpdateCard(annotation, card);

      if (!needUpdate && !this.options.forceSync) {
        console.log(`✅ [BidirectionalSyncEngine] 内容未变化，跳过同步`);
        return;
      }

      // 3. 更新卡片内容
      await this.updateCardContent(card, annotation);

      // 4. 更新其他同UUID的标注块
      await this.updateOtherAnnotations(uuid, annotation);

      console.log(`✅ [BidirectionalSyncEngine] 同步完成: ${uuid}`);

    } catch (error) {
      console.error(`❌ [BidirectionalSyncEngine] 同步失败:`, error);
    } finally {
      this.syncing.delete(uuid);
    }
  }

  /**
   * 同步卡片到标注块
   * @param card 卡片对象
   */
  private async syncCardToAnnotations(card: Card): Promise<void> {
    const uuid = card.uuid;

    // 防止循环同步
    if (this.syncing.has(uuid)) {
      return;
    }

    this.syncing.add(uuid);

    try {
      console.log(`🔄 [BidirectionalSyncEngine] 开始同步卡片→标注: ${uuid}`);

      // 查找所有标注块位置
      const sources = card.annotationSources || this.registry.findAnnotationsByUUID(uuid);

      if (sources.length === 0) {
        console.log(`ℹ️ [BidirectionalSyncEngine] 无关联标注块: ${uuid}`);
        return;
      }

      // 批量更新标注块
      for (const source of sources) {
        await this.updateAnnotationBlock(source, card.content);
      }

      console.log(`✅ [BidirectionalSyncEngine] 同步完成: ${uuid}, 更新了 ${sources.length} 个标注块`);

    } catch (error) {
      console.error(`❌ [BidirectionalSyncEngine] 同步失败:`, error);
    } finally {
      this.syncing.delete(uuid);
    }
  }

  /**
   * 判断是否需要更新卡片
   * @param annotation 标注块
   * @param card 卡片
   * @returns 是否需要更新
   */
  private async shouldUpdateCard(annotation: TuankiAnnotation, card: Card): Promise<boolean> {
    // 方法1：内容哈希比较
    const annotationHash = this.hashContent(annotation.cardContent);
    const cardHash = this.hashContent(card.content);

    if (annotationHash !== cardHash) {
      console.log(`📊 [BidirectionalSyncEngine] 内容哈希不同，需要更新`);
      return true;
    }

    // 方法2：时间戳比较（如果有）
    if (annotation.metadata.modified && card.modified) {
      const annotationTime = new Date(annotation.metadata.modified);
      const cardTime = new Date(card.modified);
      
      if (annotationTime > cardTime) {
        console.log(`📊 [BidirectionalSyncEngine] 标注更新，需要同步`);
        return true;
      }
    }

    // 🆕 方法3：牌组标签比较
    const newDeckName = annotation.deckTemplate?.deckName;
    if (newDeckName) {
      const currentDeck = await this.getDeckById(card.deckId);
      if (currentDeck && currentDeck.name !== newDeckName) {
        console.log(`📊 [BidirectionalSyncEngine] 牌组标签变化: ${currentDeck.name} → ${newDeckName}`);
        return true;
      }
    }

    return false;
  }

  /**
   * 更新卡片内容
   * @param card 卡片对象
   * @param annotation 标注块
   */
  private async updateCardContent(card: Card, annotation: TuankiAnnotation): Promise<void> {
    console.log(`📝 [BidirectionalSyncEngine] 更新卡片内容: ${card.id}`);

    // 更新卡片内容
    card.content = annotation.cardContent;
    card.modified = new Date().toISOString();

    // 🆕 检测并处理牌组变更
    await this.handleDeckChange(card, annotation);

    // 更新标注源列表（确保包含当前位置）
    if (!card.annotationSources) {
      card.annotationSources = [];
    }

    const source: AnnotationSource = {
      filePath: annotation.position.filePath,
      blockId: annotation.metadata.blockId || '',
      lastSync: new Date().toISOString(),
      lineRange: [annotation.position.startLine, annotation.position.endLine]
    };

    const existingIndex = card.annotationSources.findIndex(s =>
      s.filePath === source.filePath && s.blockId === source.blockId
    );

    if (existingIndex >= 0) {
      card.annotationSources[existingIndex] = source;
    } else {
      card.annotationSources.push(source);
    }

    // 保存到数据库
    if (this.dataStorage) {
      await this.dataStorage.updateCard(card);
      
      // 更新缓存
      this.registry.updateCardCache(card);
      
      console.log(`✅ [BidirectionalSyncEngine] 卡片已更新并保存`);
      
      // 🆕 显示同步通知
      const preview = (card.content || '').substring(0, 30).replace(/\n/g, ' ');
      showNotification(`🔄 卡片已同步${preview ? '：' + preview + '...' : ''}`, 'info');
    } else {
      console.warn('⚠️ [BidirectionalSyncEngine] DataStorage未初始化');
    }
  }

  /**
   * 更新其他同UUID的标注块
   * @param uuid 卡片UUID
   * @param sourceAnnotation 触发源标注块
   */
  private async updateOtherAnnotations(uuid: string, sourceAnnotation: TuankiAnnotation): Promise<void> {
    console.log(`🔄 [BidirectionalSyncEngine] 更新其他标注块: ${uuid}`);

    // 查找所有同UUID的标注块位置
    const sources = this.registry.findAnnotationsByUUID(uuid);

    if (sources.length <= 1) {
      console.log(`ℹ️ [BidirectionalSyncEngine] 仅有一个标注块，无需更新其他`);
      return;
    }

    // 遍历并更新（跳过触发源）
    for (const source of sources) {
      // 跳过触发源
      if (source.filePath === sourceAnnotation.position.filePath &&
          source.blockId === sourceAnnotation.metadata.blockId) {
        continue;
      }

      await this.updateAnnotationBlock(source, sourceAnnotation.cardContent);
    }

    console.log(`✅ [BidirectionalSyncEngine] 已更新 ${sources.length - 1} 个其他标注块`);
  }

  /**
   * 更新单个标注块的内容
   * @param source 标注源信息
   * @param newContent 新内容
   */
  private async updateAnnotationBlock(source: AnnotationSource, newContent: string): Promise<void> {
    if (!this.vault) {
      console.warn('⚠️ [BidirectionalSyncEngine] Vault未初始化');
      return;
    }

    try {
      console.log(`📝 [BidirectionalSyncEngine] 更新标注块: ${source.filePath}`);

      const file = this.vault.getAbstractFileByPath(source.filePath);
      if (!file || !(file instanceof TFile)) {
        console.warn(`⚠️ [BidirectionalSyncEngine] 文件不存在: ${source.filePath}`);
        return;
      }

      // 读取文件内容
      const fileContent = await this.vault.read(file);
      const lines = fileContent.split('\n');

      // 查找标注块（通过blockId）
      const blockIndex = lines.findIndex(line => 
        line.trim() === `> ^${source.blockId}`
      );

      if (blockIndex === -1) {
        console.warn(`⚠️ [BidirectionalSyncEngine] 未找到块ID: ^${source.blockId}`);
        return;
      }

      // 向上查找标注块起始
      let startIndex = blockIndex;
      for (let i = blockIndex - 1; i >= 0; i--) {
        if (lines[i].match(/^>\s*\[!tuanki\]/)) {
          startIndex = i;
          break;
        }
        if (!lines[i].startsWith('>')) {
          break;
        }
      }

      // 向下查找元数据区域起始（包括块ID那一行）
      let metadataStartIndex = blockIndex;
      
      // 向上查找元数据的实际起始（可能有空行）
      for (let i = blockIndex - 1; i > startIndex; i--) {
        const line = lines[i].trim();
        // 如果是元数据行或空行，继续向上
        if (line === '>' || line.match(/^>\s*(uuid|modified|created|version):/)) {
          metadataStartIndex = i;
        } else {
          break;
        }
      }

      // 构造新的内容行（保留引用符号）
      const newContentLines = newContent
        .split('\n')
        .map(line => `> ${line}`);

      // 重建标注块
      const before = lines.slice(0, startIndex + 1); // 包含 [!tuanki] 行
      const metadata = lines.slice(metadataStartIndex, blockIndex + 1); // 元数据部分（包括块ID）
      const after = lines.slice(blockIndex + 1); // 后面的内容

      const newLines = [
        ...before,
        ...newContentLines,
        '>', // 空行分隔内容和元数据
        ...metadata,
        ...after
      ];

      // 写回文件
      await this.vault.modify(file, newLines.join('\n'));

      console.log(`✅ [BidirectionalSyncEngine] 标注块更新成功: ${source.filePath}`);

    } catch (error) {
      console.error(`❌ [BidirectionalSyncEngine] 更新标注块失败:`, error);
    }
  }

  /**
   * 计算内容哈希
   * @param content 内容字符串
   * @returns 哈希值
   */
  private hashContent(content: string): string {
    let hash = 0;
    const normalizedContent = content.trim().replace(/\s+/g, ' ');
    
    for (let i = 0; i < normalizedContent.length; i++) {
      const char = normalizedContent.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    
    return Math.abs(hash).toString(36);
  }

  /**
   * 🆕 处理牌组变更
   * 检测标注块中的牌组标识变化，自动将卡片移动到新牌组
   * @param card 卡片对象
   * @param annotation 标注块对象
   */
  private async handleDeckChange(card: Card, annotation: TuankiAnnotation): Promise<void> {
    // 提取标注块中的牌组名
    const newDeckName = annotation.deckTemplate?.deckName;
    
    if (!newDeckName) {
      // 标注块中没有指定牌组，不做处理
      return;
    }

    // 获取当前卡片所在牌组
    const currentDeck = await this.getDeckById(card.deckId);
    
    if (!currentDeck) {
      console.warn(`⚠️ [BidirectionalSyncEngine] 无法获取当前牌组: ${card.deckId}`);
      return;
    }

    // 如果牌组名没有变化，不做处理
    if (currentDeck.name === newDeckName) {
      return;
    }

    // 检测到牌组变更
    console.log(`🔄 [BidirectionalSyncEngine] 检测到牌组变更: ${currentDeck.name} → ${newDeckName}`);

    // 查找目标牌组
    const targetDeck = await this.findDeckByName(newDeckName);
    
    if (targetDeck) {
      // 目标牌组存在，移动卡片
      card.deckId = targetDeck.id;
      console.log(`✅ [BidirectionalSyncEngine] 卡片已移动到牌组: ${newDeckName}`);
      
      // 🆕 显示牌组移动通知
      showNotification(`📦 卡片已移动到「${newDeckName}」`, 'success');
    } else {
      // 目标牌组不存在，根据需求不创建新牌组
      console.warn(`⚠️ [BidirectionalSyncEngine] 目标牌组不存在，卡片保持在原牌组: ${currentDeck.name}`);
      
      // 🆕 显示警告通知
      showNotification(`⚠️ 牌组「${newDeckName}」不存在，请先创建`, 'warning');
    }
  }

  /**
   * 🆕 通过ID获取牌组
   * @param deckId 牌组ID
   * @returns 牌组对象或null
   */
  private async getDeckById(deckId: string): Promise<any> {
    try {
      if (!this.dataStorage) return null;
      return await this.dataStorage.getDeck(deckId);
    } catch (error) {
      console.error(`❌ [BidirectionalSyncEngine] 获取牌组失败:`, error);
      return null;
    }
  }

  /**
   * 🆕 通过名称查找牌组
   * @param name 牌组名称
   * @returns 牌组对象或null
   */
  private async findDeckByName(name: string): Promise<any> {
    try {
      if (!this.dataStorage) return null;
      const allDecks = await this.dataStorage.getDecks();
      return allDecks.find((deck: any) => deck.name === name) || null;
    } catch (error) {
      console.error(`❌ [BidirectionalSyncEngine] 查找牌组失败:`, error);
      return null;
    }
  }

  /**
   * 清理资源
   */
  public cleanup(): void {
    // 清除所有防抖定时器
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();
    
    this.syncing.clear();
    
    console.log('🧹 [BidirectionalSyncEngine] 清理完成');
  }

  /**
   * 获取统计信息
   */
  public getStats(): {
    pendingSyncs: number;
    activeSyncs: number;
  } {
    return {
      pendingSyncs: this.debounceTimers.size,
      activeSyncs: this.syncing.size
    };
  }
}

