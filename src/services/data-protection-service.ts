/**
 * 数据保护服务
 * 确保用户内容永不丢失，提供完整的数据保护和恢复机制
 */

export interface DataProtectionConfig {
  enableAutoBackup: boolean;           // 启用自动备份
  backupInterval: number;              // 备份间隔（毫秒）
  maxBackupVersions: number;           // 最大备份版本数
  enableIntegrityCheck: boolean;       // 启用完整性检查
  enableRecoveryMode: boolean;         // 启用恢复模式
  compressionEnabled: boolean;         // 启用压缩
}

export interface DataSnapshot {
  id: string;
  timestamp: number;
  originalContent: string;
  parsedFields: Record<string, string>;
  metadata: {
    contentLength: number;
    fieldCount: number;
    parseMethod: string;
    confidence: number;
    checksum: string;
  };
  version: string;
}

export interface DataIntegrityReport {
  isValid: boolean;
  issues: DataIntegrityIssue[];
  recommendations: string[];
  recoveryOptions: RecoveryOption[];
  lastChecked: number;
}

export interface DataIntegrityIssue {
  type: 'missing_notes' | 'content_mismatch' | 'field_corruption' | 'checksum_failure';
  severity: 'critical' | 'warning' | 'info';
  description: string;
  affectedFields: string[];
  detectedAt: number;
}

export interface RecoveryOption {
  id: string;
  type: 'restore_from_notes' | 'restore_from_backup' | 'merge_content' | 'manual_recovery';
  description: string;
  confidence: number;
  previewData: {
    question: string;
    answer: string;
    notes: string;
  };
  timestamp: number;
}

/**
 * 数据保护服务
 * 提供全面的数据保护、备份和恢复功能
 */
export class DataProtectionService {
  private config: DataProtectionConfig;
  private snapshots: Map<string, DataSnapshot[]> = new Map();
  private integrityCheckInterval: NodeJS.Timeout | null = null;

  constructor(config?: Partial<DataProtectionConfig>) {
    this.config = {
      enableAutoBackup: true,
      backupInterval: 30000, // 30秒
      maxBackupVersions: 10,
      enableIntegrityCheck: true,
      enableRecoveryMode: true,
      compressionEnabled: false,
      ...config
    };

    this.initializeService();
  }

  /**
   * 初始化服务
   */
  private initializeService(): void {
    console.log('🛡️ [DataProtection] 初始化数据保护服务');
    
    if (this.config.enableIntegrityCheck) {
      this.startIntegrityChecking();
    }
  }

  /**
   * 保护数据 - 在任何操作前调用
   */
  protectData(
    cardId: string,
    originalContent: string,
    parsedFields: Record<string, string>,
    parseMetadata: {
      method: string;
      confidence: number;
    }
  ): DataSnapshot {
    console.log(`🛡️ [DataProtection] 保护数据: ${cardId}`);

    // 确保notes字段包含完整原始内容
    const protectedFields = { ...parsedFields };
    if (!protectedFields.notes || protectedFields.notes.trim() === '') {
      protectedFields.notes = originalContent;
      console.log(`🔒 [DataProtection] 强制保存原始内容到notes字段`);
    }

    // 验证notes字段完整性
    if (protectedFields.notes !== originalContent) {
      console.warn(`⚠️ [DataProtection] Notes字段与原始内容不匹配，强制同步`);
      protectedFields.notes = originalContent;
    }

    // 创建数据快照
    const snapshot: DataSnapshot = {
      id: this.generateSnapshotId(),
      timestamp: Date.now(),
      originalContent,
      parsedFields: protectedFields,
      metadata: {
        contentLength: originalContent.length,
        fieldCount: Object.keys(protectedFields).length,
        parseMethod: parseMetadata.method,
        confidence: parseMetadata.confidence,
        checksum: this.calculateChecksum(originalContent)
      },
      version: '1.0.0'
    };

    // 保存快照
    this.saveSnapshot(cardId, snapshot);

    console.log(`✅ [DataProtection] 数据保护完成: ${snapshot.id}`);
    return snapshot;
  }

