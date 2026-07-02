<!--
  数据概览卡片组件
  显示数据统计信息和快速操作
-->
<script lang="ts">
  import { logger } from '../../../utils/logger';

  import type { DataOverview } from '../../../types/data-management-types';
  import { formatFileSize, formatNumber } from '../../../utils/format-utils';
  import { createEventDispatcher } from 'svelte';
  import ObsidianIcon from '../../ui/ObsidianIcon.svelte';
  import { tr } from '../../../utils/i18n';

  // 响应式翻译
  let t = $derived($tr);

  interface Props {
    overview: DataOverview | null;
    isLoading?: boolean;
    onRefresh?: () => Promise<void>;
    onOpenFolder?: () => Promise<void>;
    onCreateBackup?: () => Promise<void>;
  }

  let {
    overview,
    isLoading = false,
    onRefresh,
    onOpenFolder,
    onCreateBackup
  }: Props = $props();

  const dispatch = createEventDispatcher<{
    refresh: void;
    openFolder: void;
    createBackup: void;
  }>();

  // 派生状态
  let formattedSize = $derived(
    overview ? formatFileSize(overview.totalSize) : t('common.loading')
  );

  let formattedCards = $derived(
    overview ? formatNumber(overview.totalCards) : '0'
  );

  let formattedDecks = $derived(
    overview ? formatNumber(overview.totalDecks) : '0'
  );

  let formattedBackupSlots = $derived(
    overview ? `${overview.filledBackupSlots ?? 0}/2` : '0/2'
  );

  let lastUpdatedText = $derived.by(() => {
    if (!overview?.lastUpdated) return t('common.unknown');

    const lastUpdated = new Date(overview.lastUpdated);
    const now = new Date();
    const diffMs = now.getTime() - lastUpdated.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffMinutes < 1) return t('dataManagement.backup.latest.justNow');
    if (diffMinutes < 60) return `${diffMinutes} ${t('common.timeUnits.minutes').replace('{n}', '').trim()}`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} ${t('common.timeUnits.hours').replace('{n}', '').trim()}`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} ${t('common.timeUnits.days').replace('{n}', '').trim()}`;
  });

  // 事件处理
  async function handleRefresh() {
    if (isLoading) return;

    try {
      if (onRefresh) {
        await onRefresh();
      }
      dispatch('refresh');
    } catch (error) {
      logger.error('刷新数据概览失败:', error);
    }
  }

  async function handleOpenFolder() {
    try {
      if (onOpenFolder) {
        await onOpenFolder();
      }
      dispatch('openFolder');
    } catch (error) {
      logger.error('打开文件夹失败:', error);
    }
  }

  async function handleCreateBackup() {
    try {
      if (onCreateBackup) {
        await onCreateBackup();
      }
      dispatch('createBackup');
    } catch (error) {
      logger.error('创建备份失败:', error);
    }
  }
</script>

