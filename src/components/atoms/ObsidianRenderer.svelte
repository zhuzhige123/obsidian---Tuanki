<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { MarkdownRenderer, Component } from 'obsidian';
  import type { WeavePlugin } from '../../main';
  import { logger } from '../../utils/logger';
  import { shouldRevealClozeAnswersForRender } from '../../utils/cloze-mode';
  import { escapeHtml, replaceAnkiClozeSyntax, replaceConfiguredClozeSyntax } from '../../utils/cloze-syntax';
  import { applyStyleProps } from '../../utils/style-props';

  interface Props {
    plugin: WeavePlugin;
    content: string;
    sourcePath?: string;
    enableClozeProcessing?: boolean;
    showClozeAnswers?: boolean;
    clozeMode?: import('../../utils/cloze-mode').ClozeMode;
    clozeUserAnswers?: string[] | null;
    card?: any; // 卡片对象
    studyInstance?: any; // 渐进式挖空学习实例
    activeClozeOrdinal?: number; // 当前激活的挖空序号（1-based）
    onRenderComplete?: (element: HTMLElement) => void;
    onRenderError?: (error: Error) => void;
  }

  let {
    plugin,
    content,
    sourcePath = '',
    enableClozeProcessing = false,
    showClozeAnswers = false,
    clozeMode = 'reveal',
    clozeUserAnswers = null,
    card,
    studyInstance, // 渐进式挖空学习实例
    activeClozeOrdinal, // 渐进式挖空序号
    onRenderComplete: onRenderCompleteProp,
    onRenderError: onRenderErrorProp
  }: Props = $props();

  function notifyRenderComplete(element: HTMLElement): void {
    if (typeof onRenderCompleteProp === 'function') {
      onRenderCompleteProp(element);
    }
  }

  function notifyRenderError(error: Error): void {
    if (typeof onRenderErrorProp === 'function') {
      onRenderErrorProp(error);
    }
  }

  // 未显式传入 sourcePath 时，回退到卡片来源路径，保证内部链接与悬停预览可用
  const effectiveSourcePath = $derived(
    sourcePath || card?.sourceFile || ''
  );
  const effectiveShowClozeAnswers = $derived.by(() =>
    shouldRevealClozeAnswersForRender(clozeMode, showClozeAnswers)
  );
  const isInputClozeMode = $derived.by(() =>
    clozeMode === 'input' &&
    activeClozeOrdinal === undefined &&
    !(studyInstance && typeof studyInstance === 'object' && 'activeClozeOrd' in studyInstance)
  );
  const normalizedClozeUserAnswers = $derived.by(() =>
    Array.isArray(clozeUserAnswers) ? clozeUserAnswers : []
  );

  function getClozeAriaLabel(shouldReveal: boolean, hint?: string | null): string {
    const baseLabel = shouldReveal
      ? '答案已显示'
      : isInputClozeMode
        ? '请输入答案后确认'
        : '点击或悬停显示答案';

    return hint ? `${baseLabel}，提示: ${hint}` : baseLabel;
  }

  function normalizeClozeAnswer(value: string | null | undefined): string {
    return String(value || '')
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  let clozeTextMeasureCanvas: HTMLCanvasElement | null = null;

  function getClozeTextMeasureContext(): CanvasRenderingContext2D | null {
    if (typeof document === 'undefined') {
      return null;
    }

    clozeTextMeasureCanvas ??= document.createElement('canvas');
    return clozeTextMeasureCanvas.getContext('2d');
  }

  function buildMeasurementFont(styles: CSSStyleDeclaration): string {
    if (styles.font && styles.font.trim()) {
      return styles.font;
    }

    const lineHeight = styles.lineHeight && styles.lineHeight !== 'normal'
      ? `/${styles.lineHeight}`
      : '';

    return [
      styles.fontStyle || 'normal',
      styles.fontVariant || 'normal',
      styles.fontWeight || '400',
      `${styles.fontSize || '16px'}${lineHeight}`,
      styles.fontFamily || 'sans-serif'
    ].join(' ');
  }

  function measureClozeTextWidth(text: string, inputEl?: HTMLInputElement): number {
    const sample = text || ' ';
    const fallbackWidth = Math.max(Array.from(sample).length * 18, 48);

    if (!inputEl || typeof window === 'undefined') {
      return fallbackWidth;
    }

    const context = getClozeTextMeasureContext();
    if (!context) {
      return fallbackWidth;
    }

    const styles = window.getComputedStyle(inputEl);
    context.font = buildMeasurementFont(styles);

    const letterSpacing = parseFloat(styles.letterSpacing);
    const letterSpacingWidth = Number.isFinite(letterSpacing)
      ? Math.max(0, Array.from(sample).length - 1) * letterSpacing
      : 0;

    return context.measureText(sample).width + letterSpacingWidth;
  }

  function resolveClozeInputMaxWidth(inputEl?: HTMLInputElement): number {
    if (!inputEl || typeof window === 'undefined') {
      return 520;
    }

    const viewportLimit = Math.max(window.innerWidth - 96, 160);
    const nearestContentContainer =
      inputEl.closest('.question-content, .explanation-content, .markdown-rendered, .markdown-preview-view')
      || inputEl.parentElement?.parentElement;

    const containerWidth = nearestContentContainer instanceof HTMLElement
      ? nearestContentContainer.getBoundingClientRect().width
      : 0;
    const containerLimit = containerWidth > 0 ? Math.max(containerWidth - 24, 160) : 520;

    return Math.min(520, viewportLimit, containerLimit);
  }

  function computeClozeInputWidth(
    answerText: string,
    userAnswer: string,
    inputEl?: HTMLInputElement
  ): string {
    const contentWidth = Math.max(
      measureClozeTextWidth(answerText, inputEl),
      measureClozeTextWidth(userAnswer, inputEl),
      measureClozeTextWidth('填空', inputEl)
    );

    let horizontalChromeWidth = 22;
    if (inputEl && typeof window !== 'undefined') {
      const styles = window.getComputedStyle(inputEl);
      const paddingWidth = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      const borderWidth = parseFloat(styles.borderLeftWidth) + parseFloat(styles.borderRightWidth);
      horizontalChromeWidth = (Number.isFinite(paddingWidth) ? paddingWidth : 0)
        + (Number.isFinite(borderWidth) ? borderWidth : 0)
        + 18;
    }

    const width = Math.min(
      Math.max(contentWidth + horizontalChromeWidth, 56),
      resolveClozeInputMaxWidth(inputEl)
    );
    return `${Math.ceil(width)}px`;
  }

  function resetClozeStateClasses(markEl: HTMLElement): void {
    markEl.classList.remove(
      'weave-cloze-hidden',
      'weave-cloze-revealed',
      'weave-cloze-input-mode',
      'weave-cloze-correct',
      'weave-cloze-incorrect'
    );
  }

  function renderClozeAsInput(markEl: HTMLElement): void {
    const answerText = markEl.getAttribute('data-cloze-answer') || markEl.textContent || '';
    const userAnswer = markEl.getAttribute('data-user-answer') || '';
    const hint = markEl.getAttribute('data-hint');

    resetClozeStateClasses(markEl);
    markEl.classList.add('weave-cloze-input-mode');
    markEl.replaceChildren();
    applyStyleProps(markEl, { cursor: 'text' });
    markEl.setAttribute('tabindex', '-1');
    markEl.setAttribute('role', 'group');
    markEl.setAttribute('aria-label', getClozeAriaLabel(false, hint));

    const inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.className = 'weave-cloze-input';
    inputEl.value = userAnswer;
    inputEl.spellcheck = false;
    inputEl.autocomplete = 'off';
    inputEl.setAttribute('data-cloze-input', 'true');
    inputEl.setAttribute('autocorrect', 'off');
    inputEl.setAttribute('autocapitalize', 'off');
    inputEl.setAttribute('aria-label', hint ? `输入答案，提示：${hint}` : '输入答案');
    inputEl.addEventListener('input', () => {
      markEl.setAttribute('data-user-answer', inputEl.value);
      applyStyleProps(inputEl, { width: computeClozeInputWidth(answerText, inputEl.value, inputEl) });
    });

    markEl.appendChild(inputEl);
    applyStyleProps(inputEl, { width: computeClozeInputWidth(answerText, userAnswer, inputEl) });
    requestAnimationFrame(() => {
      applyStyleProps(inputEl, { width: computeClozeInputWidth(answerText, inputEl.value, inputEl) });
    });
  }

  function renderClozeAsReveal(markEl: HTMLElement, shouldShow: boolean): void {
    const answerText = markEl.getAttribute('data-cloze-answer') || markEl.textContent || '';
    const hint = markEl.getAttribute('data-hint');

    resetClozeStateClasses(markEl);
    markEl.replaceChildren(document.createTextNode(answerText));
    markEl.setAttribute('tabindex', '0');
    markEl.setAttribute('role', 'button');
    markEl.setAttribute('aria-label', getClozeAriaLabel(shouldShow, hint));
    applyStyleProps(markEl, { cursor: shouldShow ? 'default' : 'pointer' });

    if (shouldShow) {
      markEl.classList.add('weave-cloze-revealed');
      return;
    }

    markEl.classList.add('weave-cloze-hidden');
  }

  function renderClozeAsInputResult(markEl: HTMLElement): void {
    const answerText = markEl.getAttribute('data-cloze-answer') || markEl.textContent || '';
    const userAnswer = markEl.getAttribute('data-user-answer') || '';
    const hint = markEl.getAttribute('data-hint');
    const isCorrect = normalizeClozeAnswer(userAnswer) === normalizeClozeAnswer(answerText) && normalizeClozeAnswer(answerText) !== '';

    resetClozeStateClasses(markEl);
    markEl.classList.add('weave-cloze-revealed', isCorrect ? 'weave-cloze-correct' : 'weave-cloze-incorrect');
    markEl.replaceChildren(document.createTextNode(answerText));
    applyStyleProps(markEl, { cursor: 'default' });
    markEl.setAttribute('tabindex', '0');
    markEl.setAttribute('role', 'status');
    markEl.setAttribute(
      'aria-label',
      isCorrect
        ? `回答正确，${getClozeAriaLabel(true, hint)}`
        : `回答错误，正确答案是 ${answerText}${hint ? `，提示: ${hint}` : ''}`
    );

    if (!isCorrect && userAnswer.trim()) {
      markEl.setAttribute('title', `你的答案：${userAnswer}\n正确答案：${answerText}`);
    }
  }

  function applyClozeDisplayState(markEl: HTMLElement, shouldShow: boolean): void {
    if (isInputClozeMode) {
      if (shouldShow) {
        renderClozeAsInputResult(markEl);
      } else {
        renderClozeAsInput(markEl);
      }
      return;
    }

    renderClozeAsReveal(markEl, shouldShow);
  }


  let container: HTMLDivElement;
  let component: Component | null = null;
  let isRendering = $state(false);
  let renderError = $state<string | null>(null);
  let isMounted = $state(false);  
  let pendingRender = $state(false);

  function buildWeaveClozeMarkup(answerText: string, hint?: string | null): string {
    const markHtml = `<mark data-weave-cloze="true">${escapeHtml(answerText)}</mark>`;
    if (!hint) {
      return markHtml;
    }

    return `<span data-cloze-hint="${escapeHtml(hint)}">${markHtml}</span>`;
  }

  function preprocessClozeContent(rawContent: string): string {
    if (!rawContent) return rawContent;
    
    let processedContent = rawContent;
    const clozeSettings = plugin?.settings?.clozeSettings;
    
    if (activeClozeOrdinal !== undefined) {
      processedContent = replaceAnkiClozeSyntax(processedContent, (match) => {
        if (match.ordinal === activeClozeOrdinal) {
          return buildWeaveClozeMarkup(match.text, match.hint);
        }

        return match.text;
      });

      logger.debug('[ObsidianRenderer]',`✅ 渲染渐进式挖空（activeCloze: c${activeClozeOrdinal}）`);
    } else if (studyInstance && typeof studyInstance === 'object' && 'activeClozeOrd' in studyInstance) {
      const activeClozeOrd = studyInstance.activeClozeOrd;

      processedContent = replaceAnkiClozeSyntax(processedContent, (match) => {
        if (match.ordinal === activeClozeOrd + 1) {
          return buildWeaveClozeMarkup(match.text, match.hint);
        }

        return match.text;
      });

      logger.debug('[ObsidianRenderer]',`✅ 渲染渐进式挖空学习实例（activeCloze: c${activeClozeOrd + 1}）`);
    } else {
      processedContent = replaceAnkiClozeSyntax(processedContent, (match) =>
        buildWeaveClozeMarkup(match.text, match.hint)
      );
    }

    processedContent = replaceConfiguredClozeSyntax(
      processedContent,
      (match) => buildWeaveClozeMarkup(match.text),
      clozeSettings
    );
    
    return processedContent;
  }

  /**
   * 设置内部链接点击处理器。
   * MarkdownRenderer 只负责渲染 HTML，需要额外绑定点击事件来处理内部跳转。
   */
  function setupInternalLinkHandlers(container: HTMLElement): void {
    if (!container) return;

    // 查找所有内部链接
    const internalLinks = container.querySelectorAll('a.internal-link');
    
    internalLinks.forEach((link) => {
      const anchorEl = link as HTMLAnchorElement;
      const href = anchorEl.getAttribute('data-href');
      
      if (!href) return;

      // 移除已有的点击处理器（如果有）
      const oldHandler = (anchorEl as any)._weaveClickHandler;
      if (oldHandler) {
        anchorEl.removeEventListener('click', oldHandler);
      }

      // 添加新的点击处理器
      const clickHandler = (e: MouseEvent) => {
        e.preventDefault();
        // Svelte 5: 内部链接导航不需要 stopPropagation
        
        logger.debug('[ObsidianRenderer]','内部链接点击:', href);
        
        // 使用Obsidian的app.workspace.openLinkText API
        plugin.app.workspace.openLinkText(
          href,
          effectiveSourcePath,
          e.ctrlKey || e.metaKey // 新标签页
        );
      };

      anchorEl.addEventListener('click', clickHandler);
      
      // 保存处理器引用以便清理
      (anchorEl as any)._weaveClickHandler = clickHandler;

      // 设置Obsidian标准属性以启用hover预览
      anchorEl.setAttribute('data-href', href);
      anchorEl.setAttribute('data-tooltip-position', 'top');
      anchorEl.setAttribute('rel', 'noopener');
      anchorEl.setAttribute('target', '_blank');
      anchorEl.classList.add('internal-link');
      
      // 添加hover事件
      anchorEl.addEventListener('mouseenter', (e: MouseEvent) => {
        const targetEl = e.currentTarget as HTMLElement;
        
        plugin.app.workspace.trigger('hover-link', {
          event: e,
          source: 'preview',
          hoverParent: container,
          targetEl: targetEl,
          linktext: href,
          sourcePath: effectiveSourcePath
        });
      });
    });
  }

  /**
   * 脚注弹窗状态
   */
  let activeFootnotePopover: HTMLElement | null = null;
  let footnoteHideTimer: ReturnType<typeof setTimeout> | null = null;

  function removeFootnotePopover(): void {
    if (footnoteHideTimer) {
      clearTimeout(footnoteHideTimer);
      footnoteHideTimer = null;
    }
    if (activeFootnotePopover) {
      activeFootnotePopover.remove();
      activeFootnotePopover = null;
    }
  }

  function scheduleRemovePopover(delay = 200): void {
    if (footnoteHideTimer) clearTimeout(footnoteHideTimer);
    footnoteHideTimer = setTimeout(removeFootnotePopover, delay);
  }

  function cancelRemovePopover(): void {
    if (footnoteHideTimer) {
      clearTimeout(footnoteHideTimer);
      footnoteHideTimer = null;
    }
  }

  /**
   * 查找脚注定义元素（兼容不同ID格式）
   */
  function findFootnoteElement(container: HTMLElement, footnoteId: string): Element | null {
    return container.querySelector(`li[id="${footnoteId}"]`) ||
           container.querySelector(`[id="${footnoteId}"]`) ||
           container.querySelector(`[data-footnote-id="${footnoteId}"]`);
  }

  /**
   * 设置脚注处理器
   */
  function setupFootnoteHandlers(container: HTMLElement): void {
    if (!container) return;

    const footnoteRefs = container.querySelectorAll(
      'a.footnote-ref, sup a[href^="#fn"], sup[class*="footnote"] a, a[data-footnote-ref], a[role="doc-noteref"]'
    );
    const footnotesSection = container.querySelector(
      '.footnotes, section.footnotes, section[data-footnotes], [class*="footnote-list"]'
    );
    
    if (footnoteRefs.length === 0 && !footnotesSection) return;

    // 为脚注引用添加悬停弹窗和点击处理
    footnoteRefs.forEach((ref) => {
      const refEl = ref as HTMLAnchorElement;
      const href = refEl.getAttribute('href');
      
      if (!href || !href.startsWith('#')) return;
      
      const footnoteId = href.substring(1);

      const oldHandler = (refEl as any)._weaveFootnoteHandler;
      if (oldHandler) {
        refEl.removeEventListener('click', oldHandler);
      }

      const clickHandler = (e: MouseEvent) => {
        e.preventDefault();
        
        const footnoteContent = findFootnoteElement(container, footnoteId);
        
        if (footnoteContent) {
          footnoteContent.scrollIntoView({ behavior: 'smooth', block: 'center' });
          footnoteContent.classList.add('footnote-highlighted');
          setTimeout(() => {
            footnoteContent.classList.remove('footnote-highlighted');
          }, 2000);
        }
      };

      refEl.addEventListener('click', clickHandler, { capture: true });
      (refEl as any)._weaveFootnoteHandler = clickHandler;

      // 悬停弹窗
      const oldEnter = (refEl as any)._weaveFootnoteEnter;
      const oldLeave = (refEl as any)._weaveFootnoteLeave;
      if (oldEnter) refEl.removeEventListener('mouseenter', oldEnter);
      if (oldLeave) refEl.removeEventListener('mouseleave', oldLeave);

      let hoverShowTimer: ReturnType<typeof setTimeout> | null = null;

      const enterHandler = (e: MouseEvent) => {
        // 如果已有同一个弹窗，取消隐藏计时
        if (activeFootnotePopover) {
          cancelRemovePopover();
          return;
        }

        // 延迟显示弹窗（避免快速掠过时闪烁）
        hoverShowTimer = setTimeout(() => {
          hoverShowTimer = null;
          showFootnotePopover(refEl, container, footnoteId);
        }, 300);
      };

      const leaveHandler = () => {
        if (hoverShowTimer) {
          clearTimeout(hoverShowTimer);
          hoverShowTimer = null;
        }
        scheduleRemovePopover(300);
      };

      refEl.addEventListener('mouseenter', enterHandler);
      refEl.addEventListener('mouseleave', leaveHandler);
      (refEl as any)._weaveFootnoteEnter = enterHandler;
      (refEl as any)._weaveFootnoteLeave = leaveHandler;
    });

    // 为脚注返回链接添加处理
    const backRefs = container.querySelectorAll('a.footnote-backref, .footnotes a[href^="#fnref"]');
    
    backRefs.forEach((backRef) => {
      const backRefEl = backRef as HTMLAnchorElement;
      const href = backRefEl.getAttribute('href');
      
      if (!href || !href.startsWith('#')) return;
      
      const targetId = href.substring(1);

      const oldHandler = (backRefEl as any)._weaveBackrefHandler;
      if (oldHandler) {
        backRefEl.removeEventListener('click', oldHandler);
      }

      const clickHandler = (e: MouseEvent) => {
        e.preventDefault();
        
        let target = container.querySelector(`#${CSS.escape(targetId)}`);
        
        if (!target && targetId.startsWith('fnref:')) {
          const num = targetId.substring(6);
          target = container.querySelector(`a[href="#fn:${num}"]`) ||
                  container.querySelector(`sup a[href="#fn:${num}"]`) ||
                  container.querySelector(`a.footnote-ref[href="#fn:${num}"]`);
        }
        
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.classList.add('footnote-highlighted');
          setTimeout(() => {
            target.classList.remove('footnote-highlighted');
          }, 2000);
        }
      };

      backRefEl.addEventListener('click', clickHandler, { capture: true });
      (backRefEl as any)._weaveBackrefHandler = clickHandler;
    });
  }

  /**
   * 显示脚注弹窗
   */
  function showFootnotePopover(refEl: HTMLElement, container: HTMLElement, footnoteId: string): void {
    removeFootnotePopover();

    const footnoteLi = findFootnoteElement(container, footnoteId);
    if (!footnoteLi) return;

    const clone = footnoteLi.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('a.footnote-backref, a[href^="#fnref"]').forEach(el => el.remove());
    clone.removeAttribute('id');

    const popover = document.createElement('div');
    popover.className = 'weave-footnote-popover';
    const contentDiv = document.createElement('div');
    contentDiv.className = 'weave-footnote-popover-content';
    contentDiv.innerHTML = clone.innerHTML;
    popover.appendChild(contentDiv);

    popover.addEventListener('mouseenter', cancelRemovePopover);
    popover.addEventListener('mouseleave', () => scheduleRemovePopover(300));

    document.body.appendChild(popover);
    activeFootnotePopover = popover;

    const rect = refEl.getBoundingClientRect();
    applyStyleProps(popover, {
      left: `${rect.left}px`,
      top: `${rect.bottom + 6}px`
    });

    requestAnimationFrame(() => {
      if (!activeFootnotePopover) return;
      const pr = popover.getBoundingClientRect();
      if (pr.right > window.innerWidth - 16) {
        applyStyleProps(popover, {
          left: `${window.innerWidth - pr.width - 16}px`
        });
      }
      if (pr.bottom > window.innerHeight - 16) {
        applyStyleProps(popover, {
          top: `${rect.top - pr.height - 6}px`
        });
      }
    });
  }

  // 后处理渲染内容，补充挖空标记的样式和交互
  function postProcessRenderedContent(element: HTMLElement): void {
    if (!enableClozeProcessing) return;

    const markElements = element.querySelectorAll('mark[data-weave-cloze]');
    const shouldReveal = effectiveShowClozeAnswers;
    
    markElements.forEach((mark, index) => {
      const markEl = mark as HTMLElement;
      const answerText = markEl.textContent || '';
      const userAnswer = normalizedClozeUserAnswers[index] || '';
      const previousHandler = (markEl as HTMLElement & { _weaveClozeClickHandler?: EventListener })._weaveClozeClickHandler;
      if (previousHandler) {
        markEl.removeEventListener('click', previousHandler);
      }
      
      markEl.classList.add('weave-cloze-mark');
      markEl.setAttribute('data-cloze-answer', answerText);
      markEl.setAttribute('data-cloze-index', String(index));
      if (userAnswer) {
        markEl.setAttribute('data-user-answer', userAnswer);
      } else {
        markEl.removeAttribute('data-user-answer');
      }

      if (!isInputClozeMode) {
        const clickHandler: EventListener = (e) => {
          const target = e.currentTarget as HTMLElement;
          if (target.classList.contains('weave-cloze-hidden')) {
            target.classList.remove('weave-cloze-hidden');
            target.classList.add('weave-cloze-revealed');
            target.setAttribute('aria-label', getClozeAriaLabel(true, target.getAttribute('data-hint')));
          }
        };

        markEl.addEventListener('click', clickHandler);
        (markEl as HTMLElement & { _weaveClozeClickHandler?: EventListener })._weaveClozeClickHandler = clickHandler;
      }
    });
    
    //  处理带hint的挖空（从Anki格式转换而来）
    const hintWrappers = element.querySelectorAll('[data-cloze-hint]');
    let hintCount = 0;
    
    hintWrappers.forEach((wrapper) => {
      const wrapperEl = wrapper as HTMLElement;
      const hint = wrapperEl.getAttribute('data-cloze-hint');
      const markEl = wrapperEl.querySelector('mark');
      
      if (markEl && hint) {
        markEl.setAttribute('data-hint', hint);
        markEl.setAttribute('title', `💡 提示: ${hint}`);
        hintCount++;
      }
    });

    markElements.forEach((mark) => {
      applyClozeDisplayState(mark as HTMLElement, shouldReveal);
    });
    
    logger.debug('[ObsidianRenderer]',`✅ 处理了 ${markElements.length} 个挖空标记 (其中 ${hintCount} 个带提示)`);
  }

  function wrapTablesForHorizontalScroll(element: HTMLElement): void {
    const tables = Array.from(element.querySelectorAll('table'));
    if (tables.length === 0) return;

    for (const table of tables) {
      const existingWrapper = table.closest('.weave-table-scroll');
      if (existingWrapper) continue;

      const parent = table.parentElement;
      if (!parent) continue;

      const wrapper = document.createElement('div');
      wrapper.className = 'weave-table-scroll';

      parent.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    }
  }


  // 渲染 Markdown 内容
  async function renderContent(): Promise<void> {
    // 防止组件卸载后继续渲染
    if (!isMounted || !container || !plugin?.app) {
      logger.debug('[ObsidianRenderer]','⚠️ 跳过渲染：组件未挂载或缺少依赖', {
        isMounted,
        hasContainer: !!container,
        hasPlugin: !!plugin?.app,
        contentLength: content?.length ?? 0
      });
      return;
    }
    
    // 避免并发渲染
    if (isRendering) {
      logger.debug('[ObsidianRenderer]','⚠️ 跳过渲染：上一次渲染尚未完成');
      pendingRender = true;
      return;
    }
    
    logger.debug('[ObsidianRenderer]','✅ 开始渲染内容:', {
      contentLength: content?.length ?? 0,
      enableClozeProcessing,
      showClozeAnswers,
      clozeMode,
      effectiveShowClozeAnswers
    });

    isRendering = true;
    renderError = null;

    try {
      // 清理之前的渲染
      if (component) {
        component.unload();
        component = null;
      }
      
      // 在异步操作前再次确认组件仍然挂载
      if (!isMounted || !container) {
        logger.debug('[ObsidianRenderer]','渲染中止：组件已卸载');
        return;
      }
      
      // 防止切换卡片时答案闪烁：渲染期间隐藏容器，等待onRenderComplete处理后才显示
      applyStyleProps(container, { visibility: 'hidden' });

      container.innerHTML = '';

      // 预处理内容
      const processedContent = preprocessClozeContent(content);

      // 创建新的组件实例
      component = new Component();

      // 使用Obsidian原生渲染引擎
      await MarkdownRenderer.render(
        plugin.app,
        processedContent || '*空内容*',
        container,
        effectiveSourcePath,  //  使用有效的源路径以支持内部链接和hover
        component
      );

      // 在加载组件前做最后一次挂载检查
      if (!isMounted || !component) {
        logger.debug('[ObsidianRenderer]','渲染完成但组件已卸载，跳过加载');
        if (component) {
          component.unload();
          component = null;
        }
        return;
      }

      // 加载组件
      component.load();

      // 脚注需要在 Component 加载后再等一个 DOM 更新周期才能完整渲染
      await new Promise(resolve => setTimeout(resolve, 50));

      // 后处理渲染内容
      postProcessRenderedContent(container);

      wrapTablesForHorizontalScroll(container);

      // 注册内部链接点击事件处理器
      setupInternalLinkHandlers(container);

      // 设置脚注处理器
      setupFootnoteHandlers(container);

      // 触发完成回调（父组件在此回调中分割DOM并隐藏答案区域）
      notifyRenderComplete(container);

      // 回调完成后恢复可见（答案已被隐藏）
      if (isMounted && container) {
        applyStyleProps(container, { visibility: null });
      }
      
      logger.debug('[ObsidianRenderer]','✅ 渲染成功', {
        contentLength: content.length,
        enableClozeProcessing,
        showClozeAnswers,
        clozeMode,
        effectiveShowClozeAnswers,
        timestamp: new Date().toLocaleTimeString()
      });

    } catch (error) {
      // 仅在组件仍然挂载时处理错误
      if (!isMounted || !container) {
        logger.debug('[ObsidianRenderer]','渲染错误但组件已卸载，忽略');
        return;
      }
      
      logger.error('[ObsidianRenderer] 渲染失败:', error);
      renderError = error instanceof Error ? error.message : '未知渲染错误';
      
      // 错误时恢复可见
      applyStyleProps(container, { visibility: null });
      
      // 降级到简单HTML渲染
      container.innerHTML = `
        <div class="weave-render-error">
          <div class="error-icon">[!]</div>
          <div class="error-message">内容渲染失败</div>
          <div class="error-fallback">${content}</div>
        </div>
      `;

      notifyRenderError(error instanceof Error ? error : new Error('渲染失败'));
    } finally {
      isRendering = false;

      if (pendingRender) {
        pendingRender = false;

        if (isMounted && container && plugin?.app) {
          setTimeout(() => renderContent(), 0);
        }
      }
    }
  }

  // 使用安全的 $effect + 延迟执行，避免阻塞初始化
  
  // 跟踪上一次渲染的内容，用于检测变化
  let previousContent = $state<string>('');
  let previousShowCloze = $state<boolean | undefined>(undefined);
  let previousClozeMode = $state<'reveal' | 'input' | undefined>(undefined);
  let previousActiveClozeOrdinal = $state<number | undefined>(undefined); // 跟踪挖空序号
  
  // 安全监听内容变化，并同时追踪 activeClozeOrdinal
  $effect(() => {
    // 读取依赖以触发追踪
    const currentContent = content;
    const currentActiveCloze = activeClozeOrdinal;
    const mounted = isMounted;
    
    // 检测 content 或 activeClozeOrdinal 变化
    const contentChanged = currentContent !== previousContent;
    const activeClozeChanged = currentActiveCloze !== previousActiveClozeOrdinal;
    
    if (mounted && currentContent !== undefined && (contentChanged || activeClozeChanged)) {
      logger.debug('[ObsidianRenderer]','内容或挖空序号变化，延迟渲染', {
        contentChanged,
        activeClozeChanged,
        oldActiveCloze: previousActiveClozeOrdinal,
        newActiveCloze: currentActiveCloze
      });
      
      previousContent = currentContent;
      previousActiveClozeOrdinal = currentActiveCloze;
      
      // 延迟到下一个事件循环，避免阻塞启动
      setTimeout(() => renderContent(), 0);
    }
  });
  
  // 安全的挖空显示状态监听（延迟执行，避免阻塞）
  $effect(() => {
    // 读取依赖以触发追踪
    const shouldShow = effectiveShowClozeAnswers;
    const currentMode = clozeMode;
    const mounted = isMounted;
    const processingEnabled = enableClozeProcessing;
    const showStateChanged = shouldShow !== previousShowCloze;
    const modeChanged = currentMode !== previousClozeMode;
    
    if (mounted && processingEnabled && (showStateChanged || modeChanged)) {
      logger.debug('[ObsidianRenderer]','挖空显示状态变化:', {
        shouldShow,
        showClozeAnswers,
        clozeMode,
        modeChanged
      });
      previousShowCloze = shouldShow;
      previousClozeMode = currentMode;
      // 延迟执行，避免阻塞
      setTimeout(() => updateClozeDisplay(shouldShow), 100);
    }
  });
  
  // 独立的挖空显示更新函数
  function updateClozeDisplay(shouldShow: boolean): void {
    if (!container) return;
    
    const markElements = container.querySelectorAll('mark[data-weave-cloze].weave-cloze-mark');
    logger.debug('[ObsidianRenderer]',`更新 ${markElements.length} 个挖空的显示状态`);
    
    markElements.forEach((mark) => {
      applyClozeDisplayState(mark as HTMLElement, shouldShow);
    });
  }

  onMount(() => {
    isMounted = true;  //  标记组件已挂载
    logger.debug('[ObsidianRenderer]','onMount - 组件已挂载');
    // 初次渲染由 $effect 监听 content 变化自动触发（previousContent 初始为 ''，检测到变化后调度 renderContent）
    // 不在此处重复调度，避免双重渲染导致卡片切换时内容抖动
  });

  onDestroy(() => {
    isMounted = false;  //  标记组件已卸载（防止异步渲染继续）
    
    removeFootnotePopover();

    if (component) {
      component.unload();
      component = null;
    }
  });
