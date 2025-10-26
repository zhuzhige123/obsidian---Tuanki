<!--
  备份历史列表组件
  显示最多3个备份的历史记录
-->
<script lang="ts">
  import type { BackupInfo } from '../../../types/data-management-types';
  import { formatFileSize, formatRelativeTime, formatBackupType } from '../../../utils/format-utils';
  import { createEventDispatcher } from 'svelte';

  interface Props {
    backups: BackupInfo[];
    maxBackups?: number;
    isLoading?: boolean;
    onRestore?: (backupId: string) => Promise<void>;
    onDelete?: (backupId: string) => Promise<void>;
    onPreview?: (backupId: string) => Promise<void>;
  }

  let { 
    backups, 
    maxBackups = 3, 
    isLoading = false,
    onRestore,
    onDelete,
    onPreview
  }: Props = $props();

  const dispatch = createEventDispatcher<{
    restore: { backupId: string };
    delete: { backupId: string };
    preview: { backupId: string };
  }>();

  // 备份类型显示文本
  const backupTypeLabels: Record<string, string> = {
    'auto': '自动备份',
    'manual': '手动备份',
    'pre_operation': '操作前备份',
    'scheduled': '定时备份'
  };

  // 获取备份类型标签
  function getBackupTypeLabel(type: string): string {
    return backupTypeLabels[type] || '备份';
  }

  // 获取备份状态样式类
  function getBackupStatusClass(backup: BackupInfo): string {
    if (!backup.isValid) return 'invalid';
    
    const now = new Date();
    const backupTime = new Date(backup.timestamp);
    const diffHours = (now.getTime() - backupTime.getTime()) / (1000 * 60 * 60);
    
    if (diffHours < 24) return 'recent';
    if (diffHours < 168) return 'normal'; // 7天内
    return 'old';
  }

  // 处理恢复操作
  async function handleRestore(backupId: string) {
    try {
      if (onRestore) {
        await onRestore(backupId);
      }
      dispatch('restore', { backupId });
    } catch (error) {
      console.error('恢复备份失败:', error);
    }
  }

  // 处理删除操作
  async function handleDelete(backupId: string) {
    try {
      if (onDelete) {
        await onDelete(backupId);
      }
      dispatch('delete', { backupId });
    } catch (error) {
      console.error('删除备份失败:', error);
    }
  }

  // 处理预览操作
  async function handlePreview(backupId: string) {
    try {
      if (onPreview) {
        await onPreview(backupId);
      }
      dispatch('preview', { backupId });
    } catch (error) {
      console.error('预览备份失败:', error);
    }
  }

  // 限制显示的备份数量
  let displayedBackups = $derived(
    backups.slice(0, maxBackups)
  );

  // 检查是否有更多备份
  let hasMoreBackups = $derived(
    backups.length > maxBackups
  );
</script>

