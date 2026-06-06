<!--
  数据管理主面板组件
  集成所有数据管理功能的统一界面
  使用 Svelte 5 响应式架构
-->
<script lang="ts">
  import { logger } from '../../../utils/logger';

  import { onMount, onDestroy } from 'svelte';
  import { Notice, TFolder } from 'obsidian';
  import { OperationType } from '../../../types/data-management-types';
  import type {
    DataOverview,
    BackupInfo,
    OperationProgress,
    SecurityLevel
  } from '../../../types/data-management-types';
  
  // 响应式存储
  import { BackupReactiveStore } from '../../../stores/BackupReactiveStore';

  // 导入子组件
  import DataOverviewCard from '../data-management/DataOverviewCard.svelte';
  import DataOperationToolbar from '../data-management/DataOperationToolbar.svelte';
  import ConfirmationDialog from '../data-management/ConfirmationDialog.svelte';
  import ProgressIndicator from '../data-management/ProgressIndicator.svelte';
  import AutoBackupConfig from '../data-management/AutoBackupConfig.svelte';
  import ObsidianIcon from '../../ui/ObsidianIcon.svelte';
  import { Menu } from 'obsidian';
  import { formatFileSize } from '../../../utils/format-utils';
  
  //  导入国际化
  import { tr } from '../../../utils/i18n';
  import { getReadableWeaveRoot, normalizeWeaveParentFolder } from '../../../config/paths';
  import { DirectoryUtils } from '../../../utils/directory-utils';
  import { DataManagementService } from '../../../services/data-management-service';
  import { BackupManagementService } from '../../../services/backup-management-service';
  import { UnifiedDataMigrationService } from '../../../services/data-migration/UnifiedDataMigrationService';
  import { VaultFolderSuggestModal } from '../../../modals/VaultFolderSuggestModal';
  
  interface Props {
    plugin: any;
    onSave: () => Promise<void>;
  }

  async function tryRemoveEmptyFolder(folderPath: string): Promise<void> {
    const adapter = plugin.app.vault.adapter;
    try {
      if (!(await adapter.exists(folderPath))) return;
      const listing = await (adapter as any).list(folderPath);
      const files: string[] = listing?.files || [];
      const folders: string[] = listing?.folders || [];
      if (files.length === 0 && folders.length === 0) {
        await adapter.rmdir(folderPath, false);
      }
    } catch {
    }
  }

  async function mergeFolderContents(fromFolder: string, toFolder: string): Promise<void> {
    const vault = plugin.app.vault;
    const adapter = vault.adapter;

    if (!(await adapter.exists(toFolder))) {
      await vault.createFolder(toFolder);
    }

    const listing = await (adapter as any).list(fromFolder);
    const files: string[] = Array.isArray(listing?.files) ? listing.files : [];
    const folders: string[] = Array.isArray(listing?.folders) ? listing.folders : [];

    for (const filePath of files) {
      const name = filePath.split('/').pop();
      if (!name) continue;

      const targetPath = `${toFolder}/${name}`;
      const exists = await adapter.exists(targetPath);

      const srcObj = vault.getAbstractFileByPath(filePath);
      if (!srcObj) continue;

      if (!exists) {
        await vault.rename(srcObj, targetPath);
        continue;
      }

      const conflictsDir = `${toFolder}/_migration_conflicts`;
      await DirectoryUtils.ensureDirRecursive(adapter, conflictsDir);

      let conflictPath = `${conflictsDir}/${name}`;
      if (await adapter.exists(conflictPath)) {
        const dot = name.lastIndexOf('.');
        const base = dot > 0 ? name.slice(0, dot) : name;
        const ext = dot > 0 ? name.slice(dot) : '';
        conflictPath = `${conflictsDir}/${base}-${Date.now()}${ext}`;
      }
      await vault.rename(srcObj, conflictPath);
    }

    for (const folderPath of folders) {
      const name = folderPath.split('/').pop();
      if (!name) continue;
      const targetPath = `${toFolder}/${name}`;

      const srcObj = vault.getAbstractFileByPath(folderPath);
      if (!srcObj || !(srcObj instanceof TFolder)) continue;

      if (!(await adapter.exists(targetPath))) {
        await vault.rename(srcObj, targetPath);
        continue;
      }

      await mergeFolderContents(folderPath, targetPath);
      await tryRemoveEmptyFolder(folderPath);
    }
  }

  let { plugin }: Props = $props();
  
  //  响应式翻译函数
  let t = $derived($tr);

  // 响应式备份存储
  let backupStore: BackupReactiveStore | null = null;
  
  let weaveParentFolderInputEl = $state<HTMLInputElement | null>(null);
  let weaveParentFolderTriggerEl = $state<HTMLElement | null>(null);
  let weaveParentFolderPickerOpen = $state(false);
  
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
    confirmText: '',
    cancelText: '',
    requireTextConfirmation: false,
    confirmationPhrase: '',
    details: [] as string[],
    warningItems: [] as string[],
    onConfirm: null as (() => Promise<void>) | null
  });

  // 数据管理操作状态（与备份操作状态隔离）
  let dataOperationInProgress = $state<string | null>(null);

  // 初始化服务
  onMount(async () => {
    try {
      // 检查插件是否可用
      if (!plugin) {
        throw new Error('Plugin实例不可用');
      }
      
      // 创建响应式备份存储
      backupStore = new BackupReactiveStore(plugin);
      
      // 注册状态变化回调，触发 Svelte 响应式更新
      backupStore.subscribe(() => {
        storeUpdateTrigger++; // 增加触发器以触发所有 $derived 更新
      });
      
      // 创建数据管理服务
      dataManagementService = new DataManagementService(plugin.dataStorage, plugin);

      await loadInitialData();
    } catch (error) {
      logger.error('初始化数据管理服务失败:', error);
      lastError = `${t('dataManagement.initFailed')}: ${error instanceof Error ? error.message : String(error)}`;
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
      logger.error('加载数据失败:', error);
      lastError = t('dataManagement.backup.panel.loadFailed');
    }
  }
  
  // 加载数据概览
  async function loadDataOverview() {
    try {
      dataOverview = await dataManagementService.getDataOverview();
    } catch (error) {
      logger.error('获取数据概览失败:', error);
      // 不阻塞其他功能
    }
  }

  // 刷新数据概览
  async function refreshDataOverview() {
    try {
      dataOverview = await dataManagementService.getDataOverview();
    } catch (error) {
      logger.error('刷新数据概览失败:', error);
      lastError = t('dataManagement.backup.panel.refreshFailed');
    }
  }

  // 刷新备份历史
  async function refreshBackupHistory() {
    try {
      await backupStore?.loadBackups();
    } catch (error) {
      logger.error('刷新备份历史失败:', error);
      lastError = t('dataManagement.refreshFailed');
    }
  }

  // 打开文件夹
  async function handleOpenFolder() {
    try {
      await dataManagementService.openDataFolder();
    } catch (error) {
      logger.error('打开文件夹失败:', error);
      lastError = '无法打开文件夹';
    }
  }

  async function applyweaveParentFolder(newParentFolder: string): Promise<void> {
    const migrationService = new UnifiedDataMigrationService(plugin.app, plugin.settings);
    const plan = await migrationService.planDataMigration({
      requestedParentFolder: newParentFolder,
      reason: 'change-parent-folder',
    });
    await migrationService.executeDataMigration(plan);
    await plugin.saveSettings();
    await loadInitialData();
  }

  function getAnchorRect(element?: HTMLElement | null) {
    return element?.getBoundingClientRect();
  }

  async function openweaveParentFolderPicker(anchor?: HTMLElement | null) {
    if (weaveParentFolderPickerOpen) return;

    weaveParentFolderPickerOpen = true;
    try {
      const picker = new VaultFolderSuggestModal(plugin.app, {
        placeholder: t('dataManagement.backup.panel.selectFolderPath'),
        anchorRect: getAnchorRect(anchor || weaveParentFolderTriggerEl || weaveParentFolderInputEl)
      });
      const selectedFolder = await picker.openAndSelect();
      if (!selectedFolder) return;
      handleWeaveParentFolderSelect(selectedFolder);
    } finally {
      weaveParentFolderPickerOpen = false;
    }
  }

  function handleWeaveParentFolderSelect(folderPath: string) {
    const oldParentFolder = normalizeWeaveParentFolder(plugin.settings?.weaveParentFolder);
    const newParentFolder = normalizeWeaveParentFolder(folderPath);

    const oldRoot = getReadableWeaveRoot(oldParentFolder);
    const newRoot = getReadableWeaveRoot(newParentFolder);
    const legacyRoot = getReadableWeaveRoot(undefined);

    if (oldRoot === newRoot) {
      void (async () => {
        try {
          const adapter = plugin.app.vault.adapter;
          if (legacyRoot !== newRoot && (await adapter.exists(legacyRoot))) {
            showConfirmationDialog({
              title: t('dataManagement.backup.panel.repairFolderTitle'),
              message: t('dataManagement.backup.panel.repairFolderMessage'),
              securityLevel: 'caution',
              details: [
                t('dataManagement.backup.panel.oldLocation', { path: legacyRoot }),
                t('dataManagement.backup.panel.currentLocation', { path: newRoot })
              ],
              onConfirm: async () => {
                try {
                  await applyweaveParentFolder(newParentFolder);
                  new Notice(t('dataManagement.backup.panel.repairDone'));
                } catch (error) {
                  const msg = error instanceof Error ? error.message : String(error);
                  new Notice(t('dataManagement.backup.panel.repairFailed', { error: msg }), 5000);
                  lastError = msg;
                } finally {
                  closeConfirmationDialog();
                }
              }
            });
          }
        } catch {
        }
      })();
      return;
    }

    showConfirmationDialog({
      title: t('dataManagement.backup.panel.moveFolderTitle'),
      message: t('dataManagement.backup.panel.moveFolderMessage'),
      securityLevel: 'caution',
      details: [
        t('dataManagement.backup.panel.oldLocation', { path: oldRoot }),
        t('dataManagement.backup.panel.newLocation', { path: newRoot })
      ],
      onConfirm: async () => {
        try {
          await applyweaveParentFolder(newParentFolder);
          new Notice(t('dataManagement.backup.panel.folderUpdated'));
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          new Notice(t('dataManagement.backup.panel.updateFailed', { error: msg }), 5000);
          lastError = msg;
        } finally {
          closeConfirmationDialog();
        }
      }
    });
  }

  //  v1.0.0: 统一数据文件夹架构，移除可配置路径

  // 导出数据
  async function handleExportData() {
    showConfirmationDialog({
      title: t('dataManagement.importExport.export.title'),
      message: t('dataManagement.importExport.export.confirm'),
      securityLevel: 'safe',
      details: [
        t('dataManagement.importExport.export.details.all'),
        t('dataManagement.importExport.export.details.records'),
        t('dataManagement.importExport.export.details.format')
      ],
      confirmText: t('dataManagement.importExport.export.title'),
      onConfirm: async () => {
        dataOperationInProgress = 'export';
        try {
          const result = await dataManagementService.exportData({
            dataTypes: ['decks', 'cards', 'sessions', 'profile', 'templates'],
            includeMedia: true,
            compress: false,
            format: 'json'
          });
          
          if (result.success) {
            new Notice(`${t('dataManagement.importExport.export.success')}\n${t('dataManagement.importExport.export.successDetail').replace('{path}', result.filePath)}`);
          } else {
            throw new Error(result.error || t('dataManagement.importExport.export.failed'));
          }
        } catch (error) {
          logger.error('导出失败:', error);
          const errorMsg = error instanceof Error ? error.message : t('dataManagement.importExport.export.failed');
          new Notice(`${t('dataManagement.importExport.export.failed')}: ${errorMsg}`, 5000);
          lastError = errorMsg;
          throw new Error(errorMsg);
        } finally {
          dataOperationInProgress = null;
        }
      }
    });
  }

  // 导入数据
  async function handleImportData() {
    const input = activeDocument.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      showConfirmationDialog({
        title: t('dataManagement.importExport.import.title'),
        message: t('dataManagement.importExport.import.confirm'),
        securityLevel: 'caution',
        details: [
          t('dataManagement.importExport.import.details.fileName').replace('{name}', file.name),
          t('dataManagement.importExport.import.details.fileSize').replace('{size}', (file.size / 1024 / 1024).toFixed(2)),
          t('dataManagement.importExport.import.details.autoBackup')
        ],
        warningItems: [
          t('dataManagement.importExport.import.warnings.override'),
          t('dataManagement.importExport.import.warnings.format'),
          t('dataManagement.importExport.import.warnings.backup')
        ],
        confirmText: t('dataManagement.importExport.import.title'),
        onConfirm: async () => {
          dataOperationInProgress = 'import';
          try {
            const result = await dataManagementService.importData(file, {
              conflictStrategy: 'ask',
              createBackup: true,
              validateData: true,
              batchSize: 100
            });
            
            if (result.success) {
              await loadInitialData(); // 重新加载数据
              new Notice(`${t('dataManagement.importExport.import.success')}\n${t('dataManagement.importExport.import.successDetail').replace('{imported}', String(result.importedCount)).replace('{skipped}', String(result.skippedCount))}`);
            } else {
              throw new Error(result.error || t('dataManagement.importExport.import.failed'));
            }
          } catch (error) {
            logger.error('导入失败:', error);
            const errorMsg = error instanceof Error ? error.message : t('dataManagement.importExport.import.failed');
            new Notice(`${t('dataManagement.importExport.import.failed')}: ${errorMsg}`, 5000);
            lastError = errorMsg;
            throw new Error(errorMsg);
          } finally {
            dataOperationInProgress = null;
          }
        }
      });
    };
    
    input.click();
  }

  // 创建备份
  async function handleCreateBackup() {
    try {
      const backup = await backupStore?.createBackup(t('dataManagement.backup.manual.label'));
      
      if (!backup) {
        throw new Error(t('dataManagement.backup.manual.failed'));
      }
      
      new Notice(`${t('dataManagement.backup.manual.success')}\n${t('dataManagement.backup.manual.successDetail').replace('{size}', (backup.size / 1024 / 1024).toFixed(2))}`);
      // 响应式系统会自动更新UI，无需手动刷新
    } catch (error) {
      logger.error('创建备份失败:', error);
      const errorMsg = error instanceof Error ? error.message : t('dataManagement.backup.manual.failed');
      new Notice(`${t('dataManagement.backup.manual.failed')}: ${errorMsg}`, 5000);
      lastError = errorMsg;
    }
  }

  // 恢复备份
  async function handleRestoreBackup(backupId?: string) {
    if (!backupId && backupHistory.length === 0) {
      lastError = t('dataManagement.backup.panel.noBackupsAvailable');
      return;
    }

    const targetBackupId = backupId || backupHistory[0]?.id;
    const backup = backupHistory.find(b => b.id === targetBackupId);
    
    if (!backup) {
      lastError = t('dataManagement.backup.panel.backupNotFound');
      return;
    }

    showConfirmationDialog({
      title: t('dataManagement.backup.panel.restoreTitle'),
      message: t('dataManagement.backup.panel.restoreMessage'),
      securityLevel: 'caution',
      details: [
        t('dataManagement.backup.panel.backupTime', { time: new Date(backup.timestamp).toLocaleString() }),
        t('dataManagement.backup.panel.backupSize', { size: (backup.size / 1024 / 1024).toFixed(2) }),
        t('dataManagement.backup.panel.backupType', { type: backup.type })
      ],
      warningItems: [
        t('dataManagement.backup.panel.restoreWarningOverwrite'),
        t('dataManagement.backup.panel.restoreWarningAutoBackup'),
        t('dataManagement.backup.panel.restoreWarningIrreversible')
      ],
      onConfirm: async () => {
        try {
          // 使用旧的备份管理服务恢复功能
          const backupManagementService = new BackupManagementService(plugin.dataStorage, plugin) as any;
          const result = await backupManagementService.restoreFromBackup(targetBackupId, {
            dataTypes: ['decks', 'cards', 'sessions', 'profile'],
            createPreRestoreBackup: true,
            conflictStrategy: 'overwrite'
          });
          
          if (result.success) {
            await loadInitialData();
            new Notice(t('dataManagement.backup.panel.restoreSuccess', { count: String(result.restoredFileCount) }));
            closeConfirmationDialog();
          } else {
            throw new Error(result.error || t('dataManagement.backup.panel.restoreTitle'));
          }
        } catch (error) {
          logger.error('恢复失败:', error);
          const errorMsg = error instanceof Error ? error.message : t('dataManagement.backup.panel.restoreTitle');
          new Notice(t('dataManagement.backup.panel.restoreFailed', { error: errorMsg }), 5000);
          lastError = errorMsg;
          closeConfirmationDialog();
        }
      }
    });
  }

  // 重置数据
  async function handleResetData() {
    showConfirmationDialog({
      title: t('dataManagement.backup.panel.resetTitle'),
      message: t('dataManagement.backup.panel.resetMessage'),
      securityLevel: 'danger',
      requireTextConfirmation: true,
      confirmationPhrase: t('dataManagement.resetConfirmPhrase'),
      details: [
        t('dataManagement.backup.panel.resetCards', { count: String(dataOverview?.totalCards || 0) }),
        t('dataManagement.backup.panel.resetDecks', { count: String(dataOverview?.totalDecks || 0) }),
        t('dataManagement.backup.panel.resetSessions', { count: String(dataOverview?.totalSessions || 0) }),
        t('dataManagement.backup.panel.resetSettings')
      ],
      warningItems: [
        t('dataManagement.backup.panel.resetWarningIrreversible'),
        t('dataManagement.backup.panel.resetWarningAutoBackup'),
        t('dataManagement.backup.panel.resetWarningConfirm')
      ],
      confirmText: t('dataManagement.backup.panel.resetConfirm'),
      onConfirm: async () => {
        dataOperationInProgress = 'reset';
        try {
          const result = await dataManagementService.resetData(t('dataManagement.resetConfirmPhrase'));
          
          if (result.success) {
            await loadInitialData();
            new Notice(t('dataManagement.backup.panel.resetSuccess', { count: String(result.clearedRecordCount) }));
          } else {
            throw new Error(result.error || t('dataManagement.backup.panel.resetTitle'));
          }
        } catch (error) {
          logger.error('重置失败:', error);
          const errorMsg = error instanceof Error ? error.message : t('dataManagement.backup.panel.resetTitle');
          new Notice(t('dataManagement.backup.panel.resetFailed', { error: errorMsg }), 5000);
          lastError = errorMsg;
          throw new Error(errorMsg);
        } finally {
          dataOperationInProgress = null;
        }
      }
    });
  }

  // 备份辅助函数
  function formatBackupTime(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function getBackupTypeLabel(type: string): string {
    if (type === 'auto') return t('dataManagement.backup.history.type.auto');
    if (type === 'manual') return t('dataManagement.backup.history.type.manual');
    return type;
  }

  function showBackupMenu(event: MouseEvent, backup: any) {
    const menu = new Menu();
    
    menu.addItem((item) => {
      item
        .setTitle(t('dataManagement.backup.panel.preview'))
        .setIcon('eye')
        .onClick(async () => {
          await handlePreviewBackup(backup.id);
        });
    });
    
    menu.addItem((item) => {
      item
        .setTitle(t('dataManagement.backup.panel.restore'))
        .setIcon('rotate-ccw')
        .onClick(async () => {
          await handleRestoreBackup(backup.id);
        });
    });
    
    menu.addSeparator();
    
    menu.addItem((item) => {
      item
        .setTitle(t('dataManagement.backup.panel.delete'))
        .setIcon('trash')
        .onClick(async () => {
          await handleDeleteBackup(backup.id);
        });
    });
    
    menu.showAtMouseEvent(event);
  }

  // 删除备份
  async function handleDeleteBackup(backupId: string) {
    const backup = backupHistory.find(b => b.id === backupId);
    if (!backup) return;

    showConfirmationDialog({
      title: t('dataManagement.backup.panel.deleteBackupTitle'),
      message: t('dataManagement.backup.panel.deleteBackupMessage'),
      securityLevel: 'caution',
      details: [
        t('dataManagement.backup.panel.backupTime', { time: new Date(backup.timestamp).toLocaleString() }),
        t('dataManagement.backup.panel.backupSize', { size: (backup.size / 1024 / 1024).toFixed(2) })
      ],
      warningItems: [
        t('dataManagement.backup.panel.deleteBackupWarningIrreversible'),
        t('dataManagement.backup.panel.deleteBackupWarningKeep')
      ],
      onConfirm: async () => {
        try {
          await backupStore?.deleteBackup(backupId);
          new Notice(t('dataManagement.backup.panel.deleteBackupSuccess'));
          // 响应式系统会自动更新UI
          closeConfirmationDialog();
        } catch (error) {
          logger.error('删除备份失败:', error);
          new Notice(t('dataManagement.backup.panel.deleteBackupFailed'), 5000);
          lastError = t('dataManagement.backup.panel.deleteBackupFailed');
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
        new Notice(t('dataManagement.backup.panel.autoRepairSuccess', { count: String(result.success) }));
      }
      
      if (result.failed > 0) {
        const msg = t('dataManagement.backup.panel.autoRepairPartial', { success: String(result.success), failed: String(result.failed) });
        new Notice(msg, 5000);
        lastError = msg;
      }
    } catch (error) {
      logger.error('批量修复失败:', error);
      new Notice(t('dataManagement.backup.panel.autoRepairFailed'), 5000);
      lastError = t('dataManagement.backup.panel.autoRepairFailed');
    }
  }
  
  // 批量清理无效备份
  async function handleCleanupInvalidBackups() {
    if (!backupStore) return;
    
    showConfirmationDialog({
      title: t('dataManagement.backup.panel.cleanupInvalidTitle'),
      message: t('dataManagement.backup.panel.cleanupInvalidMessage'),
      securityLevel: 'warning',
      details: [
        t('dataManagement.backup.panel.cleanupInvalidDetail'),
        t('dataManagement.backup.panel.restoreWarningIrreversible')
      ],
      warningItems: [
        t('dataManagement.backup.panel.cleanupInvalidWarningBackup'),
        t('dataManagement.backup.panel.cleanupInvalidWarningCheck')
      ],
      onConfirm: async () => {
        if (!backupStore) return;
        
        try {
          const result = await backupStore.cleanupInvalidBackups();
          
          if (result) {
            const msg = t('dataManagement.backup.panel.cleanupInvalidSuccess', {
              deleted: String(result.deleted),
              failedPart: result.failed > 0 ? `, ${result.failed}` : ''
            });
            new Notice(msg);
          }
        } catch (error) {
          logger.error('清理无效备份失败:', error);
          new Notice(t('dataManagement.backup.panel.cleanupInvalidFailed'), 5000);
          lastError = t('dataManagement.backup.panel.cleanupInvalidFailed');
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
        const backupTime = backup ? new Date(backup.timestamp).toLocaleString() : '-';
        
        showConfirmationDialog({
          title: t('dataManagement.backup.panel.previewTitle'),
          message: t('dataManagement.backup.panel.previewMessage', { time: backupTime }),
          securityLevel: 'safe',
          confirmText: t('dataManagement.backup.panel.close'),
          details: [
            t('dataManagement.backup.panel.previewDeckCount', { count: String(preview.deckCount) }),
            t('dataManagement.backup.panel.previewCardCount', { count: String(preview.cardCount) }),
            t('dataManagement.backup.panel.previewBackupId', { id: backupId })
          ],
          onConfirm: () => {
            closeConfirmationDialog();
          }
        });
      }
    } catch (error) {
      logger.error('预览备份失败:', error);
      lastError = t('dataManagement.backup.panel.previewFailed');
    }
  }

  // 显示确认对话框
  function showConfirmationDialog(config: any) {
    const originalOnConfirm = config.onConfirm as undefined | (() => void | Promise<void>);
    confirmationDialog = {
      isOpen: true,
      title: config.title,
      message: config.message,
      securityLevel: config.securityLevel,
      confirmText: config.confirmText || t('dataManagement.backup.panel.confirm'),
      cancelText: config.cancelText || t('dataManagement.backup.panel.cancel'),
      requireTextConfirmation: config.requireTextConfirmation || false,
      confirmationPhrase: config.confirmationPhrase || t('dataManagement.confirmPhrase'),
      details: config.details || [],
      warningItems: config.warningItems || [],
      onConfirm: async () => {
        await originalOnConfirm?.();
        closeConfirmationDialog();
      }
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
<div class="weave-settings settings-section data-management-panel">
  <!-- 错误提示 -->
  {#if lastError}
    <div class="error-banner">
      <div class="error-icon">[X]</div>
      <div class="error-message">{lastError}</div>
      <button class="error-dismiss" onclick={() => lastError = null}>✕</button>
    </div>
  {/if}

  <!-- 自动修复建议 -->
  {#if autoRepairSuggestion.show}
    <div class="repair-suggestion-banner">
      <div class="repair-icon">[!]</div>
      <div class="repair-content">
        <div class="repair-title">{t('dataManagement.backup.panel.repairTitle', { count: String(autoRepairSuggestion.count) })}</div>
        <div class="repair-description">{t('dataManagement.backup.panel.repairDescription')}</div>
      </div>
      <div class="repair-actions">
        <button class="repair-button" onclick={handleAutoRepairAll}>
          {t('dataManagement.backup.panel.repairAll')}
        </button>
        <button class="cleanup-button" onclick={handleCleanupInvalidBackups}>
          {t('dataManagement.backup.panel.cleanupInvalid')}
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
    onCreateBackup={handleCreateBackup}
  />

  <!-- 备份历史 -->
  <div class="weave-settings settings-group backup-history">
    <h4 class="group-title with-accent-bar accent-purple">{t('dataManagement.backup.history.title')}</h4>
    
    {#if backupHistory.length > 0}
      <div class="backup-table-wrapper">
        <table class="backup-table">
          <thead>
            <!-- svelte-ignore component_name_lowercase -->
            <tr>
              <th>{t('dataManagement.backup.history.tableHeaders.backupTime')}</th>
              <th>{t('dataManagement.backup.history.tableHeaders.backupType')}</th>
              <th>{t('dataManagement.backup.history.tableHeaders.backupSize')}</th>
              <th>{t('dataManagement.backup.history.tableHeaders.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {#each backupHistory.slice(0, 5) as backup (backup.id)}
              <!-- svelte-ignore component_name_lowercase -->
              <tr class:invalid={!backup.isValid}>
                <td class="time-cell">
                  {formatBackupTime(backup.timestamp)}
                </td>
                <td class="type-cell">
                  <span class="type-badge" class:auto={backup.type === 'auto'} class:manual={backup.type === 'manual'}>
                    {getBackupTypeLabel(backup.type)}
                  </span>
                </td>
                <td class="size-cell">
                  {formatFileSize(backup.size)}
                </td>
                <td class="action-cell">
                  <button
                    class="menu-button clickable-icon"
                    type="button"
                    onclick={(e) => showBackupMenu(e, backup)}
                    title={t('dataManagement.backup.panel.moreActions')}
                    aria-label={t('dataManagement.backup.panel.moreActions')}
                  >
                    <ObsidianIcon name="more-horizontal" size={16} />
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if backupHistory.length > 5}
        <div class="more-backups-hint">
          {t('dataManagement.backup.panel.moreHidden', { count: String(backupHistory.length - 5) })}
        </div>
      {/if}
    {:else}
      <div class="no-backups">
        <ObsidianIcon name="archive" size={24} />
        <p>{t('dataManagement.backup.panel.noBackups')}</p>
      </div>
    {/if}
  </div>

  <!-- 自动备份配置 -->
  <AutoBackupConfig {plugin} />

  <!-- 父文件夹路径配置 -->
  <div class="weave-settings settings-group folder-path-config">
    <div class="group-title-with-toggle">
      <h4 class="group-title with-accent-bar accent-cyan">{t('dataManagement.backup.panel.weaveFolderTitle')}</h4>
      <div class="data-folder-visibility-section">
        <div class="folder-input-group" bind:this={weaveParentFolderTriggerEl}>
          <input
            type="text"
            class="modern-input folder-input"
            value={normalizeWeaveParentFolder(plugin.settings?.weaveParentFolder) || t('dataManagement.backup.panel.rootDirectory')}
            readonly
            bind:this={weaveParentFolderInputEl}
            onclick={() => void openweaveParentFolderPicker(weaveParentFolderInputEl)}
          />
          <button
            class="folder-select-btn"
            type="button"
            onclick={() => void openweaveParentFolderPicker(weaveParentFolderTriggerEl)}
          >
            {t('dataManagement.backup.panel.select')}
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- 操作工具栏 -->
  <DataOperationToolbar 
    disabled={isLoading || operationInProgress !== null}
    operationInProgress={dataOperationInProgress}
    onExport={handleExportData}
    onImport={handleImportData}
    onReset={handleResetData}
  />

  <!-- 确认对话框 -->
  <ConfirmationDialog 
    isOpen={confirmationDialog.isOpen}
    title={confirmationDialog.title}
    message={confirmationDialog.message}
    securityLevel={confirmationDialog.securityLevel}
    confirmText={confirmationDialog.confirmText}
    cancelText={confirmationDialog.cancelText}
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
    --weave-settings-gap-xs: var(--size-2-1, 0.25rem);
    --weave-settings-gap-sm: var(--size-2-2, 0.5rem);
    --weave-settings-gap-md: var(--size-4-2, 0.75rem);
    --weave-settings-gap-lg: var(--size-4-3, 1rem);
    --weave-settings-gap-xl: var(--size-4-5, 1.5rem);
    --weave-settings-radius-sm: var(--radius-s, 6px);
    --weave-settings-radius-md: var(--radius-m, 10px);
    --weave-settings-radius-lg: var(--radius-l, 14px);
    display: flex;
    flex-direction: column;
    gap: var(--weave-settings-gap-lg);
  }

  /* 错误横幅 */
  .error-banner {
    display: flex;
    align-items: center;
    gap: var(--weave-settings-gap-md);
    padding: var(--weave-settings-gap-lg) calc(var(--weave-settings-gap-lg) + var(--weave-settings-gap-xs));
    background: color-mix(in oklab, var(--text-error), var(--background-primary) 92%);
    border: 1px solid color-mix(in oklab, var(--text-error), transparent 35%);
    border-radius: var(--weave-settings-radius-lg);
    color: var(--text-error);
  }

  .error-icon {
    font-size: 1.25rem;
    flex-shrink: 0;
  }

  .error-message {
    flex: 1;
    font-size: var(--weave-settings-font-size-desc, 0.85rem);
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
    gap: var(--weave-settings-gap-md);
    padding: var(--weave-settings-gap-lg) calc(var(--weave-settings-gap-lg) + var(--weave-settings-gap-xs));
    background: color-mix(in oklab, var(--color-blue), var(--background-primary) 92%);
    border: 1px solid color-mix(in oklab, var(--color-blue), transparent 35%);
    border-radius: var(--weave-settings-radius-lg);
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
    font-size: var(--weave-settings-font-size-label, 0.95rem);
    font-weight: 600;
    color: var(--text-normal);
    margin-bottom: var(--weave-settings-gap-xs);
  }

  .repair-description {
    font-size: var(--weave-settings-font-size-desc, 0.85rem);
    color: var(--text-muted);
  }

  .repair-actions {
    display: flex;
    gap: var(--weave-settings-gap-sm);
    align-items: center;
  }

  .repair-button {
    padding: var(--weave-settings-gap-sm) var(--weave-settings-gap-lg);
    font-size: var(--weave-settings-font-size-desc, 0.85rem);
    font-weight: 500;
    border: 1px solid var(--color-blue);
    border-radius: var(--weave-settings-radius-sm);
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
    padding: var(--weave-settings-gap-sm) var(--weave-settings-gap-lg);
    font-size: var(--weave-settings-font-size-desc, 0.85rem);
    font-weight: 500;
    border: 1px solid var(--text-error);
    border-radius: var(--weave-settings-radius-sm);
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

  /* 备份历史表格 */
  .backup-table-wrapper {
    overflow-x: auto;
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--weave-settings-radius-sm);
  }

  /*  深色模式 - 增强表格外边框可见性 */
  :global(body.theme-dark) .backup-table-wrapper {
    border-color: rgba(255, 255, 255, 0.15);
  }

  /*  浅色模式 - 增强表格外边框可见性 */
  :global(body.theme-light) .backup-table-wrapper {
    border-color: rgba(0, 0, 0, 0.15);
  }

  .backup-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--weave-settings-font-size-label, 0.95rem);
  }

  .backup-table thead {
    background: var(--background-secondary);
    border-bottom: 1px solid var(--background-modifier-border);
  }

  /*  深色模式 - 增强表头边框可见性 */
  :global(body.theme-dark) .backup-table thead {
    border-bottom-color: rgba(255, 255, 255, 0.15);
  }

  /*  浅色模式 - 增强表头边框可见性 */
  :global(body.theme-light) .backup-table thead {
    border-bottom-color: rgba(0, 0, 0, 0.1);
  }

  .backup-table th {
    padding: var(--weave-settings-gap-md);
    text-align: left;
    font-weight: 600;
    color: var(--text-muted);
    font-size: var(--weave-settings-font-size-desc, 0.85rem);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .backup-table tbody tr {
    border-bottom: 1px solid var(--background-modifier-border);
    transition: background 0.2s ease;
  }

  /*  深色模式 - 增强表格行边框可见性 */
  :global(body.theme-dark) .backup-table tbody tr {
    border-bottom-color: rgba(255, 255, 255, 0.08);
  }

  /*  浅色模式 - 增强表格行边框可见性 */
  :global(body.theme-light) .backup-table tbody tr {
    border-bottom-color: rgba(0, 0, 0, 0.08);
  }

  .backup-table tbody tr:last-child {
    border-bottom: none;
  }

  .backup-table tbody tr:hover {
    background: var(--background-modifier-hover);
  }

  .backup-table tbody tr.invalid {
    opacity: 0.6;
    background: color-mix(in srgb, var(--text-error) 5%, transparent);
  }

  .backup-table td {
    padding: var(--weave-settings-gap-md);
    color: var(--text-normal);
  }

  .time-cell {
    font-family: var(--font-monospace);
    font-size: var(--weave-settings-font-size-desc, 0.85rem);
  }

  .type-cell .type-badge {
    display: inline-block;
    padding: var(--weave-settings-gap-xs) var(--weave-settings-gap-sm);
    border-radius: var(--weave-settings-radius-sm);
    font-size: var(--weave-settings-font-size-desc, 0.85rem);
    font-weight: 500;
  }

  .type-badge.auto {
    background: color-mix(in srgb, var(--color-blue) 20%, transparent);
    color: var(--color-blue);
  }

  .type-badge.manual {
    background: color-mix(in srgb, var(--color-green) 20%, transparent);
    color: var(--color-green);
  }

  .size-cell {
    font-family: var(--font-monospace);
    font-size: var(--weave-settings-font-size-desc, 0.85rem);
  }

  .action-cell {
    text-align: center;
    width: 50px;
  }

  .menu-button {
    width: var(--clickable-icon-size, 32px);
    height: var(--clickable-icon-size, 32px);
    padding: 0;
    border-radius: var(--clickable-icon-radius, 4px);
    color: var(--text-muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .menu-button:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .more-backups-hint {
    margin-top: var(--weave-settings-gap-sm);
    padding: var(--weave-settings-gap-sm);
    text-align: center;
    font-size: var(--weave-settings-font-size-desc, 0.85rem);
    color: var(--text-muted);
    background: var(--background-secondary);
    border-radius: var(--weave-settings-radius-sm);
  }

  .no-backups {
    padding: 2rem;
    text-align: center;
    color: var(--text-muted);
  }

  .no-backups p {
    margin: var(--weave-settings-gap-sm) 0 0 0;
    font-size: var(--weave-settings-font-size-desc, 0.85rem);
  }

  /* 父文件夹路径配置样式 */
  .folder-path-config {
    margin-top: var(--weave-settings-gap-lg);
  }

  /* 数据文件夹可见性开关样式 */
  .group-title-with-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--weave-settings-gap-lg);
    margin-bottom: var(--weave-settings-gap-lg);
  }

  .data-folder-visibility-section {
    display: flex;
    flex-direction: column;
    gap: var(--weave-settings-gap-sm);
    align-items: flex-end;
  }

  .folder-input-group {
    margin-bottom: var(--weave-settings-gap-md);
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .data-management-panel {
      gap: var(--weave-settings-gap-md);
    }

    /* 移动端开关样式调整 */
    .group-title-with-toggle {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--weave-settings-gap-md);
    }

    .data-folder-visibility-section {
      width: 100%;
      align-items: flex-start;
    }
  }

</style>
