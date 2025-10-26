<!--
  批量添加标签模态框
  支持输入多个标签，自动完成建议
-->
<script lang="ts">
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';
  import EnhancedButton from '../ui/EnhancedButton.svelte';
  import { ICON_NAMES } from '../../icons/index.js';
  import type { Card } from '../../data/types';

  interface Props {
    open: boolean;
    selectedCards: Card[];
    existingTags: string[]; // 系统中已有的所有标签
    onconfirm?: (tagsToAdd: string[]) => void;
    oncancel?: () => void;
  }

  let { open, selectedCards, existingTags, onconfirm, oncancel }: Props = $props();

  // 状态管理
  let tagInput = $state('');
  let addedTags = $state<string[]>([]);
  let showSuggestions = $state(false);

  // 计算建议标签
  let suggestedTags = $derived(() => {
    if (!tagInput.trim() || tagInput.endsWith(',')) return [];
    
    const currentInput = tagInput.split(',').pop()?.trim().toLowerCase() || '';
    if (!currentInput) return [];

    // 筛选匹配的标签
    return existingTags
      .filter(tag => 
        tag.toLowerCase().includes(currentInput) &&
        !addedTags.includes(tag)
      )
      .slice(0, 8);
  });

  // 当前卡片的标签统计
  let currentTagStats = $derived(() => {
    const tagCounts = new Map<string, number>();
    selectedCards.forEach(card => {
      card.tags?.forEach(tag => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    });
    return Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  });

  // 重置状态
  function resetState() {
    tagInput = '';
    addedTags = [];
    showSuggestions = false;
  }

  // 处理标签输入
  function handleTagInput(event: Event) {
    const target = event.target as HTMLInputElement;
    tagInput = target.value;
    showSuggestions = true;
  }

  // 选择建议标签
  function selectSuggestion(tag: string) {
    const parts = tagInput.split(',');
    parts[parts.length - 1] = tag;
    tagInput = parts.join(', ') + ', ';
    showSuggestions = false;
    
    // 聚焦回输入框
    setTimeout(() => {
      const input = document.querySelector('.bat-tag-input') as HTMLInputElement;
      input?.focus();
    }, 0);
  }

  // 添加标签
  function addTag(tag: string) {
    const trimmed = tag.trim();
    if (trimmed && !addedTags.includes(trimmed)) {
      addedTags = [...addedTags, trimmed];
    }
  }

  // 移除标签
  function removeTag(tag: string) {
    addedTags = addedTags.filter(t => t !== tag);
  }

  // 处理回车键
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      // 添加当前输入的所有标签
      const tags = tagInput.split(',').map(t => t.trim()).filter(Boolean);
      tags.forEach(tag => addTag(tag));
      tagInput = '';
      showSuggestions = false;
    } else if (event.key === 'Escape') {
      showSuggestions = false;
    }
  }

  // 确认添加
  function handleConfirm() {
    // 合并输入框中的标签
    const inputTags = tagInput.split(',').map(t => t.trim()).filter(Boolean);
    const allTags = [...new Set([...addedTags, ...inputTags])];
    
    if (allTags.length === 0) return;
    
    onconfirm?.(allTags);
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
<div class="bat-overlay" onclick={(e) => { if (e.currentTarget === e.target) handleCancel() }} onkeydown={(e) => { if (e.key === 'Escape') handleCancel() }} role="button" tabindex="0">
  <div class="bat-modal" role="dialog" aria-labelledby="bat-title">
    <header class="bat-header">
      <h2 id="bat-title">批量添加标签</h2>
      <EnhancedButton variant="secondary" size="sm" onclick={handleCancel}>
        <EnhancedIcon name={ICON_NAMES.CLOSE} size={16} />
      </EnhancedButton>
    </header>

    <main class="bat-main">
      <!-- 信息提示 -->
      <div class="bat-info">
        <EnhancedIcon name={ICON_NAMES.INFO} size={16} />
        <span>将为选中的 <strong>{selectedCards.length}</strong> 张卡片添加标签</span>
      </div>

      <!-- 当前标签统计 -->
      {#if currentTagStats().length > 0}
      <div class="bat-current-tags">
        <h4>当前标签：</h4>
        <div class="bat-tag-cloud">
          {#each currentTagStats().slice(0, 10) as stat}
          <span class="bat-tag-stat">
            {stat.tag} <span class="bat-tag-count">({stat.count})</span>
          </span>
          {/each}
        </div>
      </div>
      {/if}

      <!-- 标签输入 -->
      <div class="bat-input-container">
        <label for="tag-input">新标签：</label>
        <div class="bat-input-wrapper">
          <input
            id="tag-input"
            type="text"
            class="bat-tag-input"
            placeholder="输入标签，用逗号分隔（如：重要, 复习, 考试）"
            bind:value={tagInput}
            oninput={handleTagInput}
            onkeydown={handleKeyDown}
            onfocus={() => showSuggestions = true}
          />
          {#if suggestedTags().length > 0 && showSuggestions}
          <div class="bat-suggestions">
            {#each suggestedTags() as tag}
            <div
              class="bat-suggestion-item"
              onclick={() => selectSuggestion(tag)}
              onkeydown={(e) => { if (e.key === 'Enter') selectSuggestion(tag); }}
              role="button"
              tabindex="0"
            >
              <EnhancedIcon name={ICON_NAMES.TAG} size={14} />
              <span>{tag}</span>
            </div>
            {/each}
          </div>
          {/if}
        </div>
        <small>提示：按 Enter 键添加标签</small>
      </div>

      <!-- 已添加的标签 -->
      {#if addedTags.length > 0}
      <div class="bat-added-tags">
        <h4>待添加标签：</h4>
        <div class="bat-tag-list">
          {#each addedTags as tag}
          <div class="bat-tag-item">
            <span>{tag}</span>
            <button
              class="bat-tag-remove"
              onclick={() => removeTag(tag)}
              aria-label={`删除标签 ${tag}`}
            >
              <EnhancedIcon name={ICON_NAMES.X} size={14} />
            </button>
          </div>
          {/each}
        </div>
      </div>
      {/if}
    </main>

    <footer class="bat-footer">
      <EnhancedButton variant="secondary" onclick={handleCancel}>
        取消
      </EnhancedButton>
      <EnhancedButton 
        variant="primary" 
        onclick={handleConfirm}
        disabled={tagInput.trim() === '' && addedTags.length === 0}
      >
        确认添加标签
        <EnhancedIcon name={ICON_NAMES.CHECK} size={16} />
      </EnhancedButton>
    </footer>
  </div>
</div>
{/if}

<style>
  .bat-overlay {
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

  .bat-modal {
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

  .bat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .bat-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .bat-main {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .bat-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
    background: var(--background-secondary);
    border-radius: var(--radius-m);
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .bat-current-tags h4,
  .bat-added-tags h4 {
    margin: 0 0 0.75rem 0;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .bat-tag-cloud {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .bat-tag-stat {
    padding: 0.375rem 0.75rem;
    background: var(--background-secondary);
    border-radius: var(--radius-s);
    font-size: 0.875rem;
    color: var(--text-normal);
  }

  .bat-tag-count {
    color: var(--text-muted);
    font-size: 0.8125rem;
  }

  .bat-input-container label {
    display: block;
    font-weight: 500;
    color: var(--text-normal);
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
  }

  .bat-input-wrapper {
    position: relative;
  }

  .bat-tag-input {
    width: 100%;
    padding: 0.75rem 1rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.875rem;
    transition: all 0.2s ease;
  }

  .bat-tag-input:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }

  .bat-input-container small {
    display: block;
    margin-top: 0.5rem;
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  .bat-suggestions {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 0.25rem;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-m);
    box-shadow: var(--shadow-m);
    max-height: 200px;
    overflow-y: auto;
    z-index: 10;
  }

  .bat-suggestion-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .bat-suggestion-item:hover {
    background: var(--background-modifier-hover);
  }

  .bat-tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .bat-tag-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: var(--interactive-accent);
    color: white;
    border-radius: var(--radius-m);
    font-size: 0.875rem;
  }

  .bat-tag-remove {
    background: none;
    border: none;
    color: white;
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.8;
    transition: opacity 0.15s ease;
  }

  .bat-tag-remove:hover {
    opacity: 1;
  }

  .bat-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem;
    border-top: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
  }
</style>

