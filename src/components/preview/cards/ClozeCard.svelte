<script lang="ts">
  import type { PreviewSection } from '../ContentPreviewEngine';
  import type { AnimationController } from '../AnimationController';
  import type WeavePlugin from '../../../main';
  import type { Card } from '../../../data/types';
  import ObsidianRenderer from '../../atoms/ObsidianRenderer.svelte';
  import { resolveClozeModeForRender } from '../../../utils/cloze-mode';
  import { extractBodyContent } from '../../../utils/yaml-utils';
  import { MAIN_SEPARATOR, DELIMITER_PATTERNS } from '../../../constants/markdown-delimiters';
  import { applyStyleProps } from '../../../utils/style-props';

  interface Props {
    sections: PreviewSection[];
    showAnswer: boolean;
    plugin: WeavePlugin;
    sourcePath?: string;
    animationController?: AnimationController;
    enableAnimations?: boolean;
    card?: Card;
    activeClozeOrdinal?: number;
  }

  let { 
    sections, 
    showAnswer = $bindable(), 
    plugin,
    sourcePath = '',
    animationController,
    enableAnimations = true,
    card,
    activeClozeOrdinal
  }: Props = $props();

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
  const clozeMode = $derived.by(() => resolveClozeModeForRender(card?.content, fullBodyContent));

  // DOM 引用：渲染后切分产生的问答区域
  let questionTitleEl: HTMLElement | null = null;
  let backDividerEl: HTMLHRElement | null = null;
  let answerTitleEl: HTMLElement | null = null;
  let backSectionEl: HTMLElement | null = null;

  // 防止切换卡片时答案闪烁：内容就绪前隐藏渲染区域
  let contentReady = $state(false);

  $effect(() => {
    const _content = fullBodyContent;
    contentReady = false;
  });

  // 渲染完成后切分 DOM
  function handleRenderComplete(container: HTMLElement): void {
    if (!container) {
      contentReady = true;
      return;
    }

    questionTitleEl = null;
    backDividerEl = null;
    answerTitleEl = null;
    backSectionEl = null;

    const children = Array.from(container.children) as HTMLElement[];
    let separatorEl: HTMLElement | null = null;

    for (const el of children) {
      if (el.textContent?.trim() === MAIN_SEPARATOR) {
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

    // 插入“问题”标签到容器最前面
    const qTitleEl = document.createElement('div');
    qTitleEl.className = 'weave-qa-question-title';
    /*
    qTitleEl.legacyHTML = '<span class="weave-qa-label">问题</span>';
    */
    const qLabelEl = document.createElement('span');
    qLabelEl.className = 'weave-qa-label';
    qLabelEl.textContent = '问题';
    qTitleEl.appendChild(qLabelEl);
    container.insertBefore(qTitleEl, container.firstChild);
    questionTitleEl = qTitleEl;

    // 插入真正的 <hr> 元素，自动继承 Obsidian 主题样式
    const hrEl = document.createElement('hr');
    hrEl.className = 'weave-cloze-divider';
    container.appendChild(hrEl);
    backDividerEl = hrEl;

    // 插入“答案”标签
    const aTitleEl = document.createElement('div');
    aTitleEl.className = 'weave-qa-answer-title';
    /*
    aTitleEl.legacyHTML = '<span class="weave-qa-label weave-qa-label--answer">答案</span>';
    */
    const aLabelEl = document.createElement('span');
    aLabelEl.className = 'weave-qa-label weave-qa-label--answer';
    aLabelEl.textContent = '答案';
    aTitleEl.appendChild(aLabelEl);
    container.appendChild(aTitleEl);
    answerTitleEl = aTitleEl;

    // 创建答案内容容器
    const backWrapper = document.createElement('div');
    backWrapper.className = 'weave-cloze-back-section';
    afterNodes.forEach(node => backWrapper.appendChild(node));
    container.appendChild(backWrapper);
    backSectionEl = backWrapper;

    // 应用初始显隐状态
    updateBackVisibility();
    contentReady = true;
  }

  function updateBackVisibility(): void {
    if (backDividerEl) {
      applyStyleProps(backDividerEl, { display: showAnswer ? null : 'none' });
    }
    if (answerTitleEl) {
      applyStyleProps(answerTitleEl, { display: showAnswer ? null : 'none' });
    }
    if (backSectionEl) {
      applyStyleProps(backSectionEl, { display: showAnswer ? null : 'none' });
    }
  }

  $effect(() => {
    const _show = showAnswer;
    updateBackVisibility();
  });
</script>

<div class="weave-card-base weave-cloze-card weave-card-mount" data-type="markdown">
  <div class="weave-cloze-content">
    <div class="weave-cloze-section">
      <div class="weave-cloze-text" style:visibility={contentReady ? 'visible' : 'hidden'}>
        <ObsidianRenderer
          {plugin}
          content={fullBodyContent}
          {sourcePath}
          enableClozeProcessing={true}
          showClozeAnswers={showAnswer}
          clozeMode={clozeMode}
          {card}
          {activeClozeOrdinal}
          onRenderComplete={handleRenderComplete}
        />
      </div>
    </div>
  </div>
</div>

<style>
  /* 继承weave-card-base的样式，只定义特殊行为 */
  /* padding和gap由weave-card-base提供 */

  /* 内容样式 */
  .weave-cloze-content {
    display: flex;
    flex-direction: column;
    gap: var(--weave-space-md, 1rem);
    
    /* 支持文本选择 */
    user-select: text;
    -webkit-user-select: text;
    cursor: auto;
  }

  .weave-cloze-section {
    background: var(--weave-surface, var(--background-primary));
    border-radius: var(--weave-radius-md, 0.5rem);
    padding: var(--weave-space-lg, 1.5rem);
    transition: all var(--weave-duration-normal, 300ms) ease;
  }

  /*  已移除hover浮动和颜色变化效果 */

  .weave-cloze-text {
    color: var(--weave-text-primary, var(--text-normal));
    line-height: 1.6;
    font-size: var(--weave-font-size-md, 1rem);
  }

  /* 问题标题（由 JS 动态插入，需要 :global） */
  .weave-cloze-text :global(.weave-qa-question-title) {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    margin-bottom: var(--weave-space-md, 1rem);
    padding-bottom: var(--weave-space-sm, 0.5rem);
  }

  .weave-cloze-text :global(.weave-qa-label) {
    padding: var(--weave-space-xs, 0.25rem) var(--weave-space-sm, 0.5rem);
    background: color-mix(in srgb, var(--interactive-accent) 10%, transparent);
    color: var(--interactive-accent);
    border-radius: var(--weave-radius-sm, 0.375rem);
    font-size: var(--weave-font-size-xs, 0.75rem);
    font-weight: 600;
    letter-spacing: 0.025em;
  }

  /* 问答分割线（真正的 <hr>，继承 Obsidian 主题样式） */
  .weave-cloze-text :global(.weave-cloze-divider) {
    margin: var(--weave-space-md, 1rem) 0;
  }

  /* 答案标题（由 JS 动态插入，需要 :global） */
  .weave-cloze-text :global(.weave-qa-answer-title) {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    margin-bottom: var(--weave-space-md, 1rem);
  }

  .weave-cloze-text :global(.weave-qa-label--answer) {
    background: color-mix(in srgb, var(--color-green) 12%, transparent);
    color: var(--color-green);
  }

  /* 背面内容区域样式（由 JS 动态插入，需要 :global） */
  .weave-cloze-text :global(.weave-cloze-back-section) {
    margin-top: var(--weave-space-md, 1rem);
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .weave-cloze-section {
      padding: var(--weave-space-md, 1rem);
    }
  }

  /* 减少动画（用户偏好） */
  @media (prefers-reduced-motion: reduce) {
    .weave-cloze-section {
      transition: none;
    }

    /*  已移除hover transform效果 */
  }
</style>
