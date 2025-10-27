<script lang="ts">
  import type { SyncLogEntry } from '../../settings/types/settings-types';
  
  let {
    logs = [],
    onClearLogs
  }: {
    logs: SyncLogEntry[];
    onClearLogs: () => void;
  } = $props();

  let currentPage = $state(1);
  let pageSize = 10;

  // 派生状态
  let totalPages = $derived(Math.ceil(logs.length / pageSize));
  let paginatedLogs = $derived(
    logs.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  );

  // 统计
  let stats = $derived({
    totalSyncs: logs.length,
    totalSuccess: logs.reduce((sum, log) => sum + log.summary.successCount, 0),
    totalFailed: logs.reduce((sum, log) => sum + log.summary.failedCount, 0),
    totalSkipped: logs.reduce((sum, log) => sum + log.summary.skippedCount, 0),
    successRate: logs.length > 0 
      ? Math.round((logs.reduce((sum, log) => 
          sum + (log.summary.failedCount === 0 ? 1 : 0), 0) / logs.length) * 100)
      : 0
  });

  function getDirectionIcon(direction: string): string {
    return direction === 'to_anki' ? '→' : '←';
  }

  function formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return '昨天 ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  }

  function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}秒`;
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}分${remainingSeconds}秒`;
  }

  function handlePageChange(page: number) {
    currentPage = page;
  }
</script>

<div class="sync-log-dashboard settings-group">
  <div class="group-header">
    <h4 class="section-title with-accent-bar accent-orange">同步日志</h4>
    <p>最近的同步记录</p>
  </div>

  <!-- 统计汇总 -->
  <div class="stats-summary">
    <div class="stat-card">
      <div class="stat-value">{stats.totalSyncs}</div>
      <div class="stat-label">总同步</div>
    </div>
    <div class="stat-card success">
      <div class="stat-value">{stats.totalSuccess}</div>
      <div class="stat-label">成功</div>
    </div>
    <div class="stat-card error">
      <div class="stat-value">{stats.totalFailed}</div>
      <div class="stat-label">失败</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">{stats.successRate}%</div>
      <div class="stat-label">成功率</div>
    </div>
  </div>

  {#if logs.length > 0}
    <!-- 日志表格 -->
    <div class="log-table-container">
      <table class="anki-table">
        <thead>
          <tr>
            <th>时间</th>
            <th>方向</th>
            <th>成功</th>
            <th>失败</th>
            <th>跳过</th>
            <th>耗时</th>
          </tr>
        </thead>
        <tbody>
          {#each paginatedLogs as log}
            <tr>
              <td>{formatTime(log.timestamp)}</td>
              <td>
                <span class="direction-badge">
                  {getDirectionIcon(log.direction)}
                </span>
              </td>
              <td class="success-count">{log.summary.successCount}</td>
              <td class="failed-count">{log.summary.failedCount}</td>
              <td class="skipped-count">{log.summary.skippedCount}</td>
              <td>{formatDuration(log.duration)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- 分页和操作 -->
    <div class="footer-actions">
      {#if totalPages > 1}
        <div class="pagination">
          <button
            class="btn btn-small"
            onclick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            ← 上一页
          </button>
          <span class="page-info">
            第 {currentPage} / {totalPages} 页
          </span>
          <button
            class="btn btn-small"
            onclick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            下一页 →
          </button>
        </div>
      {/if}

      <button class="btn btn-danger btn-small" onclick={onClearLogs}>
        清空日志
      </button>
    </div>
  {/if}
</div>

<style>
  /* SyncLogDashboard 组件样式 - 使用全局样式框架 */

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

  .stat-card.success {
    border-color: var(--tuanki-success);
  }

  .stat-card.error {
    border-color: var(--tuanki-error);
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

  .log-table-container {
    overflow-x: auto;
    margin-bottom: 16px;
  }

  .direction-badge {
    display: inline-block;
    padding: 4px 8px;
    background: var(--background-secondary);
    border-radius: 4px;
    font-weight: 600;
  }

  .success-count {
    color: var(--tuanki-success);
    font-weight: 500;
  }

  .failed-count {
    color: var(--tuanki-error);
    font-weight: 500;
  }

  .skipped-count {
    color: var(--text-muted);
  }

  .footer-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .pagination {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .page-info {
    font-size: 13px;
    color: var(--text-muted);
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

  .section-title.accent-orange::before {
    background: var(--color-orange);
  }

  @media (max-width: 768px) {
    .stats-summary {
      grid-template-columns: repeat(2, 1fr);
    }

    .footer-actions {
      flex-direction: column-reverse;
      align-items: stretch;
    }

    .pagination {
      justify-content: center;
    }
  }
</style>

