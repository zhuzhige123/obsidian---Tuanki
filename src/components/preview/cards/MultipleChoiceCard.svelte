<script lang="ts">
  import { slide, fade } from 'svelte/transition';
  import ObsidianRenderer from '../../atoms/ObsidianRenderer.svelte';
  import type { PreviewData } from '../ContentPreviewEngine';
  import type { ChoiceOption } from '../../../types/choice-card-types';
  import type AnkiPlugin from '../../../main';
  import { getCardTypeIcon } from '../../../types/unified-card-types';
  import { UnifiedCardType } from '../../../types/unified-card-types';

  interface Props {
    previewData: PreviewData;
    plugin: AnkiPlugin;
  }

  let { previewData, plugin }: Props = $props();

  // 状态管理
  let selectedOption = $state<string | null>(null);
  let showExplanation = $state(false);

  // 提取选择题数据
  const questionContent = $derived(
    previewData.sections.find(s => s.type === 'front')?.content || ''
  );

  const options = $derived<ChoiceOption[]>(
    (previewData.metadata as any)?.options || []
  );

  const correctOption = $derived(
    options.find(opt => opt.isCorrect)?.id || ''
  );

  const explanationContent = $derived(
    previewData.sections.find(s => s.type === 'back')?.content || ''
  );

  const sourcePath = $derived(
    (previewData.metadata as any)?.sourcePath || ''
  );

  // 选项点击处理
  function handleOptionClick(optionId: string) {
    if (selectedOption !== null) return; // 已选择，禁止再次点击

    selectedOption = optionId;
    showExplanation = true; // 立即显示解析

    // 触发动画反馈
    setTimeout(() => {
      const optionEl = document.querySelector(`[data-option-id="${optionId}"]`);
      if (optionEl) {
        if (optionId === correctOption) {
          optionEl.classList.add('tuanki-correct-feedback');
        } else {
          optionEl.classList.add('tuanki-incorrect-feedback');
        }
      }
    }, 10);
  }

  // 获取选项样式类
  function getOptionClass(optionId: string): string {
    const baseClass = 'choice-option';
    if (selectedOption === null) {
      return baseClass;
    }
    if (optionId === correctOption) {
      return `${baseClass} choice-correct`;
    }
    if (optionId === selectedOption) {
      return `${baseClass} choice-incorrect`;
    }
    return `${baseClass} choice-unselected`;
  }
</script>

