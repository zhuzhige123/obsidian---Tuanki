/**
 * Tuanki文档修改器
 * 负责原子性文档修改和元数据插入
 */

import { TFile, Vault } from 'obsidian';
import { TuankiAnnotation, DocumentModificationResult, AnnotationMetadata } from '../types/annotation-types';
import { MetadataGenerator } from './MetadataGenerator';

/**
 * 文档修改选项
 */
export interface DocumentModificationOptions {
  /** 是否创建备份 */
  createBackup?: boolean;
  /** 是否验证修改结果 */
  validateResult?: boolean;
  /** 是否保持原有格式 */
  preserveFormatting?: boolean;
  /** 自定义元数据位置 */
  metadataPosition?: 'end' | 'after_content' | 'before_tags';
  /** 是否强制覆盖现有元数据 */
  forceOverwrite?: boolean;
}

/**
 * 修改操作类型
 */
export enum ModificationOperation {
  INSERT_METADATA = 'insert_metadata',
  UPDATE_METADATA = 'update_metadata',
  REMOVE_METADATA = 'remove_metadata',
  REPLACE_CONTENT = 'replace_content'
}

/**
 * 修改记录
 */
export interface ModificationRecord {
  operation: ModificationOperation;
  filePath: string;
  timestamp: string;
  originalContent: string;
  modifiedContent: string;
  metadata: AnnotationMetadata;
  success: boolean;
  error?: string;
}

/**
 * 文档修改器类
 */
export class DocumentModifier {
  private static instance: DocumentModifier;

  private vault: Vault;
  private metadataGenerator: MetadataGenerator;

  // 修改历史记录
  private modificationHistory: ModificationRecord[] = [];

  // 备份存储
  private backupStorage: Map<string, string> = new Map();

  private constructor() {
    this.metadataGenerator = MetadataGenerator.getInstance();
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): DocumentModifier {
    if (!DocumentModifier.instance) {
      DocumentModifier.instance = new DocumentModifier();
    }
    return DocumentModifier.instance;
  }

  /**
   * 初始化文档修改器
   */
  public initialize(vault: Vault): void {
    this.vault = vault;
    console.log('📝 [DocumentModifier] 初始化完成');
  }

  /**
   * 为标注插入元数据
   */
  public async insertMetadata(
    annotation: TuankiAnnotation,
    metadata: AnnotationMetadata,
    options: DocumentModificationOptions = {}
  ): Promise<DocumentModificationResult> {
    console.log(`📝 [DocumentModifier] 开始插入元数据: ${annotation.id}`);

    try {
      // 获取文件
      const file = this.vault.getAbstractFileByPath(annotation.position.filePath);
      if (!file || !(file instanceof TFile)) {
        return {
          success: false,
          error: `文件不存在: ${annotation.position.filePath}`
        };
      }

      // 读取原始内容
      const originalContent = await this.vault.read(file);

      // 创建备份
      if (options.createBackup) {
        this.createBackup(annotation.position.filePath, originalContent);
      }

      // 查找标注块的位置
      const annotationBlock = this.findAnnotationBlock(originalContent, annotation);
      if (!annotationBlock) {
        return {
          success: false,
          error: '无法找到对应的标注块'
        };
      }

      // 生成元数据文本
      const metadataText = this.metadataGenerator.generateMetadataText(metadata);

      // 插入元数据
      const modifiedContent = this.insertMetadataIntoBlock(
        originalContent,
        annotationBlock,
        metadataText,
        options
      );

      // 验证修改结果
      if (options.validateResult) {
        const validationResult = this.validateModification(originalContent, modifiedContent);
        if (!validationResult.isValid) {
          return {
            success: false,
            error: `修改验证失败: ${validationResult.errors.join(', ')}`
          };
        }
      }

      // 写入文件
      await this.vault.modify(file, modifiedContent);

      // 记录修改历史
      this.recordModification({
        operation: ModificationOperation.INSERT_METADATA,
        filePath: annotation.position.filePath,
        timestamp: new Date().toISOString(),
        originalContent,
        modifiedContent,
        metadata,
        success: true
      });

      console.log(`✅ [DocumentModifier] 元数据插入成功`);

      return {
        success: true,
        modifiedLines: this.countModifiedLines(originalContent, modifiedContent),
        insertedMetadata: metadata,
        originalContent
      };

    } catch (error) {
      console.error(`❌ [DocumentModifier] 元数据插入失败:`, error);

      // 记录失败的修改
      this.recordModification({
        operation: ModificationOperation.INSERT_METADATA,
        filePath: annotation.position.filePath,
        timestamp: new Date().toISOString(),
        originalContent: '',
        modifiedContent: '',
        metadata,
        success: false,
        error: error.message
      });

      return {
        success: false,
        error: `元数据插入失败: ${error.message}`
      };
    }
  }

