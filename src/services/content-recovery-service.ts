/**
 * 内容恢复服务
 * 提供完整的内容恢复功能，包括UI集成和恢复策略管理
 */

import { AnkiPlugin } from '../main';
import { DataProtectionService, RecoveryOption } from './data-protection-service';
import { GracefulDegradationManager } from '../utils/graceful-degradation-manager';

export interface ContentRecoveryConfig {
  enableAutoRecovery: boolean;        // 启用自动恢复
  showRecoveryButton: boolean;        // 显示恢复按钮
  autoShowOnFailure: boolean;         // 解析失败时自动显示恢复面板
  maxRecoveryAttempts: number;        // 最大恢复尝试次数
  recoveryTimeout: number;            // 恢复超时时间（毫秒）
}

export interface RecoverySession {
  cardId: string;
  startTime: number;
  attempts: RecoveryAttempt[];
  currentFields: Record<string, string>;
  originalContent: string;
  status: 'active' | 'completed' | 'failed' | 'cancelled';
}

export interface RecoveryAttempt {
  id: string;
  method: string;
  timestamp: number;
  success: boolean;
  confidence: number;
  recoveredFields: Record<string, string>;
  warnings: string[];
  errors: string[];
}

export interface RecoveryResult {
  success: boolean;
  method: string;
  confidence: number;
  recoveredFields: Record<string, string>;
  warnings: string[];
  errors: string[];
  session: RecoverySession;
}

/**
 * 内容恢复服务
 * 管理内容恢复的完整流程
 */
export class ContentRecoveryService {
  private plugin: AnkiPlugin;
  private protectionService: DataProtectionService;
  private degradationManager: GracefulDegradationManager;
  private config: ContentRecoveryConfig;
  private activeSessions: Map<string, RecoverySession> = new Map();

  constructor(
    plugin: AnkiPlugin,
    protectionService: DataProtectionService,
    degradationManager: GracefulDegradationManager,
    config?: Partial<ContentRecoveryConfig>
  ) {
    this.plugin = plugin;
    this.protectionService = protectionService;
    this.degradationManager = degradationManager;
    this.config = {
      enableAutoRecovery: true,
      showRecoveryButton: true,
      autoShowOnFailure: true,
      maxRecoveryAttempts: 3,
      recoveryTimeout: 30000, // 30秒
      ...config
    };

    console.log('🔄 [ContentRecovery] 内容恢复服务已初始化');
  }

  /**
   * 开始恢复会话
   */
  startRecoverySession(
    cardId: string,
    currentFields: Record<string, string>,
    originalContent?: string
  ): RecoverySession {
    console.log(`🔄 [ContentRecovery] 开始恢复会话: ${cardId}`);

    // 如果已有活跃会话，先结束它
    const existingSession = this.activeSessions.get(cardId);
    if (existingSession && existingSession.status === 'active') {
      existingSession.status = 'cancelled';
    }

    const session: RecoverySession = {
      cardId,
      startTime: Date.now(),
      attempts: [],
      currentFields: { ...currentFields },
      originalContent: originalContent || currentFields.notes || '',
      status: 'active'
    };

    this.activeSessions.set(cardId, session);
    return session;
  }

  /**
   * 获取恢复选项
   */
  async getRecoveryOptions(cardId: string): Promise<RecoveryOption[]> {
    console.log(`🔍 [ContentRecovery] 获取恢复选项: ${cardId}`);

    try {
      const session = this.activeSessions.get(cardId);
      if (!session) {
        throw new Error('没有活跃的恢复会话');
      }

      // 验证数据完整性
      const integrityReport = this.protectionService.validateDataIntegrity(
        cardId,
        session.currentFields
      );

      console.log(`✅ [ContentRecovery] 找到${integrityReport.recoveryOptions.length}个恢复选项`);
      return integrityReport.recoveryOptions;
    } catch (error) {
      console.error('❌ [ContentRecovery] 获取恢复选项失败:', error);
      return [];
    }
  }

