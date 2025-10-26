/**
 * Tuanki 标识符服务
 * 
 * 统一管理卡片UUID和BlockID的生成、验证、写入和查询
 * 这是所有卡片创建路径的唯一入口点
 * 
 * @module services/identifier
 */

import type { TFile } from 'obsidian';
import type AnkiPlugin from '../../main';

import { TuankiIDGenerator } from './TuankiIDGenerator';
import {
  UUID_WRITE_FORMAT,
  BLOCK_ID_WRITE_FORMAT,
  UNIQUENESS_CONFIG,
  ERROR_MESSAGES,
} from './constants';

import type {
  CardIdentifiers,
  IdentifierGenerationContext,
  IdentifierWriteOptions,
  LinkToDocumentOptions,
  ConflictDetectionResult,
  IdentifierStatistics,
  CardCreationMode,
  UUIDWriteFormat,
  WritePosition,
  ConflictResolution,
} from './types';

/**
 * Tuanki标识符服务类
 * 单例模式，确保全局统一管理
 */
export class TuankiIdentifierService {
  private static instance: TuankiIdentifierService | null = null;
  
  private plugin: AnkiPlugin;
  private idGenerator: TuankiIDGenerator;
  
  // 缓存：UUID -> CardIdentifiers
  private identifiersCache: Map<string, CardIdentifiers> = new Map();
  
  // 索引：BlockID -> UUID
  private blockIdIndex: Map<string, string> = new Map();
  
  // 统计信息
  private statistics = {
    totalGenerated: 0,
    uuidCollisions: 0,
    blockIdCollisions: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };

  /**
   * 私有构造函数（单例模式）
   */
  private constructor(plugin: AnkiPlugin) {
    this.plugin = plugin;
    this.idGenerator = TuankiIDGenerator.getInstance();
  }

  /**
   * 获取服务实例
   */
  static getInstance(plugin: AnkiPlugin): TuankiIdentifierService {
    if (!TuankiIdentifierService.instance) {
      TuankiIdentifierService.instance = new TuankiIdentifierService(plugin);
    }
    return TuankiIdentifierService.instance;
  }

  // ============================================================================
  // 核心功能：生成标识符
  // ============================================================================

  /**
   * 为新卡片生成标识符（统一入口）
   * 
   * 这是所有卡片创建的唯一入口点，确保ID生成的一致性
   * 
   * @param context 生成上下文
   * @returns 卡片标识符
   */
  async generateCardIdentifiers(
    context: IdentifierGenerationContext
  ): Promise<CardIdentifiers> {
    console.log(`[TuankiIdentifierService] 生成标识符 - 模式: ${context.creationMode}`);
    
    // 1. 生成或复用UUID
    const uuid = context.existingUUID || this.idGenerator.generateCardUUID();
    
    // 2. 判断是否需要生成BlockID
    let blockId: string | undefined;
    let sourceFile: string | undefined;
    let sourceLine: number | undefined;
    
    if (context.sourceFile || context.forceBlockId) {
      // 有源文档或强制生成
      blockId = context.existingBlockId || this.idGenerator.generateBlockID();
      sourceFile = context.sourceFile?.path;
      
      // 如果有源文档，尝试写入BlockID
      if (context.sourceFile && context.sourceContent) {
        const writeResult = await this.writeBlockIDToDocument(
          context.sourceFile,
          blockId,
          context.sourceContent
        );
        
        if (writeResult.success) {
          sourceLine = writeResult.line;
          console.log(`✓ BlockID已写入文档: ${blockId} at line ${sourceLine}`);
        }
      }
    }
    
    // 3. 构建标识符对象
    const identifiers: CardIdentifiers = {
      uuid,
      blockId,
      sourceFile,
      sourceLine,
    };
    
    // 4. 写入UUID到文档（根据创建模式）
    if (context.sourceFile && context.sourceContent) {
      await this.writeUUIDToDocument(
        context.sourceFile,
        uuid,
        context.sourceContent,
        context.creationMode
      );
    }
    
    // 5. 更新索引和缓存
    this.updateIndices(identifiers);
    
    // 6. 更新统计
    this.statistics.totalGenerated++;
    
    console.log(`✓ 标识符生成完成:`, identifiers);
    return identifiers;
  }

  // ============================================================================
  // UUID写入
  // ============================================================================

