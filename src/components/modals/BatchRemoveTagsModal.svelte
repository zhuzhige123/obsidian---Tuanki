<!--
  批量删除标签模态框
  显示所有选中卡片的标签，支持多选删除
-->
<script lang="ts">
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';
  import EnhancedButton from '../ui/EnhancedButton.svelte';
  import { ICON_NAMES } from '../../icons/index.js';
  import type { Card } from '../../data/types';

  interface TagStatistic {
    tag: string;
    count: number;
    percentage: number;
  }

  interface Props {
    open: boolean;
    selectedCards: Card[];
    onconfirm?: (tagsToRemove: string[]) => void;
    oncancel?: () => void;
  }

  let { open, selectedCards, onconfirm, oncancel }: Props = $props();

  // 状态管理
  let selectedTags = $state(new Set<string>());

  // 收集所有标签并统计
  let tagStatistics = $derived((): TagStatistic[] => {
    const tagCounts = new Map<string, number>();
    
    selectedCards.forEach(card => {
      card.tags?.forEach(tag => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    });

    return Array.from(tagCounts.entries())
      .map(([tag, count]) => ({
        tag,
        count,
        percentage: (count / selectedCards.length) * 100
      }))
      .sort((a, b) => b.count - a.count);
  });

  // 重置状态
  function resetState() {
    selectedTags = new Set();
  }

  // 切换标签选择
  function toggleTag(tag: string) {
    const newSet = new Set(selectedTags);
    if (newSet.has(tag)) {
      newSet.delete(tag);
    } else {
      newSet.add(tag);
    }
    selectedTags = newSet;
  }

  // 全选
  function selectAll() {
    selectedTags = new Set(tagStatistics().map(stat => stat.tag));
  }

  // 清空选择
  function clearSelection() {
    selectedTags = new Set();
  }

  // 确认删除
  function handleConfirm() {
    if (selectedTags.size === 0) return;
    onconfirm?.(Array.from(selectedTags));
    resetState();
  }

  // 取消操作
  function handleCancel() {
    oncancel?.();
    resetState();
  }

  // 监听open变化，重置状态
  $effect(() => {
    if (!open) {
      resetState();
    }
  });
</script>

{#if open}
<div class="brt-overlay" onclick={(e) => { if (e.currentTarget === e.target) handleCancel() }} onkeydown={(e) => { if (e.key === 'Escape') handleCancel() }} role="button" tabindex="0">
  <div class="brt-modal" role="dialog" aria-labelledby="brt-title">
    <header class="brt-header">
      <h2 id="brt-title">批量删除标签</h2>
      <EnhancedButton variant="secondary" size="sm" onclick={handleCancel}>
        <EnhancedIcon name={ICON_NAMES.CLOSE} size={16} />
      </EnhancedButton>
    </header>

    <main class="brt-main">
      <!-- 信息提示 -->
      <div class="brt-info">
        <EnhancedIcon name={ICON_NAMES.INFO} size={16} />
        <span>从选中的 <strong>{selectedCards.length}</strong> 张卡片中删除标签</span>
      </div>

      {#if tagStatistics().length === 0}
        <!-- 无标签提示 -->
        <div class="brt-empty">
          <EnhancedIcon name={ICON_NAMES.WARNING} size={32} />
          <p>选中的卡片没有任何标签</p>
        </div>
      {:else}
        <!-- 快捷操作 -->
        <div class="brt-actions">
          <EnhancedButton variant="secondary" size="sm" onclick={selectAll}>
            全选
          </EnhancedButton>
          <EnhancedButton variant="secondary" size="sm" onclick={clearSelection}>
            清空
          </EnhancedButton>
          <span class="brt-selection-count">
            已选择 <strong>{selectedTags.size}</strong> 个标签
          </span>
        </div>

        <!-- 标签列表 -->
        <div class="brt-tag-list">
          {#each tagStatistics() as stat (stat.tag)}
            <label class="brt-tag-item">
              <input
                type="checkbox"
                checked={selectedTags.has(stat.tag)}
                onchange={() => toggleTag(stat.tag)}
              />
              <div class="brt-tag-content">
                <div class="brt-tag-name">
                  <EnhancedIcon name={ICON_NAMES.TAG} size={14} />
                  <span>{stat.tag}</span>
                </div>
                <div class="brt-tag-stats">
                  <span class="brt-tag-count">{stat.count} 张卡片</span>
                  <div class="brt-tag-bar">
                    <div 
                      class="brt-tag-bar-fill" 
                      style="width: {stat.percentage}%"
                    ></div>
                  </div>
                  <span class="brt-tag-percentage">{stat.percentage.toFixed(0)}%</span>
                </div>
              </div>
            </label>
          {/each}
        </div>

        <!-- 删除预览 -->
        {#if selectedTags.size > 0}
        <div class="brt-preview">
          <h4>将删除以下标签：</h4>
          <div class="brt-preview-tags">
            {#each Array.from(selectedTags) as tag}
            <span class="brt-preview-tag">
              {tag}
            </span>
            {/each}
          </div>
          <p class="brt-warning">
            <EnhancedIcon name={ICON_NAMES.WARNING} size={14} />
            注意：只会从包含这些标签的卡片中删除
          </p>
        </div>
        {/if}
      {/if}
    </main>

    <footer class="brt-footer">
      <EnhancedButton variant="secondary" onclick={handleCancel}>
        取消
      </EnhancedButton>
      <EnhancedButton 
        variant="danger" 
        onclick={handleConfirm}
        disabled={selectedTags.size === 0}
      >
        确认删除标签
        <EnhancedIcon name={ICON_NAMES.DELETE} size={16} />
      </EnhancedButton>
    </footer>
  </div>
</div>
{/if}

<style>
  .brt-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }

  .brt-modal {
    background: var(--background-primary);
    border-radius: var(--radius-l);
    box-shadow: var(--shadow-l);
    width: 100%;
    max-width: 600px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .brt-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .brt-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .brt-main {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .brt-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
    background: var(--background-secondary);
    border-radius: var(--radius-m);
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .brt-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 1rem;
    color: var(--text-muted);
    text-align: center;
  }

  .brt-empty p {
    margin: 1rem 0 0 0;
  }

  .brt-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .brt-selection-count {
    margin-left: auto;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .brt-tag-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .brt-tag-item {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 1rem;
    border: 2px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .brt-tag-item:hover {
    border-color: var(--interactive-accent);
    background: var(--background-modifier-hover);
  }

  .brt-tag-item:has(input:checked) {
    border-color: var(--text-error);
    background: var(--background-modifier-error-hover);
  }

  .brt-tag-item input[type="checkbox"] {
    margin-top: 0.125rem;
    cursor: pointer;
  }

  .brt-tag-content {
    flex: 1;
  }

  .brt-tag-name {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 500;
    color: var(--text-normal);
    margin-bottom: 0.5rem;
  }

  .brt-tag-stats {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .brt-tag-count {
    color: var(--text-muted);
    font-size: 0.8125rem;
    min-width: 4rem;
  }

  .brt-tag-bar {
    flex: 1;
    height: 6px;
    background: var(--background-modifier-border);
    border-radius: 3px;
    overflow: hidden;
  }

  .brt-tag-bar-fill {
    height: 100%;
    background: var(--interactive-accent);
    transition: width 0.3s ease;
  }

  .brt-tag-percentage {
    color: var(--text-muted);
    font-size: 0.8125rem;
    min-width: 2.5rem;
    text-align: right;
  }

  .brt-preview {
    padding: 1rem;
    background: var(--background-modifier-error-hover);
    border: 1px solid var(--background-modifier-error);
    border-radius: var(--radius-m);
  }

  .brt-preview h4 {
    margin: 0 0 0.75rem 0;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-error);
  }

  .brt-preview-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .brt-preview-tag {
    padding: 0.375rem 0.75rem;
    background: var(--text-error);
    color: white;
    border-radius: var(--radius-s);
    font-size: 0.875rem;
  }

  .brt-warning {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    color: var(--text-error);
    font-size: 0.8125rem;
  }

  .brt-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem;
    border-top: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
  }
</style>