<!-- 数据概览卡片 -->
<div class="weave-settings settings-group data-overview-card" class:loading={isLoading}>
  <!-- 卡片头部 -->
  <div class="group-title-row">
    <div class="title-container">
      <h4 class="group-title with-accent-bar accent-blue">{t('dataManagement.backup.latest.title')}</h4>
      <p class="last-updated">{t('dataManagement.backup.latest.lastGenerated')}: {lastUpdatedText}</p>
    </div>
    <div class="header-actions">
      <button
        class="toolbar-icon-btn clickable-icon"
        type="button"
        onclick={handleOpenFolder}
        title={t('dataManagement.openFolder')}
        aria-label={t('dataManagement.openFolder')}
      >
        <ObsidianIcon name="folder-open" size={16} />
      </button>
      <button
        class="toolbar-icon-btn clickable-icon refresh-button"
        type="button"
        onclick={handleRefresh}
        disabled={isLoading}
        title={t('common.refresh')}
        aria-label={t('common.refresh')}
      >
        <ObsidianIcon
          name="refresh-cw"
          size={16}
          class={`refresh-icon ${isLoading ? 'spinning' : ''}`}
        />
      </button>
      <button
        class="backup-button mod-cta"
        type="button"
        onclick={handleCreateBackup}
        disabled={isLoading}
        title={t('dataManagement.backup.operations.createBackup')}
        aria-label={t('dataManagement.backup.operations.createBackup')}
      >
        <ObsidianIcon name="archive" size={16} />
        <span>{t('dataManagement.backup.operations.createBackup')}</span>
      </button>
    </div>
  </div>

  <!-- 数据统计列表 -->
  <div class="stats-grid">
    <div class="stat-item folder-info">
      <div class="stat-content">
        <div class="stat-label">{t('dataManagement.backup.latest.dataFolder')}</div>
        <div class="stat-value folder-path" title={overview?.dataFolderPath}>
          {overview?.dataFolderPath || t('common.notSet')}
        </div>
      </div>
    </div>

    <div class="stat-item">
      <div class="stat-content">
        <div class="stat-label">{t('dataManagement.backup.latest.stats.totalSize')}</div>
        <div class="stat-value">{formattedSize}</div>
      </div>
    </div>

    <div class="stat-item">
      <div class="stat-content">
        <div class="stat-label">{t('dataManagement.backup.latest.stats.deckCount')}</div>
        <div class="stat-value">{formattedDecks}</div>
      </div>
    </div>

    <div class="stat-item">
      <div class="stat-content">
        <div class="stat-label">{t('dataManagement.backup.latest.stats.cardTotal')}</div>
        <div class="stat-value">{formattedCards}</div>
      </div>
    </div>

    <div class="stat-item">
      <div class="stat-content">
        <div class="stat-label">{t('dataManagement.backup.latest.stats.backupCount')}</div>
        <div class="stat-value">{formattedBackupSlots}</div>
      </div>
    </div>
  </div>

  <!-- 加载遮罩 -->
  {#if isLoading}
    <div class="loading-overlay">
      <div class="loading-spinner"></div>
      <div class="loading-text">{t('common.loading')}</div>
    </div>
  {/if}
</div>

<style>
  .data-overview-card {
    position: relative;
  }

  .data-overview-card.loading {
    pointer-events: none;
  }

  /* 卡片头部 */
  .group-title-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
  }

  .title-container {
    flex: 1;
  }

  .last-updated {
    margin: 0.25rem 0 0 0;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .toolbar-icon-btn {
    width: var(--clickable-icon-size, 32px);
    height: var(--clickable-icon-size, 32px);
    border-radius: var(--clickable-icon-radius, 4px);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
  }

  .toolbar-icon-btn:hover:not(:disabled) {
    color: var(--text-normal);
  }

  .toolbar-icon-btn:disabled,
  .backup-button:disabled {
    opacity: var(--disabled-opacity);
    cursor: not-allowed;
  }

  /* 备份按钮 */
  .backup-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: var(--input-height);
    padding: 0 0.875rem;
    font-size: var(--font-ui-small);
    font-weight: var(--font-medium);
    white-space: nowrap;
  }

  :global(.refresh-icon.spinning svg) {
    animation: spin 1s linear infinite;
  }

  /* 统计列表 */
  .stats-grid {
    overflow: hidden;
    background: var(--weave-secondary-bg, var(--background-primary));
    border: 1px solid var(--background-modifier-border);
    border-radius: 12px;
  }

  .stat-item {
    display: flex;
    align-items: center;
    padding: 0.9rem 1rem;
    background: transparent;
    border: none;
    border-radius: 0;
    transition: background-color 0.2s ease;
  }

  .stat-item + .stat-item {
    border-top: 1px solid var(--background-modifier-border);
  }

  .stat-item:hover {
    background: var(--background-modifier-hover);
  }

  .stat-content {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(6.5rem, 10rem) minmax(0, 1fr);
    align-items: center;
    gap: 1rem;
  }

  .stat-label {
    font-size: 0.8125rem;
    color: var(--text-muted);
    letter-spacing: 0.3px;
    min-width: 0;
  }

  .stat-value {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-normal);
    min-width: 0;
    word-break: break-all;
    text-align: right;
  }

  .folder-path {
    font-family: var(--font-monospace);
    font-size: 0.875rem;
  }

  /* 加载遮罩 */
  .loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: color-mix(in oklab, var(--background-primary), transparent 20%);
    border-radius: 8px;
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

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .loading-text {
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .group-title-row {
      flex-direction: column;
      gap: 1rem;
      align-items: stretch;
    }

    .header-actions {
      justify-content: flex-end;
    }

    .stat-item {
      padding: 0.85rem 0.9rem;
    }

    .stat-content {
      grid-template-columns: 1fr;
      gap: 0.35rem;
    }

    .stat-value {
      text-align: left;
    }
  }
</style>
