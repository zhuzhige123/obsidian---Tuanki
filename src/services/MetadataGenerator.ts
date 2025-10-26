/**
 * Tuanki元数据生成器
 * 负责生成UUID、块链接、时间戳等元数据信息
 * 
 * 🆕 v0.8: 集成统一ID系统
 */

import { AnnotationMetadata, TuankiAnnotation } from '../types/annotation-types';
import { generateUUID, generateBlockId } from '../utils/helpers'; // 🆕 v0.8: 统一ID系统

/**
 * 元数据生成选项
 */
export interface MetadataGenerationOptions {
  /** 是否强制重新生成UUID */
  forceNewUuid?: boolean;
  /** 是否强制重新生成块链接 */
  forceNewBlockId?: boolean;
  /** 自定义内容哈希 */
  customContentHash?: string;
  /** 是否更新修改时间 */
  updateModifiedTime?: boolean;
  /** 版本号增量 */
  versionIncrement?: number;
}

/**
 * 元数据生成结果
 */
export interface MetadataGenerationResult {
  /** 生成的元数据 */
  metadata: AnnotationMetadata;
  /** 是否有变更 */
  hasChanges: boolean;
  /** 变更的字段列表 */
  changedFields: string[];
  /** 生成的元数据文本 */
  metadataText: string;
}

/**
 * 元数据生成器类
 */
export class MetadataGenerator {
  private static instance: MetadataGenerator;
  