<!-- 应用tuanki-card-base基础样式 -->
<div class="tuanki-card-base tuanki-choice-card tuanki-card-mount">
  <!-- 选择题头部 -->
  <div class="choice-header">
    <span class="tuanki-card-type-badge">
      {getCardTypeIcon(UnifiedCardType.MULTIPLE_CHOICE)} 选择题
    </span>
    {#if selectedOption}
      <span class="choice-status">
        {selectedOption === correctOption ? '✓ 回答正确' : '✗ 回答错误'}
      </span>
    {/if}
  </div>

  <!-- 问题区域 -->
  <div class="choice-question">
    <ObsidianRenderer
      {plugin}
      content={questionContent}
      {sourcePath}
    />
  </div>

  <!-- 选项列表 -->
  <div class="choice-options">
    {#each options as option (option.id)}
      <button
        class={getOptionClass(option.id)}
        data-option-id={option.id}
        onclick={() => handleOptionClick(option.id)}
        disabled={selectedOption !== null}
        type="button"
      >
        <!-- 选项标记 -->
        <span class="option-marker">
          {selectedOption === option.id ? '●' : '○'}
        </span>

        <!-- 选项内容 -->
        <div class="option-content">
          <span class="option-label">{option.label || option.id.toUpperCase()}.</span>
          <div class="option-text">
            <ObsidianRenderer
              {plugin}
              content={option.content}
              {sourcePath}
            />
          </div>
        </div>

        <!-- 正确/错误指示器 -->
        {#if selectedOption !== null}
          {#if option.id === correctOption}
            <span class="option-indicator correct" transition:fade>✓</span>
          {:else if option.id === selectedOption}
            <span class="option-indicator incorrect" transition:fade>✗</span>
          {/if}
        {/if}
      </button>
    {/each}
  </div>

  <!-- 答案解析（自动显示） -->
  {#if showExplanation && explanationContent}
    <div 
      class="choice-explanation tuanki-answer-enter"
      transition:slide={{ duration: 350 }}
    >
      <div class="tuanki-elegant-divider">
        <div class="divider-line"></div>
        <span class="divider-label">💡 答案解析</span>
        <div class="divider-line"></div>
      </div>
      <div class="explanation-content">
        <ObsidianRenderer
          {plugin}
          content={explanationContent}
          {sourcePath}
        />
      </div>
    </div>
  {/if}

  <!-- 空状态 -->
  {#if options.length === 0}
    <div class="choice-empty">
      <div class="empty-icon">📝</div>
      <div class="empty-title">没有选项</div>
      <div class="empty-description">此选择题没有配置选项</div>
    </div>
  {/if}
</div>

<style>
  /* 继承tuanki-card-base的样式 */

  /* 选择题头部 */
  .choice-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--tuanki-space-md);
  }

  .choice-status {
    font-size: 0.875rem;
    font-weight: 600;
    padding: var(--tuanki-space-xs) var(--tuanki-space-sm);
    border-radius: var(--tuanki-radius-sm);
    background: var(--tuanki-bg-secondary);
  }

  /* 问题区域 */
  .choice-question {
    margin-bottom: var(--tuanki-space-lg);
    font-size: 1rem;
    line-height: 1.6;
  }

  /* 选项列表 */
  .choice-options {
    display: flex;
    flex-direction: column;
    gap: var(--tuanki-space-sm);
    margin: var(--tuanki-space-lg) 0;
    
    /* 支持文本选择 */
    user-select: text;
    -webkit-user-select: text;
  }

  .choice-option {
    display: flex;
    align-items: flex-start;
    gap: var(--tuanki-space-md);
    padding: var(--tuanki-space-md);
    background: var(--tuanki-choice-default);
    border: 2px solid transparent;
    border-radius: var(--tuanki-radius-md);
    cursor: pointer;
    transition: all var(--tuanki-transition-fast) var(--tuanki-ease-out);
    text-align: left;
    width: 100%;
    position: relative;
  }

  .choice-option:hover:not(:disabled) {
    background: var(--tuanki-choice-hover);
    border-color: var(--tuanki-accent);
    transform: translateX(4px);
  }

  .choice-option:disabled {
    cursor: not-allowed;
  }

  .choice-option.choice-correct {
    background: var(--tuanki-choice-correct);
    border-color: var(--tuanki-success);
  }

  .choice-option.choice-incorrect {
    background: var(--tuanki-choice-incorrect);
    border-color: var(--tuanki-error);
  }

  .choice-option.choice-unselected {
    opacity: 0.6;
  }

  .option-marker {
    font-size: 1.25rem;
    color: var(--tuanki-text-muted);
    flex-shrink: 0;
    margin-top: 2px;
    transition: all var(--tuanki-transition-fast);
  }

  .choice-option.choice-correct .option-marker,
  .choice-option.choice-incorrect .option-marker {
    color: var(--tuanki-text-normal);
  }

  .option-content {
    flex: 1;
    display: flex;
    align-items: flex-start;
    gap: var(--tuanki-space-sm);
    min-width: 0;
  }

  .option-label {
    font-weight: 600;
    color: var(--tuanki-text-normal);
    flex-shrink: 0;
    margin-top: 2px;
  }

  .option-text {
    flex: 1;
    min-width: 0;
  }

  /* ObsidianRenderer内部样式重置 */
  .option-text :global(.tuanki-obsidian-renderer) {
    font-size: 1rem;
    line-height: 1.6;
  }

  .option-text :global(p) {
    margin: 0;
  }

  .option-indicator {
    font-size: 1.25rem;
    font-weight: bold;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .option-indicator.correct {
    color: var(--tuanki-success);
  }

  .option-indicator.incorrect {
    color: var(--tuanki-error);
  }

  /* 解析区域 */
  .choice-explanation {
    margin-top: var(--tuanki-space-lg);
  }

  .explanation-content {
    margin-top: var(--tuanki-space-md);
    padding: var(--tuanki-space-md);
    background: var(--tuanki-bg-secondary);
    border-radius: var(--tuanki-radius-md);
    line-height: 1.6;
  }

  /* 空状态 */
  .choice-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--tuanki-space-2xl);
    text-align: center;
    opacity: 0.6;
  }

  .empty-icon {
    font-size: 2.5rem;
    margin-bottom: var(--tuanki-space-md);
  }

  .empty-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--tuanki-text-normal);
    margin-bottom: var(--tuanki-space-sm);
  }

  .empty-description {
    font-size: 0.875rem;
    color: var(--tuanki-text-muted);
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .choice-header {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--tuanki-space-sm);
    }

    .choice-option {
      padding: var(--tuanki-space-md);
    }

    .option-marker,
    .option-indicator {
      font-size: 1.5rem;
    }

    .option-content {
      flex-direction: column;
      gap: var(--tuanki-space-xs);
    }

    .option-label {
      margin-top: 0;
    }
  }

  /* 减少动画偏好 */
  @media (prefers-reduced-motion: reduce) {
    .choice-option {
      transition: none;
    }

    .choice-option:hover:not(:disabled) {
      transform: none;
    }
  }

  /* 焦点可访问性 */
  .choice-option:focus-visible {
    outline: 2px solid var(--tuanki-accent);
    outline-offset: 2px;
  }
</style>

