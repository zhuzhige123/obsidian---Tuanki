<!--
  数据管理主面板组件
  集成所有数据管理功能的统一界面
  使用 Svelte 5 响应式架构
-->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Notice } from 'obsidian';
  import { resolveService } from '../../../architecture/dependency-injection';
  import { SERVICE_TOKENS } from '../../../architecture/dependency-injection';
  import { OperationType } from '../../../types/data-management-types';
  import type {
    DataOverview,
    BackupInfo,
    OperationProgress,
    SecurityLevel,
    ValidationIssue
  } from '../../../types/data-management-types';
  
  // 响应式存储
  import { BackupReactiveStore } from '../../../stores/BackupReactiveStore';

  // 导入子组件
  import DataOverviewCard from '../data-management/DataOverviewCard.svelte';
  import BackupHistoryList from '../data-management/BackupHistoryList.svelte';
  import DataOperationToolbar from '../data-management/DataOperationToolbar.svelte';
  import ConfirmationDialog from '../data-management/ConfirmationDialog.svelte';
  import ProgressIndicator from '../data-management/ProgressIndicator.svelte';
  import AutoBackupConfig from '../data-management/AutoBackupConfig.svelte';

  interface Props {
    plugin: any;
    onSave: () => Promise<void>;
  }

  let { plugin }: Props = $props();

  // 响应式备份存储
  let backupStore: BackupReactiveStore | null = null;
  
  // 数据管理服务（用于数据概览）
  let dataManagementService: any;

  // 使用 Svelte 5 $state 管理响应式状态
  let dataOverview = $state<DataOverview | null>(null);
  let lastError = $state<string | null>(null);
  let storeUpdateTrigger = $state(0); // 用于触发响应式更新
  
  // 自动派生的状态（基于 storeUpdateTrigger）
  let backupHistory = $derived.by(() => {
    storeUpdateTrigger; // 依赖此值以触发更新
    return backupStore?.backups || [];
  });
  
  let isLoading = $derived.by(() => {
    storeUpdateTrigger;
    return backupStore?.isLoading || false;
  });
  
  let operationProgress = $derived.by(() => {
    storeUpdateTrigger;
    if (!backupStore?.currentOperation) return null;
    
    return {
      operation: backupStore.currentOperation.type,
      progress: backupStore.currentOperation.progress,
      status: backupStore.currentOperation.status,
      processedCount: 0,
      totalCount: 100,
      startTime: new Date().toISOString(),
      cancellable: false
    } as OperationProgress;
  });
  
  let operationInProgress = $derived.by(() => {
    storeUpdateTrigger;
    return backupStore?.currentOperation?.type || null;
  });
  
  // 自动修复建议
  let autoRepairSuggestion = $derived.by(() => {
    storeUpdateTrigger;
    if (!backupStore) return { show: false, count: 0, backups: [] };
    
    const stats = backupStore.stats;
    if (stats && stats.invalidBackups && stats.invalidBackups.length > 0) {
      return {
        show: true,
        count: stats.invalidBackups.length,
        backups: stats.invalidBackups
      };
    }
    return { show: false, count: 0, backups: [] };
  });

  // 确认对话框状态
  let confirmationDialog = $state({
    isOpen: false,
    title: '',
    message: '',
    securityLevel: 'safe' as SecurityLevel,
    requireTextConfirmation: false,
    confirmationPhrase: '',
    details: [] as string[],
    warningItems: [] as string[],
    onConfirm: null as (() => Promise<void>) | null
  });

  // 初始化服务
  onMount(async () => {
    try {
      console.log('开始初始化数据管理服务...');

      // 检查插件是否可用
      if (!plugin) {
        throw new Error('Plugin实例不可用');
      }

      console.log('Plugin实例可用，初始化响应式存储...');
      
      // 创建响应式备份存储
      backupStore = new BackupReactiveStore(plugin);
      
      // 注册状态变化回调，触发 Svelte 响应式更新
      backupStore.subscribe(() => {
        storeUpdateTrigger++; // 增加触发器以触发所有 $derived 更新
      });
      
      // 解析数据管理服务
      dataManagementService = resolveService(SERVICE_TOKENS.DATA_MANAGEMENT_SERVICE);

      console.log('服务初始化成功，开始加载初始数据...');
      await loadInitialData();
      console.log('数据管理服务初始化完成');
    } catch (error) {
      console.error('初始化数据管理服务失败:', error);
      lastError = `服务初始化失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  });

  // 加载初始数据
  async function loadInitialData() {
    lastError = null;

    try {
      // 并行加载数据概览和备份列表
      await Promise.all([
        loadDataOverview(),
        backupStore?.loadBackups()
      ]);
    } catch (error) {
      console.error('加载数据失败:', error);
      lastError = '数据加载失败，请重试';
    }
  }
  
  // 加载数据概览
  async function loadDataOverview() {
    try {
      dataOverview = await dataManagementService.getDataOverview();
    } catch (error) {
      console.error('获取数据概览失败:', error);
      // 不阻塞其他功能
    }
  }

  // 刷新数据概览
  async function refreshDataOverview() {
    try {
      dataOverview = await dataManagementService.getDataOverview();
    } catch (error) {
      console.error('刷新数据概览失败:', error);
      lastError = '刷新失败，请重试';
    }
  }

  // 刷新备份历史
  async function refreshBackupHistory() {
    try {
      await backupStore?.loadBackups();
    } catch (error) {
      console.error('刷新备份历史失败:', error);
      lastError = '刷新失败，请重试';
    }
  }

  // 打开文件夹
  async function handleOpenFolder() {
    try {
      await dataManagementService.openDataFolder();
    } catch (error) {
      console.error('打开文件夹失败:', error);
      lastError = '无法打开文件夹';
    }
  }

  // 导出数据
  async function handleExportData() {
    showConfirmationDialog({
      title: '导出数据',
      message: '确定要导出所有数据吗？',
      securityLevel: 'safe',
      details: [
        '将导出所有牌组和卡片数据',
        '包含学习记录和用户设置',
        '生成JSON格式的导出文件'
      ],
      onConfirm: async () => {
        try {
          const result = await dataManagementService.exportData({
            dataTypes: ['decks', 'cards', 'sessions', 'profile', 'templates'],
            includeMedia: true,
            compress: false,
            format: 'json'
          });
          
          if (result.success) {
            new Notice(`✅ 数据导出成功\n文件: ${result.filePath}`);
            console.log('数据导出成功:', result.filePath);
          } else {
            throw new Error(result.error || '导出失败');
          }
        } catch (error) {
          console.error('导出失败:', error);
          const errorMsg = error instanceof Error ? error.message : '导出失败';
          new Notice(`❌ 导出失败: ${errorMsg}`, 5000);
          lastError = errorMsg;
        }
      }
    });
  }

  // 导入数据
  async function handleImportData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      showConfirmationDialog({
        title: '导入数据',
        message: '确定要导入数据吗？此操作将覆盖现有数据！',
        securityLevel: 'caution',
        details: [
          `文件名: ${file.name}`,
          `文件大小: ${(file.size / 1024 / 1024).toFixed(2)} MB`,
          '导入前将自动创建备份'
        ],
        warningItems: [
          '现有数据可能被覆盖',
          '请确保导入文件格式正确',
          '建议先创建手动备份'
        ],
        onConfirm: async () => {
          try {
            const result = await dataManagementService.importData(file, {
              conflictStrategy: 'ask',
              createBackup: true,
              validateData: true,
              batchSize: 100
            });
            
            if (result.success) {
              await loadInitialData(); // 重新加载数据
              new Notice(`✅ 数据导入成功\n导入: ${result.importedCount} 条，跳过: ${result.skippedCount} 条`);
            } else {
              throw new Error(result.error || '导入失败');
            }
          } catch (error) {
            console.error('导入失败:', error);
            const errorMsg = error instanceof Error ? error.message : '导入失败';
            new Notice(`❌ 导入失败: ${errorMsg}`, 5000);
            lastError = errorMsg;
          }
        }
      });
    };
    
    input.click();
  }

  // 创建备份
  async function handleCreateBackup() {
    try {
      const backup = await backupStore?.createBackup('手动备份');
      
      if (!backup) {
        throw new Error('创建备份失败');
      }
      
      new Notice(`✅ 备份创建成功\n大小: ${(backup.size / 1024 / 1024).toFixed(2)} MB`);
      // 响应式系统会自动更新UI，无需手动刷新
    } catch (error) {
      console.error('创建备份失败:', error);
      const errorMsg = error instanceof Error ? error.message : '创建备份失败';
      new Notice(`❌ 创建备份失败: ${errorMsg}`, 5000);
      lastError = errorMsg;
    }
  }

  // 恢复备份
  async function handleRestoreBackup(backupId?: string) {
    if (!backupId && backupHistory.length === 0) {
      lastError = '没有可用的备份';
      return;
    }

    const targetBackupId = backupId || backupHistory[0]?.id;
    const backup = backupHistory.find(b => b.id === targetBackupId);
    
    if (!backup) {
      lastError = '备份不存在';
      return;
    }

    showConfirmationDialog({
      title: '恢复备份',
      message: '确定要从备份恢复数据吗？',
      securityLevel: 'caution',
      details: [
        `备份时间: ${new Date(backup.timestamp).toLocaleString()}`,
        `备份大小: ${(backup.size / 1024 / 1024).toFixed(2)} MB`,
        `备份类型: ${backup.type}`
      ],
      warningItems: [
        '当前数据将被覆盖',
        '恢复前将自动创建备份',
        '此操作不可撤销'
      ],
      onConfirm: async () => {
        try {
          // 使用旧的备份管理服务恢复功能
          const backupManagementService = resolveService(SERVICE_TOKENS.BACKUP_MANAGEMENT_SERVICE);
          const result = await backupManagementService.restoreFromBackup(targetBackupId, {
            dataTypes: ['decks', 'cards', 'sessions', 'profile'],
            createPreRestoreBackup: true,
            conflictStrategy: 'overwrite'
          });
          
          if (result.success) {
            await loadInitialData();
            new Notice(`✅ 数据恢复成功\n恢复文件数: ${result.restoredFileCount}`);
            closeConfirmationDialog();
          } else {
            throw new Error(result.error || '恢复失败');
          }
        } catch (error) {
          console.error('恢复失败:', error);
          const errorMsg = error instanceof Error ? error.message : '恢复失败';
          new Notice(`❌ 恢复失败: ${errorMsg}`, 5000);
          lastError = errorMsg;
          closeConfirmationDialog();
        }
      }
    });
  }

  // 重置数据
  async function handleResetData() {
    showConfirmationDialog({
      title: '重置所有数据',
      message: '此操作将永久删除所有数据！',
      securityLevel: 'danger',
      requireTextConfirmation: true,
      confirmationPhrase: '确认重置',
      details: [
        `将删除 ${dataOverview?.totalCards || 0} 张卡片`,
        `将删除 ${dataOverview?.totalDecks || 0} 个牌组`,
        `将删除 ${dataOverview?.totalSessions || 0} 次学习记录`,
        '将清空所有用户设置'
      ],
      warningItems: [
        '此操作不可撤销！',
        '重置前将自动创建备份',
        '请确保您真的要执行此操作'
      ],
      onConfirm: async () => {
        try {
          const result = await dataManagementService.resetData('确认重置');
          
          if (result.success) {
            await loadInitialData();
            new Notice(`✅ 数据重置成功\n已清理 ${result.clearedRecordCount} 条记录`);
            closeConfirmationDialog();
          } else {
            throw new Error(result.error || '重置失败');
          }
        } catch (error) {
          console.error('重置失败:', error);
          const errorMsg = error instanceof Error ? error.message : '重置失败';
          new Notice(`❌ 重置失败: ${errorMsg}`, 5000);
          lastError = errorMsg;
          closeConfirmationDialog();
        }
      }
    });
  }

  // 数据完整性检查
  async function handleCheckIntegrity() {
    try {
      const result = await dataManagementService.checkDataIntegrity();
      
      if (result.passed) {
        new Notice(`✅ 数据完整性检查通过\n得分: ${result.score}/100`);
      } else {
        const criticalIssues = result.issues.filter((i: ValidationIssue) => i.severity === 'critical' || i.severity === 'error');
        new Notice(`⚠️ 发现 ${criticalIssues.length} 个严重问题\n得分: ${result.score}/100`, 5000);
      }
      
      // 显示详细问题列表
      if (result.issues.length > 0) {
        showConfirmationDialog({
          title: '数据完整性检查结果',
          message: `检查得分: ${result.score}/100`,
          securityLevel: result.passed ? 'safe' : 'caution',
          details: result.issues.map((issue: ValidationIssue) => 
            `[${issue.severity.toUpperCase()}] ${issue.description}`
          ),
          warningItems: result.issues
            .filter((i: ValidationIssue) => i.fixSuggestion)
            .map((i: ValidationIssue) => i.fixSuggestion!),
          confirmText: '关闭',
          onConfirm: () => {
            closeConfirmationDialog();
          }
        });
      }
    } catch (error) {
      console.error('完整性检查失败:', error);
      new Notice('❌ 完整性检查失败', 5000);
      lastError = error instanceof Error ? error.message : '完整性检查失败';
    }
  }

  // 删除备份
  async function handleDeleteBackup(backupId: string) {
    const backup = backupHistory.find(b => b.id === backupId);
    if (!backup) return;

    showConfirmationDialog({
      title: '删除备份',
      message: '确定要删除此备份吗？',
      securityLevel: 'caution',
      details: [
        `备份时间: ${new Date(backup.timestamp).toLocaleString()}`,
        `备份大小: ${(backup.size / 1024 / 1024).toFixed(2)} MB`
      ],
      warningItems: [
        '删除后无法恢复',
        '建议保留重要备份'
      ],
      onConfirm: async () => {
        try {
          await backupStore?.deleteBackup(backupId);
          new Notice('✅ 备份已删除');
          // 响应式系统会自动更新UI
          closeConfirmationDialog();
        } catch (error) {
          console.error('删除备份失败:', error);
          new Notice('❌ 删除备份失败', 5000);
          lastError = '删除备份失败';
          closeConfirmationDialog();
        }
      }
    });
  }
  
  // 自动修复所有无效备份
  async function handleAutoRepairAll() {
    if (!backupStore) return;
    
    try {
      const result = await backupStore.autoRepairAll();
      
      if (result.success > 0) {
        new Notice(`✅ 成功修复 ${result.success} 个备份`);
        console.log(`成功修复 ${result.success} 个备份`);
      }
      
      if (result.failed > 0) {
        const msg = `⚠️ 修复了 ${result.success} 个备份，${result.failed} 个修复失败`;
        new Notice(msg, 5000);
        lastError = msg;
      }
    } catch (error) {
      console.error('批量修复失败:', error);
      new Notice('❌ 批量修复失败', 5000);
      lastError = '批量修复失败';
    }
  }
  
  // 批量清理无效备份
  async function handleCleanupInvalidBackups() {
    if (!backupStore) return;
    
    showConfirmationDialog({
      title: '清理无效备份',
      message: '确定要删除所有无效的备份吗？',
      securityLevel: 'warning',
      details: [
        '将删除所有损坏或数据为空的备份',
        '此操作不可撤销'
      ],
      warningItems: [
        '请确保已有其他有效备份',
        '建议先检查备份列表'
      ],
      onConfirm: async () => {
        if (!backupStore) return;
        
        try {
          const result = await backupStore.cleanupInvalidBackups();
          
          if (result) {
            const msg = `✅ 成功删除 ${result.deleted} 个无效备份${result.failed > 0 ? `，失败 ${result.failed} 个` : ''}`;
            new Notice(msg);
            console.log(msg);
          }
        } catch (error) {
          console.error('清理无效备份失败:', error);
          new Notice('❌ 清理无效备份失败', 5000);
          lastError = '清理无效备份失败';
        }
      }
    });
  }

  // 预览备份
  async function handlePreviewBackup(backupId: string) {
    if (!backupStore) return;
    
    try {
      const preview = await backupStore.previewBackup(backupId);
      
      if (preview) {
        const backup = backupHistory.find(b => b.id === backupId);
        const backupTime = backup ? new Date(backup.timestamp).toLocaleString() : '未知';
        
        showConfirmationDialog({
          title: '备份预览',
          message: `备份时间: ${backupTime}`,
          securityLevel: 'safe',
          confirmText: '关闭',
          details: [
            `牌组数量: ${preview.deckCount} 个`,
            `卡片数量: ${preview.cardCount} 个`,
            `备份ID: ${backupId}`
          ],
          onConfirm: () => {
            closeConfirmationDialog();
          }
        });
      }
    } catch (error) {
      console.error('预览备份失败:', error);
      lastError = '预览备份失败';
    }
  }

  // 显示确认对话框
  function showConfirmationDialog(config: any) {
    confirmationDialog = {
      isOpen: true,
      title: config.title,
      message: config.message,
      securityLevel: config.securityLevel,
      requireTextConfirmation: config.requireTextConfirmation || false,
      confirmationPhrase: config.confirmationPhrase || '确认操作',
      details: config.details || [],
      warningItems: config.warningItems || [],
      onConfirm: config.onConfirm
    };
  }

  // 关闭确认对话框
  function closeConfirmationDialog() {
    confirmationDialog.isOpen = false;
  }

  // 清理
  onDestroy(() => {
    // 清理响应式存储
    if (backupStore) {
      backupStore.reset();
    }
  });
</script>

<!-- 数据管理主面板 -->
<div class="tuanki-settings data-management-panel">
  <!-- 错误提示 -->
  {#if lastError}
    <div class="error-banner">
      <div class="error-icon">❌</div>
      <div class="error-message">{lastError}</div>
      <button class="error-dismiss" onclick={() => lastError = null}>✕</button>
    </div>
  {/if}

  <!-- 自动修复建议 -->
  {#if autoRepairSuggestion.show}
    <div class="repair-suggestion-banner">
      <div class="repair-icon">🔧</div>
      <div class="repair-content">
        <div class="repair-title">发现 {autoRepairSuggestion.count} 个损坏的备份</div>
        <div class="repair-description">这些备份可能缺少必要文件或元数据损坏，建议尝试自动修复或直接清理</div>
      </div>
      <div class="repair-actions">
        <button class="repair-button" onclick={handleAutoRepairAll}>
          自动修复全部
        </button>
        <button class="cleanup-button" onclick={handleCleanupInvalidBackups}>
          清理无效备份
        </button>
      </div>
      <button class="repair-dismiss" onclick={() => backupStore?.clearError()}>✕</button>
    </div>
  {/if}

  <!-- 进度指示器 -->
  <ProgressIndicator 
    progress={operationProgress}
    isVisible={operationProgress !== null}
    allowCancel={false}
  />

  <!-- 数据概览 -->
  <DataOverviewCard
    overview={dataOverview}
    isLoading={isLoading}
    onRefresh={refreshDataOverview}
    onOpenFolder={handleOpenFolder}
  />

  <!-- 自动备份配置 -->
  <AutoBackupConfig {plugin} />

  <!-- 备份历史 -->
  <BackupHistoryList
    backups={backupHistory}
    maxBackups={3}
    isLoading={isLoading}
    onRestore={handleRestoreBackup}
    onDelete={handleDeleteBackup}
    onPreview={handlePreviewBackup}
  />

  <!-- 操作工具栏 -->
  <DataOperationToolbar 
    disabled={isLoading || operationInProgress !== null}
    operationInProgress={operationInProgress}
    onCheckIntegrity={handleCheckIntegrity}
    onExport={handleExportData}
    onImport={handleImportData}
    onBackup={handleCreateBackup}
    onRestore={() => handleRestoreBackup()}
    onReset={handleResetData}
    onOpenFolder={() => handleOpenFolder()}
  />

  <!-- 确认对话框 -->
  <ConfirmationDialog 
    isOpen={confirmationDialog.isOpen}
    title={confirmationDialog.title}
    message={confirmationDialog.message}
    securityLevel={confirmationDialog.securityLevel}
    requireTextConfirmation={confirmationDialog.requireTextConfirmation}
    confirmationPhrase={confirmationDialog.confirmationPhrase}
    details={confirmationDialog.details}
    warningItems={confirmationDialog.warningItems}
    onConfirm={confirmationDialog.onConfirm || undefined}
    onCancel={closeConfirmationDialog}
  />
</div>

<style>
  .data-management-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  /* 错误横幅 */
  .error-banner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem;
    background: color-mix(in oklab, var(--text-error), transparent 90%);
    border: 1px solid var(--text-error);
    border-radius: 6px;
    color: var(--text-error);
  }

  .error-icon {
    font-size: 1.25rem;
    flex-shrink: 0;
  }

  .error-message {
    flex: 1;
    font-size: 0.875rem;
  }

  .error-dismiss {
    width: 1.5rem;
    height: 1.5rem;
    border: none;
    background: none;
    color: var(--text-error);
    cursor: pointer;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.875rem;
  }

  .error-dismiss:hover {
    background: color-mix(in oklab, var(--text-error), transparent 80%);
  }

  /* 自动修复建议横幅 */
  .repair-suggestion-banner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem;
    background: color-mix(in oklab, var(--color-blue), transparent 90%);
    border: 1px solid var(--color-blue);
    border-radius: 6px;
  }

  .repair-icon {
    font-size: 1.25rem;
    flex-shrink: 0;
  }

  .repair-content {
    flex: 1;
    min-width: 0;
  }

  .repair-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-normal);
    margin-bottom: 0.25rem;
  }

  .repair-description {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .repair-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .repair-button {
    padding: 0.5rem 1rem;
    font-size: 0.75rem;
    font-weight: 500;
    border: 1px solid var(--color-blue);
    border-radius: 4px;
    background: var(--color-blue);
    color: white;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .repair-button:hover {
    background: color-mix(in oklab, var(--color-blue), black 10%);
  }

  .cleanup-button {
    padding: 0.5rem 1rem;
    font-size: 0.75rem;
    font-weight: 500;
    border: 1px solid var(--text-error);
    border-radius: 4px;
    background: transparent;
    color: var(--text-error);
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .cleanup-button:hover {
    background: color-mix(in oklab, var(--text-error), transparent 90%);
  }

  .repair-dismiss {
    width: 1.5rem;
    height: 1.5rem;
    border: none;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.875rem;
    flex-shrink: 0;
  }

  .repair-dismiss:hover {
    background: color-mix(in oklab, var(--color-blue), transparent 80%);
    color: var(--text-normal);
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .data-management-panel {
      gap: 0.75rem;
    }
  }
</style>