</script>

<div 
  class="weave-obsidian-renderer markdown-reading-view markdown-rendered"
  class:rendering={isRendering}
  class:has-error={!!renderError}
  bind:this={container}
>
  {#if isRendering}
    <div class="weave-render-loading">
      <div class="loading-spinner"></div>
      <span class="loading-text">正在渲染内容...</span>
    </div>
  {/if}
</div>

<style>
  .weave-obsidian-renderer {
    width: 100%;
    min-height: 1rem;
    position: relative;
    line-height: 1.6;
    color: var(--text-normal);
  }

  .weave-obsidian-renderer.rendering {
    opacity: 0.7;
    pointer-events: none;
  }

  .weave-obsidian-renderer.has-error {
    border: 1px solid var(--text-error);
    border-radius: var(--radius-s);
    background: var(--background-modifier-error);
  }

  /* 加载状态 */
  .weave-render-loading {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
    color: var(--text-muted);
    font-size: var(--font-ui-smaller);
  }

  .loading-spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid var(--background-modifier-border);
    border-top: 2px solid var(--interactive-accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .loading-text {
    font-size: 0.875rem;
  }

  /* 错误状态 */
  :global(.weave-render-error) {
    padding: 1rem;
    text-align: center;
    color: var(--text-error);
  }

  :global(.error-icon) {
    font-size: 1.5rem;
    margin-bottom: 0.5rem;
  }

  :global(.error-message) {
    font-weight: 600;
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
  }

  :global(.error-fallback) {
    font-size: 0.75rem;
    color: var(--text-muted);
    background: var(--background-secondary);
    padding: 0.5rem;
    border-radius: var(--radius-s);
    white-space: pre-wrap;
    text-align: left;
  }

  /* 挖空样式，基于 Obsidian 的 <mark> 元素 */
  :global(.weave-cloze-mark) {
    padding: 2px 6px;
    margin: 0 2px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.3s ease;
    position: relative;
    display: inline-block;
  }

  :global(.weave-cloze-mark.weave-cloze-input-mode) {
    padding: 0;
    margin: 0 2px;
    background: transparent;
    border: none;
    box-shadow: none;
    vertical-align: baseline;
  }

  :global(.weave-cloze-input) {
    min-width: 4ch;
    max-width: min(32rem, calc(100vw - 6rem));
    padding: 2px 8px;
    border-radius: 6px;
    border: 1.5px dashed color-mix(in srgb, var(--interactive-accent, #3b82f6) 70%, transparent);
    background: color-mix(in srgb, var(--background-secondary) 92%, transparent);
    color: var(--text-normal);
    font: inherit;
    line-height: 1.4;
    text-align: center;
    box-sizing: border-box;
    outline: none;
    transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  }

  :global(.weave-cloze-input:focus) {
    border-color: var(--interactive-accent, #3b82f6);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--interactive-accent, #3b82f6) 20%, transparent);
    background: color-mix(in srgb, var(--background-primary) 88%, transparent);
  }

  /* 隐藏状态 - 使用半透明背景和模糊文本 */
  :global(.weave-cloze-mark.weave-cloze-hidden) {
    background: linear-gradient(135deg,
      rgba(255, 165, 0, 0.3) 0%,
      rgba(255, 165, 0, 0.15) 100%);
    color: transparent;
    text-shadow: 0 0 8px rgba(0, 0, 0, 0.3);
    border: 1px dashed var(--color-orange, #ff8c00);
    user-select: none;
  }

  /* 悬停时临时显示 */
  :global(.weave-cloze-mark.weave-cloze-hidden:hover) {
    background: linear-gradient(135deg,
      rgba(255, 165, 0, 0.5) 0%,
      rgba(255, 165, 0, 0.25) 100%);
    color: var(--text-normal);
    text-shadow: none;
    border: 1px solid var(--color-orange, #ff8c00);
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  /* 焦点状态 */
  :global(.weave-cloze-mark.weave-cloze-hidden:focus) {
    outline: 2px solid var(--color-orange, #ff8c00);
    outline-offset: 2px;
  }

  /*  移除 !important：已显示状态使用更具体的选择器 */
  .weave-obsidian-renderer :global(.weave-cloze-mark.weave-cloze-revealed),
  .weave-obsidian-renderer :global(.weave-cloze-mark.weave-cloze-revealed:hover) {
    background: linear-gradient(135deg,
      rgba(16, 185, 129, 0.2) 0%,
      rgba(16, 185, 129, 0.1) 100%);
    color: var(--text-normal);
    text-shadow: none;
    border: 1px solid var(--color-green, #10b981);
    user-select: text;
    transform: none;
    animation: revealAnimation 0.3s ease-out;
  }

  .weave-obsidian-renderer :global(.weave-cloze-mark.weave-cloze-revealed.weave-cloze-correct),
  .weave-obsidian-renderer :global(.weave-cloze-mark.weave-cloze-revealed.weave-cloze-correct:hover) {
    background: linear-gradient(135deg,
      rgba(16, 185, 129, 0.25) 0%,
      rgba(16, 185, 129, 0.12) 100%);
    border-color: #10b981;
    box-shadow: 0 0 0 1px rgba(16, 185, 129, 0.18);
  }

  .weave-obsidian-renderer :global(.weave-cloze-mark.weave-cloze-revealed.weave-cloze-incorrect),
  .weave-obsidian-renderer :global(.weave-cloze-mark.weave-cloze-revealed.weave-cloze-incorrect:hover) {
    background: linear-gradient(135deg,
      rgba(239, 68, 68, 0.22) 0%,
      rgba(239, 68, 68, 0.1) 100%);
    border-color: #ef4444;
    box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.16);
  }

  :global(.weave-cloze-mark.weave-cloze-correct::after),
  :global(.weave-cloze-mark.weave-cloze-incorrect::after) {
    margin-left: 6px;
    font-size: 0.8em;
    font-weight: 700;
    vertical-align: middle;
  }

  :global(.weave-cloze-mark.weave-cloze-correct::after) {
    content: '✓';
    color: #10b981;
  }

  :global(.weave-cloze-mark.weave-cloze-incorrect::after) {
    content: '×';
    color: #ef4444;
  }

  @keyframes revealAnimation {
    0% {
      opacity: 0;
      transform: scale(0.95);
    }
    50% {
      opacity: 1;
      transform: scale(1.02);
    }
    100% {
      opacity: 1;
      transform: scale(1);
    }
  }

  /*  带提示的挖空样式（Anki格式：{{c1::text::hint}}） */
  :global(.weave-cloze-mark[data-hint]) {
    position: relative;
  }

  /* 提示图标：在挖空右上角显示小图标 */
  :global(.weave-cloze-mark[data-hint]::after) {
    content: '💡';
    position: absolute;
    top: -8px;
    right: -8px;
    font-size: 10px;
    opacity: 0.6;
    pointer-events: none;
    transition: opacity 0.2s ease;
  }

  /* 悬停时提示图标更明显 */
  :global(.weave-cloze-mark[data-hint]:hover::after) {
    opacity: 1;
  }

  /* 带提示的挖空使用特殊的边框样式 */
  :global(.weave-cloze-mark[data-hint].weave-cloze-hidden) {
    border-style: dotted;
    border-width: 2px;
  }

  /* 显示提示信息的tooltip样式增强 */
  :global(.weave-cloze-mark[data-hint][title]:hover) {
    cursor: help;
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    :global(.weave-cloze-mark) {
      padding: 4px 8px;
      margin: 2px;
      min-height: 32px;
      display: inline-flex;
      align-items: center;
    }
  }

  /* 减少动画偏好 */
  @media (prefers-reduced-motion: reduce) {
    .loading-spinner {
      animation: none;
    }

    :global(.weave-cloze-mark) {
      transition: none;
    }

    :global(.weave-cloze-revealed) {
      animation: none;
    }
  }

  /* 高对比度模式 */
  @media (prefers-contrast: high) {
    :global(.weave-cloze-mark.weave-cloze-hidden) {
      background: var(--color-orange, #ff8c00);
      color: var(--text-on-accent);
      border: 2px solid var(--text-normal);
    }

    :global(.weave-cloze-mark.weave-cloze-revealed) {
      background: var(--color-green, #10b981);
      color: var(--text-on-accent);
      border: 2px solid var(--text-normal);
    }
  }

  /* 脚注样式 */
  /* 脚注引用（上标数字） */
  :global(.footnote-ref) {
    color: var(--text-accent);
    text-decoration: none;
    cursor: pointer;
    font-size: 0.75em;
    vertical-align: super;
    padding: 0 2px;
    transition: color 0.2s ease;
  }

  :global(.footnote-ref:hover) {
    color: var(--text-accent-hover);
    text-decoration: underline;
  }

  /* 脚注内容区域 */
  :global(.footnotes) {
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid var(--background-modifier-border);
    font-size: 0.9em;
    color: var(--text-muted);
  }

  :global(.footnotes ol) {
    padding-left: 1.5rem;
    margin: 0;
  }

  :global(.footnotes li) {
    margin-bottom: 0.5rem;
    line-height: 1.6;
  }

  /* 脚注返回链接 */
  :global(.footnote-backref) {
    color: var(--text-accent);
    text-decoration: none;
    margin-left: 0.25rem;
    cursor: pointer;
    transition: color 0.2s ease;
  }

  :global(.footnote-backref:hover) {
    color: var(--text-accent-hover);
  }

  /* 脚注高亮效果 */
  :global(.footnote-highlighted) {
    background: color-mix(in srgb, var(--text-accent) 20%, transparent);
    transition: background 0.3s ease;
    border-radius: 4px;
    padding: 0.25rem;
  }

  /* 脚注引用高亮（上标数字） */
  :global(a.footnote-ref.footnote-highlighted),
  :global(sup .footnote-highlighted) {
    background: color-mix(in srgb, var(--text-accent) 25%, transparent);
    padding: 2px 4px;
    border-radius: 3px;
    transition: background 0.3s ease;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--text-accent) 15%, transparent);
  }

  /* 脚注内容使用更具体的选择器，避免依赖 !important */
  .weave-obsidian-renderer :global(.weave-qa-content .footnotes),
  .weave-obsidian-renderer :global(.weave-cloze-content .footnotes),
  .weave-obsidian-renderer :global(.weave-choice-content .footnotes) {
    display: block;
    visibility: visible;
  }

  /* Ctrl+hover 脚注弹窗样式 */
  :global(.weave-footnote-popover) {
    position: fixed;
    z-index: var(--layer-popover, 400);
    max-width: 420px;
    min-width: 180px;
    padding: 0;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    pointer-events: auto;
    animation: footnotePopIn 0.15s ease-out;
  }

  :global(.weave-footnote-popover-content) {
    padding: 0.625rem 0.875rem;
    font-size: 0.875rem;
    line-height: 1.6;
    color: var(--text-normal);
    max-height: 300px;
    overflow-y: auto;
  }

  :global(.weave-footnote-popover-content p) {
    margin: 0 0 0.25rem;
  }

  :global(.weave-footnote-popover-content p:last-child) {
    margin-bottom: 0;
  }

  @keyframes footnotePopIn {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* 表格边框样式，保证 Obsidian 表格在预览态显示一致 */
  .weave-obsidian-renderer :global(table) {
    border-collapse: collapse;
    margin: 1em 0;
  }

  .weave-obsidian-renderer :global(.weave-table-scroll) {
    overflow-x: auto;
    max-width: 100%;
    -webkit-overflow-scrolling: touch;
  }

  .weave-obsidian-renderer :global(.weave-table-scroll > table) {
    width: max-content;
    min-width: 100%;
    max-width: none;
  }

  .weave-obsidian-renderer :global(table th),
  .weave-obsidian-renderer :global(table td) {
    border: 1px solid var(--background-modifier-border);
    padding: 8px 12px;
    text-align: left;
  }

  .weave-obsidian-renderer :global(table th) {
    background: var(--background-secondary);
    font-weight: 600;
  }

  .weave-obsidian-renderer :global(table tr:nth-child(even)) {
    background: var(--background-secondary-alt, var(--background-primary-alt));
  }

  .weave-obsidian-renderer :global(table tr:hover) {
    background: var(--background-modifier-hover);
  }
</style>
