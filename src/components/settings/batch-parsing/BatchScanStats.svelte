<!--
  批量扫描内联统计信息组件
  参考 AnnotationStatusPanel 的简洁设计
  显示核心统计信息：总数、新增、更新、失败、成功率
-->

<script lang="ts">
  import type { BatchParseResult } from '../../../services/batch-parsing';
  import EnhancedIcon from '../../ui/EnhancedIcon.svelte';
  import { tr } from '../../../utils/i18n';

  let t = $derived($tr);

  interface Props {
    results: BatchParseResult | null;
  }

  let { results }: Props = $props();

  // 计算统计数据
  let stats = $derived({
    totalCards: results?.totalCards || 0,
    newCards: results?.newCards || 0,
    updatedCards: results?.updatedCards || 0,
    failedCards: results?.failedCards?.length || 0,
    errors: results?.errors?.length || 0,
    
    // 计算成功率
    successRate: (() => {
      if (!results || results.totalCards === 0) return 0;
      const successful = (results.newCards || 0) + (results.updatedCards || 0);
      return Math.round((successful / results.totalCards) * 100);
    })()
  });
</script>

{#if results && results.totalCards > 0}
<div class="batch-scan-stats">
  <div class="stat-item">
    <EnhancedIcon name="check-circle" size={14} variant="success" />
    <span>{t('dataManagement.batchScan.detected')} <strong>{stats.totalCards}</strong></span>
  </div>
  
  {#if stats.newCards > 0}
  <div class="stat-item">
    <EnhancedIcon name="plus-circle" size={14} variant="primary" />
    <span>{t('dataManagement.batchScan.newCards')} <strong>{stats.newCards}</strong></span>
  </div>
  {/if}
  
  {#if stats.updatedCards > 0}
  <div class="stat-item">
    <EnhancedIcon name="refresh-cw" size={14} variant="primary" />
    <span>{t('dataManagement.batchScan.updated')} <strong>{stats.updatedCards}</strong></span>
  </div>
  {/if}
  
  {#if stats.failedCards > 0 || stats.errors > 0}
  <div class="stat-item">
    <EnhancedIcon name="x-circle" size={14} variant="error" />
    <span>{t('dataManagement.batchScan.errors')} <strong>{stats.failedCards + stats.errors}</strong></span>
  </div>
  {/if}
  
  <div class="stat-item success-rate">
    <EnhancedIcon name="trending-up" size={14} variant="success" />
    <span>{t('dataManagement.batchScan.successRate')} <strong>{stats.successRate}%</strong></span>
  </div>
</div>
{/if}

<style>
  /* 内联统计信息容器 */
  .batch-scan-stats {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  /* 统计项 */
  .stat-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: var(--text-muted);
    padding: 0.25rem 0.5rem;
    border-radius: var(--radius-s);
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    transition: all 0.2s ease;
  }

  .stat-item:hover {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
  }

  .stat-item span {
    white-space: nowrap;
  }

  .stat-item strong {
    color: var(--text-normal);
    font-weight: 600;
  }

  /* 成功率特殊样式 */
  .stat-item.success-rate {
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(99, 102, 241, 0.1) 100%);
    border-color: rgba(139, 92, 246, 0.3);
  }

  .stat-item.success-rate:hover {
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(99, 102, 241, 0.15) 100%);
    border-color: rgba(139, 92, 246, 0.5);
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .batch-scan-stats {
      width: 100%;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }

    .stat-item {
      width: 100%;
    }
  }
</style>





