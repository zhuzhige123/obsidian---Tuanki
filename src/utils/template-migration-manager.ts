/**
 * 模板系统迁移管理器
 * 协调整个模板系统统一重构过程
 */

import type AnkiPlugin from '../main';
import { TemplateMigrationBackupManager, type RestoreResult } from './template-migration-backup';
// 使用现有的预设模板管理器
import { defaultPresetTemplateManager } from '../templates/preset-templates';
import type { FieldTemplate, TriadTemplate } from '../data/template-types';
import { generateId } from './helpers';

export interface MigrationStep {
  id: string;
  name: string;
  description: string;
  phase: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  error?: string;
  startTime?: string;
  endTime?: string;
  backupId?: string;
}

export interface MigrationProgress {
  currentStep: number;
  totalSteps: number;
  currentStepName: string;
  overallProgress: number;
  phase: string;
  isRunning: boolean;
  canRollback: boolean;
  lastBackupId?: string;
}

export interface MigrationResult {
  success: boolean;
  message: string;
  completedSteps: string[];
  failedSteps: string[];
  backupIds: string[];
  warnings: string[];
}

export class TemplateMigrationManager {
  private plugin: AnkiPlugin;
  private backupManager: TemplateMigrationBackupManager;
  private steps: MigrationStep[] = [];
  private currentStepIndex = 0;
  private isRunning = false;
  private progressCallback?: (progress: MigrationProgress) => void;

  constructor(plugin: AnkiPlugin) {
    this.plugin = plugin;
    this.backupManager = new TemplateMigrationBackupManager(plugin);
    this.initializeMigrationSteps();
  }

  /**
   * 初始化迁移步骤
   */
  private initializeMigrationSteps(): void {
    this.steps = [
      // 阶段2：核心系统统一
      {
        id: 'backup-phase2',
        name: '创建阶段2备份',
        description: '为核心系统统一创建备份',
        phase: 'phase2',
        status: 'pending'
      },
      {
        id: 'unify-template-loading',
        name: '统一模板加载机制',
        description: '将所有组件统一使用三位一体模板系统',
        phase: 'phase2',
        status: 'pending'
      },
      {
        id: 'refactor-card-management',
        name: '重构卡片管理界面',
        description: '修复卡片管理界面中的混合模板加载问题',
        phase: 'phase2',
        status: 'pending'
      },
      {
        id: 'cleanup-deprecated-code',
        name: '清理弃用代码',
        description: '移除所有标记为🗑️的弃用代码和注释',
        phase: 'phase2',
        status: 'pending'
      },
      
      // 阶段3：APKG导入集成
      {
        id: 'backup-phase3',
        name: '创建阶段3备份',
        description: '为APKG导入集成创建备份',
        phase: 'phase3',
        status: 'pending'
      },
      {
        id: 'apkg-triad-conversion',
        name: 'APKG模板转换',
        description: 'APKG导入模板自动转换为三位一体模板',
        phase: 'phase3',
        status: 'pending'
      },
      {
        id: 'apkg-settings-display',
        name: 'APKG模板设置显示',
        description: '确保APKG模板显示在设置界面',
        phase: 'phase3',
        status: 'pending'
      },
      
      // 阶段4：模板编辑界面完善
      {
        id: 'backup-phase4',
        name: '创建阶段4备份',
        description: '为模板编辑界面完善创建备份',
        phase: 'phase4',
        status: 'pending'
      },
      {
        id: 'unify-template-editor',
        name: '统一模板编辑界面',
        description: '确保所有模板类型都能在统一界面管理',
        phase: 'phase4',
        status: 'pending'
      },
      {
        id: 'consistency-check-repair',
        name: '一致性检查和修复',
        description: '实现三位一体模板间的一致性检查和自动修复',
        phase: 'phase4',
        status: 'pending'
      }
    ];
  }

