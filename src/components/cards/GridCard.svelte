<!--
  /**
   * 网格卡片组件 - 用于卡片管理页面的网格视图
   * 支持选中高亮、Obsidian 渲染、单击选中/双击编辑
  */
-->
<script lang="ts">
  import { logger } from '../../utils/logger';

  import { onMount, onDestroy, tick } from 'svelte';
  import { MarkdownRenderer, Component } from 'obsidian';
  import type { Card } from '../../data/types';
  import type { WeavePlugin } from '../../main';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';
  // 导入挖空处理工具
  import { stripClozeForDisplay } from '../../utils/cloze-utils';
  import { getCardFieldContent } from '../../utils/card-field-helper';

  interface Props {
    card: Card;
    selected?: boolean;
    plugin: WeavePlugin;
    layoutMode?: 'fixed' | 'masonry';
    viewContext?: 'grid' | 'kanban'; // 新增：区分网格视图和看板视图
    onClick?: (card: Card) => void;
    onEdit?: (card: Card) => void;
    onDelete?: (card: Card) => void;
    onView?: (card: Card) => void;
  }

  let {
    card,
    selected = false,
    plugin,
    layoutMode = 'fixed',
    viewContext = 'grid', // 默认为网格视图
    onClick,
    onEdit,
    onDelete,
    onView
  }: Props = $props();

  // 状态管理
  let contentElement = $state<HTMLElement>();
  let isRendering = $state(false);
  let clickTimer: NodeJS.Timeout | null = null;
  let isHovered = $state(false);
  let showMenu = $state(false);
  let contentComponent: Component | null = null;

  // 计算属性
  const frontText = $derived(getCardFieldContent(card, 'front'));
  const backText = $derived(getCardFieldContent(card, 'back'));
  const sourceDocument = $derived(getCardFieldContent(card, 'source_document'));
  
  // 合并完整内容，优先使用 content 字段
  // 渐进式挖空卡片的内容存储在 card.content，而非 fields
  const fullContent = $derived.by(() => {
    // 1. 优先使用原始 content 字段（包含渐进式挖空、语义标记等）
    if (card.content && card.content.trim()) {
      return stripClozeForDisplay(card.content);
    }
    
    // 2. 回退到 fields（Anki 同步格式的卡片）
    const front = frontText.trim();
    const back = backText.trim();
    
    if (!front && !back) return '';
    if (!back) return stripClozeForDisplay(front);
    
    const merged = `${front}\n\n---\n\n${back}`;
    return stripClozeForDisplay(merged);
  });
  
  // 获取源文件路径（用于正确解析相对路径的媒体文件）
  const sourcePath = $derived.by(() => {
    if (card.sourceFile) {
      return card.sourceFile.endsWith('.md') ? card.sourceFile : `${card.sourceFile}.md`;
    }
    if (card.customFields?.obsidianFilePath) {
      return card.customFields.obsidianFilePath as string;
    }
    const doc = sourceDocument.trim();
    if (doc) {
      return doc.endsWith('.md') ? doc : `${doc}.md`;
    }
    return '';
  });
  
  // UUID 显示格式：前8位-后4位
  const displayUuid = $derived.by(() => {
    const uuid = card.uuid;
    if (uuid.length > 12) {
      return `${uuid.slice(0, 8)}...${uuid.slice(-4)}`;
    }
    return uuid;
  });

  /**
   * 渲染 Markdown 内容 - 使用正确的 Obsidian API
   */
  async function renderContent(element: HTMLElement, content: string, component: Component | null): Promise<Component | null> {
    if (!element || !content || !plugin?.app) return null;
    
    isRendering = true;
    element.replaceChildren(); // 清空内容
    
    try {
      // 清理旧的组件实例
      if (component) {
        component.unload();
      }
      
      // 创建新的组件实例
      const newComponent = new Component();
      
      //  内容已在 fullContent 中处理挖空语法，直接使用
      //  使用正确的 Obsidian API
      await MarkdownRenderer.render(
        plugin.app,           // app 实例
        content,              //  已预处理的内容（来自 fullContent）
        element,              // 容器元素
        sourcePath,         // 源文件路径（关键！用于解析相对路径）
        newComponent          // Component 实例
      );
      
      // 加载组件（启用所有插件功能）
      newComponent.load();
      
      logger.debug('[GridCard] Markdown 渲染成功', {
        cardId: card.uuid,
        sourcePath: sourcePath,
        contentLength: content.length
      });
      
      return newComponent;
    } catch (error) {
      logger.error('[GridCard] Markdown 渲染失败:', error);
      //  降级处理：显示纯文本（已在 fullContent 中处理挖空语法）
      element.textContent = content;
      return null;
    } finally {
      isRendering = false;
    }
  }

  /**
   * 处理卡片点击
   * 单击：选中/取消选中
   * 双击：进入编辑
   */
  function handleCardClick(event: MouseEvent) {
    // 防止事件冒泡
    if ((event.target as HTMLElement).closest('.card-source, .card-actions')) {
      return;
    }

    if (clickTimer) {
      // 双击逻辑 - 直接编辑
      clearTimeout(clickTimer);
      clickTimer = null;
      onEdit?.(card);
    } else {
      // 单击逻辑 - 选中/取消选中
      clickTimer = setTimeout(() => {
        onClick?.(card);
        clickTimer = null;
      }, 250);
    }
  }

  /**
   * 处理悬停
   */
  function handleMouseEnter() {
    isHovered = true;
  }

  function handleMouseLeave() {
    isHovered = false;
    showMenu = false;
  }
  
  /**
   * 切换菜单显示
   */
  function toggleMenu(event: MouseEvent) {
    // Svelte 5: 菜单切换不需要 stopPropagation
    showMenu = !showMenu;
  }
  
  /**
   * 处理编辑
   */
  function handleEdit(event: MouseEvent) {
    // Svelte 5: 编辑操作不需要 stopPropagation
    showMenu = false;
    onEdit?.(card);
  }
  
  /**
   * 处理删除
   */
  function handleDelete(event: MouseEvent) {
    // Svelte 5: 删除操作不需要 stopPropagation
    showMenu = false;
    onDelete?.(card);
  }
  
  /**
   * 处理查看 - 显示卡片详情模态窗
   */
  function handleView(event: MouseEvent) {
    // Svelte 5: 查看操作不需要 stopPropagation
    showMenu = false;
    onView?.(card);
  }

  /**
   * 组件挂载时渲染内容
   */
  onMount(async () => {
    await tick();
    
    const content = fullContent;
    if (contentElement && content) {
      contentComponent = await renderContent(contentElement, content, contentComponent);
    }
  });

  //  删除$effect，它导致了无限循环重新渲染！
  // $effect会在fullContent()变化时触发，而renderContent又可能触发fullContent()的依赖
  // 如果需要响应式更新，应该监听card.id的变化而不是内容
  
  /**
   * 组件销毁时清理 Component 实例
   */
  onDestroy(() => {
    if (contentComponent) {
      contentComponent.unload();
      contentComponent = null;
    }
  });
