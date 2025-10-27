<!--
  数据概览卡片组件
  显示数据统计信息和快速操作
-->
<script lang="ts">
  import type { DataOverview } from '../../../types/data-management-types';
  import { formatFileSize, formatNumber } from '../../../utils/format-utils';
  import { createEventDispatcher } from 'svelte';
  import ObsidianIcon from '../../ui/ObsidianIcon.svelte';

  interface Props {
    overview: DataOverview | null;
    isLoading?: boolean;
    onRefresh?: () => Promise<void>;
    onOpenFolder?: () => Promise<void>;
  }

  let { overview, isLoading = false, onRefresh, onOpenFolder }: Props = $props();

  const dispatch = createEventDispatcher<{
    refresh: void;
    openFolder: void;
  }>();

  // 派生状态
  let formattedSize = $derived(
    overview ? formatFileSize(overview.totalSize) : '计算中...'
  );

  let formattedCards = $derived(
    overview ? formatNumber(overview.totalCards) : '0'
  );

  let formattedDecks = $derived(
    overview ? formatNumber(overview.totalDecks) : '0'
  );

  let formattedSessions = $derived(
    overview ? formatNumber(overview.totalSessions) : '0'
  );

  let lastUpdatedText = $derived.by(() => {
    if (!overview?.lastUpdated) return '未知';

    const lastUpdated = new Date(overview.lastUpdated);
    const now = new Date();
    const diffMs = now.getTime() - lastUpdated.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffMinutes < 1) return '刚刚';
    if (diffMinutes < 60) return `${diffMinutes}分钟前`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}小时前`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}天前`;
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
      console.error('刷新数据概览失败:', error);
    }
  }

  async function handleOpenFolder() {
    try {
      if (onOpenFolder) {
        await onOpenFolder();
      }
      dispatch('openFolder');
    } catch (error) {
      console.error('打开文件夹失败:', error);
    }
  }
</script>

<!-- 数据概览卡片 -->
<div class="tuanki-settings settings-group data-overview-card" class:loading={isLoading}>
  <!-- 卡片头部 -->
  <div class="group-title-row">
    <div class="title-container">
      <h4 class="group-title with-accent-bar accent-blue">数据概览</h4>
      <p class="last-updated">最后更新: {lastUpdatedText}</p>
    </div>
    <div class="header-actions">
      <button
        class="icon-button"
        onclick={handleOpenFolder}
        title="打开数据文件夹"
        aria-label="打开数据文件夹"
      >
        <ObsidianIcon name="folder-open" size={16} />
      </button>
      <button
        class="icon-button refresh-button"
        onclick={handleRefresh}
        disabled={isLoading}
        title="刷新数据"
        aria-label="刷新数据"
      >
        <ObsidianIcon name="refresh-cw" size={16} class={isLoading ? 'spinning' : ''} />
      </button>
    </div>
  </div>

  <!-- 数据统计网格 -->
  <div class="stats-grid">
    <!-- 数据文件夹信息 -->
    <div class="stat-item folder-info">
      <div class="stat-content">
        <div class="stat-label">数据文件夹</div>
        <div class="stat-value folder-path" title={overview?.dataFolderPath}>
          {overview?.dataFolderPath || '未设置'}
        </div>
      </div>
    </div>

    <!-- 总大小 -->
    <div class="stat-item">
      <div class="stat-content">
        <div class="stat-label">总大小</div>
        <div class="stat-value">{formattedSize}</div>
      </div>
    </div>

    <!-- 牌组数量 -->
    <div class="stat-item">
      <div class="stat-content">
        <div class="stat-label">牌组数量</div>
        <div class="stat-value">{formattedDecks}</div>
      </div>
    </div>

    <!-- 卡片总数 -->
    <div class="stat-item">
      <div class="stat-content">
        <div class="stat-label">卡片总数</div>
        <div class="stat-value">{formattedCards}</div>
      </div>
    </div>

    <!-- 学习会话 -->
    <div class="stat-item">
      <div class="stat-content">
        <div class="stat-label">学习会话</div>
        <div class="stat-value">{formattedSessions}</div>
      </div>
    </div>
  </div>

  <!-- 加载遮罩 -->
  {#if isLoading}
    <div class="loading-overlay">
      <div class="loading-spinner"></div>
      <div class="loading-text">正在加载数据...</div>
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
    gap: 0.5rem;
  }

  .icon-button {
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-primary);
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .icon-button:hover:not(:disabled) {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-normal);
    color: var(--text-normal);
  }

  .icon-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* 统计网格 */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.75rem;
  }

  .stat-item {
    display: flex;
    align-items: flex-start;
    padding: 0.75rem;
    background: var(--tuanki-secondary-bg, var(--background-primary));
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    transition: all 0.2s ease;
  }

  .stat-item:hover {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-normal);
  }

  .stat-item.folder-info {
    grid-column: 1 / -1;
  }

  .stat-content {
    flex: 1;
    min-width: 0;
  }

  .stat-label {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-bottom: 0.25rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .stat-value {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-normal);
    word-break: break-all;
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

    .stats-grid {
      grid-template-columns: 1fr;
    }

    .stat-item.folder-info {
      grid-column: 1;
    }
  }
</style>