  /**
   * 执行恢复
   */
  async executeRecovery(
    cardId: string,
    option: RecoveryOption
  ): Promise<RecoveryResult> {
    console.log(`🔄 [ContentRecovery] 执行恢复: ${cardId}, 方法: ${option.type}`);

    const session = this.activeSessions.get(cardId);
    if (!session) {
      throw new Error('没有活跃的恢复会话');
    }

    if (session.attempts.length >= this.config.maxRecoveryAttempts) {
      throw new Error('已达到最大恢复尝试次数');
    }

    const attemptId = this.generateAttemptId();
    const startTime = Date.now();

    try {
      let result;

      // 设置超时
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('恢复操作超时')), this.config.recoveryTimeout);
      });

      const recoveryPromise = this.performRecovery(cardId, option, session);
      result = await Promise.race([recoveryPromise, timeoutPromise]);

      // 记录成功的尝试
      const attempt: RecoveryAttempt = {
        id: attemptId,
        method: option.type,
        timestamp: Date.now(),
        success: true,
        confidence: result.confidence,
        recoveredFields: result.recoveredFields,
        warnings: result.warnings || [],
        errors: []
      };

      session.attempts.push(attempt);
      session.status = 'completed';

      console.log(`✅ [ContentRecovery] 恢复成功: ${option.type}`);

      return {
        success: true,
        method: option.type,
        confidence: result.confidence,
        recoveredFields: result.recoveredFields,
        warnings: result.warnings || [],
        errors: [],
        session
      };
    } catch (error) {
      // 记录失败的尝试
      const attempt: RecoveryAttempt = {
        id: attemptId,
        method: option.type,
        timestamp: Date.now(),
        success: false,
        confidence: 0,
        recoveredFields: session.currentFields,
        warnings: [],
        errors: [error instanceof Error ? error.message : String(error)]
      };

      session.attempts.push(attempt);

      console.error('❌ [ContentRecovery] 恢复失败:', error);

      return {
        success: false,
        method: option.type,
        confidence: 0,
        recoveredFields: session.currentFields,
        warnings: [],
        errors: [error instanceof Error ? error.message : String(error)],
        session
      };
    }
  }

  /**
   * 自动恢复
   */
  async autoRecover(
    cardId: string,
    currentFields: Record<string, string>,
    originalContent?: string
  ): Promise<RecoveryResult | null> {
    if (!this.config.enableAutoRecovery) {
      return null;
    }

    console.log(`🤖 [ContentRecovery] 尝试自动恢复: ${cardId}`);

    try {
      // 开始恢复会话
      const session = this.startRecoverySession(cardId, currentFields, originalContent);

      // 获取恢复选项
      const options = await this.getRecoveryOptions(cardId);
      if (options.length === 0) {
        return null;
      }

      // 选择最佳选项（置信度最高的）
      const bestOption = options.reduce((best, current) => 
        current.confidence > best.confidence ? current : best
      );

      // 只有置信度足够高才自动恢复
      if (bestOption.confidence < 0.7) {
        console.log(`⚠️ [ContentRecovery] 自动恢复置信度不足: ${bestOption.confidence}`);
        return null;
      }

      // 执行自动恢复
      const result = await this.executeRecovery(cardId, bestOption);
      
      if (result.success) {
        console.log(`✅ [ContentRecovery] 自动恢复成功: ${bestOption.type}`);
      }

      return result;
    } catch (error) {
      console.error('❌ [ContentRecovery] 自动恢复失败:', error);
      return null;
    }
  }

  /**
   * 快速恢复（从notes字段）
   */
  async quickRecover(
    cardId: string,
    currentFields: Record<string, string>
  ): Promise<RecoveryResult> {
    console.log(`⚡ [ContentRecovery] 快速恢复: ${cardId}`);

    const session = this.startRecoverySession(cardId, currentFields);

    try {
      const result = this.protectionService.recoverFromNotes(cardId, currentFields);
      
      if (result.success) {
        const attempt: RecoveryAttempt = {
          id: this.generateAttemptId(),
          method: 'quick_notes_recovery',
          timestamp: Date.now(),
          success: true,
          confidence: result.confidence,
          recoveredFields: result.recoveredFields,
          warnings: result.warnings,
          errors: []
        };

        session.attempts.push(attempt);
        session.status = 'completed';

        return {
          success: true,
          method: 'quick_notes_recovery',
          confidence: result.confidence,
          recoveredFields: result.recoveredFields,
          warnings: result.warnings,
          errors: [],
          session
        };
      } else {
        throw new Error('快速恢复失败');
      }
    } catch (error) {
      session.status = 'failed';
      
      return {
        success: false,
        method: 'quick_notes_recovery',
        confidence: 0,
        recoveredFields: currentFields,
        warnings: [],
        errors: [error instanceof Error ? error.message : String(error)],
        session
      };
    }
  }

  /**
   * 结束恢复会话
   */
  endRecoverySession(cardId: string): void {
    const session = this.activeSessions.get(cardId);
    if (session) {
      session.status = session.status === 'active' ? 'cancelled' : session.status;
      this.activeSessions.delete(cardId);
      console.log(`🏁 [ContentRecovery] 恢复会话结束: ${cardId}`);
    }
  }

  /**
   * 获取恢复会话
   */
  getRecoverySession(cardId: string): RecoverySession | undefined {
    return this.activeSessions.get(cardId);
  }

  /**
   * 获取所有活跃会话
   */
  getActiveSessions(): RecoverySession[] {
    return Array.from(this.activeSessions.values()).filter(s => s.status === 'active');
  }

  /**
   * 清理过期会话
   */
  cleanupExpiredSessions(): number {
    const now = Date.now();
    const expiredThreshold = 24 * 60 * 60 * 1000; // 24小时
    let cleaned = 0;

    for (const [cardId, session] of this.activeSessions) {
      if (now - session.startTime > expiredThreshold) {
        this.activeSessions.delete(cardId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 [ContentRecovery] 清理了${cleaned}个过期会话`);
    }

    return cleaned;
  }

  /**
   * 获取恢复统计信息
   */
  getRecoveryStatistics(): {
    totalSessions: number;
    activeSessions: number;
    completedSessions: number;
    failedSessions: number;
    averageAttempts: number;
    successRate: number;
  } {
    const allSessions = Array.from(this.activeSessions.values());
    const activeSessions = allSessions.filter(s => s.status === 'active').length;
    const completedSessions = allSessions.filter(s => s.status === 'completed').length;
    const failedSessions = allSessions.filter(s => s.status === 'failed').length;
    
    const totalAttempts = allSessions.reduce((sum, s) => sum + s.attempts.length, 0);
    const averageAttempts = allSessions.length > 0 ? totalAttempts / allSessions.length : 0;
    
    const successfulAttempts = allSessions.reduce((sum, s) => 
      sum + s.attempts.filter(a => a.success).length, 0
    );
    const successRate = totalAttempts > 0 ? successfulAttempts / totalAttempts : 0;

    return {
      totalSessions: allSessions.length,
      activeSessions,
      completedSessions,
      failedSessions,
      averageAttempts,
      successRate
    };
  }

  // 私有方法

  private async performRecovery(
    cardId: string,
    option: RecoveryOption,
    session: RecoverySession
  ): Promise<any> {
    switch (option.type) {
      case 'restore_from_notes':
        return this.protectionService.recoverFromNotes(cardId, session.currentFields);
        
      case 'restore_from_backup':
        const snapshotId = option.id.replace('recover_from_backup_', '');
        return this.protectionService.recoverFromBackup(cardId, snapshotId);
        
      case 'merge_content':
        return this.performMergeRecovery(session);
        
      case 'manual_recovery':
        return this.performManualRecovery(option);
        
      default:
        throw new Error(`不支持的恢复类型: ${option.type}`);
    }
  }

  private async performMergeRecovery(session: RecoverySession): Promise<any> {
    const mergedFields = { ...session.currentFields };
    
    if (session.originalContent) {
      const lines = session.originalContent.split('\n').filter(line => line.trim());
      if (lines.length > 0 && !mergedFields.question) {
        mergedFields.question = lines[0];
      }
      if (lines.length > 1 && !mergedFields.answer) {
        mergedFields.answer = lines.slice(1).join('\n');
      }
    }

    return {
      success: true,
      confidence: 0.6,
      recoveredFields: mergedFields,
      warnings: ['使用了合并恢复策略，请验证结果']
    };
  }

  private async performManualRecovery(option: RecoveryOption): Promise<any> {
    return {
      success: true,
      confidence: option.confidence,
      recoveredFields: {
        question: option.previewData.question,
        answer: option.previewData.answer,
        notes: option.previewData.notes
      },
      warnings: ['请手动验证恢复的内容']
    };
  }

  private generateAttemptId(): string {
    return `attempt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 销毁服务
   */
  destroy(): void {
    this.activeSessions.clear();
    console.log('🔄 [ContentRecovery] 内容恢复服务已销毁');
  }
}