  /**
   * 将UUID写入文档
   * 
   * @param file 目标文档
   * @param uuid UUID字符串
   * @param content 当前内容
   * @param mode 创建模式（决定写入格式）
   * @returns 写入结果
   */
  async writeUUIDToDocument(
    file: TFile,
    uuid: string,
    content: string,
    mode: CardCreationMode
  ): Promise<{
    success: boolean;
    line?: number;
    error?: string;
  }> {
    try {
      // 根据创建模式选择写入格式
      let uuidMarker: string;
      
      switch (mode) {
        case CardCreationMode.BATCH_PARSE:
          // 批量解析：HTML注释
          uuidMarker = UUID_WRITE_FORMAT.HTML_COMMENT(uuid);
          break;
          
        case CardCreationMode.ANNOTATION:
          // 标注块：YAML字段
          uuidMarker = UUID_WRITE_FORMAT.YAML_FIELD(uuid);
          break;
          
        default:
          // 其他模式：HTML注释（通用）
          uuidMarker = UUID_WRITE_FORMAT.HTML_COMMENT(uuid);
      }
      
      // TODO: 实际写入逻辑
      // 这里需要与DocumentModifier或BatchDocumentWriter集成
      
      console.log(`[TuankiIdentifierService] UUID写入: ${uuidMarker}`);
      
      return {
        success: true,
        line: 0, // TODO: 返回实际行号
      };
    } catch (error) {
      console.error(`❌ UUID写入失败:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // ============================================================================
  // BlockID写入
  // ============================================================================

  /**
   * 将BlockID写入文档
   * 
   * @param file 目标文档
   * @param blockId BlockID字符串
   * @param content 当前内容
   * @returns 写入结果
   */
  async writeBlockIDToDocument(
    file: TFile,
    blockId: string,
    content: string
  ): Promise<{
    success: boolean;
    line?: number;
    error?: string;
  }> {
    try {
      const blockIdMarker = BLOCK_ID_WRITE_FORMAT.STANDARD(blockId);
      
      // TODO: 实际写入逻辑
      // 需要找到合适的位置（通常是卡片内容末尾）
      
      console.log(`[TuankiIdentifierService] BlockID写入: ${blockIdMarker}`);
      
      return {
        success: true,
        line: 0, // TODO: 返回实际行号
      };
    } catch (error) {
      console.error(`❌ BlockID写入失败:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // ============================================================================
  // 延迟关联功能
  // ============================================================================

  /**
   * 将已创建的卡片关联到文档（延迟关联）
   * 
   * 用于手动创建的卡片后续导出到笔记
   * 
   * @param cardId 卡片ID
   * @param uuid 卡片UUID
   * @param options 关联选项
   * @returns 生成的标识符
   */
  async linkCardToDocument(
    cardId: string,
    uuid: string,
    options: LinkToDocumentOptions
  ): Promise<CardIdentifiers> {
    console.log(`[TuankiIdentifierService] 关联卡片到文档: ${cardId}`);
    
    // 1. 检查是否已有BlockID
    const existing = this.identifiersCache.get(uuid);
    if (existing?.blockId && !options.overrideExisting) {
      throw new Error('卡片已有BlockID，设置overrideExisting=true以覆盖');
    }
    
    // 2. 生成新BlockID
    const blockId = this.idGenerator.generateBlockID();
    
    // 3. 准备写入内容
    const blockIdMarker = BLOCK_ID_WRITE_FORMAT.STANDARD(blockId);
    
    // TODO: 根据insertFormat决定如何插入
    // - annotation: 插入到标注块末尾
    // - batch-parse: 插入到批量解析区域
    // - inline: 直接插入到指定位置
    
    // 4. 写入文档
    if (options.autoSave) {
      await this.writeBlockIDToDocument(
        options.targetFile,
        blockId,
        '' // TODO: 获取文档内容
      );
    }
    
    // 5. 更新标识符
    const identifiers: CardIdentifiers = {
      uuid,
      blockId,
      sourceFile: options.targetFile.path,
      sourceLine: options.insertPosition,
    };
    
    this.updateIndices(identifiers);
    
    return identifiers;
  }

  // ============================================================================
  // 验证功能
  // ============================================================================

  /**
   * 验证标识符有效性
   */
  validateIdentifiers(identifiers: CardIdentifiers): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    
    // 验证UUID
    if (!this.idGenerator.isValidUUID(identifiers.uuid)) {
      errors.push(`无效的UUID格式: ${identifiers.uuid}`);
    }
    
    // 验证BlockID（如果存在）
    if (identifiers.blockId && !this.idGenerator.isValidBlockID(identifiers.blockId)) {
      errors.push(`无效的BlockID格式: ${identifiers.blockId}`);
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 检测冲突
   */
  async detectConflicts(identifiers: CardIdentifiers): Promise<ConflictDetectionResult> {
    const result: ConflictDetectionResult = {
      hasConflict: false,
    };
    
    // 检查UUID冲突
    const uuidExists = await this.checkUUIDExists(identifiers.uuid);
    if (uuidExists) {
      result.hasConflict = true;
      result.conflictType = 'uuid';
      result.conflictingIdentifiers = { uuid: identifiers.uuid };
      result.suggestedResolution = ConflictResolution.REGENERATE;
    }
    
    // 检查BlockID冲突（在同一文档内）
    if (identifiers.blockId && identifiers.sourceFile) {
      const blockIdExists = await this.checkBlockIDExists(
        identifiers.blockId,
        identifiers.sourceFile
      );
      
      if (blockIdExists) {
        result.hasConflict = true;
        result.conflictType = result.conflictType === 'uuid' ? 'both' : 'blockId';
        result.conflictingIdentifiers = {
          ...result.conflictingIdentifiers,
          blockId: identifiers.blockId,
        };
        result.suggestedResolution = ConflictResolution.REGENERATE;
      }
    }
    
    return result;
  }

  // ============================================================================
  // 查询功能
  // ============================================================================

  /**
   * 通过UUID查找标识符
   */
  findByUUID(uuid: string): CardIdentifiers | undefined {
    return this.identifiersCache.get(uuid);
  }

  /**
   * 通过BlockID查找UUID
   */
  findUUIDByBlockId(blockId: string): string | undefined {
    return this.blockIdIndex.get(blockId);
  }

  /**
   * 检查UUID是否存在
   */
  private async checkUUIDExists(uuid: string): Promise<boolean> {
    // TODO: 查询数据库
    return this.identifiersCache.has(uuid);
  }

  /**
   * 检查BlockID是否存在（在指定文档内）
   */
  private async checkBlockIDExists(blockId: string, filePath: string): Promise<boolean> {
    // TODO: 扫描文档内容检查BlockID
    return false;
  }

  // ============================================================================
  // 索引管理
  // ============================================================================

  /**
   * 更新索引和缓存
   */
  private updateIndices(identifiers: CardIdentifiers): void {
    // 更新UUID缓存
    this.identifiersCache.set(identifiers.uuid, identifiers);
    
    // 更新BlockID索引
    if (identifiers.blockId) {
      this.blockIdIndex.set(identifiers.blockId, identifiers.uuid);
    }
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.identifiersCache.clear();
    this.blockIdIndex.clear();
    console.log('[TuankiIdentifierService] 缓存已清除');
  }

  /**
   * 重建索引
   */
  async rebuildIndices(): Promise<void> {
    this.clearCache();
    
    // TODO: 从数据库重新加载所有标识符
    console.log('[TuankiIdentifierService] 索引重建完成');
  }

  // ============================================================================
  // 统计信息
  // ============================================================================

  /**
   * 获取统计信息
   */
  getStatistics(): IdentifierStatistics {
    return {
      totalUUIDs: this.identifiersCache.size,
      newFormatCount: 0, // TODO: 统计新格式UUID
      legacyFormatCount: 0, // TODO: 统计旧格式UUID
      cardsWithBlockId: Array.from(this.identifiersCache.values()).filter(
        i => i.blockId
      ).length,
      cardsWithoutBlockId: Array.from(this.identifiersCache.values()).filter(
        i => !i.blockId
      ).length,
      orphanCards: Array.from(this.identifiersCache.values()).filter(
        i => !i.sourceFile
      ).length,
      conflicts: 0, // TODO: 统计冲突数量
    };
  }

  /**
   * 获取内部统计
   */
  getInternalStatistics(): typeof TuankiIdentifierService.prototype.statistics {
    return { ...this.statistics };
  }
}

// ============================================================================
// 便捷函数导出
// ============================================================================

/**
 * 获取标识符服务实例（便捷函数）
 * @param plugin AnkiPlugin实例
 */
export const getIdentifierService = (plugin: AnkiPlugin) => 
  TuankiIdentifierService.getInstance(plugin);