  /**
   * 查找标注块
   */
  private findAnnotationBlock(content: string, annotation: TuankiAnnotation): {
    startIndex: number;
    endIndex: number;
    blockContent: string;
  } | null {
    const lines = content.split('\n');

    // 优先使用注解位置定位，避免匹配到错误的 !tuanki 区块
    const hintedStart = Math.max(0, Math.min(annotation.position.startLine ?? 0, lines.length - 1));

    let startLine = -1;
    let endLine = -1;

    // 若提示行即为 tuanki 标注，则直接采用；否则向上寻找最近的 tuanki 开头
    if (lines[hintedStart] && /^>\s*\[!tuanki\]/.test(lines[hintedStart])) {
      startLine = hintedStart;
    } else {
      for (let i = hintedStart; i >= 0; i--) {
        if (/^>\s*\[!tuanki\]/.test(lines[i])) {
          startLine = i;
          break;
        }
        // 防止跨越过远：最多向上回溯 30 行
        if (hintedStart - i > 30) break;
      }
    }

    if (startLine === -1) {
      return null;
    }

    // 从 startLine 向下，直到遇到非引用行（非以 ">" 开头）或文件末尾
    for (let i = startLine + 1; i < lines.length; i++) {
      const line = lines[i];

      // 空行后如果下一行不是继续的引用块，则结束
      if (line.trim() === '') {
        if (i + 1 < lines.length && lines[i + 1].startsWith('>')) {
          continue;
        } else {
          endLine = i - 1;
          break;
        }
      }

      if (!line.startsWith('>')) {
        endLine = i - 1;
        break;
      }
    }

    if (endLine === -1) endLine = lines.length - 1;

    const startIndex = lines.slice(0, startLine).join('\n').length + (startLine > 0 ? 1 : 0);
    const endIndex = lines.slice(0, endLine + 1).join('\n').length;
    const blockContent = lines.slice(startLine, endLine + 1).join('\n');

    return { startIndex, endIndex, blockContent };
  }

  /**
   * 在标注块中插入元数据
   */
  private insertMetadataIntoBlock(
    originalContent: string,
    annotationBlock: { startIndex: number; endIndex: number; blockContent: string },
    metadataText: string,
    options: DocumentModificationOptions
  ): string {
    const { startIndex, endIndex, blockContent } = annotationBlock;

    // 检查是否已存在元数据
    const existingMetadata = this.extractExistingMetadata(blockContent);

    let newBlockContent = blockContent;

    if (existingMetadata.hasMetadata && !options.forceOverwrite) {
      // 更新现有元数据
      newBlockContent = this.updateExistingMetadata(blockContent, metadataText);
    } else {
      // 插入新元数据
      newBlockContent = this.insertNewMetadata(blockContent, metadataText, options);
    }

    // 替换原始内容中的标注块
    const beforeBlock = originalContent.substring(0, startIndex);
    const afterBlock = originalContent.substring(endIndex);

    return beforeBlock + newBlockContent + afterBlock;
  }

  /**
   * 提取现有元数据
   */
  private extractExistingMetadata(blockContent: string): {
    hasMetadata: boolean;
    metadataLines: string[];
    contentWithoutMetadata: string;
  } {
    const lines = blockContent.split('\n');
    const metadataLines: string[] = [];
    const contentLines: string[] = [];

    let inMetadataSection = false;

    for (const line of lines) {
      const cleanLine = line.replace(/^>\s?/, '');

      // 检查是否是元数据行
      if (cleanLine.match(/^(uuid|created|modified|version|blockId):\s*/) ||
          cleanLine.match(/^\^[a-zA-Z0-9-_]+$/)) {
        metadataLines.push(line);
        inMetadataSection = true;
      } else if (inMetadataSection && cleanLine.trim() === '') {
        // 元数据部分的空行
        metadataLines.push(line);
      } else {
        contentLines.push(line);
        inMetadataSection = false;
      }
    }

    return {
      hasMetadata: metadataLines.length > 0,
      metadataLines,
      contentWithoutMetadata: contentLines.join('\n')
    };
  }

  /**
   * 更新现有元数据
   */
  private updateExistingMetadata(blockContent: string, newMetadataText: string): string {
    const { contentWithoutMetadata } = this.extractExistingMetadata(blockContent);

    // 格式化新元数据
    const formattedMetadata = newMetadataText
      .split('\n')
      .map(line => line.trim() ? `> ${line}` : '>')
      .join('\n');

    return contentWithoutMetadata + '\n>\n' + formattedMetadata;
  }