  // UUID生成相关
  private readonly UUID_CHARS = '0123456789abcdef';
  private readonly BLOCK_ID_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  
  // 已生成的UUID缓存，避免重复
  private generatedUuids: Set<string> = new Set();
  private generatedBlockIds: Set<string> = new Set();

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): MetadataGenerator {
    if (!MetadataGenerator.instance) {
      MetadataGenerator.instance = new MetadataGenerator();
    }
    return MetadataGenerator.instance;
  }

  /**
   * 为标注生成完整的元数据
   */
  public generateMetadata(
    annotation: TuankiAnnotation, 
    options: MetadataGenerationOptions = {}
  ): MetadataGenerationResult {
    console.log(`🏷️ [MetadataGenerator] 开始生成元数据: ${annotation.id}`);
    
    const existingMetadata = annotation.metadata || {};
    const newMetadata: AnnotationMetadata = { ...existingMetadata };
    const changedFields: string[] = [];
    
    // 生成或保留UUID
    if (!newMetadata.uuid || options.forceNewUuid) {
      const oldUuid = newMetadata.uuid;
      newMetadata.uuid = this.generateUuid();
      if (oldUuid !== newMetadata.uuid) {
        changedFields.push('uuid');
      }
    }
    
    // 生成或保留块链接ID
    if (!newMetadata.blockId || options.forceNewBlockId) {
      const oldBlockId = newMetadata.blockId;
      newMetadata.blockId = this.generateBlockId();
      if (oldBlockId !== newMetadata.blockId) {
        changedFields.push('blockId');
      }
    }
    
    // 🆕 生成修改时间戳（用于双向同步）
    if (options.updateModifiedTime !== false) {
      const oldModified = newMetadata.modified;
      newMetadata.modified = this.generateTimestamp();
      if (oldModified !== newMetadata.modified) {
        changedFields.push('modified');
      }
    }
    
    // 生成内容哈希（内存中使用，不写回文档）
    const contentHash = options.customContentHash || this.generateContentHash(annotation.cardContent);
    if (newMetadata.contentHash !== contentHash) {
      newMetadata.contentHash = contentHash;
      changedFields.push('contentHash');
    }
    
    // 生成元数据文本
    const metadataText = this.generateMetadataText(newMetadata);
    
    console.log(`✅ [MetadataGenerator] 元数据生成完成: 变更字段=${changedFields.join(', ')}`);
    
    return {
      metadata: newMetadata,
      hasChanges: changedFields.length > 0,
      changedFields,
      metadataText
    };
  }

  /**
   * 生成UUID（🔄 重构版）
   * 🆕 v0.8: 使用新格式 tk-{12位base32}
   */
  public generateUuid(): string {
    const uuid = generateUUID(); // 使用新的统一ID生成器
    this.generatedUuids.add(uuid);
    return uuid;
  }

  /**
   * 创建UUID v4格式
   * @deprecated v0.8: 请使用 generateUuid()，新格式为 tk-{12位}
   */
  private createUuidV4(): string {
    // 保留此方法用于向后兼容，但不再使用
    const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
    return template.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return this.UUID_CHARS[v];
    });
  }

  /**
   * 生成Obsidian块链接ID（🔄 重构版）
   * 🆕 v0.8: 使用统一ID生成器
   */
  public generateBlockId(): string {
    const blockId = generateBlockId(); // 使用新的统一ID生成器
    this.generatedBlockIds.add(blockId);
    return blockId;
  }

  /**
   * 创建块链接ID
   * @deprecated v0.8: 请使用 generateBlockId()
   */
  private createBlockId(): string {
    const length = 8 + Math.floor(Math.random() * 4); // 8-11位长度
    let result = '';
    
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * this.BLOCK_ID_CHARS.length);
      result += this.BLOCK_ID_CHARS[randomIndex];
    }
    
    return result;
  }

  /**
   * 生成ISO格式时间戳
   */
  public generateTimestamp(date?: Date): string {
    const targetDate = date || new Date();
    return targetDate.toISOString();
  }

  /**
   * 生成内容哈希
   */
  public generateContentHash(content: string): string {
    // 简单的哈希算法，用于检测内容变更
    let hash = 0;
    const normalizedContent = content.trim().replace(/\s+/g, ' ');
    
    for (let i = 0; i < normalizedContent.length; i++) {
      const char = normalizedContent.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    
    return Math.abs(hash).toString(36);
  }

  /**
   * 生成元数据文本
   */
  public generateMetadataText(metadata: AnnotationMetadata): string {
    const lines: string[] = [];
    
    // 添加块链接
    if (metadata.blockId) {
      lines.push(`^${metadata.blockId}`);
    }
    
    // 添加UUID
    if (metadata.uuid) {
      lines.push(`uuid: ${metadata.uuid}`);
    }
    
    // 🆕 添加修改时间戳（用于双向同步）
    if (metadata.modified) {
      lines.push(`modified: ${metadata.modified}`);
    }
    
    return lines.join('\n');
  }

  /**
   * 解析元数据文本
   */
  public parseMetadataText(metadataText: string): AnnotationMetadata {
    const metadata: AnnotationMetadata = {};
    const lines = metadataText.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // 解析块链接
      const blockIdMatch = trimmedLine.match(/^\^([a-zA-Z0-9-_]+)$/);
      if (blockIdMatch) {
        metadata.blockId = blockIdMatch[1];
        continue;
      }
      
      // 解析键值对
      const kvMatch = trimmedLine.match(/^(uuid|created|modified|version|contentHash):\s*(.+)$/);
      if (kvMatch) {
        const key = kvMatch[1];
        const value = kvMatch[2].trim();
        
        switch (key) {
          case 'uuid':
            metadata.uuid = value;
            break;
          case 'created':
            metadata.created = value;
            break;
          case 'modified':
            metadata.modified = value;
            break;
          case 'version':
            metadata.version = parseInt(value, 10);
            break;
          case 'contentHash':
            metadata.contentHash = value;
            break;
        }
      }
    }
    
    return metadata;
  }

  /**
   * 验证UUID格式（🔄 重构版）
   * 🆕 v0.8: 兼容新旧两种格式
   */
  public validateUuid(uuid: string): boolean {
    // 新格式: tk-{12位base32}
    const newFormatRegex = /^tk-[23456789abcdefghjkmnpqrstuvwxyz]{12}$/;
    if (newFormatRegex.test(uuid)) {
      return true;
    }
    
    // 旧格式: UUID v4（向后兼容）
    const oldFormatRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return oldFormatRegex.test(uuid);
  }

  /**
   * 验证块链接ID格式
   */
  public validateBlockId(blockId: string): boolean {
    const blockIdRegex = /^[a-zA-Z0-9-_]{6,20}$/;
    return blockIdRegex.test(blockId);
  }

  /**
   * 验证时间戳格式
   */
  public validateTimestamp(timestamp: string): boolean {
    try {
      const date = new Date(timestamp);
      return date.toISOString() === timestamp;
    } catch {
      return false;
    }
  }

  /**
   * 比较两个元数据对象
   */
  public compareMetadata(metadata1: AnnotationMetadata, metadata2: AnnotationMetadata): {
    isEqual: boolean;
    differences: string[];
  } {
    const differences: string[] = [];
    const keys = new Set([...Object.keys(metadata1), ...Object.keys(metadata2)]);
    
    for (const key of keys) {
      const value1 = (metadata1 as any)[key];
      const value2 = (metadata2 as any)[key];
      
      if (value1 !== value2) {
        differences.push(key);
      }
    }
    
    return {
      isEqual: differences.length === 0,
      differences
    };
  }

  /**
   * 清理生成缓存
   */
  public clearCache(): void {
    this.generatedUuids.clear();
    this.generatedBlockIds.clear();
    console.log('🧹 [MetadataGenerator] 缓存已清理');
  }

  /**
   * 获取缓存统计信息
   */
  public getCacheStats(): { uuidCount: number; blockIdCount: number } {
    return {
      uuidCount: this.generatedUuids.size,
      blockIdCount: this.generatedBlockIds.size
    };
  }

  /**
   * 批量生成元数据
   */
  public batchGenerateMetadata(
    annotations: TuankiAnnotation[],
    options: MetadataGenerationOptions = {}
  ): MetadataGenerationResult[] {
    console.log(`🏷️ [MetadataGenerator] 开始批量生成元数据: ${annotations.length} 个标注`);
    
    const results: MetadataGenerationResult[] = [];
    
    for (const annotation of annotations) {
      try {
        const result = this.generateMetadata(annotation, options);
        results.push(result);
      } catch (error) {
        console.error(`元数据生成失败: ${annotation.id}`, error);
        // 创建错误结果
        results.push({
          metadata: annotation.metadata || {},
          hasChanges: false,
          changedFields: [],
          metadataText: ''
        });
      }
    }
    
    console.log(`✅ [MetadataGenerator] 批量元数据生成完成: ${results.length} 个结果`);
    return results;
  }
}
