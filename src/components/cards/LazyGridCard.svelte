<!--
  懒渲染网格卡片组件
  只在进入视口时才真正渲染Markdown内容
  默认显示骨架屏，性能极佳
-->
<script lang="ts">
  import { logger } from '../../utils/logger';

  import { onMount } from 'svelte';
  import { MarkdownRenderer, Component, Platform, Notice } from 'obsidian';
  import type { Card } from '../../data/types';
  import type { WeavePlugin } from '../../main';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';
  import { stripClozeForDisplay } from '../../utils/cloze-utils';
  import { getCardFieldContent } from '../../utils/card-field-helper';
  import { extractBodyContent, parseSourceInfo } from '../../utils/yaml-utils';
  import { normalizeCanvasNodeId } from '../../services/ui/canvas-source-locate';
  import { getQuestionTypeLabelFromCard } from '../../utils/question-type-utils';
  import { buildWeaveCardReferenceToken } from '../../utils/weave-card-reference';

  type GridCardAttributeType = 'none' | 'uuid' | 'source' | 'priority' | 'retention' | 'modified' | 'accuracy' | 'question_type' | 'ir_state' | 'ir_priority';
  
  interface Props {
    card: Card;
    selected?: boolean;
    emphasized?: boolean;
    plugin: WeavePlugin;
    layoutMode?: 'fixed' | 'masonry';
    attributeType?: GridCardAttributeType;
    isMobile?: boolean; // 从父组件传递移动端状态
    onClick?: (card: Card) => void;
    onEdit?: (card: Card) => void;
    onDelete?: (card: Card) => void;
    onView?: (card: Card) => void;
    onConvertToMarkdown?: (card: Card) => void;
    onSourceJump?: (card: Card) => void; // 源文档跳转
    onLongPress?: (card: Card) => void; // 长按触发多选
  }

  let {
    card,
    selected = false,
    emphasized = false,
    plugin,
    layoutMode = 'fixed',
    attributeType = 'uuid',
    isMobile: isMobileProp = false, // 接收父组件传递的移动端状态
    onClick,
    onEdit,
    onDelete,
    onView,
    onConvertToMarkdown,
    onSourceJump,
    onLongPress
  }: Props = $props();
  
  // 移动端检测函数 - 必须在使用前定义
  function detectMobile(): boolean {
    // 1. 如果 prop 已经是 true，直接返回
    if (isMobileProp) {
      return true;
    }
    // 2. Platform.isMobile - Obsidian 官方 API（最可靠）
    if (Platform.isMobile) {
      return true;
    }
    // 3. body classes - Obsidian 移动端会添加这些类
    if (typeof document !== 'undefined') {
      const body = document.body;
      if (body.classList.contains('is-mobile') || 
          body.classList.contains('is-phone') || 
          body.classList.contains('is-tablet')) {
        return true;
      }
    }
    // 4. 触摸屏检测（备用方案）
    if (typeof window !== 'undefined' && 'ontouchstart' in window) {
      return true;
    }
    // 5. Platform API 检测（最后手段）
    try {
      const { Platform } = require('obsidian');
      if (Platform.isMobile) return true;
    } catch {}
    // 6. 屏幕宽度检测（移动端通常 < 768px）
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return true;
    }
    return false;
  }
  
  // 初始化时立即检测，保证首帧渲染拿到正确的平台状态
  let isMobile = $state(detectMobile());
  
  // 监听 prop 变化
  $effect(() => {
    if (isMobileProp) {
      isMobile = true;
    }
  });
  


  // 状态管理
  let cardElement = $state<HTMLElement>();
  let contentElement = $state<HTMLElement>();
  let hasRendered = $state(false); // 是否已渲染
  let isRendering = $state(false); // 正在渲染中
  let clickTimer: NodeJS.Timeout | null = null;
  let isHovered = $state(false);
  let contentComponent: Component | null = null;
  let renderedContentSignature = $state('');
  let observer: IntersectionObserver | null = null;
  
  // 长按检测状态
  let longPressTimer: NodeJS.Timeout | null = null;
  let isLongPressTriggered = $state(false);
  const LONG_PRESS_DURATION = 500; // 长按阈值：500ms
  const SIDEBAR_DRAG_LONG_PRESS_DURATION = 420;
  const SIDEBAR_DRAG_MOVE_TOLERANCE = 8;
  let isInSidebarMode = $state(false);
  let isDragReady = $state(false);
  let isDragging = $state(false);
  let pointerDownState: { x: number; y: number; pointerId: number } | null = null;
  
  // 移动端功能键显示状态（单击显示/隐藏）
  let showMobileActions = $state(false);

  // 计算属性
  const frontText = $derived(getCardFieldContent(card, 'front'));
  const backText = $derived(getCardFieldContent(card, 'back'));
  const sourceInfo = $derived.by(() => {
    if (!card.content) {
      return null;
    }
    return parseSourceInfo(card.content);
  });

  // 优先从 content 中读取来源信息，并兼容历史字段
  const sourceDocument = $derived.by(() => {
    const contentSourceFile = sourceInfo?.sourceFile?.trim();
    if (contentSourceFile) {
      return contentSourceFile.replace(/\.md$/, '');
    }

    // 兼容旧版 sourceFile 字段
    if (card.sourceFile) {
      return card.sourceFile.replace(/\.md$/, '');
    }

    const legacySourceDocument = getCardFieldContent(card, 'source_document').trim();
    if (legacySourceDocument) return legacySourceDocument;

    return '';
  });
  
  // 渐进式挖空内容优先使用 card.content
  const fullContent = $derived.by(() => {
    if (card.content && card.content.trim()) {
      return stripClozeForDisplay(card.content);
    }
    
    // 回退到 fields（兼容 Anki 同步格式）
    const front = frontText.trim();
    const back = backText.trim();
    
    if (!front && !back) return '';
    if (!back) return stripClozeForDisplay(front);
    
    const merged = `${front}\n\n---\n\n${back}`;
    return stripClozeForDisplay(merged);
  });

  function normalizeGridPreviewMarkdown(markdown: string): string {
    const normalized = String(markdown || '')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+\n/g, '\n');

    const compactedFencedBlocks = normalized.replace(
      /(^|\n)([`~]{3,})([^\n]*)\n([\s\S]*?)\n\2(?=\n|$)/g,
      (_match, prefix: string, fence: string, info: string, body: string) => {
        const compactedBody = String(body || '')
          .replace(/^\n+|\n+$/g, '')
          .replace(/\n{3,}/g, '\n\n');

        return `${prefix}${fence}${info}\n${compactedBody}\n${fence}`;
      }
    );

    return compactedFencedBlocks
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  const previewContent = $derived.by(() => normalizeGridPreviewMarkdown(fullContent));

  const dragContent = $derived.by(() => {
    const rawContent = String(card.content || '').trim();
    if (rawContent) {
      const body = extractBodyContent(rawContent).trim();
      if (body) {
        return body;
      }
    }

    const front = frontText.trim();
    const back = backText.trim();
    if (front && back) {
      return `${front}\n\n---\n\n${back}`;
    }
    return front || back || fullContent || '';
  });

  const sourceBlockId = $derived.by(() => {
    const block = sourceInfo?.sourceBlock?.trim();
    if (block) return normalizeCanvasNodeId(block) || '';
    if (card.sourceBlock) return normalizeCanvasNodeId(String(card.sourceBlock).trim()) || '';
    return '';
  });
  
  // 获取源文件路径
  const sourcePath = $derived.by(() => {
    const contentSourceFile = sourceInfo?.sourceFile?.trim();
    if (contentSourceFile) {
      return contentSourceFile.endsWith('.md') ? contentSourceFile : `${contentSourceFile}.md`;
    }
    if (card.sourceFile) {
      return card.sourceFile.endsWith('.md') ? card.sourceFile : `${card.sourceFile}.md`;
    }
    if (card.customFields?.obsidianFilePath) {
      return card.customFields.obsidianFilePath as string;
    }
    const legacySourceDocument = getCardFieldContent(card, 'source_document').trim();
    if (legacySourceDocument) {
      return legacySourceDocument.endsWith('.md')
        ? legacySourceDocument
        : `${legacySourceDocument}.md`;
    }
    return '';
  });
  
  // 检查是否有源文档可跳转（使用 sourceDocument 的结果）
  const hasSourceDocument = $derived.by(() => {
    return !!sourceDocument;
  });
  
  // UUID 显示格式
  const fullUuid = $derived.by(() => String(card.uuid || '').trim());

  const displayUuid = $derived.by(() => {
    const uuid = fullUuid;
    if (uuid.length > 12) {
      return `${uuid.slice(0, 8)}...${uuid.slice(-4)}`;
    }
    return uuid;
  });

  const canCopyReference = $derived.by(() => attributeType === 'uuid' && fullUuid.length > 0);
  
  // 根据属性类型获取显示内容
  const attributeDisplay = $derived.by(() => {
    if (attributeType === 'none') return null;
    
    switch (attributeType) {
      case 'uuid':
        return { label: 'ID', value: displayUuid, icon: 'hash' };
      
      case 'source':
        const source = sourceDocument || '未知来源';
        return { label: '来源', value: source.length > 20 ? source.slice(0, 20) + '...' : source, icon: null };
      
      case 'priority':
        const priority = card.priority || 0;
        const priorityText = priority === 3 ? '高' : priority === 2 ? '中' : priority === 1 ? '低' : '无';
        return { label: '优先级', value: priorityText, icon: 'flag' };
      
      case 'retention':
        const retention = card.fsrs?.retrievability ? Math.round(card.fsrs.retrievability * 100) : 0;
        return { label: '记忆率', value: `${retention}%`, icon: 'activity' };
      
      case 'modified':
        const modifiedStr = card.modified || card.created || new Date().toISOString();
        const date = new Date(modifiedStr);
        const formattedDate = `${date.getMonth() + 1}/${date.getDate()}`;
        return { label: '修改', value: formattedDate, icon: 'clock' };
      
      case 'accuracy':
        const testStats = card.stats?.testStats as { accuracy?: number } | undefined;
        if (!testStats) return { label: '正确率', value: '-', icon: 'target' };
        const percent = Math.round((testStats.accuracy ?? 0) * 100);
        return { label: '正确率', value: `${percent}%`, icon: 'target' };
      
      case 'question_type':
        return { label: '题型', value: getQuestionTypeLabelFromCard(card, 'short', '-'), icon: 'list-checks' };
      
      case 'ir_state':
        const irState = (card as any).ir_state || '';
        const stateMap: Record<string, string> = { 'new': '新', 'queued': '排队', 'active': '学习中', 'suspended': '暂停', 'done': '完成' };
        return { label: '状态', value: stateMap[irState] || irState || '-', icon: 'book-open' };
      
      case 'ir_priority':
        const irPri = (card as any).ir_priority;
        const irPriText = irPri === 1 ? '低' : irPri === 2 ? '中' : irPri === 3 ? '高' : irPri != null ? String(irPri) : '-';
        return { label: 'IR优先级', value: irPriText, icon: 'signal' };
      
      default:
        return null;
    }
  });

  async function copyTextToClipboard(text: string): Promise<boolean> {
    const normalizedText = String(text || '');
    if (!normalizedText) {
      return false;
    }

    try {
      await navigator.clipboard.writeText(normalizedText);
      return true;
    } catch {}

    try {
      const textArea = document.createElement('textarea');
      textArea.value = normalizedText;
      textArea.setAttribute('readonly', 'true');
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      textArea.style.pointerEvents = 'none';
      document.body.appendChild(textArea);
      textArea.select();
      textArea.setSelectionRange(0, normalizedText.length);
      const copied = document.execCommand('copy');
      document.body.removeChild(textArea);
      return copied;
    } catch {
      return false;
    }
  }

  async function handleAttributeClick(event: MouseEvent): Promise<void> {
    if (!canCopyReference) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const copied = await copyTextToClipboard(buildWeaveCardReferenceToken(fullUuid));
    new Notice(copied ? '已复制关联卡片引用' : '复制失败，请手动复制', copied ? 2000 : 3000);
  }

  function disposeRenderedContent(): void {
    contentComponent?.unload();
    contentComponent = null;
    renderedContentSignature = '';
    contentElement?.replaceChildren();
  }

  /**
   * 渲染 Markdown 内容
   */
  async function renderMarkdown() {
    if (!contentElement || !plugin?.app || isRendering) {
      return;
    }

    const currentSignature = `${card.uuid || ''}|${card.modified || ''}|${sourcePath || ''}|${previewContent}`;
    if (contentComponent && renderedContentSignature === currentSignature) {
      return;
    }
    
    isRendering = true;
    
    try {
      if (contentComponent) {
        disposeRenderedContent();
      } else {
        contentElement.replaceChildren();
      }
      
      const component = new Component();
      component.load();
      
      const content = previewContent;
      
      await MarkdownRenderer.render(
        plugin.app,
        content,
        contentElement,
        sourcePath,
        component
      );
      
      contentComponent = component;
      renderedContentSignature = currentSignature;
      
    } catch (error) {
      logger.error('[LazyGridCard] Render failed:', error);
      if (contentElement) {
        // 降级处理：显示纯文本（previewContent 已压缩预览空白）
        contentElement.textContent = previewContent;
      }
      renderedContentSignature = currentSignature;
    } finally {
      isRendering = false;
    }
  }

  /**
   * 处理卡片点击
   * 桌面端：单击 = 选中/跳转（根据模式），双击 = 编辑
   * 移动端：单击 = 显示/隐藏功能键，双击 = 编辑，长按 = 多选
   */
  function handleCardClick(event: MouseEvent) {
    // 如果点击的是标签、源文档显示区或操作按钮，忽略点击
    if ((event.target as HTMLElement).closest('.card-source, .card-actions')) {
      return;
    }
    
    // 如果刚触发了长按，忽略这次点击
    if (isLongPressTriggered) {
      isLongPressTriggered = false;
      return;
    }

    // 移动端和桌面端统一处理：双击编辑
    if (clickTimer) {
      // 双击触发编辑
      clearTimeout(clickTimer);
      clickTimer = null;
      // 移动端双击时隐藏功能键
      if (isMobile) {
        showMobileActions = false;
      }
      onEdit?.(card);
      return;
    }
    
    // 首次点击，设置延迟触发单击事件
    clickTimer = setTimeout(() => {
      if (isMobile) {
        // 移动端：单击切换功能键显示状态
        showMobileActions = !showMobileActions;
        
        // 如果显示了功能键，通知其他卡片隐藏它们的功能键
        if (showMobileActions) {
          window.dispatchEvent(new CustomEvent('Weave:hide-other-card-actions', {
            detail: { cardUuid: card.uuid }
          }));
        }
      } else {
        // 桌面端：单击选中
        onClick?.(card);
      }
      clickTimer = null;
    }, 250);
  }
  
  /**
   * 监听其他卡片的功能键隐藏事件
   */
  function handleHideOtherCardActions(event: CustomEvent<{ cardUuid: string }>) {
    // 如果不是当前卡片触发的事件，隐藏本卡片的功能键
    if (event.detail.cardUuid !== card.uuid) {
      showMobileActions = false;
    }
  }

  function handleMouseEnter() {
    isHovered = true;
  }

  function handleMouseLeave() {
    isHovered = false;
  }
  
  function handleEdit(event: MouseEvent) {
    onEdit?.(card);
  }
  
  function handleDelete(event: MouseEvent) {
    onDelete?.(card);
  }
  
  function handleView(event: MouseEvent) {
    onView?.(card);
  }

  function handleConvertToMarkdown(event: MouseEvent) {
    onConvertToMarkdown?.(card);
  }
  
  // 处理源文档跳转
  function handleSourceJump(event: MouseEvent) {
    onSourceJump?.(card);
  }

  function toDisplaySourcePath(path: string): string {
    if (!path) return '';
    return path.toLowerCase().endsWith('.md') ? path.slice(0, -3) : path;
  }

  function buildSourceLink(): string {
    const path = String(sourcePath || '').trim();
    if (!path) return '';

    const normalizedPath = toDisplaySourcePath(path);
    const blockId = sourceBlockId;
    if (!blockId) {
      return `[[${normalizedPath}]]`;
    }
    return `[[${normalizedPath}#^${blockId}]]`;
  }

  function buildDragText(includeSourceLink: boolean): string {
    const content = dragContent.trim();
    if (!includeSourceLink || !content) {
      return content;
    }

    const sourceLink = buildSourceLink();
    if (!sourceLink) {
      return content;
    }

    return `${content}\n\n> 来源：${sourceLink}`;
  }

  function updateSidebarMode(): void {
    isInSidebarMode = !!cardElement?.closest('.weave-app.is-in-sidebar');
    if (!isInSidebarMode) {
      isDragReady = false;
      isDragging = false;
    }
  }

  function clearSidebarDragLongPress(resetReady = true): void {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    pointerDownState = null;
    if (resetReady) {
      isDragReady = false;
    }
  }

  function handlePointerDown(event: PointerEvent): void {
    if (!isInSidebarMode) return;
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest('.card-actions, button, a, input, textarea')) {
      return;
    }

    clearSidebarDragLongPress();
    isLongPressTriggered = false;
    pointerDownState = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
    };

    longPressTimer = setTimeout(() => {
      isDragReady = true;
      isLongPressTriggered = true;
      longPressTimer = null;
    }, SIDEBAR_DRAG_LONG_PRESS_DURATION);
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!isInSidebarMode || !pointerDownState) return;
    if (pointerDownState.pointerId !== event.pointerId) return;
    if (isDragReady) return;

    const dx = event.clientX - pointerDownState.x;
    const dy = event.clientY - pointerDownState.y;
    if (Math.hypot(dx, dy) > SIDEBAR_DRAG_MOVE_TOLERANCE) {
      clearSidebarDragLongPress();
    }
  }

  function handlePointerUp(): void {
    if (!isInSidebarMode) return;
    clearSidebarDragLongPress();
  }

  function handleDragStart(event: DragEvent): void {
    if (!isInSidebarMode || !isDragReady || !event.dataTransfer) {
      event.preventDefault();
      return;
    }

    const includeSourceLink = !!(event.ctrlKey || event.metaKey);
    const content = buildDragText(includeSourceLink);
    if (!content) {
      event.preventDefault();
      isDragReady = false;
      isLongPressTriggered = false;
      return;
    }

    const payload = {
      uuid: card.uuid,
      sourcePath: sourcePath || undefined,
      sourceLink: buildSourceLink() || undefined,
      includeSourceLink,
      content,
    };

    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.dropEffect = 'copy';
    event.dataTransfer.setData('text/plain', content);
    event.dataTransfer.setData('text/markdown', content);
    event.dataTransfer.setData('application/x-weave-card-content', JSON.stringify(payload));
    isDragging = true;
  }

  function handleDragEnd(): void {
    isDragging = false;
    isDragReady = false;
    isLongPressTriggered = false;
    clearSidebarDragLongPress(false);
  }
  
  // 长按开始（触摸开始）
  function handleTouchStart(event: TouchEvent) {
    if (isInSidebarMode) return;
    if (!isMobile || !onLongPress) return;
    
    isLongPressTriggered = false;
    
    longPressTimer = setTimeout(() => {
      isLongPressTriggered = true;
      // 触发长按回调（多选）
      onLongPress(card);
      // 震动反馈（如果支持）
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, LONG_PRESS_DURATION);
  }
  
  // 长按结束（触摸结束/取消）
  function handleTouchEnd() {
    if (isInSidebarMode) return;
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }
  
  // 触摸移动时取消长按
  function handleTouchMove() {
    if (isInSidebarMode) return;
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  /**
   * 监听hasRendered变化，当为true时渲染Markdown
   */
  $effect(() => {
    const renderSignature = `${card.uuid || ''}|${card.modified || ''}|${sourcePath || ''}|${previewContent}`;
    if (hasRendered && contentElement) {
      // 使用setTimeout确保DOM完全更新
      setTimeout(() => {
        void renderSignature;
        renderMarkdown();
      }, 0);
    }
  });

  /**
   * 组件挂载时设置Intersection Observer
   */
  onMount(() => {
    if (!cardElement) return;
    
    // 重新检测移动端状态
    // 优先使用父组件传递的值，否则自行检测
    if (!isMobile) {
      isMobile = detectMobile();
    }
    updateSidebarMode();
    
    // 监听其他卡片的功能键隐藏事件
    window.addEventListener('Weave:hide-other-card-actions', handleHideOtherCardActions as EventListener);
    window.addEventListener('resize', updateSidebarMode);
    
    // 创建专属于这张卡片的Observer
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && !hasRendered) {
            // 标记为已渲染，防止重复
            hasRendered = true;
            
            // 渲染后断开观察，节省资源
            observer?.disconnect();
          }
        });
      },
      {
        root: null, // 使用视口
        rootMargin: '500px', // 提前500px开始渲染
        threshold: 0 // 任何部分进入范围就触发
      }
    );
    
    observer.observe(cardElement);
    
    return () => {
      observer?.disconnect();
      disposeRenderedContent();
      if (clickTimer) {
        clearTimeout(clickTimer);
      }
      // 清理长按定时器
      if (longPressTimer) {
        clearTimeout(longPressTimer);
      }
      // 移除事件监听
      window.removeEventListener('Weave:hide-other-card-actions', handleHideOtherCardActions as EventListener);
      window.removeEventListener('resize', updateSidebarMode);
    };
  });
  
  // 清理逻辑已在 onMount return 中统一处理
