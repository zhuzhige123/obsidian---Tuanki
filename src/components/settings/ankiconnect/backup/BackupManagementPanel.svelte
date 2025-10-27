<script lang="ts">
  import { Notice } from 'obsidian';
  import type { UnifiedBackupService } from '../../../../services/ankiconnect/backup/UnifiedBackupService';
  import type { BackupMetadata, CleanupRecommendation, DeviceBackupInfo } from '../../../../types/backup-types';
  import { BackupLevel, BackupTrigger } from '../../../../types/backup-types';
  
  import BackupListTable from './BackupListTable.svelte';
  import CleanupRecommendationCard from './CleanupRecommendationCard.svelte';
  import DeviceInfoCard from './DeviceInfoCard.svelte';
  
  let {
    backupService,
    onRefresh
  }: {
    backupService: UnifiedBackupService;
    onRefresh?: () => void;
  } = $props();

  // 状态
  let backups = $state<BackupMetadata[]>([]);
  let cleanupRecommendation = $state<CleanupRecommendation | null>(null);
  let deviceInfo = $state<DeviceBackupInfo[]>([]);
  let isLoading = $state(false);
  let isCreatingBackup = $state(false);
  
  // 统计
  let stats = $derived({
    totalBackups: backups.length,
    totalSize: backups.reduce((sum, b) => sum + b.size, 0),
    compressedBackups: backups.filter(b => b.compressed).length,
    autoBackups: backups.filter(b => b.trigger !== BackupTrigger.MANUAL).length,
    deviceCount: new Set(backups.map(b => b.deviceId)).size
  });

  // 初始化
  $effect(() => {
    loadBackupData();
  });

  async function loadBackupData() {
    isLoading = true;
    try {
      // 加载所有备份
      const backupList = await backupService.listBackups();
      backups = backupList;
      
      // 加载清理建议
      const recommendation = await backupService.getCleanupRecommendation();
      cleanupRecommendation = recommendation;
      
      // 加载设备信息
      deviceInfo = extractDeviceInfo(backupList);
    } catch (error) {
      console.error('加载备份数据失败:', error);
      new Notice('加载备份数据失败');
    } finally {
      isLoading = false;
    }
  }

  function extractDeviceInfo(allBackups: BackupMetadata[]): DeviceBackupInfo[] {
    const deviceMap = new Map<string, DeviceBackupInfo>();
    
    for (const backup of allBackups) {
      const existing = deviceMap.get(backup.deviceId);
      if (existing) {
        existing.backupCount++;
        existing.totalSize += backup.size;
        if (backup.timestamp > existing.latestBackup) {
          existing.latestBackup = backup.timestamp;
        }
      } else {
        deviceMap.set(backup.deviceId, {
          deviceId: backup.deviceId,
          deviceName: backup.deviceName,
          backupCount: 1,
          latestBackup: backup.timestamp,
          totalSize: backup.size,
          isCurrent: false // 将在下面设置
        });
      }
    }
    
    // TODO: 检测当前设备
    // 暂时简单地将最近活跃的设备标记为当前设备
    const devices = Array.from(deviceMap.values());
    if (devices.length > 0) {
      const mostRecent = devices.reduce((a, b) => 
        a.latestBackup > b.latestBackup ? a : b
      );
      mostRecent.isCurrent = true;
    }
    
    return devices;
  }

  async function handleCreateBackup() {
    isCreatingBackup = true;
    try {
      const result = await backupService.createBackup({
        level: BackupLevel.GLOBAL,
        trigger: BackupTrigger.MANUAL,
        data: null, // 全局备份会自动获取所有数据
        reason: '用户手动创建备份'
      });
      
      if (result.success) {
        new Notice('备份创建成功');
        await loadBackupData();
        onRefresh?.();
      } else {
        new Notice('备份创建失败: ' + result.error);
      }
    } catch (error) {
      console.error('创建备份失败:', error);
      new Notice('创建备份失败');
    } finally {
      isCreatingBackup = false;
    }
  }

  async function handleRestoreBackup(backupId: string) {
    try {
      const result = await backupService.restoreBackup(backupId);
      if (result.success) {
        new Notice(`成功恢复 ${result.restoredItems} 项数据`);
        onRefresh?.();
      } else {
        new Notice('恢复失败: ' + result.error);
      }
    } catch (error) {
      console.error('恢复备份失败:', error);
      new Notice('恢复备份失败');
    }
  }

  async function handleDeleteBackup(backupId: string) {
    try {
      const success = await backupService.deleteBackup(backupId);
      if (success) {
        new Notice('备份已删除');
        await loadBackupData();
      } else {
        new Notice('删除失败');
      }
    } catch (error) {
      console.error('删除备份失败:', error);
      new Notice('删除备份失败: ' + (error as Error).message);
    }
  }

  async function handleCleanupSelected(items: string[]) {
    try {
      let successCount = 0;
      let failedCount = 0;
      
      for (const backupId of items) {
        const success = await backupService.deleteBackup(backupId);
        if (success) {
          successCount++;
        } else {
          failedCount++;
        }
      }
      
      new Notice(`清理完成: 成功 ${successCount}, 失败 ${failedCount}`);
      await loadBackupData();
    } catch (error) {
      console.error('批量清理失败:', error);
      new Notice('批量清理失败: ' + (error as Error).message);
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
</script>

<div class="backup-management-panel">
  <!-- 统计汇总 -->
  <div class="settings-group">
    <div class="group-header">
      <h4 class="section-title with-accent-bar accent-cyan">备份统计</h4>
      <p class="group-description">当前备份系统的总体情况</p>
    </div>

    <div class="stats-summary">
      <div class="stat-card">
        <div class="stat-value">{stats.totalBackups}</div>
        <div class="stat-label">总备份</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{formatSize(stats.totalSize)}</div>
        <div class="stat-label">总大小</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{stats.compressedBackups}</div>
        <div class="stat-label">压缩备份</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{stats.deviceCount}</div>
        <div class="stat-label">设备数量</div>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="action-buttons">
      <button
        class="btn btn-primary"
        onclick={handleCreateBackup}
        disabled={isCreatingBackup}
      >
        {isCreatingBackup ? '创建中...' : '创建备份'}
      </button>
      <button
        class="btn btn-secondary"
        onclick={loadBackupData}
        disabled={isLoading}
      >
        {isLoading ? '刷新中...' : '🔄 刷新'}
      </button>
    </div>
  </div>

  <!-- 设备信息 -->
  {#if deviceInfo.length > 0}
    <DeviceInfoCard devices={deviceInfo} />
  {/if}

  <!-- 清理建议 -->
  {#if cleanupRecommendation && cleanupRecommendation.recommendedDeletions.length > 0}
    <CleanupRecommendationCard
      recommendation={cleanupRecommendation}
      onCleanup={handleCleanupSelected}
    />
  {/if}

  <!-- 备份列表 -->
  <BackupListTable
    {backups}
    {isLoading}
    onRestore={handleRestoreBackup}
    onDelete={handleDeleteBackup}
  />
</div>

<style>
  /* BackupManagementPanel 组件样式 - 使用全局样式框架 */

  .backup-management-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    /* 🔧 确保备份管理面板可交互 */
    position: relative;
    z-index: 1;
    pointer-events: auto;
  }

  .stats-summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 12px;
    margin-bottom: 16px;
  }

  .stat-card {
    padding: 16px;
    background: var(--background-primary);
    border-radius: var(--tuanki-radius-md);
    border: 1px solid var(--background-modifier-border);
    text-align: center;
  }

  .stat-value {
    font-size: 24px;
    font-weight: 600;
    color: var(--text-normal);
    margin-bottom: 4px;
  }

  .stat-label {
    font-size: 12px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .action-buttons {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .action-buttons .btn {
    flex: 1;
    min-width: 120px;
  }

  /* 侧边颜色条样式 */
  .section-title.with-accent-bar {
    position: relative;
    padding-left: 0.75rem;
  }

  .section-title.with-accent-bar::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 1.2em;
    border-radius: 2px;
  }

  .section-title.accent-cyan::before {
    background: var(--color-cyan);
  }

  @media (max-width: 768px) {
    .stats-summary {
      grid-template-columns: repeat(2, 1fr);
    }

    .action-buttons {
      flex-direction: column;
    }

    .action-buttons .btn {
      flex: none;
      min-width: auto;
    }
  }
</style>