<!-- 备份历史列表 -->
<div class="backup-history-list" class:loading={isLoading}>
  <!-- 头部信息 -->
  <div class="list-header">
    <div class="header-content">
      <div class="header-text">
        <h3 class="section-title with-accent-bar accent-purple">备份历史</h3>
        <p class="backup-count">
          {#if backups.length === 0}
            暂无备份记录
          {:else if hasMoreBackups}
            显示最近 {maxBackups} 个备份 (共 {backups.length} 个)
          {:else}
            共 {backups.length} 个备份
          {/if}
        </p>
      </div>
    </div>
  </div>

  <!-- 备份列表 -->
  <div class="backup-list">
    {#if displayedBackups.length === 0}
      <div class="empty-state">
        <div class="empty-text">
          {#if isLoading}
            正在加载备份历史...
          {:else}
            暂无备份记录
          {/if}
        </div>
      </div>    {:else}
      {#each displayedBackups as backup (backup.id)}
        {@const typedBackup = backup as BackupInfo}
        <div class="backup-item" class:invalid={!typedBackup.isValid}>
          <!-- 备份信息 -->
          <div class="backup-info">
            <!-- 主要信息 -->
            <div class="backup-main">
              <div class="backup-header">
                <div class="backup-type" data-type={typedBackup.type}>
                  <span class="type-badge" class:auto={typedBackup.type === 'auto'} class:manual={typedBackup.type === 'manual'}>
                    {getBackupTypeLabel(typedBackup.type)}
                  </span>
                </div>
                <div class="backup-time">
                  {formatRelativeTime(typedBackup.timestamp)}
                </div>
              </div>

              <div class="backup-details">
                <div class="backup-size">{formatFileSize(typedBackup.size)}</div>
                {#if typedBackup.description}
                  <div class="backup-description">{typedBackup.description}</div>
                {/if}
              </div>
            </div>

            <!-- 数据类型标签 -->
            {#if typedBackup.dataTypes && typedBackup.dataTypes.length > 0}
              <div class="data-types">
                {#each typedBackup.dataTypes as dataType}
                  <span class="data-type-tag">{dataType}</span>
                {/each}
              </div>
            {/if}

            <!-- 备份状态 -->
            {#if !typedBackup.isValid}
              <div class="backup-warning">
                <span class="warning-text">⚠ 备份文件可能已损坏</span>
              </div>
            {/if}
          </div>

          <!-- 操作按钮 -->
          <div class="backup-actions">
            <button
              class="action-button preview-button"
              onclick={() => handlePreview(typedBackup.id)}
              title="预览备份内容"
              disabled={isLoading}
            >
              预览
            </button>

            <button
              class="action-button restore-button"
              onclick={() => handleRestore(typedBackup.id)}
              title="从此备份恢复数据"
              disabled={isLoading || !typedBackup.isValid}
            >
              恢复
            </button>

            <button
              class="action-button delete-button"
              onclick={() => handleDelete(typedBackup.id)}
              title="删除此备份"
              disabled={isLoading}
            >
              删除
            </button>
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <!-- 提示信息 -->
  {#if displayedBackups.length > 0}
    <div class="list-footer">
      <div class="footer-hint">
        系统自动保留最近 {maxBackups} 个备份，超出部分将被清理
      </div>
    </div>
  {/if}

  <!-- 加载遮罩 -->
  {#if isLoading}
    <div class="loading-overlay">
      <div class="loading-spinner"></div>
      <div class="loading-text">正在处理备份操作...</div>
    </div>
  {/if}
</div>

<style>
  .backup-history-list {
    position: relative;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .backup-history-list.loading {
    pointer-events: none;
  }

  /* 头部样式 */
  .list-header {
    padding: 1rem 1.5rem;
    background: var(--background-secondary);
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .header-content {
    display: flex;
    align-items: center;
  }

  .header-text {
    flex: 1;
  }

  .section-title {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-normal);
    padding-left: 0.75rem;
  }

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

  .section-title.accent-purple::before {
    background: var(--color-purple);
  }

  .backup-count {
    margin: 0.25rem 0 0 0;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  /* 备份列表 */
  .backup-list {
    flex: 1;
    overflow-y: auto;
    min-height: 120px;
  }

  /* 空状态 */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem 1.5rem;
    text-align: center;
    min-height: 120px;
  }

  .empty-text {
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  /* 备份项目 */
  .backup-item {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    padding: 0.875rem 1.25rem;
    border-bottom: 1px solid var(--background-modifier-border);
    transition: all 0.2s ease;
  }

  .backup-item:last-child {
    border-bottom: none;
  }

  .backup-item:hover {
    background: var(--background-modifier-hover);
  }

  .backup-item.invalid {
    opacity: 0.7;
    background: color-mix(in oklab, var(--text-error), transparent 95%);
  }

  /* 备份信息 */
  .backup-info {
    flex: 1;
    min-width: 0;
  }

  .backup-main {
    margin-bottom: 0.375rem;
  }

  .backup-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.25rem;
  }

  .backup-type {
    display: flex;
    align-items: center;
  }

  .type-badge {
    padding: 0.25rem 0.625rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    transition: all 0.2s ease;
  }

  /* 自动备份样式 */
  .type-badge.auto {
    background: color-mix(in oklab, var(--color-blue), transparent 85%);
    color: var(--color-blue);
    border: 1px solid color-mix(in oklab, var(--color-blue), transparent 70%);
  }

  /* 手动备份样式 */
  .type-badge.manual {
    background: color-mix(in oklab, var(--color-green), transparent 85%);
    color: var(--color-green);
    border: 1px solid color-mix(in oklab, var(--color-green), transparent 70%);
  }

  .backup-time {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .backup-details {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .backup-size {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-family: var(--font-monospace);
  }

  .backup-description {
    font-size: 0.75rem;
    color: var(--text-faint);
    font-style: italic;
  }

  /* 数据类型标签 */
  .data-types {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-bottom: 0.5rem;
  }

  .data-type-tag {
    padding: 0.125rem 0.375rem;
    font-size: 0.625rem;
    background: var(--background-modifier-border);
    color: var(--text-muted);
    border-radius: 3px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* 备份警告 */
  .backup-warning {
    margin-top: 0.25rem;
  }

  .warning-text {
    font-size: 0.7rem;
    color: var(--text-error);
  }

  /* 操作按钮 */
  .backup-actions {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    flex-shrink: 0;
    margin-top: 0.25rem;
  }

  .action-button {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.375rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 500;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-primary);
    color: var(--text-normal);
    cursor: pointer;
    transition: all 0.2s ease;
    min-width: 60px;
  }

  .action-button:hover:not(:disabled) {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-normal);
  }

  .action-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-button.restore-button:hover:not(:disabled) {
    border-color: var(--text-success);
    color: var(--text-success);
  }

  .action-button.delete-button:hover:not(:disabled) {
    border-color: var(--text-error);
    color: var(--text-error);
  }

  /* 底部提示 */
  .list-footer {
    padding: 0.75rem 1.5rem;
    background: var(--background-secondary);
    border-top: 1px solid var(--background-modifier-border);
  }

  .footer-hint {
    font-size: 0.75rem;
    color: var(--text-muted);
    text-align: center;
  }

  /* 加载遮罩 */
  .loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: color-mix(in oklab, var(--background-primary), transparent 20%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    backdrop-filter: blur(2px);
  }

  .loading-spinner {
    width: 2rem;
    height: 2rem;
    border: 2px solid var(--background-modifier-border);
    border-top: 2px solid var(--interactive-accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .loading-text {
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* 滚动条样式 */
  .backup-list::-webkit-scrollbar {
    width: 6px;
  }

  .backup-list::-webkit-scrollbar-track {
    background: var(--background-secondary);
  }

  .backup-list::-webkit-scrollbar-thumb {
    background: var(--background-modifier-border);
    border-radius: 3px;
  }

  .backup-list::-webkit-scrollbar-thumb:hover {
    background: var(--interactive-normal);
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .backup-item {
      flex-direction: column;
      align-items: stretch;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
    }

    .backup-actions {
      flex-direction: row;
      justify-content: center;
      gap: 0.5rem;
    }

    .action-button {
      flex: 1;
      justify-content: center;
      min-width: auto;
    }

    .list-header {
      padding: 0.875rem 1rem;
    }

    .list-footer {
      padding: 0.625rem 1rem;
    }
  }
</style>