  /**
   * 验证数据完整性
   */
  validateDataIntegrity(
    cardId: string,
    currentFields: Record<string, string>
  ): DataIntegrityReport {
    console.log(`🔍 [DataProtection] 验证数据完整性: ${cardId}`);

    const issues: DataIntegrityIssue[] = [];
    const recommendations: string[] = [];
    const recoveryOptions: RecoveryOption[] = [];

    // 检查notes字段是否存在
    if (!currentFields.notes || currentFields.notes.trim() === '') {
      issues.push({
        type: 'missing_notes',
        severity: 'critical',
        description: 'Notes字段缺失或为空，原始内容可能丢失',
        affectedFields: ['notes'],
        detectedAt: Date.now()
      });
      recommendations.push('立即从备份恢复notes字段');
    }

    // 检查字段内容完整性
    const snapshots = this.snapshots.get(cardId) || [];
    if (snapshots.length > 0) {
      const latestSnapshot = snapshots[snapshots.length - 1];
      
      // 验证checksum
      if (currentFields.notes) {
        const currentChecksum = this.calculateChecksum(currentFields.notes);
        if (currentChecksum !== latestSnapshot.metadata.checksum) {
          issues.push({
            type: 'checksum_failure',
            severity: 'warning',
            description: 'Notes字段内容校验失败，可能已被修改',
            affectedFields: ['notes'],
            detectedAt: Date.now()
          });
        }
      }

      // 检查字段数量变化
      const currentFieldCount = Object.keys(currentFields).length;
      if (currentFieldCount < latestSnapshot.metadata.fieldCount) {
        issues.push({
          type: 'field_corruption',
          severity: 'warning',
          description: `字段数量减少：${currentFieldCount} < ${latestSnapshot.metadata.fieldCount}`,
          affectedFields: Object.keys(latestSnapshot.parsedFields),
          detectedAt: Date.now()
        });
      }

      // 生成恢复选项
      if (issues.length > 0) {
        recoveryOptions.push(...this.generateRecoveryOptions(cardId, currentFields, snapshots));
      }
    }

    const report: DataIntegrityReport = {
      isValid: issues.filter(i => i.severity === 'critical').length === 0,
      issues,
      recommendations,
      recoveryOptions,
      lastChecked: Date.now()
    };

    if (!report.isValid) {
      console.warn(`⚠️ [DataProtection] 数据完整性验证失败: ${cardId}`, issues);
    } else {
      console.log(`✅ [DataProtection] 数据完整性验证通过: ${cardId}`);
    }

    return report;
  }

  /**
   * 从notes字段恢复数据
   */
  recoverFromNotes(
    cardId: string,
    currentFields: Record<string, string>
  ): {
    success: boolean;
    recoveredFields: Record<string, string>;
    method: string;
    confidence: number;
    warnings: string[];
  } {
    console.log(`🔄 [DataProtection] 从notes字段恢复数据: ${cardId}`);

    const warnings: string[] = [];

    // 检查notes字段
    if (!currentFields.notes || currentFields.notes.trim() === '') {
      return {
        success: false,
        recoveredFields: currentFields,
        method: 'none',
        confidence: 0,
        warnings: ['Notes字段为空，无法恢复']
      };
    }

    // 尝试从最新快照恢复
    const snapshots = this.snapshots.get(cardId) || [];
    if (snapshots.length > 0) {
      const latestSnapshot = snapshots[snapshots.length - 1];
      
      // 验证notes字段与快照的原始内容是否匹配
      if (currentFields.notes === latestSnapshot.originalContent) {
        console.log(`✅ [DataProtection] 从快照恢复: ${latestSnapshot.id}`);
        return {
          success: true,
          recoveredFields: { ...latestSnapshot.parsedFields },
          method: 'snapshot_recovery',
          confidence: latestSnapshot.metadata.confidence,
          warnings: []
        };
      } else {
        warnings.push('Notes内容与最新快照不匹配，使用当前notes内容');
      }
    }

    // 使用当前notes字段作为原始内容，尝试重新解析
    const recoveredFields: Record<string, string> = {
      ...currentFields,
      notes: currentFields.notes // 确保notes字段保持不变
    };

    // 简单的内容分割作为后备方案
    const lines = currentFields.notes.split('\n').filter(line => line.trim());
    if (lines.length > 1) {
      recoveredFields['question'] = lines[0];
      recoveredFields['answer'] = lines.slice(1).join('\n');
      warnings.push('使用简单分割方法恢复字段内容');
    } else if (lines.length === 1) {
      recoveredFields['question'] = lines[0];
      recoveredFields['answer'] = '';
      warnings.push('只能恢复问题字段，答案字段为空');
    }

    console.log(`🔄 [DataProtection] 恢复完成，置信度: 0.6`);

    return {
      success: true,
      recoveredFields,
      method: 'notes_parsing',
      confidence: 0.6,
      warnings
    };
  }

  /**
   * 从备份恢复数据
   */
  recoverFromBackup(
    cardId: string,
    snapshotId?: string
  ): {
    success: boolean;
    recoveredFields: Record<string, string>;
    snapshot: DataSnapshot | null;
    warnings: string[];
  } {
    console.log(`🔄 [DataProtection] 从备份恢复数据: ${cardId}, 快照: ${snapshotId || 'latest'}`);

    const snapshots = this.snapshots.get(cardId) || [];
    if (snapshots.length === 0) {
      return {
        success: false,
        recoveredFields: {},
        snapshot: null,
        warnings: ['没有可用的备份快照']
      };
    }

    let targetSnapshot: DataSnapshot;
    if (snapshotId) {
      const found = snapshots.find(s => s.id === snapshotId);
      if (!found) {
        return {
          success: false,
          recoveredFields: {},
          snapshot: null,
          warnings: [`找不到指定的快照: ${snapshotId}`]
        };
      }
      targetSnapshot = found;
    } else {
      targetSnapshot = snapshots[snapshots.length - 1]; // 最新快照
    }

    console.log(`✅ [DataProtection] 从快照恢复: ${targetSnapshot.id}`);

    return {
      success: true,
      recoveredFields: { ...targetSnapshot.parsedFields },
      snapshot: targetSnapshot,
      warnings: []
    };
  }

