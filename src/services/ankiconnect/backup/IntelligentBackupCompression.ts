/**
 * 智能备份压缩系统
 * 
 * 根据数据大小自动选择最佳压缩策略：
 * - 小数据（<1MB）：不压缩，直接JSON
 * - 中等数据（1-10MB）：Gzip 压缩
 * - 大数据（>10MB）：增量备份 + Gzip 压缩
 */

import * as pako from 'pako';
import type { Card } from '../../../data/types';
import type {
  BackupData,
  CompressedBackup,
  IncrementalBackup,
  CompressionType,
  BackupType
} from '../../../types/backup-types';

export class IntelligentBackupCompression {
  // 压缩阈值配置
  private readonly SMALL_DATA_THRESHOLD = 1024 * 1024;      // 1MB
  private readonly LARGE_DATA_THRESHOLD = 10 * 1024 * 1024; // 10MB
  
  /**
   * 自动选择压缩策略并创建备份
   * @param data 备份数据
   * @param baseBackupId 基础备份ID（用于增量备份）
   * @returns 压缩后的备份
   */
  async createCompressedBackup(
    data: BackupData,
    baseBackupId?: string
  ): Promise<CompressedBackup> {
    const dataSize = this.calculateSize(data);
    
    console.log(`📦 备份数据大小: ${this.formatSize(dataSize)}`);
    
    // 策略 1: 小数据（<1MB）→ 不压缩，直接JSON
    if (dataSize < this.SMALL_DATA_THRESHOLD) {
      console.log('  → 策略: 不压缩（小数据）');
      return {
        type: CompressionType.NONE,
        data: JSON.stringify(data, null, 2),
        size: dataSize
      };
    }
    
    // 策略 2: 中等数据（1-10MB）→ Gzip 压缩
    if (dataSize < this.LARGE_DATA_THRESHOLD) {
      console.log('  → 策略: Gzip 压缩（中等数据）');
      const compressed = await this.gzipCompress(data);
      const compressionRatio = ((1 - compressed.byteLength / dataSize) * 100);
      
      console.log(`  ✓ 压缩完成: ${this.formatSize(compressed.byteLength)} (节省 ${compressionRatio.toFixed(1)}%)`);
      
      return {
        type: CompressionType.GZIP,
        data: compressed,
        size: compressed.byteLength,
        originalSize: dataSize,
        compressionRatio
      };
    }
    
    // 策略 3: 大数据（>10MB）→ 增量备份 + Gzip 压缩
    console.log('  → 策略: 增量备份 + Gzip 压缩（大数据）');
    
    if (!baseBackupId) {
      // 无基础备份，创建完整备份
      console.log('  ⚠️ 无基础备份，创建完整备份');
      const compressed = await this.gzipCompress(data);
      return {
        type: CompressionType.GZIP,
        data: compressed,
        size: compressed.byteLength,
        originalSize: dataSize,
        compressionRatio: ((1 - compressed.byteLength / dataSize) * 100)
      };
    }
    
    // 创建增量备份
    const incremental = await this.createIncrementalBackup(data, baseBackupId);
    const incrementalSize = incremental.size;
    const savings = ((1 - incrementalSize / dataSize) * 100);
    
    console.log(`  ✓ 增量备份完成: ${this.formatSize(incrementalSize)} (节省 ${savings.toFixed(1)}%)`);
    
    return {
      type: CompressionType.GZIP,
      data: incremental.data,
      size: incrementalSize,
      originalSize: dataSize,
      compressionRatio: savings
    };
  }
  
  /**
   * Gzip 压缩
   * @param data 要压缩的数据
   * @returns 压缩后的数据
   */
  async gzipCompress(data: any): Promise<Uint8Array> {
    const jsonString = JSON.stringify(data);
    const uint8Array = new TextEncoder().encode(jsonString);
    return pako.gzip(uint8Array);
  }
  
  /**
   * Gzip 解压
   * @param compressed 压缩的数据
   * @returns 解压后的数据
   */
  async gzipDecompress(compressed: Uint8Array): Promise<any> {
    const decompressed = pako.ungzip(compressed);
    const jsonString = new TextDecoder().decode(decompressed);
    return JSON.parse(jsonString);
  }
  