  /**
   * 插入新元数据
   */
  private insertNewMetadata(
    blockContent: string,
    metadataText: string,
    options: DocumentModificationOptions
  ): string {
    // 格式化元数据
    const formattedMetadata = metadataText
      .split('\n')
      .map(line => line.trim() ? `> ${line}` : '>')
      .join('\n');

    // 根据位置选项插入
    switch (options.metadataPosition) {
      case 'after_content':
        return blockContent + '\n>\n' + formattedMetadata;
      case 'before_tags':
        return this.insertBeforeTags(blockContent, formattedMetadata);
      default:
        return blockContent + '\n>\n' + formattedMetadata;
    }
  }

  /**
   * 在标签前插入元数据
   */
  private insertBeforeTags(blockContent: string, metadataText: string): string {
    const lines = blockContent.split('\n');
    const tagLineIndex = lines.findIndex(line =>
      line.replace(/^>\s?/, '').match(/#[a-zA-Z0-9\u4e00-\u9fff/_-]+/)
    );

    if (tagLineIndex !== -1) {
      lines.splice(tagLineIndex, 0, '>', ...metadataText.split('\n'));
      return lines.join('\n');
    } else {
      return blockContent + '\n>\n' + metadataText;
    }
  }

  /**
   * 验证修改结果
   */
  private validateModification(originalContent: string, modifiedContent: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // 检查内容长度变化是否合理（允许微小的收缩以适配格式化/去重）
    const lengthDiff = modifiedContent.length - originalContent.length;
    if (lengthDiff < -50) {
      errors.push('修改后内容长度显著减少，可能存在内容丢失');
    }

    // 检查标注块格式是否正确
    const tuankiBlocks = modifiedContent.match(/^>\s*\[!tuanki\]/gm);
    if (!tuankiBlocks || tuankiBlocks.length === 0) {
      errors.push('修改后未找到tuanki标注块');
    }

    // 检查元数据格式（包含 uuid/created/modified/version/blockId 任意之一）
    const metadataPattern = /^>\s*(uuid|created|modified|version|blockId):\s*.+$/gm;
    const metadataMatches = modifiedContent.match(metadataPattern);
    if (!metadataMatches || metadataMatches.length === 0) {
      errors.push('修改后未找到有效的元数据');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 计算修改的行数
   */
  private countModifiedLines(originalContent: string, modifiedContent: string): number {
    const originalLines = originalContent.split('\n');
    const modifiedLines = modifiedContent.split('\n');

    return Math.abs(modifiedLines.length - originalLines.length);
  }

  /**
   * 创建备份
   */
  private createBackup(filePath: string, content: string): void {
    const backupKey = `${filePath}-${Date.now()}`;
    this.backupStorage.set(backupKey, content);

    // 限制备份数量
    if (this.backupStorage.size > 100) {
      const oldestKey = this.backupStorage.keys().next().value;
      this.backupStorage.delete(oldestKey);
    }

    console.log(`💾 [DocumentModifier] 创建备份: ${backupKey}`);
  }

  /**
   * 恢复备份
   */
  public async restoreBackup(filePath: string, timestamp?: number): Promise<boolean> {
    try {
      let backupKey: string;

      if (timestamp) {
        backupKey = `${filePath}-${timestamp}`;
      } else {
        // 查找最新的备份
        const keys = Array.from(this.backupStorage.keys())
          .filter(key => key.startsWith(filePath))
          .sort()
          .reverse();

        if (keys.length === 0) {
          console.error('未找到备份文件');
          return false;
        }

        backupKey = keys[0];
      }

      const backupContent = this.backupStorage.get(backupKey);
      if (!backupContent) {
        console.error('备份内容不存在');
        return false;
      }

      const file = this.vault.getAbstractFileByPath(filePath);
      if (!file || !(file instanceof TFile)) {
        console.error('目标文件不存在');
        return false;
      }

      await this.vault.modify(file, backupContent);
      console.log(`🔄 [DocumentModifier] 备份恢复成功: ${backupKey}`);

      return true;
    } catch (error) {
      console.error('备份恢复失败:', error);
      return false;
    }
  }

  /**
   * 记录修改历史
   */
  private recordModification(record: ModificationRecord): void {
    this.modificationHistory.push(record);

    // 限制历史记录数量
    if (this.modificationHistory.length > 1000) {
      this.modificationHistory.shift();
    }
  }

  /**
   * 获取修改历史
   */
  public getModificationHistory(filePath?: string): ModificationRecord[] {
    if (filePath) {
      return this.modificationHistory.filter(record => record.filePath === filePath);
    }
    return [...this.modificationHistory];
  }

  /**
   * 清理历史记录和备份
   */
  public cleanup(): void {
    this.modificationHistory.length = 0;
    this.backupStorage.clear();
    console.log('🧹 [DocumentModifier] 清理完成');
  }

  /**
   * 批量插入元数据
   */
  public async batchInsertMetadata(
    annotations: Array<{ annotation: TuankiAnnotation; metadata: AnnotationMetadata }>,
    options: DocumentModificationOptions = {}
  ): Promise<DocumentModificationResult[]> {
    console.log(`📝 [DocumentModifier] 开始批量插入元数据: ${annotations.length} 个标注`);

    const results: DocumentModificationResult[] = [];

    for (const { annotation, metadata } of annotations) {
      try {
        const result = await this.insertMetadata(annotation, metadata, options);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          error: `批量处理失败: ${error.message}`
        });
      }
    }

    console.log(`✅ [DocumentModifier] 批量元数据插入完成: ${results.length} 个结果`);
    return results;
  }

  /**
   * 依据 blockId 清理标注元数据，并将 [!tuanki] 重命名为 [!note]
   */
  public async cleanupAnnotationByBlockId(
    filePath: string,
    blockId: string,
    options: { renameCalloutToNote?: boolean } = { renameCalloutToNote: true }
  ): Promise<{ success: boolean; modified?: number; error?: string }>
  {
    try {
      const file = this.vault.getAbstractFileByPath(filePath);
      if (!file || !(file instanceof TFile)) {
        return { success: false, error: `文件不存在: ${filePath}` };
      }

      const originalContent = await this.vault.read(file);
      const lines = originalContent.split('\n');

      // 1) 找到包含 ^blockId 的行（通常形如 "> ^xxxx"）
      const anchorRegex = new RegExp(`^>\\s*\\^${blockId}\\s*$`);
      const anchorIndex = lines.findIndex(l => anchorRegex.test(l.trim()));
      if (anchorIndex === -1) {
        return { success: false, error: `未找到 blockId: ${blockId}` };
      }

      // 2) 向上寻找本标注块的起始行（> [!tuanki]）
      let start = anchorIndex;
      for (let i = anchorIndex; i >= 0; i--) {
        if (/^>\s*\[!tuanki\]/.test(lines[i])) { start = i; break; }
        // 若遇到非引用行，说明越界
        if (!lines[i].startsWith('>')) break;
      }

      // 3) 向下寻找本标注块的结束行（直到遇到非 '>' 行）
      let end = anchorIndex;
      for (let i = anchorIndex + 1; i < lines.length; i++) {
        if (!lines[i].startsWith('>')) { end = i - 1; break; }
        if (i === lines.length - 1) end = i;
      }

      if (start > end) {
        return { success: false, error: '标注块边界解析失败' };
      }

      const blockLines = lines.slice(start, end + 1);

      // 4) 过滤掉元数据相关行（^blockId、uuid/created/modified/version/blockId）
      const shouldDrop = (raw: string) => {
        const line = raw.replace(/^>\s?/, '').trim();
        if (line === `^${blockId}`) return true;
        if (/^(uuid|created|modified|version|blockId):\s*/.test(line)) return true;
        return false;
      };

      const cleanedBlockLines = blockLines.filter(l => !shouldDrop(l));

      // 5) 可选：将起始行的 [!tuanki] 改为 [!note]
      if (options.renameCalloutToNote && cleanedBlockLines.length > 0) {
        cleanedBlockLines[0] = cleanedBlockLines[0].replace(/\[!tuanki\]/, '[!note]');
      }

      // 6) 写回
      const before = lines.slice(0, start).join('\n');
      const after = lines.slice(end + 1).join('\n');
      const modifiedContent = [before, cleanedBlockLines.join('\n'), after].filter(Boolean).join('\n');

      await this.vault.modify(file, modifiedContent);

      // 记录历史
      this.recordModification({
        operation: ModificationOperation.REMOVE_METADATA,
        filePath,
        timestamp: new Date().toISOString(),
        originalContent,
        modifiedContent,
        metadata: { blockId },
        success: true
      });

      return { success: true, modified: Math.abs(modifiedContent.length - originalContent.length) };
    } catch (error) {
      console.error('清理标注失败:', error);
      return { success: false, error: (error as any).message };
    }
  }

}
