<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { MarkdownRenderer, Component } from 'obsidian';
  import type AnkiPlugin from '../../main';

  interface Props {
    plugin: AnkiPlugin;
    content: string;
    sourcePath?: string;
    enableClozeProcessing?: boolean;
    showClozeAnswers?: boolean;
    onRenderComplete?: (element: HTMLElement) => void;
    onRenderError?: (error: Error) => void;
  }

  let {
    plugin,
    content,
    sourcePath = '',
    enableClozeProcessing = false,
    showClozeAnswers = false,
    onRenderComplete,
    onRenderError
  }: Props = $props();

  let container: HTMLDivElement;
  let component: Component | null = null;
  let isRendering = $state(false);
  let renderError = $state<string | null>(null);
  let isMounted = $state(false);  // ✅ 新增：跟踪组件是否已挂载

  // 预处理挖空内容
  // ✅ 新逻辑：保留原始==text==格式，让Obsidian自然渲染为<mark>
  function preprocessClozeContent(rawContent: string): string {
    // 不再在预处理阶段替换内容，让Obsidian自然渲染高亮
    return rawContent;
  }

  // 后处理渲染内容
  // ✅ 新逻辑：处理Obsidian渲染的<mark>元素作为挖空
  function postProcessRenderedContent(element: HTMLElement): void {
    if (!enableClozeProcessing) return;

    // 查找所有Obsidian渲染的高亮元素（<mark>标签）
    const markElements = element.querySelectorAll('mark');
    
    markElements.forEach((mark, index) => {
      const markEl = mark as HTMLElement;
      
      // 添加挖空样式类
      markEl.classList.add('tuanki-cloze-mark');
      
      if (!showClozeAnswers) {
        // 未显示答案时，添加隐藏类
        markEl.classList.add('tuanki-cloze-hidden');
      } else {
        // 显示答案时，添加已显示类
        markEl.classList.add('tuanki-cloze-revealed');
      }
      
      // 添加可访问性属性
      markEl.setAttribute('tabindex', '0');
      markEl.setAttribute('role', 'button');
      markEl.setAttribute('aria-label', showClozeAnswers ? '答案已显示' : '点击或悬停显示答案');
      markEl.setAttribute('data-cloze-index', String(index));
      
      // 添加点击事件 - 切换单个挖空的显示状态
      markEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = e.currentTarget as HTMLElement;
        if (target.classList.contains('tuanki-cloze-hidden')) {
          target.classList.remove('tuanki-cloze-hidden');
          target.classList.add('tuanki-cloze-revealed');
          target.setAttribute('aria-label', '答案已显示');
        }
      });
    });
    
    console.log(`[ObsidianRenderer] 处理了 ${markElements.length} 个挖空标记`);
  }

  /**
   * 🔍 调试：打印完整的DOM树结构
   */
  function debugDOMStructure(element: HTMLElement): void {
    let current = element;
    const path: string[] = [];
    
    while (current && current !== document.body) {
      const classes = current.className ? `.${current.className.split(' ').join('.')}` : '';
      const dataType = current.getAttribute('data-type') ? `[data-type="${current.getAttribute('data-type')}"]` : '';
      const tag = current.tagName.toLowerCase();
      path.unshift(`${tag}${classes}${dataType}`);
      current = current.parentElement!;
    }
    
    console.log('[ObsidianRenderer] 📍 DOM路径:', path.join(' > '));
  }

  // 渲染Markdown内容
  async function renderContent(): Promise<void> {
    // ✅ 关键检查：防止组件卸载后继续渲染
    if (!isMounted || !container || !plugin?.app) {
      console.warn('[ObsidianRenderer] ⚠️ 跳过渲染：组件未挂载或缺少依赖', {
        isMounted,
        hasContainer: !!container,
        hasPlugin: !!plugin?.app,
        contentLength: content?.length ?? 0
      });
      return;
    }
    
    // 🔥 防止并发渲染
    if (isRendering) {
      console.warn('[ObsidianRenderer] ⚠️ 跳过渲染：上一次渲染尚未完成');
      return;
    }
    
    console.log('[ObsidianRenderer] ✅ 开始渲染内容:', {
      contentLength: content?.length ?? 0,
      sourcePath,
      enableClozeProcessing,
      showClozeAnswers
    });

    // 🔍 调试日志：检查DOM结构和渲染环境
    if (container) {
      debugDOMStructure(container);
      const workspaceLeaf = container.closest('.workspace-leaf-content');
      console.log('[ObsidianRenderer] 🔍 渲染环境检查:', {
        hasContainer: !!container,
        containerClasses: container.className,
        workspaceLeaf: !!workspaceLeaf,
        leafDataType: workspaceLeaf?.getAttribute('data-type'),
        hasPlugin: !!plugin?.app,
        contentLength: content.length,
        sourcePath,
        hasMainEditorMode: container.closest('.tuanki-main-editor-mode') !== null
      });
    }

    isRendering = true;
    renderError = null;

    try {
      // 清理之前的渲染
      if (component) {
        component.unload();
        component = null;
      }
      
      // ✅ 再次检查：在异步操作前确认组件仍然挂载
      if (!isMounted || !container) {
        console.log('[ObsidianRenderer] 渲染中止：组件已卸载');
        return;
      }
      
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
        sourcePath,
        component
      );

      // ✅ 最终检查：在加载组件前确认组件仍然挂载
      if (!isMounted || !component) {
        console.log('[ObsidianRenderer] 渲染完成但组件已卸载，跳过加载');
        if (component) {
          component.unload();
          component = null;
        }
        return;
      }

      // 加载组件
      component.load();

      // 后处理渲染内容
      postProcessRenderedContent(container);

      // 触发完成回调
      onRenderComplete?.(container);
      
      console.log('[ObsidianRenderer] ✅ 🎯 渲染成功', {
        contentLength: content.length,
        enableClozeProcessing,
        showClozeAnswers,
        timestamp: new Date().toLocaleTimeString(),
        containerHasContent: container.innerHTML.length > 0
      });

    } catch (error) {
      // ✅ 只在组件仍然挂载时处理错误
      if (!isMounted || !container) {
        console.log('[ObsidianRenderer] 渲染错误但组件已卸载，忽略');
        return;
      }
      
      console.error('[ObsidianRenderer] 渲染失败:', error);
      renderError = error instanceof Error ? error.message : '未知渲染错误';
      
      // 降级到简单HTML渲染
      container.innerHTML = `
        <div class="tuanki-render-error">
          <div class="error-icon">⚠️</div>
          <div class="error-message">内容渲染失败</div>
          <div class="error-fallback">${content}</div>
        </div>
      `;

      onRenderError?.(error instanceof Error ? error : new Error('渲染失败'));
    } finally {
      isRendering = false;
    }
  }

  // 🔥 使用安全的 $effect + 延迟执行，避免启动阻塞
  
  // 跟踪上一次渲染的内容，用于检测变化
  let previousContent = $state<string>('');
  let previousShowCloze = $state<boolean>(false);
  
  // 安全的内容变化监听（延迟执行，避免阻塞）
  $effect(() => {
    // 读取依赖以触发追踪
    const currentContent = content;
    const mounted = isMounted;
    
    if (mounted && currentContent !== undefined && currentContent !== previousContent) {
      console.log('[ObsidianRenderer] 内容变化，延迟渲染');
      previousContent = currentContent;
      // 延迟到下一个事件循环，避免阻塞启动
      setTimeout(() => renderContent(), 0);
    }
  });
  
  // 安全的挖空显示状态监听（延迟执行，避免阻塞）
  $effect(() => {
    // 读取依赖以触发追踪
    const shouldShow = showClozeAnswers;
    const mounted = isMounted;
    const processingEnabled = enableClozeProcessing;
    
    if (mounted && shouldShow !== previousShowCloze && processingEnabled) {
      console.log('[ObsidianRenderer] 挖空显示状态变化:', shouldShow);
      previousShowCloze = shouldShow;
      // 延迟执行，避免阻塞
      setTimeout(() => updateClozeDisplay(shouldShow), 100);
    }
  });
  
  // 独立的挖空显示更新函数
  function updateClozeDisplay(shouldShow: boolean): void {
    if (!container) return;
    
    const markElements = container.querySelectorAll('mark.tuanki-cloze-mark');
    console.log(`[ObsidianRenderer] 更新 ${markElements.length} 个挖空的显示状态`);
    
    markElements.forEach((mark) => {
      const markEl = mark as HTMLElement;
      if (shouldShow) {
        markEl.classList.remove('tuanki-cloze-hidden');
        markEl.classList.add('tuanki-cloze-revealed');
        markEl.setAttribute('aria-label', '答案已显示');
        markEl.style.cursor = 'default';
      } else {
        markEl.classList.add('tuanki-cloze-hidden');
        markEl.classList.remove('tuanki-cloze-revealed');
        markEl.setAttribute('aria-label', '点击或悬停显示答案');
        markEl.style.cursor = 'pointer';
      }
    });
  }

  onMount(() => {
    isMounted = true;  // ✅ 标记组件已挂载
    console.log('[ObsidianRenderer] onMount - 组件已挂载');
    
    // 🔥 安全的初次渲染：延迟执行避免阻塞启动
    setTimeout(() => {
      if (container && content !== undefined) {
        previousContent = content;
        previousShowCloze = showClozeAnswers;
        renderContent();
      }
    }, 0);
  });

  onDestroy(() => {
    isMounted = false;  // ✅ 标记组件已卸载（防止异步渲染继续）
    
    if (component) {
      component.unload();
      component = null;
    }
  });
