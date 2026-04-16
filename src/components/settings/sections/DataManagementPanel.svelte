<!--
  数据管理主面板组件
  集成所有数据管理功能的统一界面
  使用 Svelte 5 响应式架构
-->
<script lang="ts">
  import { logger } from '../../../utils/logger';

  import { onMount, onDestroy } from 'svelte';
  import { Notice, TFolder, normalizePath } from 'obsidian';
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
  import { getReadableWeaveRoot, getV2Paths, normalizeWeaveParentFolder } from '../../../config/paths';
  import FolderSuggestModal from '../../ui/FolderSuggestModal.svelte';
  import { DirectoryUtils } from '../../../utils/directory-utils';
  import { DataManagementService } from '../../../services/data-management-service';
  import { BackupManagementService } from '../../../services/backup-management-service';
  import { UnifiedDataMigrationService } from '../../../services/data-migration/UnifiedDataMigrationService';
  
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

  async function rewriteIRStorageFilePaths(fromRoots: Iterable<string>, toRoot: string): Promise<void> {
    const vault = plugin.app.vault;
    const adapter = vault.adapter;

    const normalizedToRoot = normalizePath(toRoot);
    const roots = Array.from(new Set(Array.from(fromRoots)
      .filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
      .map(r => normalizePath(r))
      .filter(r => r !== normalizedToRoot)
    ));

    if (roots.length === 0) return;

    const rewritePath = (p: unknown): string | null => {
      if (typeof p !== 'string' || !p.trim()) return null;
      const normalized = normalizePath(p);
      for (const root of roots) {
        if (normalized === root) {
          return normalizedToRoot;
        }
        if (normalized.startsWith(`${root}/`)) {
          return normalizePath(`${normalizedToRoot}/${normalized.slice(root.length + 1)}`);
        }
      }
      return normalized;
    };

    const updateJson = async (
      filePath: string,
      updater: (data: any) => { changed: boolean; data: any }
    ): Promise<void> => {
      let raw = '';
      try {
        if (!(await adapter.exists(filePath))) return;
        raw = await adapter.read(filePath);
      } catch {
        return;
      }

      if (!raw) return;
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return;
      }

      const { changed, data } = updater(parsed);
      if (!changed) return;

      try {
        await adapter.write(filePath, JSON.stringify(data, null, 2));
      } catch {
      }
    };

    const v2Paths = getV2Paths(plugin?.settings?.weaveParentFolder);

    await updateJson(`${v2Paths.ir.root}/chunks.json`, (store) => {
      const chunks = store?.chunks;
      if (!chunks || typeof chunks !== 'object') return { changed: false, data: store };

      let changed = false;
      for (const chunk of Object.values(chunks)) {
        if (!chunk || typeof chunk !== 'object') continue;
        const current = (chunk as any).filePath;
        const rewritten = rewritePath(current);
        if (rewritten && rewritten !== current) {
          (chunk as any).filePath = rewritten;
          changed = true;
        }
      }

      return { changed, data: store };
    });

    await updateJson(`${v2Paths.ir.root}/sources.json`, (store) => {
      const sources = store?.sources;
      if (!sources || typeof sources !== 'object') return { changed: false, data: store };

      let changed = false;
      for (const src of Object.values(sources)) {
        if (!src || typeof src !== 'object') continue;
        const indexFilePath = (src as any).indexFilePath;
        const rewrittenIndex = rewritePath(indexFilePath);
        if (rewrittenIndex && rewrittenIndex !== indexFilePath) {
          (src as any).indexFilePath = rewrittenIndex;
          changed = true;
        }

        const rawFilePath = (src as any).rawFilePath;
        const rewrittenRaw = rewritePath(rawFilePath);
        if (rewrittenRaw && rewrittenRaw !== rawFilePath) {
          (src as any).rawFilePath = rewrittenRaw;
          changed = true;
        }
      }

      return { changed, data: store };
    });
  }

  let { plugin }: Props = $props();
  
  //  响应式翻译函数
  let t = $derived($tr);

  // 响应式备份存储
  let backupStore: BackupReactiveStore | null = null;
  
  let showweaveParentFolderModal = $state(false);
  
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
    confirmText: '确认',
    cancelText: '取消',
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
      lastError = '数据加载失败，请重试';
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
      lastError = '刷新失败，请重试';
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

  function openweaveParentFolderPicker() {
    showweaveParentFolderModal = true;
  }

  function handleWeaveParentFolderSelect(folderPath: string) {
    const oldParentFolder = normalizeWeaveParentFolder(plugin.settings?.weaveParentFolder);
    const newParentFolder = normalizeWeaveParentFolder(folderPath);

    const oldRoot = getReadableWeaveRoot(oldParentFolder);
    const newRoot = getReadableWeaveRoot(newParentFolder);
    const legacyRoot = getReadableWeaveRoot(undefined);

    showweaveParentFolderModal = false;

    if (oldRoot === newRoot) {
      void (async () => {
        try {
          const adapter = plugin.app.vault.adapter;
          if (legacyRoot !== newRoot && (await adapter.exists(legacyRoot))) {
            showConfirmationDialog({
              title: '修复 Weave 文件夹',
              message: '检测到旧位置仍存在数据目录，将合并到当前设置的父目录并修复增量阅读路径引用。',
              securityLevel: 'caution',
              details: [
                `旧位置: ${legacyRoot}`,
                `当前位置: ${newRoot}`
              ],
              onConfirm: async () => {
                try {
                  await applyweaveParentFolder(newParentFolder);
                  new Notice('修复完成');
                } catch (error) {
                  const msg = error instanceof Error ? error.message : String(error);
                  new Notice(`修复失败: ${msg}`, 5000);
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
      title: '移动 Weave 文件夹',
      message: '将移动可读内容文件夹到新的父目录。',
      securityLevel: 'caution',
      details: [
        `旧位置: ${oldRoot}`,
        `新位置: ${newRoot}`
      ],
      onConfirm: async () => {
        try {
          await applyweaveParentFolder(newParentFolder);
          new Notice('Weave 文件夹位置已更新');
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          new Notice(`更新失败: ${msg}`, 5000);
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
    const input = document.createElement('input');
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
          const backupManagementService = new BackupManagementService(plugin.dataStorage, plugin) as any;
          const result = await backupManagementService.restoreFromBackup(targetBackupId, {
            dataTypes: ['decks', 'cards', 'sessions', 'profile'],
            createPreRestoreBackup: true,
            conflictStrategy: 'overwrite'
          });
          
          if (result.success) {
            await loadInitialData();
            new Notice(`数据恢复成功\n恢复文件数: ${result.restoredFileCount}`);
            closeConfirmationDialog();
          } else {
            throw new Error(result.error || '恢复失败');
          }
        } catch (error) {
          logger.error('恢复失败:', error);
          const errorMsg = error instanceof Error ? error.message : '恢复失败';
          new Notice(`恢复失败: ${errorMsg}`, 5000);
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
      confirmationPhrase: t('dataManagement.resetConfirmPhrase'),
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
      confirmText: '重置',
      onConfirm: async () => {
        dataOperationInProgress = 'reset';
        try {
          const result = await dataManagementService.resetData(t('dataManagement.resetConfirmPhrase'));
          
          if (result.success) {
            await loadInitialData();
            new Notice(`数据重置成功\n已清理 ${result.clearedRecordCount} 条记录`);
          } else {
            throw new Error(result.error || '重置失败');
          }
        } catch (error) {
          logger.error('重置失败:', error);
          const errorMsg = error instanceof Error ? error.message : '重置失败';
          new Notice(`重置失败: ${errorMsg}`, 5000);
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
        .setTitle('预览')
        .setIcon('eye')
        .onClick(async () => {
          await handlePreviewBackup(backup.id);
        });
    });
    
    menu.addItem((item) => {
      item
        .setTitle('恢复')
        .setIcon('rotate-ccw')
        .onClick(async () => {
          await handleRestoreBackup(backup.id);
        });
    });
    
    menu.addSeparator();
    
    menu.addItem((item) => {
      item
        .setTitle('删除')
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
          new Notice('备份已删除');
          // 响应式系统会自动更新UI
          closeConfirmationDialog();
        } catch (error) {
          logger.error('删除备份失败:', error);
          new Notice('删除备份失败', 5000);
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
        new Notice(`成功修复 ${result.success} 个备份`);
      }
      
      if (result.failed > 0) {
        const msg = `修复了 ${result.success} 个备份，${result.failed} 个修复失败`;
        new Notice(msg, 5000);
        lastError = msg;
      }
    } catch (error) {
      logger.error('批量修复失败:', error);
      new Notice('批量修复失败', 5000);
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
            const msg = `成功删除 ${result.deleted} 个无效备份${result.failed > 0 ? `，失败 ${result.failed} 个` : ''}`;
            new Notice(msg);
          }
        } catch (error) {
          logger.error('清理无效备份失败:', error);
          new Notice('清理无效备份失败', 5000);
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
      logger.error('预览备份失败:', error);
      lastError = '预览备份失败';
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
      confirmText: config.confirmText || '确认',
      cancelText: config.cancelText || '取消',
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
<div class="weave-settings data-management-panel">
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
                    title="更多操作"
                    aria-label="更多操作"
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
          还有 {backupHistory.length - 5} 个备份未显示
        </div>
      {/if}
    {:else}
      <div class="no-backups">
        <ObsidianIcon name="archive" size={24} />
        <p>暂无备份记录</p>
      </div>
    {/if}
  </div>

  <!-- 自动备份配置 -->
  <AutoBackupConfig {plugin} />

  <!-- 父文件夹路径配置 -->
  <div class="weave-settings settings-group folder-path-config">
    <div class="group-title-with-toggle">
      <h4 class="group-title with-accent-bar accent-cyan">Weave 文件夹位置</h4>
      <div class="data-folder-visibility-section">
        <div class="folder-input-group" style="margin-bottom: 0.75rem;">
          <input
            type="text"
            class="modern-input folder-input"
            value={normalizeWeaveParentFolder(plugin.settings?.weaveParentFolder) || '(根目录)'}
            readonly
          />
          <button
            class="folder-select-btn"
            type="button"
            onclick={openweaveParentFolderPicker}
          >
            选择
          </button>
        </div>
      </div>
    </div>
  </div>

  {#if showweaveParentFolderModal}
    <FolderSuggestModal
      {plugin}
      currentFolder={normalizeWeaveParentFolder(plugin.settings?.weaveParentFolder) || ''}
      onSelect={handleWeaveParentFolderSelect}
      onClose={() => showweaveParentFolderModal = false}
    />
  {/if}

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

  /* 备份历史表格 */
  .backup-table-wrapper {
    overflow-x: auto;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
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
    font-size: 0.875rem;
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
    padding: 0.75rem;
    text-align: left;
    font-weight: 600;
    color: var(--text-muted);
    font-size: 0.75rem;
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
    padding: 0.75rem;
    color: var(--text-normal);
  }

  .time-cell {
    font-family: var(--font-monospace);
    font-size: 0.8125rem;
  }

  .type-cell .type-badge {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
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
    font-size: 0.8125rem;
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
    margin-top: 0.5rem;
    padding: 0.5rem;
    text-align: center;
    font-size: 0.75rem;
    color: var(--text-muted);
    background: var(--background-secondary);
    border-radius: 4px;
  }

  .no-backups {
    padding: 2rem;
    text-align: center;
    color: var(--text-muted);
  }

  .no-backups p {
    margin: 0.5rem 0 0 0;
    font-size: 0.875rem;
  }

  /* 父文件夹路径配置样式 */
  .folder-path-config {
    margin-top: 1rem;
  }

  /* 数据文件夹可见性开关样式 */
  .group-title-with-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .data-folder-visibility-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    align-items: flex-end;
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .data-management-panel {
      gap: 0.75rem;
    }

    /* 移动端开关样式调整 */
    .group-title-with-toggle {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.75rem;
    }

    .data-folder-visibility-section {
      width: 100%;
      align-items: flex-start;
    }
  }

</style>
