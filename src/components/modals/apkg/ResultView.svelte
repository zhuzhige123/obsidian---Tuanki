<!--
  结果展示视图
  显示导入成功或失败的结果
-->
<script lang="ts">
  import EnhancedIcon from '../../ui/EnhancedIcon.svelte';
  
  // UI专用类型定义
  interface ImportResult {
    success: boolean;
    message: string;
    createdDeckName?: string;
    importedCards?: number;
    totalCards?: number;
    failedCards?: any[];
  }
  
  interface Props {
    result: ImportResult | null;
    onClose: () => void;
    onImportAnother?: () => void;
  }
  
  let { result, onClose, onImportAnother }: Props = $props();
</script>

{#if result}
<div class="result-view">
  {#if result.success}
    <!-- 成功结果 -->
    <div class="result-success">
      <div class="result-icon">
        <EnhancedIcon name="check-circle" size={64} color="var(--tuanki-success, var(--color-green))" />
      </div>
      <h3 class="result-title">导入成功！</h3>
      <p class="result-message">{result.message}</p>
      
      {#if result.createdDeckName || result.importedCards !== undefined}
        <div class="tuanki-card tuanki-card--flat result-details">
          {#if result.createdDeckName}
            <div class="detail-item">
              <span class="detail-label">牌组：</span>
              <span class="detail-value">{result.createdDeckName}</span>
            </div>
          {/if}
          {#if result.importedCards !== undefined}
            <div class="detail-item">
              <span class="detail-label">成功导入：</span>
              <span class="detail-value">{result.importedCards} 张卡片</span>
            </div>
          {/if}
          {#if result.failedCards && result.failedCards.length > 0}
            <div class="detail-item mod-warning">
              <span class="detail-label">跳过：</span>
              <span class="detail-value">{result.failedCards.length} 张卡片</span>
            </div>
          {/if}
        </div>
      {/if}
      
      <!-- 失败卡片列表 -->
      {#if result.failedCards && result.failedCards.length > 0}
        <details class="tuanki-collapsible">
          <summary class="tuanki-collapsible-trigger">
            <EnhancedIcon name="alert-triangle" size={16} />
            <span>查看跳过的卡片 ({result.failedCards.length})</span>
            <EnhancedIcon name="chevron-down" size={16} class="chevron" />
          </summary>
          <div class="tuanki-collapsible-content">
            {#each result.failedCards as failed}
              <div class="failed-card">
                <div class="failed-header">
                  <span class="failed-id">卡片 #{failed.cardId}</span>
                  <span class="failed-model">{failed.modelName}</span>
                </div>
                <div class="failed-reason">{failed.reason}</div>
                {#if failed.fieldPreview && Object.keys(failed.fieldPreview).length > 0}
                  <details class="failed-preview">
                    <summary>查看字段内容</summary>
                    <div class="failed-fields">
                      {#each Object.entries(failed.fieldPreview) as [name, value]}
                        <div class="field-item">
                          <strong>{name}:</strong>
                          <span>{String(value).slice(0, 100)}{String(value).length > 100 ? '...' : ''}</span>
                        </div>
                      {/each}
                    </div>
                  </details>
                {/if}
              </div>
            {/each}
          </div>
        </details>
      {/if}
      
      <!-- 操作按钮 -->
      <div class="result-actions">
        {#if onImportAnother}
          <button class="tuanki-btn tuanki-btn--secondary tuanki-btn--md" onclick={onImportAnother}>
            <EnhancedIcon name="plus" size={16} />
            <span>导入另一个文件</span>
          </button>
        {/if}
        <button class="tuanki-btn tuanki-btn--primary tuanki-btn--md" onclick={onClose}>
          <EnhancedIcon name="check" size={16} />
          <span>完成</span>
        </button>
      </div>
    </div>
    
  {:else}
    <!-- 失败结果 -->
    <div class="result-error">
      <div class="result-icon">
        <EnhancedIcon name="alert-circle" size={64} color="var(--tuanki-error, var(--color-red))" />
      </div>
      <h3 class="result-title">导入失败</h3>
      <p class="result-message">{result.message}</p>
      
      <div class="result-actions">
        {#if onImportAnother}
          <button class="tuanki-btn tuanki-btn--secondary tuanki-btn--md" onclick={onImportAnother}>
            <EnhancedIcon name="rotate-cw" size={16} />
            <span>重新尝试</span>
          </button>
        {/if}
        <button class="tuanki-btn tuanki-btn--primary tuanki-btn--md" onclick={onClose}>
          <span>关闭</span>
        </button>
      </div>
    </div>
  {/if}
</div>
{:else}
<div class="no-result">
  <p>无结果数据</p>
</div>
{/if}

<style>
  .result-view {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-height: 300px;
    padding: var(--tuanki-space-xl, 1.5rem);
  }
  
  .result-success,
  .result-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    width: 100%;
    max-width: 600px;
  }
  
  .result-icon {
    margin-bottom: var(--tuanki-space-lg, 1.25rem);
    animation: tuanki-fade-in 0.5s var(--tuanki-ease-out, cubic-bezier(0.4, 0, 0.2, 1));
  }
  
  @keyframes tuanki-fade-in {
    from {
      opacity: 0;
      transform: scale(0.8);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  
  .result-title {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0 0 var(--tuanki-space-md, 1rem) 0;
    color: var(--tuanki-text-normal, var(--text-normal));
  }
  
  .result-message {
    font-size: 1rem;
    color: var(--tuanki-text-muted, var(--text-muted));
    margin-bottom: var(--tuanki-space-lg, 1.25rem);
  }
  
  /* 结果详情 */
  .result-details {
    width: 100%;
    text-align: left;
    background: var(--tuanki-bg-secondary, var(--background-secondary));
    margin-bottom: var(--tuanki-space-lg, 1.25rem);
  }
  
  .detail-item {
    display: flex;
    justify-content: space-between;
    padding: var(--tuanki-space-sm, 0.5rem) 0;
    border-bottom: 1px solid var(--tuanki-border, var(--background-modifier-border));
  }
  
  .detail-item:last-child {
    border-bottom: none;
  }
  
  .detail-item.mod-warning {
    color: var(--tuanki-warning, var(--color-yellow));
  }
  
  .detail-label {
    color: var(--tuanki-text-muted, var(--text-muted));
  }
  
  .detail-value {
    font-weight: 600;
  }
  
  /* 折叠组件 */
  .tuanki-collapsible {
    width: 100%;
    margin-bottom: var(--tuanki-space-lg, 1.25rem);
    border: 1px solid var(--tuanki-border, var(--background-modifier-border));
    border-radius: var(--tuanki-radius-md, 8px);
    overflow: hidden;
  }
  
  .tuanki-collapsible-trigger {
    display: flex;
    align-items: center;
    gap: var(--tuanki-space-sm, 0.5rem);
    padding: var(--tuanki-space-md, 1rem);
    background: var(--tuanki-bg-secondary, var(--background-secondary));
    cursor: pointer;
    font-weight: 600;
    transition: background var(--tuanki-transition-fast, 150ms);
    user-select: none;
  }
  
  .tuanki-collapsible-trigger:hover {
    background: var(--tuanki-bg-modifier, var(--background-modifier-hover));
  }
  
  .tuanki-collapsible-trigger :global(.chevron) {
    margin-left: auto;
    transition: transform var(--tuanki-transition-fast, 150ms);
  }
  
  .tuanki-collapsible[open] :global(.chevron) {
    transform: rotate(180deg);
  }
  
  .tuanki-collapsible-content {
    padding: var(--tuanki-space-md, 1rem);
    background: var(--tuanki-bg-primary, var(--background-primary));
    border-top: 1px solid var(--tuanki-border, var(--background-modifier-border));
    max-height: 400px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--tuanki-space-sm, 0.5rem);
  }
  
  /* 失败卡片 */
  .failed-card {
    padding: var(--tuanki-space-md, 1rem);
    background: var(--tuanki-bg-secondary, var(--background-secondary));
    border-left: 3px solid var(--tuanki-warning, var(--color-yellow));
    border-radius: var(--tuanki-radius-sm, 6px);
  }
  
  .failed-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: var(--tuanki-space-sm, 0.5rem);
    font-size: 0.875rem;
  }
  
  .failed-id {
    color: var(--tuanki-text-muted, var(--text-muted));
  }
  
  .failed-model {
    font-weight: 600;
  }
  
  .failed-reason {
    color: var(--tuanki-warning, var(--color-yellow));
    font-size: 0.875rem;
    margin-bottom: var(--tuanki-space-sm, 0.5rem);
  }
  
  .failed-preview summary {
    cursor: pointer;
    font-size: 0.875rem;
    color: var(--interactive-accent);
  }
  
  .failed-fields {
    margin-top: var(--tuanki-space-sm, 0.5rem);
    font-size: 0.875rem;
  }
  
  .failed-fields .field-item {
    margin-bottom: var(--tuanki-space-xs, 0.25rem);
    display: flex;
    gap: var(--tuanki-space-xs, 0.25rem);
  }
  
  .failed-fields .field-item strong {
    color: var(--tuanki-text-muted, var(--text-muted));
    min-width: 100px;
  }
  
  /* 操作按钮 */
  .result-actions {
    display: flex;
    gap: var(--tuanki-space-md, 1rem);
    margin-top: var(--tuanki-space-lg, 1.25rem);
  }
  
  .no-result {
    text-align: center;
    padding: var(--tuanki-space-2xl, 2rem);
    color: var(--tuanki-text-muted, var(--text-muted));
  }
  
  @media (max-width: 768px) {
    .result-actions {
      flex-direction: column;
      width: 100%;
    }
    
    .result-actions button {
      width: 100%;
    }
  }
</style>