</script>

<div 
  class="tuanki-obsidian-renderer markdown-reading-view"
  class:rendering={isRendering}
  class:has-error={!!renderError}
  bind:this={container}
>
  {#if isRendering}
    <div class="tuanki-render-loading">
      <div class="loading-spinner"></div>
      <span class="loading-text">正在渲染内容...</span>
    </div>
  {/if}
</div>

<style>
  .tuanki-obsidian-renderer {
    width: 100%;
    min-height: 1rem;
    position: relative;
    line-height: 1.6;
    color: var(--text-normal);
  }

  .tuanki-obsidian-renderer.rendering {
    opacity: 0.7;
    pointer-events: none;
  }

  .tuanki-obsidian-renderer.has-error {
    border: 1px solid var(--text-error);
    border-radius: var(--radius-s);
    background: var(--background-modifier-error);
  }

  /* 加载状态 */
  .tuanki-render-loading {
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
  :global(.tuanki-render-error) {
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

  /* ✅ 新挖空样式 - 基于Obsidian的<mark>元素 */
  :global(.tuanki-cloze-mark) {
    padding: 2px 6px;
    margin: 0 2px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.3s ease;
    position: relative;
    display: inline-block;
  }

  /* 隐藏状态 - 使用半透明背景和模糊文本 */
  :global(.tuanki-cloze-mark.tuanki-cloze-hidden) {
    background: linear-gradient(135deg,
      rgba(255, 165, 0, 0.3) 0%,
      rgba(255, 165, 0, 0.15) 100%);
    color: transparent;
    text-shadow: 0 0 8px rgba(0, 0, 0, 0.3);
    border: 1px dashed var(--color-orange, #ff8c00);
    user-select: none;
  }

  /* 悬停时临时显示 */
  :global(.tuanki-cloze-mark.tuanki-cloze-hidden:hover) {
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
  :global(.tuanki-cloze-mark.tuanki-cloze-hidden:focus) {
    outline: 2px solid var(--color-orange, #ff8c00);
    outline-offset: 2px;
  }

  /* 已显示状态 - 使用!important确保优先级最高 */
  :global(.tuanki-cloze-mark.tuanki-cloze-revealed),
  :global(.tuanki-cloze-mark.tuanki-cloze-revealed:hover) {
    background: linear-gradient(135deg,
      rgba(16, 185, 129, 0.2) 0%,
      rgba(16, 185, 129, 0.1) 100%) !important;
    color: var(--text-normal) !important;
    text-shadow: none !important;
    border: 1px solid var(--color-green, #10b981) !important;
    user-select: text !important;
    transform: none !important;
    animation: revealAnimation 0.3s ease-out;
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

  /* 响应式设计 */
  @media (max-width: 768px) {
    :global(.tuanki-cloze-mark) {
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

    :global(.tuanki-cloze-mark) {
      transition: none;
    }

    :global(.tuanki-cloze-revealed) {
      animation: none;
    }
  }

  /* 高对比度模式 */
  @media (prefers-contrast: high) {
    :global(.tuanki-cloze-mark.tuanki-cloze-hidden) {
      background: var(--color-orange, #ff8c00);
      color: var(--text-on-accent);
      border: 2px solid var(--text-normal);
    }

    :global(.tuanki-cloze-mark.tuanki-cloze-revealed) {
      background: var(--color-green, #10b981);
      color: var(--text-on-accent);
      border: 2px solid var(--text-normal);
    }
  }
</style>
