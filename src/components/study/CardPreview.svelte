<script lang="ts">
  import { DesignTokens } from '../design/tokens';
  import ObsidianRenderer from '../atoms/ObsidianRenderer.svelte';
  import Icon from '../ui/Icon.svelte';
  import type { ParsedCard } from '../../types/newCardParsingTypes';
  import type AnkiPlugin from '../../main';

  // Props
  interface Props {
    card: ParsedCard;
    showAnswer?: boolean;
    plugin: AnkiPlugin;
  }
  const { card, showAnswer = false, plugin }: Props = $props();

  // 内部状态
  let revealedClozes = $state<Set<string>>(new Set());

  // 使用外部传入的 showAnswer 状态，如果没有传入则使用内部状态
  let internalShowBack = $state(false);
  const showBack = $derived(showAnswer || internalShowBack);

  // 获取正面内容的Markdown
  const frontMarkdown = $derived(() => {
    return card?.fields?.front || card?.fields?.question || '';
  });

  // 获取背面内容的Markdown
  const backMarkdown = $derived(() => {
    return card?.fields?.back || card?.fields?.answer || '';
  });

  // 计算挖空数量
  function countClozes(text: string): number {
    const highlightMatches = text.match(/==(.*?)==/g);
    const ankiMatches = text.match(/\{\{c\d+::(.*?)\}\}/g);
    return (highlightMatches?.length || 0) + (ankiMatches?.length || 0);
  }

  // 检测是否为挖空题
  const isClozeCard = $derived(card?.type === 'cloze');

  // 响应式计算 - 根据卡片类型智能统计
  const totalClozes = $derived(() => {
    if (isClozeCard) {
      // 挖空题：只统计front字段的挖空（避免重复计数）
      return countClozes(frontMarkdown());
    } else {
      // 普通题：统计front和back的总挖空数
      return countClozes(frontMarkdown()) + countClozes(backMarkdown());
    }
  });
  
  const revealedCount = $derived(revealedClozes.size);
  const allRevealed = $derived(revealedCount >= totalClozes());
  const hasBack = $derived(!isClozeCard && !!backMarkdown() && backMarkdown().trim().length > 0);
  const hasClozes = $derived(totalClozes() > 0);

  function revealCloze(segmentId: string): void {
    revealedClozes.add(segmentId);
    revealedClozes = new Set(revealedClozes);
  }

  function revealAll(): void {
    // 对于新的结构，我们简单地设置一个标志来显示所有挖空
    // 实际的挖空显示由ObsidianRenderer处理
    revealedClozes = new Set(['all']);
  }

  function hideAll(): void {
    revealedClozes = new Set();
  }

  function toggleBack(): void {
    // 只有在没有外部 showAnswer 控制时才允许内部切换
    if (showAnswer === undefined) {
      internalShowBack = !internalShowBack;
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case ' ':
        event.preventDefault();
        if (hasClozes && !allRevealed) {
          revealAll();
        } else if (hasBack) {
          toggleBack();
        }
        break;
      case 'h':
      case 'H':
        event.preventDefault();
        if (hasClozes) {
          if (allRevealed) {
            hideAll();
          } else {
            revealAll();
          }
        }
        break;
      case 'Enter':
        event.preventDefault();
        if (hasBack) {
          toggleBack();
        }
        break;
    }
  }

  function getCardTypeLabel(type: string): string {
    switch (type) {
      case 'qa':
        return 'Q&A 卡片';
      case 'cloze':
        return '挖空卡片';
      case 'basic':
        return '基础卡片';
      default:
        return type;
    }
  }

  function getCardTypeColor(type: string): string {
    switch (type) {
      case 'qa':
        return 'var(--tuanki-info)';
      case 'cloze':
        return 'var(--tuanki-success)';
      case 'basic':
        return 'var(--tuanki-warning)';
      default:
        return 'var(--tuanki-text-muted)';
    }
  }
</script>

<div
  class="card-preview"
  tabindex="0"
  onkeydown={handleKeydown}
  role="button"
  aria-label="卡片预览"
