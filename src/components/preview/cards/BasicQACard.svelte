<script lang="ts">
  import type { PreviewSection } from '../ContentPreviewEngine';
  import type { AnimationController } from '../AnimationController';
  import type AnkiPlugin from '../../../main';
  import ObsidianRenderer from '../../atoms/ObsidianRenderer.svelte';

  interface Props {
    sections: PreviewSection[];
    showAnswer: boolean;
    plugin: AnkiPlugin;
    sourcePath?: string;
    animationController?: AnimationController;
    enableAnimations?: boolean;
  }

  let { 
    sections, 
    showAnswer = $bindable(), 
    plugin,
    sourcePath = '',
    animationController,
    enableAnimations = true 
  }: Props = $props();

  // 🔧 修复：分离问题和答案节 - 使用正确的类型匹配
  let questionSections = $derived(sections.filter(s => s.type === 'front'));
  let answerSections = $derived(sections.filter(s => s.type === 'back'));

  // 动画处理
  function handleAnswerReveal(element: HTMLElement): void {
    if (animationController && enableAnimations) {
      animationController.animateContentReveal(element, {
        duration: 400,
        easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        delay: 100
      });
    }
  }

  function handleSectionHover(element: HTMLElement, isEntering: boolean): void {
    if (animationController && enableAnimations) {
      animationController.animateHover(element, isEntering);
    }
  }
</script>