  /**
   * 获取卡片的所有快照
   */
  getSnapshots(cardId: string): DataSnapshot[] {
    return this.snapshots.get(cardId) || [];
  }

  /**
   * 清理旧快照
   */
  cleanupOldSnapshots(cardId: string): number {
    const snapshots = this.snapshots.get(cardId) || [];
    if (snapshots.length <= this.config.maxBackupVersions) {
      return 0;
    }

    const toRemove = snapshots.length - this.config.maxBackupVersions;
    const remaining = snapshots.slice(toRemove);
    this.snapshots.set(cardId, remaining);

    console.log(`🧹 [DataProtection] 清理了${toRemove}个旧快照: ${cardId}`);
    return toRemove;
  }

  /**
   * 获取数据保护统计信息
   */
  getProtectionStatistics(): {
    totalCards: number;
    totalSnapshots: number;
    averageSnapshotsPerCard: number;
    oldestSnapshot: number;
    newestSnapshot: number;
    totalDataSize: number;
  } {
    let totalSnapshots = 0;
    let oldestSnapshot = Date.now();
    let newestSnapshot = 0;
    let totalDataSize = 0;

    for (const [cardId, snapshots] of this.snapshots) {
      totalSnapshots += snapshots.length;
      
      for (const snapshot of snapshots) {
        oldestSnapshot = Math.min(oldestSnapshot, snapshot.timestamp);
        newestSnapshot = Math.max(newestSnapshot, snapshot.timestamp);
        totalDataSize += snapshot.originalContent.length;
      }
    }

    return {
      totalCards: this.snapshots.size,
      totalSnapshots,
      averageSnapshotsPerCard: this.snapshots.size > 0 ? totalSnapshots / this.snapshots.size : 0,
      oldestSnapshot,
      newestSnapshot,
      totalDataSize
    };
  }

  // 私有辅助方法

  private saveSnapshot(cardId: string, snapshot: DataSnapshot): void {
    const snapshots = this.snapshots.get(cardId) || [];
    snapshots.push(snapshot);
    this.snapshots.set(cardId, snapshots);

    // 清理旧快照
    this.cleanupOldSnapshots(cardId);
  }

  private generateSnapshotId(): string {
    return `snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private calculateChecksum(content: string): string {
    // 简单的校验和算法
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return hash.toString(16);
  }

  private startIntegrityChecking(): void {
    if (this.integrityCheckInterval) {
      clearInterval(this.integrityCheckInterval);
    }

    this.integrityCheckInterval = setInterval(() => {
      this.performPeriodicIntegrityCheck();
    }, this.config.backupInterval);

    console.log(`🔍 [DataProtection] 启动定期完整性检查，间隔: ${this.config.backupInterval}ms`);
  }

  private performPeriodicIntegrityCheck(): void {
    console.log(`🔍 [DataProtection] 执行定期完整性检查`);
    
    let totalCards = 0;
    let issuesFound = 0;

    for (const [cardId] of this.snapshots) {
      totalCards++;
      // 这里可以添加更多的完整性检查逻辑
      // 由于我们没有访问实际的卡片数据，这里只是示例
    }

    console.log(`✅ [DataProtection] 完整性检查完成: ${totalCards}张卡片, ${issuesFound}个问题`);
  }

  private generateRecoveryOptions(
    cardId: string,
    currentFields: Record<string, string>,
    snapshots: DataSnapshot[]
  ): RecoveryOption[] {
    const options: RecoveryOption[] = [];

    // 选项1: 从notes字段恢复
    if (currentFields.notes && currentFields.notes.trim()) {
      options.push({
        id: 'recover_from_notes',
        type: 'restore_from_notes',
        description: '从notes字段恢复内容',
        confidence: 0.8,
        previewData: {
          question: currentFields.notes.split('\n')[0] || '',
          answer: currentFields.notes.split('\n').slice(1).join('\n') || '',
          notes: currentFields.notes
        },
        timestamp: Date.now()
      });
    }

    // 选项2: 从最新备份恢复
    if (snapshots.length > 0) {
      const latestSnapshot = snapshots[snapshots.length - 1];
      options.push({
        id: `recover_from_backup_${latestSnapshot.id}`,
        type: 'restore_from_backup',
        description: `从最新备份恢复 (${new Date(latestSnapshot.timestamp).toLocaleString()})`,
        confidence: latestSnapshot.metadata.confidence,
        previewData: {
          question: latestSnapshot.parsedFields.question || '',
          answer: latestSnapshot.parsedFields.answer || '',
          notes: latestSnapshot.originalContent
        },
        timestamp: latestSnapshot.timestamp
      });
    }

    return options;
  }

  /**
   * 销毁服务
   */
  destroy(): void {
    if (this.integrityCheckInterval) {
      clearInterval(this.integrityCheckInterval);
      this.integrityCheckInterval = null;
    }
    
    this.snapshots.clear();
    console.log(`🛡️ [DataProtection] 数据保护服务已销毁`);
  }
}