>
  <!-- 卡片头部 -->
  <div class="card-header">
    <div class="card-info">
      <span
        class="card-type-badge"
        style:color={getCardTypeColor(card.type)}
      >
        {getCardTypeLabel(card.type)}
      </span>
      {#if hasClozes}
        <span class="cloze-counter">
          {revealedCount}/{totalClozes} 已显示
        </span>
      {/if}
    </div>
    
    <div class="keyboard-hints">
      <span class="hint">空格键: 显示答案</span>
      {#if hasClozes}
        <span class="hint">H: 切换挖空</span>
      {/if}
    </div>
  </div>

  <!-- 卡片内容 -->
  <div class="card-content">
    {#if isClozeCard}
      <!-- 挖空题：只渲染一次完整内容，通过showBack控制挖空显示 -->
      <div class="cloze-content">
        <ObsidianRenderer
          {plugin}
          content={frontMarkdown()}
          enableClozeProcessing={true}
          showClozeAnswers={showBack}
          onRenderComplete={(element) => {
            console.log('[CardPreview] 挖空题内容渲染完成');
          }}
          onRenderError={(error) => {
            console.error('[CardPreview] 挖空题内容渲染失败:', error);
          }}
        />
      </div>
    {:else}
      <!-- 普通题：分别渲染正面和背面 -->
      <!-- 正面内容 - 使用Obsidian渲染器 -->
      <div class="front-content">
        <ObsidianRenderer
          {plugin}
          content={frontMarkdown()}
          enableClozeProcessing={true}
          showClozeAnswers={showBack}
          onRenderComplete={(element) => {
            console.log('[CardPreview] 正面内容渲染完成');
          }}
          onRenderError={(error) => {
            console.error('[CardPreview] 正面内容渲染失败:', error);
          }}
        />
      </div>

      <!-- 现代化分隔线 -->
      {#if hasBack && showBack}
        <div class="tuanki-modern-divider" aria-hidden="true">
          <div class="divider-container">
            <div class="divider-line-left"></div>
            <div class="divider-content">
              <div class="divider-icon">💡</div>
              <span class="divider-text">答案解析</span>
            </div>
            <div class="divider-line-right"></div>
          </div>
        </div>
      {/if}

      <!-- 背面内容 - 使用Obsidian渲染器 -->
      {#if hasBack && showBack}
        <div class="back-content">
          <ObsidianRenderer
            {plugin}
            content={backMarkdown()}
            enableClozeProcessing={true}
            showClozeAnswers={true}
            onRenderComplete={(_element) => {
              console.log('[CardPreview] 背面内容渲染完成');
            }}
            onRenderError={(error) => {
              console.error('[CardPreview] 背面内容渲染失败:', error);
            }}
          />
        </div>
      {/if}
    {/if}
  </div>

  <!-- 操作按钮 -->
  <div class="card-actions">
    {#if isClozeCard}
      <!-- 挖空题模式：统一的显示/隐藏挖空答案按钮 -->
      {#if hasClozes}
        <button
          class="action-button primary"
          onclick={() => internalShowBack = !internalShowBack}
        >
          {showBack ? '隐藏挖空答案' : '显示挖空答案'}
        </button>
      {:else}
        <div class="empty-state-inline">
          <Icon name="alert-circle" size={20} />
          <span>未检测到挖空标记</span>
        </div>
      {/if}
    {:else}
      <!-- 普通题模式：交互式挖空和背面显示 -->
      {#if hasClozes}
        <button
          class="action-button primary"
          onclick={allRevealed ? hideAll : revealAll}
          disabled={!hasClozes}
        >
          {#if allRevealed}
            隐藏答案
          {:else}
            显示答案 ({revealedCount}/{totalClozes()})
          {/if}
        </button>
      {/if}

      {#if hasBack}
        <button
          class="action-button secondary"
          onclick={toggleBack}
        >
          {showBack ? '隐藏' : '显示'}背面
        </button>
      {/if}
    {/if}

    {#if !hasClozes && !hasBack}
      <div class="no-actions">
        <span class="no-actions-text">无交互内容</span>
      </div>
    {/if}
  </div>

  <!-- 元数据 -->
  {#if card.metadata}
    <div class="card-metadata">
      {#if card.metadata.sourceContent}
        <span class="metadata-item">
          来源: {card.metadata.sourceContent.substring(0, 50)}...
        </span>
      {/if}
      {#if card.metadata.parseMethod}
        <span class="metadata-item">
          解析方式: {card.metadata.parseMethod}
        </span>
      {/if}
      {#if card.metadata.confidence}
        <span class="metadata-item">
          置信度: {Math.round(card.metadata.confidence * 100)}%
        </span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .card-preview {
    display: flex;
    flex-direction: column;
    background: var(--tuanki-bg);
    border: 1px solid var(--tuanki-border);
    border-radius: var(--tuanki-radius-lg);
    overflow: hidden;
    transition: all var(--tuanki-duration-fast);
    outline: none;
  }

  .card-preview:focus-visible {
    border-color: var(--tuanki-primary);
    box-shadow: 0 0 0 3px var(--tuanki-primary-light);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--tuanki-spacing-sm) var(--tuanki-spacing-md);
    background: var(--tuanki-surface);
    border-bottom: 1px solid var(--tuanki-border);
  }

  .card-info {
    display: flex;
    align-items: center;
    gap: var(--tuanki-spacing-sm);
  }

  .card-type-badge {
    padding: 2px 8px;
    background: currentColor;
    color: white;
    font-size: var(--tuanki-text-xs);
    font-weight: 500;
    border-radius: var(--tuanki-radius-sm);
    opacity: 0.9;
  }

  .cloze-counter {
    font-size: var(--tuanki-text-xs);
    color: var(--tuanki-text-secondary);
    font-weight: 500;
  }

  .keyboard-hints {
    display: flex;
    gap: var(--tuanki-spacing-sm);
  }

  .hint {
    font-size: var(--tuanki-text-xs);
    color: var(--tuanki-text-muted);
    padding: 2px 6px;
    background: var(--tuanki-surface-active);
    border-radius: var(--tuanki-radius-sm);
  }

  .card-content {
    flex: 1;
    padding: var(--tuanki-spacing-lg);
    line-height: 1.6;
    font-size: var(--tuanki-text-base);
    color: var(--tuanki-text-primary);
  }

  .front-content,
  .back-content,
  .cloze-content {
    margin-bottom: var(--tuanki-spacing-md);
  }

  .back-content {
    margin-bottom: 0;
  }

  .cloze-content {
    margin-bottom: 0;
  }

  /* 现代化分隔符样式 */
  .tuanki-modern-divider {
    margin: var(--tuanki-spacing-xl, 2rem) 0;
    position: relative;
    animation: dividerSlideIn 0.5s ease-out;
  }

  .divider-container {
    display: flex;
    align-items: center;
    gap: var(--tuanki-spacing-md, 1rem);
    position: relative;
  }

  .divider-line-left,
  .divider-line-right {
    flex: 1;
    height: 2px;
    background: linear-gradient(
      90deg,
      transparent 0%,
      var(--interactive-accent, #7c3aed) 20%,
      var(--interactive-accent, #7c3aed) 80%,
      transparent 100%
    );
    border-radius: 1px;
    position: relative;
    overflow: hidden;
  }

  .divider-line-left::after,
  .divider-line-right::after {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.4),
      transparent
    );
    animation: shimmer 2s infinite;
  }

  .divider-content {
    display: flex;
    align-items: center;
    gap: var(--tuanki-spacing-sm, 0.5rem);
    background: var(--background-primary, #ffffff);
    padding: var(--tuanki-spacing-sm, 0.5rem) var(--tuanki-spacing-md, 1rem);
    border-radius: var(--radius-l, 1rem);
    border: 2px solid var(--interactive-accent, #7c3aed);
    box-shadow:
      0 4px 12px rgba(124, 58, 237, 0.15),
      0 0 0 1px rgba(124, 58, 237, 0.1);
    position: relative;
    z-index: 1;
  }

  .divider-icon {
    font-size: 1.2rem;
    animation: iconPulse 2s ease-in-out infinite;
  }

  .divider-text {
    font-size: var(--font-ui-small, 0.875rem);
    color: var(--interactive-accent, #7c3aed);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* 动画定义 */
  @keyframes dividerSlideIn {
    0% {
      opacity: 0;
      transform: translateY(20px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes shimmer {
    0% {
      left: -100%;
    }
    100% {
      left: 100%;
    }
  }

  @keyframes iconPulse {
    0%, 100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.1);
    }
  }

  .card-actions {
    display: flex;
    gap: var(--tuanki-spacing-sm);
    padding: var(--tuanki-spacing-md);
    background: var(--tuanki-surface);
    border-top: 1px solid var(--tuanki-border);
  }

  .action-button {
    padding: var(--tuanki-spacing-sm) var(--tuanki-spacing-md);
    border: 1px solid var(--tuanki-border);
    border-radius: var(--tuanki-radius-md);
    font-size: var(--tuanki-text-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--tuanki-duration-fast);
  }

  .action-button:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: var(--tuanki-shadow-sm);
  }

  .action-button:active:not(:disabled) {
    transform: translateY(0);
  }

  .action-button.primary {
    background: var(--tuanki-primary);
    border-color: var(--tuanki-primary);
    color: var(--tuanki-text-inverse);
  }

  .action-button.primary:hover:not(:disabled) {
    background: var(--tuanki-primary-hover);
    border-color: var(--tuanki-primary-hover);
  }

  .action-button.secondary {
    background: var(--tuanki-surface);
    border-color: var(--tuanki-border);
    color: var(--tuanki-text-primary);
  }

  .action-button.secondary:hover:not(:disabled) {
    background: var(--tuanki-surface-hover);
    border-color: var(--tuanki-border-hover);
  }

  .action-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .no-actions {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .no-actions-text {
    font-size: var(--tuanki-text-sm);
    color: var(--tuanki-text-muted);
    font-style: italic;
  }

  .empty-state-inline {
    display: flex;
    align-items: center;
    gap: var(--tuanki-spacing-xs);
    padding: var(--tuanki-spacing-sm) var(--tuanki-spacing-md);
    color: var(--tuanki-text-muted);
    font-size: var(--tuanki-text-sm);
    background: var(--tuanki-surface-secondary);
    border-radius: var(--tuanki-radius-md);
  }

  .card-metadata {
    display: flex;
    gap: var(--tuanki-spacing-sm);
    padding: var(--tuanki-spacing-xs) var(--tuanki-spacing-md);
    background: var(--tuanki-surface-active);
    border-top: 1px solid var(--tuanki-border);
  }

  .metadata-item {
    font-size: var(--tuanki-text-xs);
    color: var(--tuanki-text-muted);
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .card-header {
      flex-direction: column;
      gap: var(--tuanki-spacing-xs);
      align-items: stretch;
    }

    .keyboard-hints {
      justify-content: center;
    }

    .card-content {
      padding: var(--tuanki-spacing-md);
    }

    .card-actions {
      flex-direction: column;
    }

    .card-metadata {
      flex-direction: column;
      gap: var(--tuanki-spacing-xs);
    }

    /* 移动端分隔符优化 */
    .tuanki-modern-divider {
      margin: var(--tuanki-spacing-lg, 1.5rem) 0;
    }

    .divider-content {
      padding: var(--tuanki-spacing-xs, 0.25rem) var(--tuanki-spacing-sm, 0.5rem);
    }

    .divider-text {
      font-size: var(--font-ui-smaller, 0.75rem);
    }

    .divider-icon {
      font-size: 1rem;
    }
  }

  /* 减少动画偏好 */
  @media (prefers-reduced-motion: reduce) {
    .tuanki-modern-divider {
      animation: none;
    }

    .divider-line-left::after,
    .divider-line-right::after {
      animation: none;
    }

    .divider-icon {
      animation: none;
    }
  }

  /* 打印样式 */
  @media print {
    .card-header,
    .card-actions,
    .card-metadata {
      display: none;
    }

    .card-preview {
      border: none;
      box-shadow: none;
    }

    .card-content {
      padding: 0;
    }
  }
</style>
