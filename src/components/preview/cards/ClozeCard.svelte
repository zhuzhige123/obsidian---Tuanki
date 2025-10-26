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

  // ✅ 简化逻辑：移除复杂的状态管理，交由ObsidianRenderer处理
</script>

<!-- 应用tuanki-card-base基础样式 -->
<div class="tuanki-card-base tuanki-cloze-card tuanki-card-mount">
  <!-- ✅ 简化头部：只显示题型标签 -->
  <div class="tuanki-cloze-header">
    <span class="tuanki-cloze-label">挖空题</span>
  </div>

  <!-- 挖空内容 -->
  <div class="tuanki-cloze-content">
    {#each sections as section}
      <!-- 只渲染front类型的section作为挖空区域 -->
      {#if section.type === 'front'}
        <div class="tuanki-cloze-section">
          {#if section.metadata?.title}
            <div class="tuanki-cloze-section-title">{section.metadata.title}</div>
          {/if}
          
          <!-- ✅ 挖空内容由ObsidianRenderer直接渲染，无需额外处理 -->
          <div class="tuanki-cloze-text">
            <ObsidianRenderer
              {plugin}
              content={section.content}
              {sourcePath}
              enableClozeProcessing={true}
              showClozeAnswers={showAnswer}
            />
          </div>
        </div>
      {/if}
    {/each}
  </div>
  
  <!-- ✅ 背面内容区域（---div---分隔符后的内容） -->
  {#if showAnswer}
    {#each sections as section}
      {#if section.type === 'back'}
        <div class="tuanki-cloze-back-section">
          <ObsidianRenderer
            {plugin}
            content={section.content}
            {sourcePath}
            enableClozeProcessing={false}
            showClozeAnswers={true}
          />
        </div>
      {/if}
    {/each}
  {/if}
</div>

<style>
  /* 继承tuanki-card-base的样式，只定义特殊行为 */
  /* padding和gap由tuanki-card-base提供 */

  /* ✅ 简化头部样式 */
  .tuanki-cloze-header {
    display: flex;
    align-items: center;
    padding: var(--tuanki-space-md, 1rem);
    background: var(--tuanki-surface, var(--background-primary));
    border: 1px solid var(--tuanki-border, var(--background-modifier-border));
    border-radius: var(--tuanki-radius-md, 0.5rem);
  }

  .tuanki-cloze-label {
    padding: var(--tuanki-space-xs, 0.25rem) var(--tuanki-space-sm, 0.5rem);
    background: color-mix(in srgb, var(--interactive-accent) 10%, transparent);
    color: var(--interactive-accent);
    border-radius: var(--tuanki-radius-sm, 0.375rem);
    font-size: var(--tuanki-font-size-xs, 0.75rem);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  /* 内容样式 */
  .tuanki-cloze-content {
    display: flex;
    flex-direction: column;
    gap: var(--tuanki-space-md, 1rem);
    
    /* 支持文本选择 */
    user-select: text;
    -webkit-user-select: text;
    cursor: auto;
  }

  .tuanki-cloze-section {
    background: var(--tuanki-surface, var(--background-primary));
    border-radius: var(--tuanki-radius-md, 0.5rem);
    padding: var(--tuanki-space-lg, 1.5rem);
    transition: all var(--tuanki-duration-normal, 300ms) ease;
  }

  .tuanki-cloze-section:hover {
    background: var(--tuanki-surface-hover, var(--background-modifier-hover));
    transform: translateY(-1px);
    box-shadow: var(--tuanki-shadow-md, 0 4px 6px -1px rgb(0 0 0 / 0.1));
  }

  .tuanki-cloze-section-title {
    font-size: var(--tuanki-font-size-sm, 0.875rem);
    font-weight: 600;
    color: var(--tuanki-text-secondary, var(--text-muted));
    margin-bottom: var(--tuanki-space-md, 1rem);
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .tuanki-cloze-text {
    color: var(--tuanki-text-primary, var(--text-normal));
    line-height: 1.6;
    font-size: var(--tuanki-font-size-md, 1rem);
  }

  /* 背面内容区域样式 - 保持Obsidian原生渲染风格 */
  .tuanki-cloze-back-section {
    margin-top: var(--tuanki-space-md, 1rem);
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .tuanki-cloze-section {
      padding: var(--tuanki-space-md, 1rem);
    }
  }

  /* 减少动画（用户偏好） */
  @media (prefers-reduced-motion: reduce) {
    .tuanki-cloze-section {
      transition: none;
    }

    .tuanki-cloze-section:hover {
      transform: none;
    }
  }
</style>
