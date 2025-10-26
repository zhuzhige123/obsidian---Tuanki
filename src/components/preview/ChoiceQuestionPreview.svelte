<script lang="ts">
  import type { ChoiceQuestion, ChoiceOption } from '../../parsing/choice-question-parser';
  import type { Card } from '../../data/types';
  import { MarkdownRenderer } from 'obsidian';
  import { onMount } from 'svelte';
  import type AnkiPlugin from '../../main';

  interface Props {
    /** 选择题数据 */
    question: ChoiceQuestion;
    /** 是否显示答案 */
    showAnswer: boolean;
    /** 选项选择回调 */
    onOptionSelect?: (label: string) => void;
    /** 显示答案回调 */
    onShowAnswer?: () => void;
    /** 已选择的选项标签列表 */
    selectedOptions?: string[];
    /** 插件实例（用于Markdown渲染） */
    plugin: AnkiPlugin;
    /** 是否启用动画 */
    enableAnimations?: boolean;
    /** 卡片数据（用于统计显示） */
    card?: Card;
    /** 加入错题集回调 */
    onAddToErrorBook?: () => void;
    /** 移出错题集回调 */
    onRemoveFromErrorBook?: () => void;
    /** 当前反应时间（毫秒） */
    currentResponseTime?: number;
  }

  let {
    question,
    showAnswer,
    onOptionSelect,
    onShowAnswer,
    selectedOptions = $bindable([]),
    plugin,
    enableAnimations = true,
    card,
    onAddToErrorBook,
    onRemoveFromErrorBook,
    currentResponseTime
  }: Props = $props();

  // 渲染容器引用
  let questionContainer: HTMLDivElement | null = $state(null);
  let optionContainers = new Map<string, HTMLDivElement>();
  let explanationContainer: HTMLDivElement | null = $state(null);
  
  // 设置选项容器引用
  function setOptionContainer(label: string, el: HTMLDivElement | null) {
    if (el) {
      optionContainers.set(label, el);
    }
  }
  
  // Svelte action用于注册选项容器
  function registerOptionContainer(node: HTMLElement, label: string) {
    optionContainers.set(label, node as HTMLDivElement);
    return {
      destroy() {
        optionContainers.delete(label);
      }
    };
  }

  // 渲染Markdown内容
  async function renderMarkdown(container: HTMLElement, content: string) {
    if (!container || !content) return;

    try {
      container.innerHTML = '';
      const sourcePath = plugin.app.workspace.getActiveFile()?.path || '';
      
      await MarkdownRenderer.render(
        plugin.app,
        content,
        container,
        sourcePath,
        plugin as any
      );
    } catch (error) {
      console.error('[ChoiceQuestionPreview] Markdown渲染失败:', error);
      container.textContent = content;
    }
  }

  // 渲染问题文本
  $effect(() => {
    if (questionContainer && question.question) {
      renderMarkdown(questionContainer, question.question);
    }
  });

  // 渲染选项内容
  $effect(() => {
    question.options.forEach((option) => {
      const container = optionContainers.get(option.label);
      if (container && option.content) {
        renderMarkdown(container, option.content);
      }
    });
  });

  // 渲染解析内容
  $effect(() => {
    if (showAnswer && explanationContainer && question.explanation) {
      renderMarkdown(explanationContainer, question.explanation);
    }
  });

  // ===== 新增：答案摘要相关状态和函数 =====
  
  /**
   * 判断用户是否已作答
   */
  let hasAnswered = $derived(selectedOptions.length > 0);
  
  /**
   * 判断用户答题是否正确
   */
  let isCorrect = $derived.by(() => {
    if (selectedOptions.length === 0) return false;
    
    if (question.isMultipleChoice) {
      // 多选题：必须选中所有正确答案，且不能选中错误答案
      const correctLabels = question.options
        .filter(opt => opt.isCorrect)
        .map(opt => opt.label);
      
      const selectedSet = new Set(selectedOptions);
      const correctSet = new Set(correctLabels);
      
      // 检查数量是否相同
      if (selectedSet.size !== correctSet.size) return false;
      
      // 检查每个选中的选项是否都是正确答案
      for (const label of selectedOptions) {
        if (!correctSet.has(label)) return false;
      }
      
      return true;
    } else {
      // 单选题：选中的选项必须是正确答案
      const selectedOption = question.options.find(opt => opt.label === selectedOptions[0]);
      return selectedOption?.isCorrect || false;
    }
  });

  /**
   * 获取所有正确答案的标签
   */
  let correctAnswerLabels = $derived(
    question.options
      .filter(opt => opt.isCorrect)
      .map(opt => opt.label)
  );



  /**
   * 获取选项的CSS类名
   */
  function getOptionClass(option: ChoiceOption): string {
    const classes = ['choice-option'];

    if (showAnswer) {
      // 显示答案后的状态
      if (option.isCorrect) {
        classes.push('correct');
      } else if (selectedOptions.includes(option.label)) {
        classes.push('incorrect');
      }
    } else {
      // 未显示答案时的状态
      if (selectedOptions.includes(option.label)) {
        classes.push('selected');
      }
    }

    return classes.join(' ');
  }

  /**
   * 处理选项点击
   */
  function handleOptionClick(option: ChoiceOption) {
    if (showAnswer) return; // 显示答案后禁用交互

    const label = option.label;

    if (question.isMultipleChoice) {
      // 多选题：切换选中状态
      if (selectedOptions.includes(label)) {
        selectedOptions = selectedOptions.filter(l => l !== label);
      } else {
        selectedOptions = [...selectedOptions, label];
      }
      // 多选题不自动显示答案，需要用户点击"确认答案"按钮
    } else {
      // 单选题：只能选择一个
      selectedOptions = [label];
      // 单选题点击后立即显示答案（移除延迟以优化交互体验）
      onShowAnswer?.();
    }

    // 触发回调
    onOptionSelect?.(label);
  }

  /**
   * 键盘快捷键支持（A/B/C/D）
   * ✅ 只处理选项快捷键，其他按键让它冒泡到StudyModal
   */
  function handleKeyPress(event: KeyboardEvent) {
    // 显示答案后停止处理键盘事件
    if (showAnswer) return;

    // 如果焦点在输入框等可编辑元素中，不处理
    const target = event.target as HTMLElement;
    if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) {
      return;
    }

    const key = event.key.toUpperCase();
    const option = question.options.find(opt => opt.label === key);

    // ✅ 只处理ABCD等选项快捷键，其他键（空格、数字键等）不拦截
    if (option) {
      event.preventDefault();
      event.stopPropagation(); // 阻止事件冒泡，避免触发其他处理器
      handleOptionClick(option);
    }
    // ✅ 其他按键（如空格、1234等）不处理，让它们冒泡到StudyModal
  }

  onMount(() => {
    // 绑定键盘事件到window，使用捕获阶段以优先处理
    window.addEventListener('keydown', handleKeyPress, { capture: false });

    return () => {
      window.removeEventListener('keydown', handleKeyPress, { capture: false });
    };
  });