</script>

<div
  class="grid-card"
  class:selected
  class:hovered={isHovered}
  class:fixed-height={layoutMode === 'fixed'}
  class:masonry={layoutMode === 'masonry'}
  class:grid-card--kanban={viewContext === 'kanban'}
  onclick={handleCardClick}
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
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

  <!-- UUID 显示 -->
  <div class="card-uuid">
    {displayUuid}
  </div>

  <!-- 功能菜单按钮 -->
  <div class="card-actions">
    <button
      class="menu-button"
      onclick={toggleMenu}
      title="更多操作"
    >
      <EnhancedIcon name="more-horizontal" size={16} />
    </button>
    
    <!-- 功能菜单 - 水平向左展开 -->
    {#if showMenu}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="action-menu-backdrop" onclick={() => showMenu = false} onkeydown={() => {}}></div>
      <div class="action-menu">
        {#if onEdit}
          <button class="action-menu-item" onclick={handleEdit} title="编辑">
            <EnhancedIcon name="edit" size={16} />
          </button>
        {/if}
        {#if onDelete}
          <button class="action-menu-item danger" onclick={handleDelete} title="删除">
            <EnhancedIcon name="trash-2" size={16} />
          </button>
        {/if}
        {#if onView}
          <button class="action-menu-item" onclick={handleView} title="查看">
            <EnhancedIcon name="eye" size={16} />
          </button>
        {/if}
      </div>
    {/if}
  </div>

  <!-- 卡片内容 -->
  <div class="card-body">
    <!-- 完整内容显示 - 不强制分隔正反面 -->
    <div 
      bind:this={contentElement}
      class="content-area markdown-rendered"
      class:rendering={isRendering}
    >
      {#if isRendering}
        <div class="skeleton-line"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line"></div>
      {/if}
    </div>
  </div>

  <!-- 选中遮罩 -->
  {#if selected}
    <div class="selected-overlay"></div>
  {/if}
</div>

<style>
  .grid-card {
    --weave-grid-card-border-color: var(
      --weave-card-border-color,
      var(--divider-color, var(--background-modifier-border-hover, var(--background-modifier-border, var(--text-faint))))
    );
    --weave-grid-card-hover-shadow: var(
      --shadow-s,
      0 4px 12px rgba(0, 0, 0, 0.12)
    );
    position: relative;
    background: var(--weave-surface-background, var(--background-primary));
    /*  参考复选框方案：使用box-shadow + !important */
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
  .grid-card.fixed-height {
    height: 280px;
  }

  .grid-card.fixed-height .card-body {
    flex: 1;
    overflow: hidden;
  }

  .grid-card.fixed-height .content-area {
    max-height: 120px;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    -webkit-box-orient: vertical;
  }

  /* 瀑布流模式 */
  .grid-card.masonry {
    height: auto;
    min-height: 200px;
  }

  .grid-card.masonry .content-area {
    max-height: none;
  }

  .grid-card:hover,
  .grid-card.hovered {
    box-shadow: 
      inset 0 0 0 2px var(--interactive-accent),
      var(--weave-grid-card-hover-shadow);
    transform: translateY(-2px);
  }

  /*  移除 !important：选中效果使用更具体的选择器 */
  :global(body.theme-dark) .grid-card.selected,
  :global(body.theme-light) .grid-card.selected {
    box-shadow: 
      inset 0 0 0 3px var(--interactive-accent),
      0 0 0 2px color-mix(in srgb, var(--interactive-accent) 20%, transparent);
  }

  /* 选中标记 */
  .selected-indicator {
    position: absolute;
    top: 8px;
    right: 8px;
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

  /* 选中遮罩 */
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

  /* UUID 显示 */
  .card-uuid {
    position: absolute;
    top: 8px;
    left: 8px;
    font-size: var(--weave-font-size-xs);
    font-weight: 600;
    color: var(--weave-text-faint);
    background: var(--weave-elevated-background, var(--background-secondary));
    padding: 2px 8px;
    border-radius: var(--weave-radius-sm);
    font-family: var(--font-monospace, 'Courier New', monospace);
    z-index: 2;
  }

  .grid-card.selected .card-uuid {
    color: var(--interactive-accent);
  }

  /* 功能菜单 */
  .card-actions {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .menu-button {
    width: 28px;
    height: 28px;
    background: var(--weave-elevated-background, var(--background-secondary));
    border: 1px solid var(--weave-border);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
    color: var(--text-muted);
  }

  .menu-button:hover {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
    color: var(--text-normal);
    box-shadow: var(--weave-shadow-sm);
  }

  /* 水平向左展开的菜单 */
  .action-menu {
    display: flex;
    align-items: center;
    gap: 8px;
    animation: slideInLeft 0.2s ease-out;
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

  .action-menu-item {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: var(--weave-elevated-background, var(--background-secondary));
    border: 1px solid var(--weave-border);
    border-radius: 50%;
    cursor: pointer;
    color: var(--text-normal);
    transition: all 0.15s ease;
  }

  .action-menu-item:hover {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
    box-shadow: var(--weave-shadow-sm);
  }

  .action-menu-item.danger {
    color: var(--text-error);
  }

  .action-menu-item.danger:hover {
    background: var(--background-modifier-error);
    border-color: var(--text-error);
  }

  /* 点击外部关闭菜单的背景遮罩 */
  .action-menu-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 9;
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
    line-height: 1.5;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  
  /* fixed模式下限制高度 */
  .grid-card.fixed-height .content-area {
    max-height: 160px; /* 增加高度 */
  }
  
  /* masonry模式下不限制高度 */
  .grid-card.masonry .content-area {
    max-height: none;
  }

  /* Markdown 渲染样式 */
  .content-area.markdown-rendered :global(p) {
    margin: 0.25em 0;
  }

  .content-area.markdown-rendered :global(ul),
  .content-area.markdown-rendered :global(ol) {
    margin: 0.25em 0;
    padding-left: 1.5em;
  }

  .content-area.markdown-rendered :global(code) {
    background: var(--background-modifier-border);
    padding: 2px 4px;
    border-radius: 3px;
    font-size: 0.9em;
  }

  .content-area.markdown-rendered :global(a) {
    color: var(--interactive-accent);
    text-decoration: none;
  }

  .content-area.markdown-rendered :global(a:hover) {
    text-decoration: underline;
  }
  
  /* 分隔符样式 - 正反面之间的分隔线 */
  .content-area.markdown-rendered :global(hr) {
    margin: var(--weave-space-md) 0;
    border: none;
    border-top: 2px dashed var(--weave-border);
    opacity: 0.5;
  }
  
  /* 图片和媒体 */
  .content-area.markdown-rendered :global(img),
  .content-area.markdown-rendered :global(video) {
    max-width: 100%;
    height: auto;
    border-radius: var(--weave-radius-sm);
    margin: var(--weave-space-xs) 0;
  }

  /* 骨架屏 */
  .skeleton-line {
    height: 12px;
    background: linear-gradient(
      90deg,
      var(--background-modifier-border) 25%,
      var(--background-modifier-hover) 50%,
      var(--background-modifier-border) 75%
    );
    background-size: 200% 100%;
    animation: skeleton-loading 1.5s ease-in-out infinite;
    border-radius: 4px;
    margin: 4px 0;
  }

  .skeleton-line:first-child {
    width: 90%;
  }

  .skeleton-line:last-child {
    width: 60%;
  }

  @keyframes skeleton-loading {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  /* 响应式 */
  @media (max-width: 768px) {
    .grid-card {
      padding: var(--weave-space-sm);
    }

    .grid-card.fixed-height {
      height: 240px;
    }

    .card-uuid {
      font-size: 10px;
      padding: 1px 6px;
    }
  }

  /* 看板视图适配样式 */
  .grid-card--kanban {
    width: 100%; /* 占满列宽 */
    height: auto; /* 自适应高度 */
    min-height: 160px; /* 最小高度 */
    margin-bottom: 0.75rem; /* 看板卡片间距 */
  }

  .grid-card--kanban .card-body {
    flex: 1;
    overflow: hidden;
  }

  .grid-card--kanban .content-area {
    max-height: 200px; /* 限制内容高度 */
    overflow-y: auto;
  }

</style>