  /**
   * 创建增量备份（只存储变更）
   * @param data 当前数据
   * @param baseBackupId 基础备份ID
   * @returns 增量备份
   */
  async createIncrementalBackup(
    data: BackupData,
    baseBackupId: string
  ): Promise<IncrementalBackup> {
    // 注意：实际实现需要加载基础备份并比较
    // 这里简化处理，假设可以获取基础备份数据
    
    // TODO: 从存储加载基础备份
    // const baseBackup = await this.loadBackup(baseBackupId);
    
    // 暂时使用完整备份
    // 实际应用中需要实现真正的差异计算
    const diff = this.computeDiff([], data.cards);
    
    const incrementalData = {
      type: 'incremental' as const,
      baseBackupId,
      timestamp: Date.now(),
      changes: {
        added: diff.addedCards,
        modified: diff.modifiedCards,
        deleted: diff.deletedCardIds
      },
      cardCount: {
        total: data.cards.length,
        changed: diff.addedCards.length + diff.modifiedCards.length
      }
    };
    
    const compressed = await this.gzipCompress(incrementalData);
    
    return {
      type: 'incremental',
      baseBackupId,
      data: compressed,
      size: compressed.byteLength,
      metadata: incrementalData
    };
  }
  
  /**
   * 计算两个卡片列表的差异
   * @param oldCards 旧卡片列表
   * @param newCards 新卡片列表
   * @returns 差异信息
   */
  computeDiff(oldCards: Card[], newCards: Card[]): {
    addedCards: Card[];
    modifiedCards: Card[];
    deletedCardIds: string[];
  } {
    const oldMap = new Map(oldCards.map(c => [c.id, c]));
    const newMap = new Map(newCards.map(c => [c.id, c]));
    
    const addedCards: Card[] = [];
    const modifiedCards: Card[] = [];
    const deletedCardIds: string[] = [];
    
    // 查找新增和修改的卡片
    for (const [id, newCard] of newMap) {
      const oldCard = oldMap.get(id);
      
      if (!oldCard) {
        // 新增的卡片
        addedCards.push(newCard);
      } else {
        // 检查是否修改
        if (this.hasCardChanged(oldCard, newCard)) {
          modifiedCards.push(newCard);
        }
      }
    }
    
    // 查找删除的卡片
    for (const [id] of oldMap) {
      if (!newMap.has(id)) {
        deletedCardIds.push(id);
      }
    }
    
    return { addedCards, modifiedCards, deletedCardIds };
  }
  
  /**
   * 判断卡片是否有变化
   * @param oldCard 旧卡片
   * @param newCard 新卡片
   * @returns 是否有变化
   */
  private hasCardChanged(oldCard: Card, newCard: Card): boolean {
    // 简单比较：比较 lastModified 时间戳
    if (oldCard.lastModified !== newCard.lastModified) {
      return true;
    }
    
    // 或者比较内容哈希
    const oldHash = this.hashCard(oldCard);
    const newHash = this.hashCard(newCard);
    
    return oldHash !== newHash;
  }
  
  /**
   * 计算卡片内容哈希
   * @param card 卡片
   * @returns 哈希值
   */
  private hashCard(card: Card): string {
    // 简单的字符串哈希
    const str = JSON.stringify({
      fields: card.fields,
      tags: card.tags,
      templateId: card.templateId
    });
    
    return this.hashString(str);
  }
  
  /**
   * 字符串哈希函数
   * @param str 字符串
   * @returns 哈希值
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }
  
  /**
   * 恢复增量备份（递归合并）
   * @param backupData 增量备份数据
   * @param loadBackupFn 加载备份的函数
   * @returns 完整的备份数据
   */
  async restoreIncrementalBackup(
    backupData: IncrementalBackup['metadata'],
    loadBackupFn: (backupId: string) => Promise<BackupData>
  ): Promise<BackupData> {
    // 递归恢复基础备份
    const baseData = await loadBackupFn(backupData.baseBackupId);
    
    // 应用增量变更
    const changes = backupData.changes;
    const restoredCards = [...baseData.cards];
    
    // 删除已删除的卡片
    for (const deletedId of changes.deleted) {
      const index = restoredCards.findIndex(c => c.id === deletedId);
      if (index !== -1) {
        restoredCards.splice(index, 1);
      }
    }
    
    // 更新修改的卡片
    for (const modifiedCard of changes.modified) {
      const index = restoredCards.findIndex(c => c.id === modifiedCard.id);
      if (index !== -1) {
        restoredCards[index] = modifiedCard;
      }
    }
    
    // 添加新增的卡片
    restoredCards.push(...changes.added);
    
    return {
      ...baseData,
      cards: restoredCards
    };
  }
  
  /**
   * 计算数据大小
   * @param data 数据
   * @returns 字节数
   */
  calculateSize(data: any): number {
    const jsonString = JSON.stringify(data);
    return new TextEncoder().encode(jsonString).byteLength;
  }
  
  /**
   * 格式化文件大小
   * @param bytes 字节数
   * @returns 格式化的字符串
   */
  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
}


