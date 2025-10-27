<script lang="ts">
  import type { CleanupRecommendation, BackupCleanupItem } from '../../../../types/backup-types';
  
  let {
    recommendation,
    onCleanup
  }: {
    recommendation: CleanupRecommendation;
    onCleanup: (backupIds: string[]) => Promise<void>;
  } = $props();

  let selectedItems = $state<Set<string>>(new Set());
  let isProcessing = $state(false);

  // 自动选中推荐删除的项目
  $effect(() => {
    const recommendedIds = recommendation.recommendedDeletions
      .filter(item => item.assessment.recommendDelete)
      .map(item => item.backupId);
    selectedItems = new Set(recommendedIds);
  });

  // 计算选中项的总节省空间
  let selectedSavings = $derived(
    recommendation.recommendedDeletions
      .filter(item => selectedItems.has(item.backupId))
      .reduce((sum, item) => sum + item.potentialSavings, 0)
  );

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function toggleItem(backupId: string) {
    const newSet = new Set(selectedItems);
    if (newSet.has(backupId)) {
      newSet.delete(backupId);
    } else {
      newSet.add(backupId);
    }
    selectedItems = newSet;
  }

  function toggleAll() {
    if (selectedItems.size === recommendation.recommendedDeletions.length) {
      selectedItems = new Set();
    } else {
      selectedItems = new Set(recommendation.recommendedDeletions.map(item => item.backupId));
    }
  }

  async function handleCleanup() {
    if (selectedItems.size === 0) return;
    
    const confirmed = confirm(
      `确定要删除 ${selectedItems.size} 个备份吗？\n` +
      `这将释放 ${formatSize(selectedSavings)} 的空间。\n` +
      `此操作不可恢复！`
    );
    
    if (!confirmed) return;

    isProcessing = true;
    try {
      await onCleanup(Array.from(selectedItems));
      selectedItems = new Set();
    } finally {
      isProcessing = false;
    }
  }

  function getConfidenceBadge(confidence?: 'low' | 'medium' | 'high'): { text: string; class: string } {
    switch (confidence) {
      case 'high':
        return { text: '高', class: 'confidence-high' };
      case 'medium':
        return { text: '中', class: 'confidence-medium' };
      case 'low':
        return { text: '低', class: 'confidence-low' };
      default:
        return { text: '未知', class: 'confidence-unknown' };
    }
  }
</script>

