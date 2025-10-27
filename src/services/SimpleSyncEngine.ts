/**
 * SimpleSyncEngine - 简化的标注同步引擎
 * 核心设计：
 * 1. 不依赖previousContent缓存
 * 2. 直接与数据库比较确定是否需要更新
 * 3. UUID是唯一标识符
 * 4. 数据库是真相源
 */

import { TuankiAnnotation } from '../types/annotation-types';
import { Card, AnnotationSource } from '../data/types';
import { showNotification } from '../utils/notifications';
import { Vault, TFile } from 'obsidian';

export class SimpleSyncEngine {
  private static instance: SimpleSyncEngine;
  
  private dataStorage: any;
  private cardCreationBridge: any;
  private vault: Vault | null = null;

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): SimpleSyncEngine {
    if (!SimpleSyncEngine.instance) {
      SimpleSyncEngine.instance = new SimpleSyncEngine();
    }
    return SimpleSyncEngine.instance;
  }

  /**
   * 初始化依赖
   */
  public initialize(dependencies: {
    dataStorage: any;
    cardCreationBridge: any;
    vault?: Vault;
  }): void {
    this.dataStorage = dependencies.dataStorage;
    this.cardCreationBridge = dependencies.cardCreationBridge;
    this.vault = dependencies.vault || null;
    
    console.log('✅ [SimpleSyncEngine] 初始化完成');
  }

  /**
   * 🆕 核心方法：智能同步标注
   * 根据UUID存在性和数据库状态自动判断操作类型
   */
  public async smartSync(annotation: TuankiAnnotation): Promise<void> {
    console.log(`🔄 [SimpleSyncEngine] ========== 开始同步标注 ==========`);
    console.log(`📋 [SimpleSyncEngine] 标注信息:`, {
      hasUUID: !!annotation.metadata.uuid,
      uuid: annotation.metadata.uuid?.substring(0, 8) + '...',
      contentPreview: annotation.cardContent?.substring(0, 50) + '...',
      deckName: annotation.deckTemplate?.deckName
    });
    
    // 情况1：无UUID → 创建新卡片
    if (!annotation.metadata.uuid) {
      console.log('📝 [SimpleSyncEngine] 无UUID，创建新卡片');
      await this.cardCreationBridge.createCardFromAnnotation(annotation);
      return;
    }
    
    // 情况2：有UUID → 从数据库查询
    console.log(`🔍 [SimpleSyncEngine] 查询卡片: ${annotation.metadata.uuid}`);
    const card = await this.dataStorage.getCardByUUID(annotation.metadata.uuid);
    
    if (!card) {
      // 区分两种情况：
      // 1. 新标注块（无UUID） → 创建卡片
      // 2. 孤立标注块（有UUID但卡片已删除） → 清理标注块
      
      if (annotation.metadata.uuid) {
        // 孤立标注块：卡片已在Tuanki中删除
        console.log(`🧹 [SimpleSyncEngine] 检测到孤立标注块: ${annotation.metadata.uuid}`);
        await this.cleanupOrphanedAnnotation(annotation);
      } else {
        // 新标注块：创建卡片（理论上不会到这里，因为上面已经检查了uuid）
        console.log('📝 [SimpleSyncEngine] 无UUID，创建新卡片');
        await this.cardCreationBridge.createCardFromAnnotation(annotation);
      }
      return;
    }
    
    console.log(`✅ [SimpleSyncEngine] 找到卡片: ${card.id}`);
    console.log(`💾 [SimpleSyncEngine] 卡片当前状态:`, {
      content: card.content?.substring(0, 50) + '...',
      deckId: card.deckId,
      modified: card.modified
    });
    
    // 情况3：卡片存在 → 检查是否需要更新
    const needsUpdate = await this.checkNeedsUpdate(annotation, card);
    
    if (needsUpdate) {
      console.log('✏️ [SimpleSyncEngine] 检测到变更，更新卡片');
      await this.updateCard(card, annotation);
    } else {
      console.log('✅ [SimpleSyncEngine] 内容未变化，跳过同步');
    }
    
    console.log(`🔄 [SimpleSyncEngine] ========== 同步完成 ==========`);
  }

  /**
   * 🆕 检查是否需要更新
   * 直接比较数据库内容和当前标注内容
   */
  private async checkNeedsUpdate(annotation: TuankiAnnotation, card: Card): Promise<boolean> {
    // 🔍 详细调试日志
    console.log('🔍 [SimpleSyncEngine] ========== 内容对比开始 ==========');
    console.log('📄 [SimpleSyncEngine] 标注内容 (annotation.cardContent):');
    console.log(annotation.cardContent);
    console.log(`📏 [SimpleSyncEngine] 标注内容长度: ${annotation.cardContent?.length || 0}`);
    console.log('💾 [SimpleSyncEngine] 卡片内容 (card.content):');
    console.log(card.content);
    console.log(`📏 [SimpleSyncEngine] 卡片内容长度: ${card.content?.length || 0}`);
    console.log(`🔗 [SimpleSyncEngine] 严格相等: ${annotation.cardContent === card.content}`);
    console.log('🔍 [SimpleSyncEngine] ========== 内容对比结束 ==========');
    
    // 检查1：内容变化
    if (annotation.cardContent !== card.content) {
      console.log('📝 [SimpleSyncEngine] ✅ 内容已变化，需要更新');
      return true;
    }
    
    // 检查2：牌组变化
    const newDeckName = annotation.deckTemplate?.deckName;
    if (newDeckName) {
      const currentDeckName = await this.getDeckNameById(card.deckId);
      if (currentDeckName !== newDeckName) {
        console.log(`📦 [SimpleSyncEngine] 牌组变化: ${currentDeckName} → ${newDeckName}`);
        return true;
      }
    }
    
    console.log('✅ [SimpleSyncEngine] 内容未变化，无需更新');
    return false;
  }

  /**
   * 🆕 更新卡片
   * 处理内容更新、牌组移动和多源标注同步
   */
  private async updateCard(card: Card, annotation: TuankiAnnotation): Promise<void> {
    console.log(`📝 [SimpleSyncEngine] ========== 开始更新卡片 ==========`);
    console.log(`🆔 [SimpleSyncEngine] 卡片ID: ${card.id}`);
    console.log(`📦 [SimpleSyncEngine] 当前牌组ID: ${card.deckId}`);
    console.log(`📍 [SimpleSyncEngine] 修改来源: ${annotation.position.filePath}`);
    
    const oldDeckId = card.deckId;
    const oldContent = card.content;
    let deckChanged = false;
    
    // 更新内容
    card.content = annotation.cardContent;
    card.modified = new Date().toISOString();
    
    console.log(`📄 [SimpleSyncEngine] 内容更新前: ${oldContent?.substring(0, 50)}...`);
    console.log(`📄 [SimpleSyncEngine] 内容更新后: ${card.content?.substring(0, 50)}...`);
    
    // 🆕 更新标注源列表（支持多源标注）
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
      console.log(`🔄 [SimpleSyncEngine] 更新已有标注源: ${source.filePath}`);
    } else {
      card.annotationSources.push(source);
      console.log(`➕ [SimpleSyncEngine] 添加新标注源: ${source.filePath}`);
    }
    
    console.log(`📋 [SimpleSyncEngine] 标注源总数: ${card.annotationSources.length}`);
    
    // 处理牌组变更
    const newDeckName = annotation.deckTemplate?.deckName;
    if (newDeckName) {
      const allDecks = await this.dataStorage.getAllDecks();
      const targetDeck = allDecks.find((d: any) => d.name === newDeckName);
      
      if (targetDeck) {
        if (targetDeck.id !== card.deckId) {
          const oldDeckName = await this.getDeckNameById(card.deckId);
          
          // 🆕 关键：移动卡片需要先从旧牌组删除
          console.log(`📦 [SimpleSyncEngine] 开始移动卡片: ${oldDeckName} → ${newDeckName}`);
          console.log(`📦 [SimpleSyncEngine] 从牌组删除: ${oldDeckId}`);
          
          // 从旧牌组删除
          const deleteResult = await this.dataStorage.deleteCard(card.id);
          console.log(`✅ [SimpleSyncEngine] 删除结果:`, deleteResult);
          
          // 修改牌组ID
          card.deckId = targetDeck.id;
          deckChanged = true;
          
          console.log(`📦 [SimpleSyncEngine] 新牌组ID: ${card.deckId}`);
          console.log(`📦 [SimpleSyncEngine] 卡片已移动: ${oldDeckName} → ${newDeckName}`);
          showNotification(`📦 卡片已移动到「${newDeckName}」`, 'success');
        }
      } else {
        console.warn(`⚠️ [SimpleSyncEngine] 目标牌组不存在: ${newDeckName}`);
        showNotification(`⚠️ 牌组「${newDeckName}」不存在，请先创建`, 'warning');
      }
    }
    
    // 🆕 保存到数据库（使用 saveCard 而不是 updateCard）
    console.log(`💾 [SimpleSyncEngine] 准备保存卡片到牌组: ${card.deckId}`);
    const result = await this.dataStorage.saveCard(card);
    
    console.log(`💾 [SimpleSyncEngine] 保存结果:`, result);
    
    if (result.success) {
      console.log('✅ [SimpleSyncEngine] 卡片已更新到数据库');
      console.log(`📄 [SimpleSyncEngine] 最终内容: ${card.content?.substring(0, 50)}...`);
      
      // 🆕 更新其他同UUID的标注块
      await this.updateOtherAnnotations(annotation);
      
      if (!deckChanged) {
        showNotification('✅ 卡片已同步', 'success');
      }
    } else {
      console.error('❌ [SimpleSyncEngine] 保存卡片失败:', result.error);
      showNotification(`❌ 同步失败: ${result.error}`, 'error');
    }
    
    console.log(`📝 [SimpleSyncEngine] ========== 更新卡片完成 ==========`);
  }
  
  /**
   * 🆕 更新其他同UUID的标注块
   * 确保所有具有相同UUID的标注块内容一致
   */
  private async updateOtherAnnotations(sourceAnnotation: TuankiAnnotation): Promise<void> {
    if (!this.vault || !sourceAnnotation.metadata.uuid) {
      return;
    }
    
    const uuid = sourceAnnotation.metadata.uuid;
    console.log(`🔄 [SimpleSyncEngine] 检查其他同UUID标注块: ${uuid}`);
    
    // 获取卡片以读取所有标注源
    const card = await this.dataStorage.getCardByUUID(uuid);
    if (!card || !card.annotationSources || card.annotationSources.length <= 1) {
      console.log(`ℹ️ [SimpleSyncEngine] 仅有一个标注源，无需更新其他`);
      return;
    }
    
    console.log(`📋 [SimpleSyncEngine] 找到 ${card.annotationSources.length} 个标注源，开始更新...`);
    
    let updatedCount = 0;
    
    // 遍历所有标注源
    for (const source of card.annotationSources) {
      // 跳过触发源
      if (source.filePath === sourceAnnotation.position.filePath &&
          source.blockId === sourceAnnotation.metadata.blockId) {
        continue;
      }
      
      try {
        await this.updateAnnotationBlock(source, sourceAnnotation.cardContent);
        updatedCount++;
      } catch (error) {
        console.error(`❌ [SimpleSyncEngine] 更新标注块失败: ${source.filePath}`, error);
      }
    }
    
    if (updatedCount > 0) {
      console.log(`✅ [SimpleSyncEngine] 已更新 ${updatedCount} 个其他标注块`);
    }
  }
  
  /**
   * 🆕 更新指定标注块的内容
   */
  private async updateAnnotationBlock(source: AnnotationSource, newContent: string): Promise<void> {
    if (!this.vault) {
      throw new Error('Vault未初始化');
    }
    
    const file = this.vault.getAbstractFileByPath(source.filePath);
    if (!file || !(file instanceof TFile)) {
      console.warn(`⚠️ [SimpleSyncEngine] 文件不存在: ${source.filePath}`);
      return;
    }
    
    const content = await this.vault.read(file);
    const lines = content.split('\n');
    
    // 查找块ID所在行
    const blockIndex = lines.findIndex(line => line.includes(`^${source.blockId}`));
    if (blockIndex === -1) {
      console.warn(`⚠️ [SimpleSyncEngine] 找不到块ID: ^${source.blockId}`);
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
    
    // 向上查找元数据区域起始
    let metadataStartIndex = blockIndex;
    for (let i = blockIndex - 1; i > startIndex; i--) {
      const line = lines[i].trim();
      if (line === '>' || line.match(/^>\s*(uuid|modified|created|version):/)) {
        metadataStartIndex = i;
      } else {
        break;
      }
    }
    
    // 构造新的内容行
    const newContentLines = newContent.split('\n').map(line => `> ${line}`);
    
    // 重建标注块
    const before = lines.slice(0, startIndex + 1); // 包含 [!tuanki] 行
    const metadata = lines.slice(metadataStartIndex, blockIndex + 1); // 元数据部分
    const after = lines.slice(blockIndex + 1); // 后面的内容
    
    const newLines = [
      ...before,
      ...newContentLines,
      '>', // 空行分隔
      ...metadata,
      ...after
    ];
    
    await this.vault.modify(file, newLines.join('\n'));
    console.log(`✅ [SimpleSyncEngine] 标注块已更新: ${source.filePath}`);
  }

  /**
   * 🆕 清理孤立的标注块
   * 当标注块有UUID但数据库中找不到对应卡片时调用
   * 将 [!tuanki] 转换为 [!note]，删除 uuid、modified、created、blockId
   */
  private async cleanupOrphanedAnnotation(annotation: TuankiAnnotation): Promise<void> {
    if (!this.vault) {
      console.warn('⚠️ [SimpleSyncEngine] Vault未初始化');
      return;
    }
    
    const filePath = annotation.position.filePath;
    const uuid = annotation.metadata.uuid;
    
    console.log(`🧹 [SimpleSyncEngine] 开始清理孤立标注块`);
    console.log(`📍 [SimpleSyncEngine] 文件: ${filePath}`);
    console.log(`🆔 [SimpleSyncEngine] UUID: ${uuid}`);
    
    try {
      // 查找并清理标注块
      const block = await this.findAnnotationBlockByUUID(filePath, uuid);
      
      if (!block) {
        console.warn(`⚠️ [SimpleSyncEngine] 找不到标注块: ${uuid}`);
        return;
      }
      
      const file = this.vault.getAbstractFileByPath(filePath);
      if (!file || !(file instanceof TFile)) {
        console.warn(`⚠️ [SimpleSyncEngine] 文件不存在: ${filePath}`);
        return;
      }
      
      const lines = block.lines;
      
      // 1. 修改 [!tuanki] 为 [!note]
      lines[block.startLine] = lines[block.startLine].replace('[!tuanki]', '[!note]');
      console.log(`✏️ [SimpleSyncEngine] 已修改标记: [!tuanki] → [!note]`);
      
      // 2. 标记需要删除的元数据行
      const linesToRemove = new Set<number>();
      
      for (let i = block.startLine; i < lines.length; i++) {
        const line = lines[i];
        
        if (!line.startsWith('>')) {
          break; // 超出标注块范围
        }
        
        // 删除: uuid、modified、created、version、blockId、元数据分隔符
        if (
          line.match(/^>\s*uuid:/i) ||
          line.match(/^>\s*modified:/i) ||
          line.match(/^>\s*created:/i) ||
          line.match(/^>\s*version:/i) ||
          line.match(/^>\s*\^[a-zA-Z0-9]+\s*$/) ||  // 块ID
          (line.trim() === '>' && i > block.startLine)  // 空行分隔符
        ) {
          linesToRemove.add(i);
        }
      }
      
      console.log(`🗑️ [SimpleSyncEngine] 将删除 ${linesToRemove.size} 行元数据`);
      
      // 3. 重建文件内容
      const newLines = lines.filter((_, index) => !linesToRemove.has(index));
      
      // 4. 写回文件
      await this.vault.modify(file, newLines.join('\n'));
      
      console.log(`✅ [SimpleSyncEngine] 孤立标注块已清理完成`);
      showNotification(`🧹 已清理孤立标注块`, 'info');
      
    } catch (error) {
      console.error(`❌ [SimpleSyncEngine] 清理失败: ${filePath}`, error);
      showNotification(`❌ 清理标注块失败`, 'error');
    }
  }

  /**
   * 🆕 通过UUID在文件中查找标注块
   * 不依赖行号，而是通过UUID行向上搜索
   */
  private async findAnnotationBlockByUUID(
    filePath: string,
    uuid: string | undefined
  ): Promise<{ startLine: number; lines: string[] } | null> {
    if (!this.vault || !uuid) {
      return null;
    }
    
    const file = this.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof TFile)) {
      return null;
    }
    
    const content = await this.vault.read(file);
    const lines = content.split('\n');
    
    // 查找UUID所在行
    const uuidPattern = new RegExp(`^>\\s*uuid:\\s*${uuid.replace(/-/g, '\\-')}\\s*$`);
    const uuidLine = lines.findIndex(line => uuidPattern.test(line.trim()));
    
    if (uuidLine === -1) {
      console.warn(`⚠️ [SimpleSyncEngine] 找不到UUID行: ${uuid}`);
      return null;
    }
    
    console.log(`🔍 [SimpleSyncEngine] 找到UUID行: 第${uuidLine + 1}行`);
    
    // 向上查找 [!tuanki] 起始行
    let startLine = -1;
    for (let i = uuidLine - 1; i >= 0; i--) {
      if (lines[i].match(/^>\s*\[!tuanki\]/)) {
        startLine = i;
        break;
      }
      if (!lines[i].startsWith('>')) {
        break; // 超出标注块范围
      }
    }
    
    if (startLine === -1) {
      console.warn(`⚠️ [SimpleSyncEngine] 找不到标注块起始: ${uuid}`);
      return null;
    }
    
    console.log(`🔍 [SimpleSyncEngine] 找到标注块: 第${startLine + 1}行 - 第${uuidLine + 1}行`);
    
    return {
      startLine,
      lines
    };
  }

  /**
   * 🆕 根据牌组ID获取牌组名
   */
  private async getDeckNameById(deckId: string): Promise<string | null> {
    try {
      const deck = await this.dataStorage.getDeck(deckId);
      return deck?.name || null;
    } catch (error) {
      console.error('❌ [SimpleSyncEngine] 获取牌组名失败:', error);
      return null;
    }
  }
}

