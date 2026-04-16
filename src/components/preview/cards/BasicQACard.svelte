<script lang="ts">
  import type { PreviewSection } from '../ContentPreviewEngine';
  import type { AnimationController } from '../AnimationController';
  import type WeavePlugin from '../../../main';
  import type { Card } from '../../../data/types';
  import ObsidianRenderer from '../../atoms/ObsidianRenderer.svelte';
  import { extractBodyContent } from '../../../utils/yaml-utils';
  import { MAIN_SEPARATOR, DELIMITER_PATTERNS } from '../../../constants/markdown-delimiters';

  interface Props {
    sections: PreviewSection[];
    showAnswer: boolean;
    plugin: WeavePlugin;
    card?: Card;
    sourcePath?: string;
    animationController?: AnimationController;
    enableAnimations?: boolean;
    activeClozeOrdinal?: number;
  }

  let { 
    sections, 
    showAnswer = $bindable(), 
    plugin,
    card,
    sourcePath = '',
    animationController,
    enableAnimations = true,
    activeClozeOrdinal
  }: Props = $props();

  /**
   * 确保 ---div--- 前后有空行，使 Obsidian 渲染器将其生成为独立的 <p> 元素
   */
  function normalizeDivSeparator(text: string): string {
    return text.replace(DELIMITER_PATTERNS.MAIN_SEPARATOR, '\n\n' + MAIN_SEPARATOR + '\n\n');
  }

  // 统一渲染：使用完整 body content（保留脚注定义在同一渲染上下文中）
  const fullBodyContent = $derived.by(() => {
    if (card?.content) {
      return normalizeDivSeparator(extractBodyContent(card.content));
    }
    // 回退：从 sections 重建
    const frontParts = sections.filter(s => s.type === 'front').map(s => s.content);
    const backParts = sections.filter(s => s.type === 'back').map(s => s.content);
    if (backParts.length > 0) {
      return [...frontParts, MAIN_SEPARATOR, ...backParts].join('\n\n');
    }
    return frontParts.join('\n\n');
  });

  // DOM 引用：渲染后切分产生的答案区域
  let answerDividerEl: HTMLHRElement | null = null;
  let answerTitleEl: HTMLElement | null = null;
  let answerSectionEl: HTMLElement | null = null;

  // 防止切换卡片时答案闪烁：内容就绪前隐藏渲染区域
  let contentReady = $state(false);

  $effect(() => {
    const _content = fullBodyContent;
    contentReady = false;
  });

  // 渲染完成后切分 DOM：在分隔符处将内容分为问题/答案两部分
  function handleRenderComplete(container: HTMLElement): void {
    if (!container) {
      contentReady = true;
      return;
    }

    answerDividerEl = null;
    answerTitleEl = null;
    answerSectionEl = null;

    // 查找 ---div--- 对应的渲染元素（通常是 <p>---div---</p>）
    const children = Array.from(container.children) as HTMLElement[];
    let separatorEl: HTMLElement | null = null;

    for (const el of children) {
      const text = el.textContent?.trim();
      if (text === MAIN_SEPARATOR) {
        separatorEl = el;
        break;
      }
    }

    if (!separatorEl) {
      contentReady = true;
      return;
    }

    // 收集分隔符之后的所有节点
    const afterNodes: Node[] = [];
    let sibling = separatorEl.nextSibling;
    while (sibling) {
      const next = sibling.nextSibling;
      afterNodes.push(sibling);
      sibling = next;
    }

    // 移除分隔符
    separatorEl.remove();

    // 插入真正的 <hr> 元素，自动继承 Obsidian 主题样式
    const hrEl = document.createElement('hr');
    hrEl.className = 'weave-qa-divider';
    container.appendChild(hrEl);
    answerDividerEl = hrEl;

    // 插入答案标题
    const titleEl = document.createElement('div');
    titleEl.className = 'weave-qa-answer-title';
    /*
    titleEl.legacyHTML = '<span class="weave-qa-label weave-qa-label--answer">答案</span>';
    */
    const labelEl = document.createElement('span');
    labelEl.className = 'weave-qa-label weave-qa-label--answer';
    labelEl.textContent = '答案';
    titleEl.appendChild(labelEl);
    container.appendChild(titleEl);
    answerTitleEl = titleEl;

    // 创建答案内容容器
    const answerWrapper = document.createElement('div');
    answerWrapper.className = 'weave-qa-back-section';
    afterNodes.forEach(node => answerWrapper.appendChild(node));
    container.appendChild(answerWrapper);
    answerSectionEl = answerWrapper;

    // 应用初始显隐状态
    updateAnswerVisibility();
    contentReady = true;

    // 动画
    if (showAnswer && animationController && enableAnimations) {
      animationController.animateContentReveal(answerWrapper, {
        duration: 400,
        easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        delay: 100
      });
    }
  }

  // 根据 showAnswer 控制答案区域的显隐
  function updateAnswerVisibility(): void {
    if (answerDividerEl) {
      answerDividerEl.style.display = showAnswer ? '' : 'none';
    }
    if (answerTitleEl) {
      answerTitleEl.style.display = showAnswer ? '' : 'none';
    }
    if (answerSectionEl) {
      answerSectionEl.style.display = showAnswer ? '' : 'none';
    }
  }

  // 响应式监听 showAnswer 变化
  $effect(() => {
    const _show = showAnswer;
    updateAnswerVisibility();
  });
