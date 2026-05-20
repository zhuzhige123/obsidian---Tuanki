<script lang="ts">
  /**
   * 选择题选项渲染组件
   * 
   * 使用三层分离架构避免Obsidian渲染冲突：
   * - 第1层：交互层 (option-wrapper)
   * - 第2层：布局层 (option-layout)  
   * - 第3层：渲染层 (option-content-wrapper)
   */
  
  import ObsidianRenderer from './ObsidianRenderer.svelte';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';
  import type { WeavePlugin } from '../../main';
  import type { ChoiceOption } from '../../parsing/choice-question-parser';

  interface Props {
    /** 选项数据 */
    option: ChoiceOption;
    /** 是否选中 */
    isSelected: boolean;
    /** 是否正确答案（显示答案后） */
    isCorrect?: boolean;
    /** 是否错误答案（用户选择但不正确） */
    isWrong?: boolean;
    /** 是否禁用 */
    disabled?: boolean;
    /** 是否显示状态图标 */
    showStatusIcon?: boolean;
    /** 徽章文字（如"你选对了"/"你选错了"/"漏选"） */
    badgeText?: string;
    /** 徽章图标名称 */
    badgeIcon?: string;
    /** 插件实例 */
    plugin: WeavePlugin;
    /** 源文件路径 */
    sourcePath?: string;
    /** 点击回调 */
    onclick?: (e: MouseEvent) => void;
    /** 键盘事件回调 */
    onkeydown?: (e: KeyboardEvent) => void;
    /** 自定义class */
    className?: string;
  }

  let {
    option,
    isSelected = false,
    isCorrect = false,
    isWrong = false,
    disabled = false,
    showStatusIcon = false,
    badgeText,
    badgeIcon,
    plugin,
    sourcePath = '',
    onclick,
    onkeydown,
    className = ''
  }: Props = $props();

  // 处理点击事件，排除内部链接
  function handleClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    
    // 如果点击的是链接或按钮，不触发选项选择
    if (target.tagName === 'A' || target.tagName === 'BUTTON') {
      // Svelte 5: 移除 stopPropagation
      return;
    }
    
    // 如果禁用，不处理
    if (disabled) return;
    
    // 调用外部回调
    onclick?.(e);
  }

  // 处理键盘事件
  function handleKeydown(e: KeyboardEvent) {
    if (disabled) return;
    
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onkeydown?.(e);
    }
  }
</script>

<div
  class="choice-option-wrapper {className}"
  class:selected={isSelected}
  class:correct={isCorrect}
  class:wrong={isWrong}
  class:disabled={disabled}
  role="button"
  tabindex={disabled ? -1 : 0}
  aria-label="选项{option.label}"
  aria-pressed={isSelected}
  aria-disabled={disabled}
  data-option-label={option.label}
  onclick={handleClick}
  onkeydown={handleKeydown}