</script>

<div class="choice-question-container" class:animations-enabled={enableAnimations}>
  <!-- 题型标题 - 与问答题和挖空题保持一致的位置和样式 -->
  <div class="choice-question-title">
    <span class="choice-question-label">
      {question.isMultipleChoice ? '多选题' : '单选题'}
    </span>
    <span class="choice-question-count">
      {question.options.length} 个选项
      {#if selectedOptions.length > 0 && !showAnswer}
        · 已选 {selectedOptions.length}
      {/if}
    </span>
  </div>

  <!-- 问题文本 -->
  <div class="question-header">
    <div class="question-text" bind:this={questionContainer}></div>
  </div>

  <!-- 选项列表 -->
  <div class="options-container">
    {#each question.options as option (option.label)}
      <button
        class={getOptionClass(option)}
        onclick={() => handleOptionClick(option)}
        disabled={showAnswer}
        data-option={option.label}
        type="button"
      >
        <div class="option-label">{option.label}</div>
        <div 
          class="option-content"
          data-option-label={option.label}
          use:registerOptionContainer={option.label}
        ></div>
        {#if showAnswer}
          {#if option.isCorrect}
            <span class="option-status-icon correct">✓ 正确</span>
          {:else if selectedOptions.includes(option.label)}
            <span class="option-status-icon incorrect">✗ 错误</span>
          {/if}
        {/if}
      </button>
    {/each}
  </div>

  <!-- 答案对比区域 - 极简主义设计 -->
  {#if showAnswer && hasAnswered}
    <div class="answer-comparison">
      <div class="comparison-row">
        <div class="comparison-item your-answer">
          <span class="comparison-label">你的答案</span>
          <span class="comparison-value" class:incorrect={!isCorrect}>
            {selectedOptions.sort().join('、')}
          </span>
        </div>
        <div class="comparison-divider"></div>
        <div class="comparison-item correct-answer">
          <span class="comparison-label">正确答案</span>
          <span class="comparison-value correct">
            {correctAnswerLabels.sort().join('、')}
          </span>
        </div>
      </div>
    </div>
  {/if}

  <!-- 解析区域 - 直接显示 -->
  {#if showAnswer && question.explanation}
    <div class="explanation-section">
      <div class="explanation-header">
        <span class="explanation-icon">💡</span>
        <span class="explanation-title">详细解析</span>
      </div>
      <div class="explanation-content" bind:this={explanationContainer}></div>
    </div>
  {/if}

</div>

<style>
  /* ===== 容器样式 ===== */
  .choice-question-container {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    width: 100%;
    max-width: 800px;
    margin: 0 auto;
    padding: 1rem;
  }

  /* ===== 题型标题 - 与问答题和挖空题样式保持一致 ===== */
  .choice-question-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--background-modifier-border);
    margin-bottom: 0.5rem;
  }

  .choice-question-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-accent);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .choice-question-count {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-weight: 500;
  }

  /* ===== 问题区域 ===== */
  .question-header {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .question-text {
    flex: 1;
    font-size: 1.125rem;
    font-weight: 600;
    
    /* 支持文本选择 */
    user-select: text;
    -webkit-user-select: text;
    cursor: text;
    color: var(--text-normal);
    line-height: 1.6;
  }

  /* ===== 选项容器 - 扁平化 ===== */
  .options-container {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    /* 移除边框和内边距，简化为纯布局容器 */
    border: none;
    border-radius: 0;
    overflow: visible;
    padding: 0;
  }

  /* ===== 选项卡片 - 扁平化设计 ===== */
  .choice-option {
    position: relative;
    display: flex;
    align-items: center; /* ✅ 改为center，让标签和内容垂直居中对齐 */
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: var(--background-primary);
    border: none; /* ✅ 完全移除边框，避免布局跳动 */
    border-radius: var(--radius-s, 4px);
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
    width: 100%;
    min-height: 48px; /* ✅ 确保最小高度，提供足够的点击区域 */
  }

  .choice-option:hover:not(:disabled) {
    background: var(--background-modifier-hover);
  }

  .choice-option:active:not(:disabled) {
    background: var(--background-modifier-hover);
  }

  .choice-option:disabled {
    cursor: default;
  }

  /* ===== 选项标签 (A/B/C/D) - 圆形徽章设计 ===== */
  .option-label {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 28px;
    padding: 0 0.375rem;
    background: var(--background-modifier-border);
    color: var(--text-muted);
    border: none;
    border-radius: 50%; /* ✅ 圆形设计 */
    font-weight: 700;
    font-size: 0.875rem;
    transition: all 0.2s ease;
    margin-top: 0;
  }

  /* ===== 选项内容 ===== */
  .option-content {
    flex: 1;
    font-size: 0.9375rem;
    color: var(--text-normal);
    line-height: 1.6;
    min-width: 0; /* 允许文本换行 */
    word-wrap: break-word; /* 长单词换行 */
    overflow-wrap: break-word; /* 现代浏览器换行 */
    word-break: break-word; /* 强制换行 */
    white-space: normal; /* 明确允许换行 */
    align-self: center; /* ✅ 在父flex容器中垂直居中 */
  }

  /* ===== 选中状态 - 只标记标签，不影响内容区域 ===== */
  .choice-option.selected {
    background: transparent; /* ✅ 移除整行背景 */
    border: none;
  }

  .choice-option.selected .option-label {
    background: var(--text-accent);
    color: white;
    font-weight: 700;
  }

  /* ===== 正确答案状态 - 只标记标签 ===== */
  .choice-option.correct {
    background: transparent; /* ✅ 移除整行背景，只在标签上显示 */
    border: none;
  }

  .choice-option.correct .option-label {
    background: var(--color-green);
    color: white;
    font-weight: 700;
  }

  /* ===== 错误答案状态 - 只标记标签 ===== */
  .choice-option.incorrect {
    background: transparent; /* ✅ 移除整行背景，只在标签上显示 */
    border: none;
  }

  .choice-option.incorrect .option-label {
    background: var(--color-red);
    color: white;
    font-weight: 700;
  }

  /* ===== 选项状态图标 - 极简设计 ===== */
  .option-status-icon {
    position: absolute;
    right: 1rem;
    top: 50%;
    transform: translateY(-50%);
    font-size: 0.875rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .option-status-icon.correct {
    color: var(--color-green);
  }

  .option-status-icon.incorrect {
    color: var(--color-red);
  }

  /* ===== 答案对比区域 - 极简主义 ===== */
  .answer-comparison {
    margin: 1.5rem 0;
    padding: 1rem;
    background: var(--background-secondary);
    border-radius: 4px;
    border: 1px solid var(--background-modifier-border);
  }

  .comparison-row {
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }

  .comparison-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .comparison-label {
    font-size: 0.875rem;
    color: var(--text-muted);
    font-weight: 500;
  }

  .comparison-value {
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--text-normal);
  }

  .comparison-value.correct {
    color: var(--color-green);
  }

  .comparison-value.incorrect {
    color: var(--color-red);
  }

  .comparison-divider {
    width: 1px;
    height: 40px;
    background-color: var(--background-modifier-border);
    flex-shrink: 0;
  }

  /* ===== 解析区域 - 直接显示设计 ===== */
  .explanation-section {
    margin-top: 1.5rem;
    padding: 1rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-primary);
  }

  .explanation-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 500;
    color: var(--text-normal);
    margin-bottom: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .explanation-icon {
    font-size: 1.125rem;
  }

  .explanation-title {
    flex: 1;
    font-size: 0.875rem;
    font-weight: 600;
  }

  .explanation-content {
    color: var(--text-normal);
    line-height: 1.7;
    font-size: 0.9375rem;
  }


  /* ===== 响应式设计 ===== */
  @media (max-width: 768px) {
    .choice-question-container {
      padding: 0.75rem;
      gap: 1.25rem;
    }

    .choice-option {
      padding: 0.875rem 1rem;
      gap: 0.75rem;
    }

    .option-label {
      width: 28px;
      height: 28px;
      font-size: 0.8125rem;
    }

    .option-content {
      font-size: 0.875rem;
    }

    .question-text {
      font-size: 1rem;
    }

    /* 移动端答案对比垂直布局 */
    .comparison-row {
      flex-direction: column;
      gap: 1rem;
    }

    .comparison-divider {
      width: 100%;
      height: 1px;
    }

    .option-status-icon {
      position: static;
      transform: none;
      display: block;
      margin-top: 0.5rem;
    }

    .keyboard-hint {
      display: none; /* 移动端隐藏键盘提示 */
    }
  }

  /* ===== 辅助功能 ===== */
  .choice-option:focus-visible {
    outline: 2px solid var(--text-accent);
    outline-offset: 2px;
  }

  /* ===== Markdown渲染内容样式调整 ===== */
  .option-content :global(*) {
    margin: 0 !important;
    padding: 0 !important;
    line-height: 1.6 !important;
  }

  .option-content :global(p) {
    margin: 0 !important;
    padding: 0 !important;
    display: inline !important; /* ✅ 强制内联显示，避免块级元素的垂直间距 */
  }

  .option-content :global(p + p) {
    margin-top: 0.5rem !important;
    display: block !important;
  }

  .option-content :global(code) {
    padding: 0.125rem 0.25rem !important;
    background: var(--background-modifier-border);
    border-radius: 3px;
    font-size: 0.875em;
  }

  .option-content :global(.markdown-rendered),
  .option-content :global(.markdown-preview-view) {
    padding: 0 !important;
    margin: 0 !important;
  }

  .explanation-content :global(p) {
    margin: 0.5rem 0;
  }

  .explanation-content :global(p:first-child) {
    margin-top: 0;
  }

  .explanation-content :global(p:last-child) {
    margin-bottom: 0;
  }

  .explanation-content :global(code) {
    padding: 0.125rem 0.375rem;
    background: var(--background-modifier-border);
    border-radius: 3px;
    font-family: var(--font-monospace);
    font-size: 0.9em;
  }

  .explanation-content :global(ul),
  .explanation-content :global(ol) {
    margin: 0.75rem 0;
    padding-left: 1.5rem;
  }

  .explanation-content :global(li) {
    margin: 0.375rem 0;
  }

  .explanation-content :global(strong) {
    font-weight: 600;
    color: var(--text-normal);
  }
</style>