  /**
   * 开始迁移过程
   */
  async startMigration(progressCallback?: (progress: MigrationProgress) => void): Promise<MigrationResult> {
    if (this.isRunning) {
      throw new Error('迁移过程已在运行中');
    }

    this.isRunning = true;
    this.progressCallback = progressCallback;
    this.currentStepIndex = 0;

    const result: MigrationResult = {
      success: false,
      message: '',
      completedSteps: [],
      failedSteps: [],
      backupIds: [],
      warnings: []
    };

    try {
      console.log('[MigrationManager] 开始模板系统迁移');
      
      // 创建初始备份
      const initialBackupId = await this.backupManager.createMigrationBackup(
        'initial',
        '迁移开始前的完整备份'
      );
      result.backupIds.push(initialBackupId);

      // 执行所有迁移步骤
      for (let i = 0; i < this.steps.length; i++) {
        this.currentStepIndex = i;
        const step = this.steps[i];
        
        this.updateProgress();
        
        try {
          await this.executeStep(step);
          result.completedSteps.push(step.name);
          
          if (step.backupId) {
            result.backupIds.push(step.backupId);
          }
        } catch (error) {
          step.status = 'failed';
          step.error = error instanceof Error ? error.message : String(error);
          result.failedSteps.push(step.name);
          
          console.error(`[MigrationManager] 步骤失败: ${step.name}`, error);
          
          // 决定是否继续或停止
          if (this.isCriticalStep(step)) {
            throw new Error(`关键步骤失败: ${step.name} - ${step.error}`);
          } else {
            result.warnings.push(`非关键步骤失败: ${step.name} - ${step.error}`);
          }
        }
      }

      result.success = result.failedSteps.length === 0;
      result.message = result.success 
        ? `迁移成功完成，共执行 ${result.completedSteps.length} 个步骤`
        : `迁移部分完成，${result.completedSteps.length} 个成功，${result.failedSteps.length} 个失败`;

      console.log('[MigrationManager] 迁移完成:', result.message);

    } catch (error) {
      result.success = false;
      result.message = `迁移失败: ${error instanceof Error ? error.message : String(error)}`;
      console.error('[MigrationManager] 迁移失败:', error);
    } finally {
      this.isRunning = false;
      this.updateProgress();
    }

    return result;
  }

  /**
   * 执行单个迁移步骤
   */
  private async executeStep(step: MigrationStep): Promise<void> {
    console.log(`[MigrationManager] 执行步骤: ${step.name}`);
    
    step.status = 'running';
    step.startTime = new Date().toISOString();
    
    try {
      switch (step.id) {
        case 'backup-phase2':
        case 'backup-phase3':
        case 'backup-phase4':
          step.backupId = await this.backupManager.createMigrationBackup(
            step.phase,
            step.description
          );
          break;
          
        case 'unify-template-loading':
          await this.unifyTemplateLoading();
          break;
          
        case 'refactor-card-management':
          await this.refactorCardManagement();
          break;
          
        case 'cleanup-deprecated-code':
          await this.cleanupDeprecatedCode();
          break;
          
        case 'apkg-triad-conversion':
          await this.implementAPKGTriadConversion();
          break;
          
        case 'apkg-settings-display':
          await this.ensureAPKGSettingsDisplay();
          break;
          
        case 'unify-template-editor':
          await this.unifyTemplateEditor();
          break;
          
        case 'consistency-check-repair':
          await this.implementConsistencyCheck();
          break;
          
        default:
          throw new Error(`未知的迁移步骤: ${step.id}`);
      }
      
      step.status = 'completed';
      step.endTime = new Date().toISOString();
      
    } catch (error) {
      step.status = 'failed';
      step.error = error instanceof Error ? error.message : String(error);
      step.endTime = new Date().toISOString();
      throw error;
    }
  }

  /**
   * 统一模板加载机制
   */
  private async unifyTemplateLoading(): Promise<void> {
    // 这里将在后续步骤中实现具体的代码修改
    console.log('[MigrationManager] 统一模板加载机制 - 待实现');
  }

  /**
   * 重构卡片管理界面
   */
  private async refactorCardManagement(): Promise<void> {
    // 这里将在后续步骤中实现具体的代码修改
    console.log('[MigrationManager] 重构卡片管理界面 - 待实现');
  }