<!-- 应用tuanki-card-base基础样式 -->
<div class="tuanki-card-base tuanki-basic-qa-card tuanki-card-mount">
  <!-- 问题部分 -->
  {#if questionSections.length > 0}
    <div class="tuanki-qa-question">
      <div class="tuanki-qa-question-title">
        <span class="tuanki-qa-label">问题</span>
      </div>
      
      {#each questionSections as section, index}
        <div
          class="tuanki-qa-question-content"
          class:tuanki-qa-multiple={questionSections.length > 1}
          role="region"
          aria-label="问题内容区域"
        >
          {#if questionSections.length > 1}
            <div class="tuanki-qa-field-label">{section.metadata?.title || `字段 ${index + 1}`}</div>
          {/if}
          
          <div class="tuanki-qa-content">
            <ObsidianRenderer
              {plugin}
              content={section.content}
              {sourcePath}
            />
          </div>
          
          {#if section.metadata?.keywords && section.metadata.keywords.length > 0}
            <div class="tuanki-qa-keywords">
              {#each section.metadata.keywords as keyword}
                <span class="tuanki-qa-keyword">{keyword}</span>
              {/each}
            </div>
          {/if}
          
          {#if section.metadata?.truncated}
            <div class="tuanki-qa-overflow-indicator">
              内容已截断，完整内容请查看原文...
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- 答案部分 -->
  {#if answerSections.length > 0}
    <div 
      class="tuanki-qa-answer"
      class:tuanki-qa-answer--hidden={!showAnswer}
    >
      {#if showAnswer}
        <div class="tuanki-qa-answer-title">
          <span class="tuanki-qa-label tuanki-qa-label--answer">答案</span>
        </div>
        
        {#each answerSections as section, index}
          <div
            class="tuanki-qa-answer-content"
            class:tuanki-qa-multiple={answerSections.length > 1}
            role="region"
            aria-label="答案内容区域"
            use:handleAnswerReveal
          >
            {#if answerSections.length > 1}
              <div class="tuanki-qa-field-label">{section.metadata?.title || `字段 ${index + 1}`}</div>
            {/if}
            
            <div class="tuanki-qa-content">
              <ObsidianRenderer
                {plugin}
                content={section.content}
                {sourcePath}
              />
            </div>
            
            {#if section.metadata?.keywords && section.metadata.keywords.length > 0}
              <div class="tuanki-qa-keywords">
                {#each section.metadata.keywords as keyword}
                  <span class="tuanki-qa-keyword">{keyword}</span>
                {/each}
              </div>
            {/if}
            
            {#if section.metadata?.truncated}
              <div class="tuanki-qa-overflow-indicator">
                内容已截断，完整内容请查看原文...
              </div>
            {/if}
          </div>
        {/each}
      {:else}
        <div class="tuanki-qa-answer-placeholder">
          <div class="tuanki-qa-placeholder-icon">👁️</div>
          <div class="tuanki-qa-placeholder-text">点击显示答案查看答案内容</div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- 空状态 -->
  {#if questionSections.length === 0 && answerSections.length === 0}
    <div class="tuanki-qa-empty">
      <div class="tuanki-qa-empty-icon">📝</div>
      <div class="tuanki-qa-empty-title">没有可显示的内容</div>
      <div class="tuanki-qa-empty-description">卡片内容为空或解析失败</div>
    </div>
  {/if}
</div>

<style>
  /* 继承tuanki-card-base的样式，只定义特殊行为 */
  /* padding和gap由tuanki-card-base提供 */

  /* 问题样式 - 简洁扁平设计 */
  .tuanki-qa-question {
    /* ✅ 移除边框和背景，避免多层嵌套 */
    background: transparent;
    border: none;
    border-radius: 0;
    padding: 0 0 1.5rem 0; /* 只保留底部间距 */
    margin-bottom: 1.5rem;
    border-bottom: 2px solid var(--background-modifier-border); /* 简单分隔线 */
    transition: border-color var(--tuanki-duration-normal, 300ms) ease;
  }

  .tuanki-qa-question:hover {
    border-bottom-color: var(--text-accent); /* 悬停时分隔线变色 */
  }

  /* 答案样式 - 简洁扁平设计 */
  .tuanki-qa-answer {
    /* ✅ 移除边框和背景，避免多层嵌套 */
    background: transparent;
    border: none;
    border-radius: 0;
    padding: 1.5rem 0 0 0; /* 只保留顶部间距 */
    transition: opacity var(--tuanki-duration-normal, 300ms) ease;
  }

  .tuanki-qa-answer--hidden {
    opacity: 0.6;
    pointer-events: none;
  }

  /* 标题样式 */
  .tuanki-qa-question-title,
  .tuanki-qa-answer-title {
    display: flex;
    align-items: center;
    justify-content: flex-start; /* 移除字段统计后改为左对齐 */
    margin-bottom: var(--tuanki-space-md, 1rem);
    padding-bottom: var(--tuanki-space-sm, 0.5rem);
    /* ✅ 移除底部边框，避免过多分隔线 */
  }

  .tuanki-qa-label {
    padding: var(--tuanki-space-xs, 0.25rem) var(--tuanki-space-sm, 0.5rem);
    background: color-mix(in srgb, var(--interactive-accent) 10%, transparent);
    color: var(--interactive-accent);
    border-radius: var(--tuanki-radius-sm, 0.375rem);
    font-size: var(--tuanki-font-size-xs, 0.75rem);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .tuanki-qa-label--answer {
    background: var(--tuanki-success-light, rgba(16, 185, 129, 0.1));
    color: var(--tuanki-success, #10b981);
  }

  /* 内容样式 */
  .tuanki-qa-question-content,
  .tuanki-qa-answer-content {
    margin-bottom: var(--tuanki-space-md, 1rem);
    transition: all var(--tuanki-duration-fast, 150ms) ease;
    
    /* 支持文本选择 */
    user-select: text;
    -webkit-user-select: text;
    cursor: auto;
  }

  .tuanki-qa-question-content:last-child,
  .tuanki-qa-answer-content:last-child {
    margin-bottom: 0;
  }

  .tuanki-qa-multiple {
    background: var(--tuanki-surface, var(--background-primary));
    border: 1px solid var(--tuanki-border, var(--background-modifier-border));
    border-radius: var(--tuanki-radius-md, 0.5rem);
    padding: var(--tuanki-space-md, 1rem);
  }

  .tuanki-qa-field-label {
    font-size: var(--tuanki-font-size-sm, 0.875rem);
    font-weight: 600;
    color: var(--tuanki-text-secondary, var(--text-muted));
    margin-bottom: var(--tuanki-space-sm, 0.5rem);
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .tuanki-qa-content {
    color: var(--tuanki-text-primary, var(--text-normal));
    line-height: 1.6;
    font-size: var(--tuanki-font-size-md, 1rem);
    
    /* 支持文本选择 */
    user-select: text;
    -webkit-user-select: text;
    -moz-user-select: text;
    -ms-user-select: text;
    cursor: text;
  }

  /* 关键词样式 */
  .tuanki-qa-keywords {
    display: flex;
    flex-wrap: wrap;
    gap: var(--tuanki-space-xs, 0.25rem);
    margin-top: var(--tuanki-space-sm, 0.5rem);
  }

  .tuanki-qa-keyword {
    background: var(--tuanki-warning-light, rgba(245, 158, 11, 0.2));
    color: var(--tuanki-warning, #f59e0b);
    padding: 0.125rem 0.375rem;
    border-radius: var(--tuanki-radius-sm, 0.375rem);
    font-size: var(--tuanki-font-size-xs, 0.75rem);
    font-weight: 600;
  }

  /* 溢出指示器 */
  .tuanki-qa-overflow-indicator {
    color: var(--tuanki-text-muted, var(--text-muted));
    font-style: italic;
    text-align: center;
    margin-top: var(--tuanki-space-sm, 0.5rem);
    font-size: var(--tuanki-font-size-sm, 0.875rem);
  }

  /* 答案占位符 */
  .tuanki-qa-answer-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--tuanki-space-xl, 2rem);
    text-align: center;
    opacity: 0.7;
  }

  .tuanki-qa-placeholder-icon {
    font-size: 2rem;
    margin-bottom: var(--tuanki-space-sm, 0.5rem);
  }

  .tuanki-qa-placeholder-text {
    color: var(--tuanki-text-secondary, var(--text-muted));
    font-size: var(--tuanki-font-size-sm, 0.875rem);
  }

  /* 空状态 */
  .tuanki-qa-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--tuanki-space-xl, 2rem);
    text-align: center;
    opacity: 0.6;
  }

  .tuanki-qa-empty-icon {
    font-size: 2.5rem;
    margin-bottom: var(--tuanki-space-md, 1rem);
  }

  .tuanki-qa-empty-title {
    font-size: var(--tuanki-font-size-lg, 1.125rem);
    font-weight: 600;
    color: var(--tuanki-text-primary, var(--text-normal));
    margin-bottom: var(--tuanki-space-sm, 0.5rem);
  }

  .tuanki-qa-empty-description {
    color: var(--tuanki-text-secondary, var(--text-muted));
    font-size: var(--tuanki-font-size-sm, 0.875rem);
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .tuanki-basic-qa-card {
      padding: var(--tuanki-space-md, 1rem);
      gap: var(--tuanki-space-md, 1rem);
    }

    .tuanki-qa-question,
    .tuanki-qa-answer {
      /* ✅ 移动端保持简洁，由容器padding控制间距 */
      padding: 0 0 1rem 0;
    }

    .tuanki-qa-content {
      font-size: var(--tuanki-font-size-sm, 0.875rem);
    }

    .tuanki-qa-question-title,
    .tuanki-qa-answer-title {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--tuanki-space-xs, 0.25rem);
    }
  }

  /* 可访问性增强 */
  .tuanki-qa-question-content:focus,
  .tuanki-qa-answer-content:focus {
    outline: 2px solid var(--interactive-accent);
    outline-offset: 2px;
  }

  /* 减少动画（用户偏好） */
  @media (prefers-reduced-motion: reduce) {
    .tuanki-qa-question,
    .tuanki-qa-answer,
    .tuanki-qa-question-content,
    .tuanki-qa-answer-content {
      transition: none;
    }
  }
</style>