</script>

<div class="weave-card-base weave-basic-qa-card weave-card-mount" data-type="markdown">
  <!-- 问题标题 -->
  <div class="weave-qa-question">
    <div class="weave-qa-question-title">
      <span class="weave-qa-label">问题</span>
    </div>

    <!-- 统一渲染区域：完整内容由单个 ObsidianRenderer 渲染，渲染后通过 JS 切分问题/答案 -->
    <div class="weave-qa-content" style:visibility={contentReady ? 'visible' : 'hidden'}>
      <ObsidianRenderer
        {plugin}
        content={fullBodyContent}
        {sourcePath}
        {card}
        enableClozeProcessing={!!activeClozeOrdinal}
        showClozeAnswers={showAnswer}
        {activeClozeOrdinal}
        onRenderComplete={handleRenderComplete}
      />
    </div>
  </div>

  <!-- 空状态 -->
  {#if !fullBodyContent}
    <div class="weave-qa-empty">
      <div class="weave-qa-empty-icon">--</div>
      <div class="weave-qa-empty-title">没有可显示的内容</div>
      <div class="weave-qa-empty-description">卡片内容为空或解析失败</div>
    </div>
  {/if}
</div>

<style>
  /* 继承weave-card-base的样式，只定义特殊行为 */
  /* padding和gap由weave-card-base提供 */

  /* 问题样式 - 统一渲染容器 */
  .weave-qa-question {
    background: transparent;
    border: none;
    border-radius: 0;
    padding: 0;
  }

  /* 标题样式 */
  .weave-qa-question-title {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    margin-bottom: var(--weave-space-md, 1rem);
    padding-bottom: var(--weave-space-sm, 0.5rem);
  }

  /* 问答分割线（真正的 <hr>，继承 Obsidian 主题样式） */
  .weave-qa-content :global(.weave-qa-divider) {
    margin: var(--weave-space-md, 1rem) 0;
  }

  /* 答案标题（由 JS 动态插入） */
  .weave-qa-content :global(.weave-qa-answer-title) {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    margin-bottom: var(--weave-space-md, 1rem);
  }

  /* 答案内容区域（由 JS 动态插入） */
  .weave-qa-content :global(.weave-qa-back-section) {
    color: var(--weave-text-primary, var(--text-normal));
    line-height: 1.6;
  }

  .weave-qa-label {
    padding: var(--weave-space-xs, 0.25rem) var(--weave-space-sm, 0.5rem);
    background: color-mix(in srgb, var(--interactive-accent) 10%, transparent);
    color: var(--interactive-accent);
    border-radius: var(--weave-radius-sm, 0.375rem);
    font-size: var(--weave-font-size-xs, 0.75rem);
    font-weight: 600;
    letter-spacing: 0.025em;
  }

  /* 答案标签样式（JS动态创建，需要 :global） */
  .weave-qa-content :global(.weave-qa-label--answer) {
    background: color-mix(in srgb, var(--color-green) 12%, transparent);
    color: var(--color-green);
  }

  /* 内容样式 */
  .weave-qa-content {
    color: var(--weave-text-primary, var(--text-normal));
    line-height: 1.6;
    font-size: var(--weave-font-size-md, 1rem);
    user-select: text;
    -webkit-user-select: text;
    cursor: text;
  }

  /* 空状态 */
  .weave-qa-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--weave-space-xl, 2rem);
    text-align: center;
    opacity: 0.6;
  }

  .weave-qa-empty-icon {
    font-size: 2.5rem;
    margin-bottom: var(--weave-space-md, 1rem);
  }

  .weave-qa-empty-title {
    font-size: var(--weave-font-size-lg, 1.125rem);
    font-weight: 600;
    color: var(--weave-text-primary, var(--text-normal));
    margin-bottom: var(--weave-space-sm, 0.5rem);
  }

  .weave-qa-empty-description {
    color: var(--weave-text-secondary, var(--text-muted));
    font-size: var(--weave-font-size-sm, 0.875rem);
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .weave-basic-qa-card {
      padding: var(--weave-space-md, 1rem);
      gap: var(--weave-space-md, 1rem);
    }

    .weave-qa-content {
      font-size: var(--weave-font-size-sm, 0.875rem);
    }

    .weave-qa-question-title {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--weave-space-xs, 0.25rem);
    }

    .weave-qa-content :global(.weave-qa-answer-title) {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--weave-space-xs, 0.25rem);
    }
  }
</style>