<div class="cleanup-recommendation-card settings-group">
  <div class="group-header">
    <h4>🧹 清理建议</h4>
    <p class="group-description">
      系统检测到 {recommendation.recommendedDeletions.length} 个可清理的备份，
      可释放 {formatSize(recommendation.potentialSavings)} 空间 
      ({recommendation.savingsPercentage.toFixed(1)}%)
    </p>
  </div>

  <!-- 汇总卡片 -->
  <div class="cleanup-summary">
    <div class="summary-card">
      <div class="summary-label">总备份数</div>
      <div class="summary-value">{recommendation.totalBackups}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">总大小</div>
      <div class="summary-value">{formatSize(recommendation.totalSize)}</div>
    </div>
    <div class="summary-card highlight">
      <div class="summary-label">可清理</div>
      <div class="summary-value">{recommendation.recommendedDeletions.length}</div>
    </div>
    <div class="summary-card highlight">
      <div class="summary-label">可释放空间</div>
      <div class="summary-value">{formatSize(recommendation.potentialSavings)}</div>
    </div>
  </div>

  <!-- 清理项列表 -->
  <div class="cleanup-list">
    <div class="list-header">
      <label class="checkbox-label">
        <input
          type="checkbox"
          checked={selectedItems.size === recommendation.recommendedDeletions.length}
          onchange={toggleAll}
        />
        <span>全选 ({selectedItems.size}/{recommendation.recommendedDeletions.length})</span>
      </label>
    </div>

    {#each recommendation.recommendedDeletions as item}
      {@const confidence = getConfidenceBadge(item.assessment.confidence)}
      <div class="cleanup-item" class:selected={selectedItems.has(item.backupId)}>
        <label class="checkbox-label">
          <input
            type="checkbox"
            checked={selectedItems.has(item.backupId)}
            onchange={() => toggleItem(item.backupId)}
          />
          <div class="item-info">
            <div class="item-header">
              <div class="item-title">
                {item.metadata.summary.deckName || '全局备份'} 
                · {item.metadata.summary.cardCount} 张卡片
              </div>
              <div class="item-badges">
                {#if item.assessment.recommendDelete}
                  <span class="badge recommend">推荐删除</span>
                {/if}
                <span class="badge {confidence.class}">
                  置信度: {confidence.text}
                </span>
              </div>
            </div>
            
            <div class="item-details">
              <span class="detail-item">
                📅 {formatTime(item.metadata.timestamp)}
              </span>
              <span class="detail-item">
                💾 {formatSize(item.potentialSavings)}
              </span>
              <span class="detail-item">
                📱 {item.metadata.deviceName}
              </span>
            </div>
            
            <div class="item-reason">
              {item.assessment.reason}
            </div>

            {#if item.assessment.dependentBackups && item.assessment.dependentBackups.length > 0}
              <div class="item-warning">
                ⚠️ 注意: 此备份有 {item.assessment.dependentBackups.length} 个依赖备份
              </div>
            {/if}
          </div>
        </label>
      </div>
    {/each}
  </div>

  <!-- 操作按钮 -->
  <div class="cleanup-actions">
    <div class="selected-info">
      已选择 {selectedItems.size} 项，将释放 {formatSize(selectedSavings)}
    </div>
    <button
      class="btn btn-danger"
      onclick={handleCleanup}
      disabled={selectedItems.size === 0 || isProcessing}
    >
      {isProcessing ? '清理中...' : `清理选中项 (${selectedItems.size})`}
    </button>
  </div>
</div>

<style>
  /* CleanupRecommendationCard 组件样式 - 使用全局样式框架 */

  .cleanup-summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 12px;
    margin-bottom: 16px;
  }

  .summary-card {
    padding: 12px;
    background: var(--background-primary);
    border-radius: var(--tuanki-radius-md);
    border: 1px solid var(--background-modifier-border);
    text-align: center;
  }

  .summary-card.highlight {
    border-color: var(--color-orange);
    background: color-mix(in srgb, var(--color-orange) 5%, var(--background-primary));
  }

  .summary-label {
    font-size: 11px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }

  .summary-value {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-normal);
  }

  .cleanup-list {
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--tuanki-radius-md);
    overflow: hidden;
    margin-bottom: 16px;
  }

  .list-header {
    padding: 12px 16px;
    background: var(--background-secondary);
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .cleanup-item {
    padding: 12px 16px;
    border-bottom: 1px solid var(--background-modifier-border);
    transition: background 0.2s ease;
  }

  .cleanup-item:last-child {
    border-bottom: none;
  }

  .cleanup-item:hover {
    background: var(--background-modifier-hover);
  }

  .cleanup-item.selected {
    background: color-mix(in srgb, var(--interactive-accent) 5%, var(--background-primary));
  }

  .checkbox-label {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    cursor: pointer;
    margin: 0;
  }

  .checkbox-label input[type="checkbox"] {
    margin-top: 2px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .item-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .item-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    flex-wrap: wrap;
  }

  .item-title {
    font-weight: 500;
    font-size: 14px;
    color: var(--text-normal);
  }

  .item-badges {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .badge {
    padding: 3px 8px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .badge.recommend {
    background: color-mix(in srgb, var(--color-orange) 20%, transparent);
    color: var(--color-orange);
  }

  .badge.confidence-high {
    background: color-mix(in srgb, var(--color-green) 20%, transparent);
    color: var(--color-green);
  }

  .badge.confidence-medium {
    background: color-mix(in srgb, var(--color-yellow) 20%, transparent);
    color: var(--color-yellow);
  }

  .badge.confidence-low {
    background: color-mix(in srgb, var(--text-muted) 20%, transparent);
    color: var(--text-muted);
  }

  .item-details {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }

  .detail-item {
    font-size: 12px;
    color: var(--text-muted);
  }

  .item-reason {
    font-size: 13px;
    color: var(--text-normal);
    padding: 8px 12px;
    background: var(--background-secondary);
    border-radius: 6px;
    border-left: 3px solid var(--color-orange);
  }

  .item-warning {
    font-size: 12px;
    color: var(--color-orange);
    padding: 6px 12px;
    background: color-mix(in srgb, var(--color-orange) 10%, transparent);
    border-radius: 6px;
  }

  .cleanup-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--background-modifier-border);
  }

  .selected-info {
    font-size: 14px;
    color: var(--text-muted);
    font-weight: 500;
  }

  /* 响应式 */
  @media (max-width: 768px) {
    .cleanup-summary {
      grid-template-columns: repeat(2, 1fr);
    }

    .item-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .cleanup-actions {
      flex-direction: column;
      align-items: stretch;
    }

    .cleanup-actions .btn {
      width: 100%;
    }
  }
</style>