  /**
   * 清理弃用代码
   */
  private async cleanupDeprecatedCode(): Promise<void> {
    // 这里将在后续步骤中实现具体的代码修改
    console.log('[MigrationManager] 清理弃用代码 - 待实现');
  }

  /**
   * 实现APKG三位一体转换
   */
  private async implementAPKGTriadConversion(): Promise<void> {
    // 这里将在后续步骤中实现具体的代码修改
    console.log('[MigrationManager] 实现APKG三位一体转换 - 待实现');
  }

  /**
   * 确保APKG设置显示
   */
  private async ensureAPKGSettingsDisplay(): Promise<void> {
    // 这里将在后续步骤中实现具体的代码修改
    console.log('[MigrationManager] 确保APKG设置显示 - 待实现');
  }

  /**
   * 统一模板编辑器
   */
  private async unifyTemplateEditor(): Promise<void> {
    // 这里将在后续步骤中实现具体的代码修改
    console.log('[MigrationManager] 统一模板编辑器 - 待实现');
  }

  /**
   * 实现一致性检查
   */
  private async implementConsistencyCheck(): Promise<void> {
    // 这里将在后续步骤中实现具体的代码修改
    console.log('[MigrationManager] 实现一致性检查 - 待实现');
  }

  /**
   * 判断是否为关键步骤
   */
  private isCriticalStep(step: MigrationStep): boolean {
    const criticalSteps = [
      'backup-phase2',
      'backup-phase3', 
      'backup-phase4',
      'unify-template-loading'
    ];
    return criticalSteps.includes(step.id);
  }

  /**
   * 更新进度
   */
  private updateProgress(): void {
    if (!this.progressCallback) return;

    const progress: MigrationProgress = {
      currentStep: this.currentStepIndex + 1,
      totalSteps: this.steps.length,
      currentStepName: this.steps[this.currentStepIndex]?.name || '完成',
      overallProgress: Math.round(((this.currentStepIndex + 1) / this.steps.length) * 100),
      phase: this.steps[this.currentStepIndex]?.phase || 'completed',
      isRunning: this.isRunning,
      canRollback: !this.isRunning && this.currentStepIndex > 0,
      lastBackupId: this.getLastBackupId()
    };

    this.progressCallback(progress);
  }

  /**
   * 获取最后的备份ID
   */
  private getLastBackupId(): string | undefined {
    for (let i = this.currentStepIndex; i >= 0; i--) {
      if (this.steps[i]?.backupId) {
        return this.steps[i].backupId;
      }
    }
    return undefined;
  }

  /**
   * 回滚到指定备份
   */
  async rollbackToBackup(backupId: string): Promise<RestoreResult> {
    if (this.isRunning) {
      throw new Error('无法在迁移运行时执行回滚');
    }

    console.log(`[MigrationManager] 开始回滚到备份: ${backupId}`);
    
    const result = await this.backupManager.restoreFromBackup(backupId);
    
    if (result.success) {
      // 重置迁移状态
      this.currentStepIndex = 0;
      this.steps.forEach(step => {
        step.status = 'pending';
        step.error = undefined;
        step.startTime = undefined;
        step.endTime = undefined;
      });
      
      console.log('[MigrationManager] 回滚成功，迁移状态已重置');
    }
    
    return result;
  }

  /**
   * 获取迁移状态
   */
  getMigrationStatus(): {
    steps: MigrationStep[];
    progress: MigrationProgress;
    isRunning: boolean;
  } {
    return {
      steps: [...this.steps],
      progress: {
        currentStep: this.currentStepIndex + 1,
        totalSteps: this.steps.length,
        currentStepName: this.steps[this.currentStepIndex]?.name || '完成',
        overallProgress: Math.round(((this.currentStepIndex + 1) / this.steps.length) * 100),
        phase: this.steps[this.currentStepIndex]?.phase || 'completed',
        isRunning: this.isRunning,
        canRollback: !this.isRunning && this.currentStepIndex > 0,
        lastBackupId: this.getLastBackupId()
      },
      isRunning: this.isRunning
    };
  }

  /**
   * 获取可用备份
   */
  async getAvailableBackups() {
    return await this.backupManager.getAvailableBackups();
  }
}