>
  <!-- 第2层：布局层 -->
  <div class="choice-option-layout">
    <!-- 标签容器 -->
    <div class="choice-option-label-container">
      <span class="choice-option-label">{option.label}</span>
    </div>

    <!-- 第3层：渲染层容器 -->
    <div class="choice-option-content-wrapper">
      <ObsidianRenderer
        {plugin}
        content={option.content}
        {sourcePath}
      />
    </div>

    <!-- 状态徽章（优先显示文字徽章） -->
    {#if badgeText}
      <div class="choice-option-badge" class:correct={isCorrect} class:wrong={isWrong}>
        {#if badgeIcon}
          <ObsidianIcon name={badgeIcon} size={16} />
        {/if}
        <span class="badge-text">{badgeText}</span>
      </div>
    {:else if showStatusIcon}
      {#if isCorrect}
        <div class="choice-option-status-icon correct">
          <ObsidianIcon name="check" size={18} />
        </div>
      {:else if isWrong}
        <div class="choice-option-status-icon wrong">
          <ObsidianIcon name="x" size={18} />
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  /* ==================== 第1层：交互层容器 ==================== */
  .choice-option-wrapper {
    display: block;
    position: relative;
    text-align: left;
    font: inherit;
    color: inherit;
    background: none;
    outline: none;
  }

  /* 焦点状态 - 无障碍支持 */
  .choice-option-wrapper:focus-visible .choice-option-layout {
    outline: 2px solid var(--interactive-accent);
    outline-offset: 2px;
    border-color: var(--interactive-accent);
  }

  /* ==================== 第2层：布局层 ==================== */
  .choice-option-layout {
    display: flex;
    align-items: flex-start; /* 支持多行内容 */
    gap: 1rem;
    padding: 1.25rem 1.5rem;
    background: var(--background-primary);
    border: none;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    min-height: 60px;
  }

  /* ✅ 移除 !important：深色模式边框使用更具体的选择器 */
  :global(body.theme-dark) .choice-option-wrapper .choice-option-layout {
    box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.35);
  }

  /* ✅ 移除 !important：浅色模式边框使用更具体的选择器 */
  :global(body.theme-light) .choice-option-wrapper .choice-option-layout {
    box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.35);
  }

  .choice-option-wrapper:hover:not(.disabled) .choice-option-layout {
    background: var(--background-modifier-hover);
    transform: translateX(4px);
  }

  /* ✅ 移除 !important：悬停状态使用更具体的选择器 */
  :global(body.theme-dark) .choice-option-wrapper:hover:not(.disabled) .choice-option-layout {
    box-shadow: inset 0 0 0 2px var(--interactive-accent), 0 4px 12px rgba(0, 0, 0, 0.2);
  }

  :global(body.theme-light) .choice-option-wrapper:hover:not(.disabled) .choice-option-layout {
    box-shadow: inset 0 0 0 2px var(--interactive-accent), 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  /* ==================== 标签容器 ==================== */
  .choice-option-label-container {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--background-secondary);
    border: none;
    border-radius: 6px;
    transition: all 0.2s ease;
  }

  :global(body.theme-dark) .choice-option-label-container {
    box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.35);
  }

  :global(body.theme-light) .choice-option-label-container {
    box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.35);
  }

  .choice-option-label {
    font-weight: 700;
    font-size: 0.95rem;
    color: var(--text-normal);
  }

  /* ==================== 第3层：渲染层容器 ==================== */
  .choice-option-content-wrapper {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    position: relative;
    isolation: isolate; /* CSS隔离 */
  }

  /* 覆盖ObsidianRenderer默认样式 */
  .choice-option-content-wrapper :global(.weave-obsidian-renderer) {
    padding: 0;
    margin: 0;
    background: transparent;
    border: none;
    font-size: 1rem;
    line-height: 1.6;
    color: var(--text-normal);
  }

  /* 重置Markdown元素 */
  .choice-option-content-wrapper :global(p) {
    margin: 0;
    padding: 0;
    line-height: 1.6;
    white-space: pre-wrap; /* 保留换行符 */
  }

  .choice-option-content-wrapper :global(p + p) {
    margin-top: 0.5rem;
  }

  .choice-option-content-wrapper :global(strong) {
    font-weight: 600;
  }

  .choice-option-content-wrapper :global(mark) {
    background: rgba(245, 158, 11, 0.15);
    padding: 2px 4px;
    border-radius: 3px;
  }

  .choice-option-content-wrapper :global(code) {
    background: var(--background-secondary);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: var(--font-monospace);
    font-size: 0.9em;
  }

  .choice-option-content-wrapper :global(img) {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 0.5rem 0;
    border-radius: 6px;
  }

  /* ==================== 选项状态样式 ==================== */
  /* 选中状态 */
  .choice-option-wrapper.selected .choice-option-layout {
    background: rgba(124, 58, 237, 0.05);
  }

  /* ✅ 移除 !important：选中状态使用更具体的选择器 */
  :global(body.theme-dark) .choice-option-wrapper.selected .choice-option-layout,
  :global(body.theme-light) .choice-option-wrapper.selected .choice-option-layout {
    box-shadow: inset 0 0 0 3px var(--interactive-accent), 0 0 0 2px color-mix(in srgb, var(--interactive-accent) 20%, transparent);
  }

  .choice-option-wrapper.selected .choice-option-label-container {
    background: var(--interactive-accent);
    transform: scale(1.05);
  }

  :global(body.theme-dark) .choice-option-wrapper.selected .choice-option-label-container,
  :global(body.theme-light) .choice-option-wrapper.selected .choice-option-label-container {
    box-shadow: none;
  }

  .choice-option-wrapper.selected .choice-option-label {
    color: white;
  }

  /* 正确状态 */
  .choice-option-wrapper.correct .choice-option-layout {
    background: color-mix(in srgb, var(--background-secondary) 92%, var(--color-green));
  }

  /* ✅ 移除 !important：正确状态使用更具体的选择器 */
  :global(body.theme-dark) .choice-option-wrapper.correct .choice-option-layout,
  :global(body.theme-light) .choice-option-wrapper.correct .choice-option-layout {
    box-shadow: inset 0 0 0 3px var(--color-green);
  }

  .choice-option-wrapper.correct .choice-option-label-container {
    background: var(--color-green);
  }

  :global(body.theme-dark) .choice-option-wrapper.correct .choice-option-label-container,
  :global(body.theme-light) .choice-option-wrapper.correct .choice-option-label-container {
    box-shadow: none;
  }

  .choice-option-wrapper.correct .choice-option-label {
    color: white;
  }

  /* 错误状态 */
  .choice-option-wrapper.wrong .choice-option-layout {
    background: color-mix(in srgb, var(--background-secondary) 92%, var(--color-red));
  }

  /* ✅ 移除 !important：错误状态使用更具体的选择器 */
  :global(body.theme-dark) .choice-option-wrapper.wrong .choice-option-layout,
  :global(body.theme-light) .choice-option-wrapper.wrong .choice-option-layout {
    box-shadow: inset 0 0 0 3px var(--color-red);
  }

  .choice-option-wrapper.wrong .choice-option-label-container {
    background: var(--color-red);
  }

  :global(body.theme-dark) .choice-option-wrapper.wrong .choice-option-label-container,
  :global(body.theme-light) .choice-option-wrapper.wrong .choice-option-label-container {
    box-shadow: none;
  }

  .choice-option-wrapper.wrong .choice-option-label {
    color: white;
  }

  /* 禁用状态 */
  .choice-option-wrapper.disabled {
    cursor: not-allowed;
  }

  .choice-option-wrapper.disabled .choice-option-layout {
    opacity: 0.9;
    cursor: not-allowed;
  }

  .choice-option-wrapper.disabled .choice-option-content-wrapper {
    pointer-events: none;
  }

  /* ==================== 状态徽章（文字） ==================== */
  .choice-option-badge {
    position: absolute;
    top: 50%;
    right: 1.5rem;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 500;
    animation: popIn 0.3s ease-out;
    pointer-events: none;
    white-space: nowrap;
  }

  .choice-option-badge.correct {
    background: color-mix(in srgb, var(--background-secondary) 78%, var(--color-green));
    color: var(--color-green);
    border: 1px solid color-mix(in srgb, var(--color-green) 35%, transparent);
  }

  .choice-option-badge.wrong {
    background: color-mix(in srgb, var(--background-secondary) 78%, var(--color-red));
    color: var(--color-red);
    border: 1px solid color-mix(in srgb, var(--color-red) 35%, transparent);
  }

  .badge-text {
    line-height: 1;
  }

  /* ==================== 状态图标（仅图标） ==================== */
  .choice-option-status-icon {
    position: absolute;
    top: 50%;
    right: 1.5rem;
    transform: translateY(-50%);
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: popIn 0.3s ease-out;
    pointer-events: none;
  }

  .choice-option-status-icon.correct {
    background: var(--color-green);
    color: white;
  }

  .choice-option-status-icon.wrong {
    background: var(--color-red);
    color: white;
  }

  /* ==================== 学习界面干净样式变体 ==================== */
  .choice-option-wrapper.memory-study-option .choice-option-layout {
    align-items: center;
    gap: 1rem;
    min-height: 78px;
    padding: 1.15rem 1.2rem;
    border-radius: 18px;
    background: var(--background-secondary);
    box-shadow: inset 0 0 0 1px var(--background-modifier-border);
  }

  :global(body.theme-dark) .choice-option-wrapper.memory-study-option .choice-option-layout,
  :global(body.theme-light) .choice-option-wrapper.memory-study-option .choice-option-layout {
    box-shadow: inset 0 0 0 1px var(--background-modifier-border);
  }

  .choice-option-wrapper.memory-study-option:hover:not(.disabled) .choice-option-layout {
    transform: none;
    background: var(--background-modifier-hover);
    box-shadow: inset 0 0 0 1px var(--interactive-accent-hover);
  }

  :global(body.theme-dark) .choice-option-wrapper.memory-study-option:hover:not(.disabled) .choice-option-layout,
  :global(body.theme-light) .choice-option-wrapper.memory-study-option:hover:not(.disabled) .choice-option-layout {
    box-shadow: inset 0 0 0 1px var(--interactive-accent-hover);
  }

  .choice-option-wrapper.memory-study-option .choice-option-label-container {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: var(--background-primary);
    box-shadow: none;
  }

  :global(body.theme-dark) .choice-option-wrapper.memory-study-option .choice-option-label-container,
  :global(body.theme-light) .choice-option-wrapper.memory-study-option .choice-option-label-container {
    box-shadow: none;
  }

  .choice-option-wrapper.memory-study-option .choice-option-content-wrapper :global(.weave-obsidian-renderer) {
    font-size: 1.02rem;
    line-height: 1.65;
  }

  .choice-option-wrapper.memory-study-option .choice-option-content-wrapper :global(p) {
    margin: 0;
  }

  .choice-option-wrapper.memory-study-option .choice-option-content-wrapper :global(p + p) {
    margin-top: 0.45rem;
  }

  .choice-option-wrapper.memory-study-option.selected .choice-option-layout {
    background: var(--background-secondary);
    box-shadow: inset 0 0 0 2px var(--interactive-accent);
  }

  .choice-option-wrapper.memory-study-option.selected .choice-option-label-container {
    background: var(--interactive-accent);
  }

  .choice-option-wrapper.memory-study-option.selected .choice-option-label {
    color: var(--text-on-accent, #fff);
  }

  :global(body.theme-dark) .choice-option-wrapper.memory-study-option.selected .choice-option-layout,
  :global(body.theme-light) .choice-option-wrapper.memory-study-option.selected .choice-option-layout {
    box-shadow: inset 0 0 0 2px var(--interactive-accent);
  }

  .choice-option-wrapper.memory-study-option.correct .choice-option-layout {
    background: color-mix(in srgb, var(--background-secondary) 92%, var(--color-green));
    box-shadow: inset 0 0 0 2px var(--color-green);
  }

  .choice-option-wrapper.memory-study-option.wrong .choice-option-layout {
    background: color-mix(in srgb, var(--background-secondary) 92%, var(--color-red));
    box-shadow: inset 0 0 0 2px var(--color-red);
  }

  .choice-option-wrapper.memory-study-option.correct .choice-option-label-container {
    background: var(--color-green);
  }

  .choice-option-wrapper.memory-study-option.wrong .choice-option-label-container {
    background: var(--color-red);
  }

  @keyframes popIn {
    0% {
      opacity: 0;
      transform: translateY(-50%) scale(0);
    }
    50% {
      transform: translateY(-50%) scale(1.1);
    }
    100% {
      opacity: 1;
      transform: translateY(-50%) scale(1);
    }
  }
</style>