</script>

<div
  bind:this={cardElement}
  class="lazy-grid-card"
  class:selected
  class:emphasized
  class:hovered={isHovered}
  class:fixed-height={layoutMode === 'fixed'}
  class:masonry={layoutMode === 'masonry'}
  class:rendering={isRendering}
  class:drag-ready={isDragReady}
  class:dragging={isDragging}
  onclick={handleCardClick}
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  onpointercancel={handlePointerUp}
  ontouchstart={handleTouchStart}
  ontouchend={handleTouchEnd}
  ontouchcancel={handleTouchEnd}
  ontouchmove={handleTouchMove}
  ondragstart={handleDragStart}
  ondragend={handleDragEnd}
  draggable={isInSidebarMode}
  role="button"
  tabindex="0"
  onkeydown={(e) => e.key === 'Enter' && handleCardClick(e as any)}
>
  <!-- 选中标记 -->
  {#if selected}
    <div class="selected-indicator">
      <div class="checkmark-circle">
        <EnhancedIcon name="check" size={14} />
      </div>
    </div>
  {/if}

  {#if emphasized}
    <div class="current-card-indicator">
      <span>当前卡片</span>
    </div>
  {/if}

  <!-- 动态属性显示（左上角） -->
  {#if attributeDisplay}
    {#if canCopyReference}
      <button
        type="button"
        class="card-attribute card-attribute--clickable"
        title="点击复制关联卡片格式"
        aria-label="复制关联卡片格式"
        onclick={handleAttributeClick}
      >
        {#if attributeDisplay?.icon}
          <EnhancedIcon name={attributeDisplay.icon} size={12} />
        {/if}
        <span>{attributeDisplay?.value}</span>
      </button>
    {:else}
      <div class="card-attribute" title={attributeDisplay?.label}>
        {#if attributeDisplay?.icon}
          <EnhancedIcon name={attributeDisplay.icon} size={12} />
        {/if}
        <span>{attributeDisplay?.value}</span>
      </div>
    {/if}
  {/if}

  <!-- 功能菜单（右上角） -->
  <!-- 桌面端：悬停显示 -->
  <!-- 移动端：单击卡片显示/隐藏 -->
  <div 
    class="card-actions" 
    class:hovered={isHovered} 
    class:mobile={isMobile}
    class:mobile-visible={isMobile && showMobileActions}
  >
    {#if onSourceJump && hasSourceDocument}
      <button class="action-menu-item" onclick={handleSourceJump} title="跳转到源文档">
        <EnhancedIcon name="external-link" size={16} />
      </button>
    {/if}
    {#if onConvertToMarkdown}
      <button class="action-menu-item" onclick={handleConvertToMarkdown} title="转换为 MD">
        <EnhancedIcon name="markdown" size={16} />
      </button>
    {/if}
    {#if onEdit}
      <button class="action-menu-item" onclick={handleEdit} title="编辑">
        <EnhancedIcon name="edit" size={16} />
      </button>
    {/if}
    {#if onView}
      <button class="action-menu-item" onclick={handleView} title="查看">
        <EnhancedIcon name="eye" size={16} />
      </button>
    {/if}
    {#if onDelete}
      <button class="action-menu-item danger" onclick={handleDelete} title="删除">
        <EnhancedIcon name="trash-2" size={16} />
      </button>
    {/if}
  </div>

  <!-- 卡片内容 -->
  <div class="card-body">
    {#if hasRendered}
      <!-- 真正的Markdown渲染 -->
      <div 
        bind:this={contentElement}
        class="content-area markdown-rendered"
      ></div>
    {:else}
      <!-- 骨架屏占位 -->
      <div class="skeleton-placeholder">
        <div class="skeleton-line"></div>
        <div class="skeleton-line short"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line medium"></div>
      </div>
    {/if}
  </div>

  <!-- 选中遮罩 -->
  {#if selected}
    <div class="selected-overlay"></div>
  {/if}
</div>

<style>
  .lazy-grid-card {
    --weave-grid-card-border-color: var(
      --weave-card-border-color,
      var(--divider-color, var(--background-modifier-border-hover, var(--background-modifier-border, var(--text-faint))))
    );
    --weave-grid-card-hover-shadow: var(
      --shadow-s,
      0 2px 8px rgba(0, 0, 0, 0.12)
    );
    position: relative;
    background: var(--weave-surface-background, var(--background-primary));
    /*  不依赖变量，直接使用box-shadow实现边框 */
    border: none;
    border-radius: var(--weave-radius-lg);
    padding: var(--weave-space-md);
    cursor: pointer;
    transition: all 0.2s ease;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: inset 0 0 0 1px var(--weave-grid-card-border-color);
  }

  /* 固定高度模式 */
  .lazy-grid-card.fixed-height {
    height: 280px;
  }

  .lazy-grid-card.fixed-height .card-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
  }

  .lazy-grid-card.fixed-height .content-area {
    flex: 1 1 auto;
    min-height: 0;
    max-height: none;
  }

  .lazy-grid-card.fixed-height .skeleton-placeholder {
    flex: 1 1 auto;
    min-height: 0;
  }

  /* 瀑布流模式 */
  .lazy-grid-card.masonry {
    height: auto;
    min-height: 0;
  }

  .lazy-grid-card.masonry .card-body {
    flex: 0 0 auto;
  }

  .lazy-grid-card.masonry .content-area {
    flex: none;
  }

  .lazy-grid-card.masonry .content-area {
    max-height: none;
  }

  .lazy-grid-card.masonry .skeleton-placeholder {
    flex: none;
  }

  /* 由 Obsidian 主题变量统一驱动边框和悬停阴影，避免深浅色硬编码 */
  .lazy-grid-card:hover,
  .lazy-grid-card.hovered {
    box-shadow: 
      inset 0 0 0 1px var(--interactive-accent),
      var(--weave-grid-card-hover-shadow);
    transform: translateY(-1px);
  }

  /* 移动端禁用 hover 效果 - 避免触摸时触发浮动动画 */
  :global(body.is-mobile) .lazy-grid-card:hover,
  :global(body.is-phone) .lazy-grid-card:hover,
  :global(body.is-tablet) .lazy-grid-card:hover {
    transform: none;
  }
  
  /* 使用媒体查询作为备用方案 */
  @media (hover: none) and (pointer: coarse) {
    .lazy-grid-card:hover {
      transform: none;
    }
  }

  /* 选中效果 - 通用，更精细 */
  :global(body.theme-dark) .lazy-grid-card.selected,
  :global(body.theme-light) .lazy-grid-card.selected {
    box-shadow: 
      inset 0 0 0 2px var(--interactive-accent),
      0 0 0 1px color-mix(in srgb, var(--interactive-accent) 30%, transparent);
  }

  .lazy-grid-card.emphasized {
    animation: weave-card-focus-pulse 1.6s ease-out;
  }

  :global(body.theme-dark) .lazy-grid-card.emphasized,
  :global(body.theme-light) .lazy-grid-card.emphasized {
    box-shadow:
      inset 0 0 0 2px color-mix(in srgb, var(--interactive-accent) 88%, white 12%),
      0 0 0 3px color-mix(in srgb, var(--interactive-accent) 30%, transparent),
      0 0 22px color-mix(in srgb, var(--interactive-accent) 28%, transparent);
  }

  /* 选中标记 - 移至顶部中间 */
  .selected-indicator {
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10;
  }

  .checkmark-circle {
    width: 24px;
    height: 24px;
    background: var(--interactive-accent);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    box-shadow: var(--weave-shadow-sm);
  }

  .current-card-indicator {
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 24px;
    padding: 0 10px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--interactive-accent) 18%, var(--background-primary));
    color: var(--text-accent);
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, var(--interactive-accent) 38%, transparent),
      0 4px 12px color-mix(in srgb, var(--interactive-accent) 12%, transparent);
    font-size: var(--weave-font-size-xs);
    font-weight: 700;
    letter-spacing: 0.02em;
    white-space: nowrap;
    pointer-events: none;
  }

  .selected-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: color-mix(in srgb, var(--interactive-accent) 8%, transparent);
    pointer-events: none;
    z-index: 1;
  }

  @keyframes weave-card-focus-pulse {
    0% {
      transform: translateY(-1px) scale(0.992);
      box-shadow:
        inset 0 0 0 2px color-mix(in srgb, var(--interactive-accent) 95%, white 5%),
        0 0 0 0 color-mix(in srgb, var(--interactive-accent) 45%, transparent),
        0 0 0 0 color-mix(in srgb, var(--interactive-accent) 18%, transparent);
    }
    30% {
      transform: translateY(-2px) scale(1.01);
      box-shadow:
        inset 0 0 0 2px color-mix(in srgb, var(--interactive-accent) 88%, white 12%),
        0 0 0 5px color-mix(in srgb, var(--interactive-accent) 24%, transparent),
        0 10px 24px color-mix(in srgb, var(--interactive-accent) 20%, transparent);
    }
    100% {
      transform: translateY(0) scale(1);
    }
  }

  /* 卡片属性显示（左上角） */
  .lazy-grid-card .card-attribute {
    position: absolute;
    top: 8px;
    left: 8px;
    /*  固定高度，与右侧操作按钮对齐 */
    min-height: 28px;
    font-size: var(--weave-font-size-xs);
    font-weight: 500;
    color: var(--text-muted);
    /*  使用与卡片内容区相同的背景色，消除色差 */
    background: transparent;
    padding: 0;
    border-radius: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 4px;
    /*  移除边框，使用透明边框保持布局一致 */
    border: none;
    box-shadow: none;
    outline: none;
    appearance: none;
    -webkit-appearance: none;
    font-family: inherit;
    text-align: left;
    cursor: default;
    transition: all 0.2s ease;
  }

  .lazy-grid-card .card-attribute:hover {
    background: transparent;
    color: var(--text-normal);
  }

  .lazy-grid-card .card-attribute--clickable {
    cursor: pointer;
  }

  .lazy-grid-card .card-attribute--clickable:hover,
  .lazy-grid-card .card-attribute--clickable:focus-visible {
    outline: none;
    background: transparent;
    box-shadow: none;
    color: var(--interactive-accent);
    text-decoration: underline;
    text-underline-offset: 0.14em;
    text-decoration-thickness: 1px;
  }

  /* 功能菜单（右上角） */
  .card-actions {
    position: absolute;
    top: 8px;
    right: 8px;
    /*  固定高度，与左侧属性标签对齐 */
    height: 28px;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 4px;
    /* 桌面端默认隐藏，悬停时显示 */
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
  }

  /*  桌面端：悬停时显示功能键 */
  .lazy-grid-card:hover .card-actions:not(.mobile),
  .card-actions.hovered:not(.mobile) {
    opacity: 1;
    pointer-events: auto;
  }

  /* 移动端：单击卡片后显示功能键 */
  .card-actions.mobile-visible {
    opacity: 1;
    pointer-events: auto;
  }

  @keyframes slideInLeft {
    from {
      opacity: 0;
      transform: translateX(10px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  /*  操作按钮 - 使用 Obsidian clickable-icon 风格
   * 完全透明背景，无边框无阴影，仅在 hover/active 时显示背景
   * 通过高特异性选择器覆盖全局样式，避免使用 !important
   */
  .lazy-grid-card .card-actions .action-menu-item {
    /*  28px 尺寸，与左侧属性标签高度一致 */
    width: 28px;
    height: 28px;
    min-width: 28px;
    min-height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    /*  完全透明背景，像 Obsidian clickable-icon 一样 */
    background: transparent;
    border: none;
    box-shadow: none;
    outline: none;
    border-radius: var(--radius-s, 4px);
    cursor: pointer;
    color: var(--text-muted);
    transition: color 0.15s ease, background 0.15s ease;
  }

  .lazy-grid-card .card-actions .action-menu-item:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .lazy-grid-card .card-actions .action-menu-item.danger {
    color: var(--text-error);
  }

  .lazy-grid-card .card-actions .action-menu-item.danger:hover {
    background: color-mix(in srgb, var(--text-error) 15%, transparent);
  }
  
  /*  移动端按钮样式优化 - 更大的点击区域，但视觉尺寸与桌面端一致 */
  :global(body.is-mobile) .lazy-grid-card .card-actions .action-menu-item,
  :global(body.is-phone) .lazy-grid-card .card-actions .action-menu-item,
  :global(body.is-tablet) .lazy-grid-card .card-actions .action-menu-item {
    /*  视觉尺寸保持 28px，与左侧属性标签对齐 */
    width: 28px;
    height: 28px;
    min-width: 28px;
    min-height: 28px;
    /*  确保完全透明，无边框无阴影 */
    background: transparent;
    border: none;
    box-shadow: none;
    /*  通过 padding 扩大触控区域到 44px，但不影响视觉尺寸 */
    position: relative;
  }
  
  /*  移动端：使用伪元素扩大触控区域 */
  :global(body.is-mobile) .lazy-grid-card .card-actions .action-menu-item::before,
  :global(body.is-phone) .lazy-grid-card .card-actions .action-menu-item::before,
  :global(body.is-tablet) .lazy-grid-card .card-actions .action-menu-item::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 44px;
    height: 44px;
    border-radius: 50%;
  }
  
  :global(body.is-mobile) .lazy-grid-card .card-actions .action-menu-item:active,
  :global(body.is-phone) .lazy-grid-card .card-actions .action-menu-item:active,
  :global(body.is-tablet) .lazy-grid-card .card-actions .action-menu-item:active {
    transform: scale(0.92);
    background: var(--background-modifier-hover);
  }
  
  :global(body.is-mobile) .lazy-grid-card .card-actions,
  :global(body.is-phone) .lazy-grid-card .card-actions,
  :global(body.is-tablet) .lazy-grid-card .card-actions {
    gap: 2px;
  }

  /* 卡片主体 */
  .card-body {
    margin-top: 32px;
    flex: 1;
    display: flex;
    flex-direction: column;
    position: relative;
    z-index: 2;
    overflow: hidden;
  }

  .content-area {
    flex: 1;
    color: var(--text-normal);
    font-size: var(--weave-font-size-sm);
    line-height: 1.6;
    word-break: break-word;
    overflow: hidden;
  }

  /* 骨架屏 */
  .skeleton-placeholder {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: var(--weave-space-sm) 0;
  }

  .skeleton-line {
    height: 14px;
    background: linear-gradient(
      90deg,
      var(--background-modifier-border) 25%,
      var(--background-modifier-hover) 50%,
      var(--background-modifier-border) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite ease-in-out;
    border-radius: 4px;
  }

  .skeleton-line.short {
    width: 60%;
  }

  .skeleton-line.medium {
    width: 80%;
  }

  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  /* 渲染状态 */
  .lazy-grid-card.rendering {
    opacity: 0.9;
  }

  .lazy-grid-card.drag-ready {
    box-shadow:
      inset 0 0 0 2px color-mix(in srgb, var(--interactive-accent) 92%, white 8%),
      0 0 0 3px color-mix(in srgb, var(--interactive-accent) 18%, transparent),
      0 10px 24px color-mix(in srgb, var(--interactive-accent) 16%, transparent);
  }

  .lazy-grid-card.dragging {
    opacity: 0.72;
    cursor: grabbing;
    transform: scale(0.985);
  }

  /* Markdown 渲染样式 */
  .content-area.markdown-rendered :global(p) {
    margin: 0.25em 0;
  }

  .content-area.markdown-rendered :global(hr) {
    margin: var(--weave-space-md) 0;
    border: none;
    border-top: 2px dashed var(--weave-border);
    opacity: 0.5;
  }

  .content-area.markdown-rendered :global(pre) {
    margin: var(--weave-space-xs) 0;
    padding: 8px 10px;
  }

  .content-area.markdown-rendered :global(img),
  .content-area.markdown-rendered :global(video) {
    max-width: 100%;
    height: auto;
    border-radius: var(--weave-radius-sm);
    margin: var(--weave-space-xs) 0;
  }

</style>
