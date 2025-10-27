<!--
  网格卡片组件
  用于网格视图中显示单个卡片
  支持选中高亮、Obsidian 渲染、单击选中/双击编辑
-->
<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { MarkdownRenderer, Component } from 'obsidian';
  import type { Card } from '../../data/types';
  import type AnkiPlugin from '../../main';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';

  interface Props {
    card: Card;
    selected?: boolean;
    plugin: AnkiPlugin;
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
  const frontText = $derived(card.fields?.front || card.fields?.question || '');
  const backText = $derived(card.fields?.back || card.fields?.answer || '');
  const tags = $derived(card.tags || []);
  const sourceDocument = $derived(card.fields?.source_document as string || '');
  
  // ✅ 合并完整内容 - 网格视图是浏览模式，显示完整内容
  const fullContent = $derived(() => {
    const front = frontText.trim();
    const back = backText.trim();
    
    // 如果没有背面内容，只显示正面
    if (!back) return front;
    
    // 如果有背面内容，用分隔符连接
    return `${front}\n\n---\n\n${back}`;
  });
  
  // 获取源文件路径（用于正确解析相对路径的媒体文件）
  const sourcePath = $derived(() => {
    // 优先使用 source_document 字段
    if (card.fields?.source_document) {
      const doc = card.fields.source_document as string;
      // 如果已经是完整路径就直接使用
      if (doc.endsWith('.md')) return doc;
      // 否则添加 .md 后缀
      return `${doc}.md`;
    }
    // 其次使用 obsidianFilePath
    if (card.customFields?.obsidianFilePath) {
      return card.customFields.obsidianFilePath as string;
    }
    // 最后返回空字符串
    return '';
  });
  
  /**
   * 根据标签名生成颜色类名
   */
  function getTagColor(tag: string): string {
    const colors = ['blue', 'purple', 'pink', 'red', 'orange', 'green', 'cyan', 'gray'];
    // 使用简单的哈希函数
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
      hash = tag.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  }
  
  // UUID 显示格式：前8位-后4位
  const displayUuid = $derived(() => {
    const uuid = card.uuid || card.id;
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
    element.innerHTML = ''; // 清空内容
    
    try {
      // 清理旧的组件实例
      if (component) {
        component.unload();
      }
      
      // 创建新的组件实例
      const newComponent = new Component();
      
      // ✅ 使用正确的 Obsidian API
      await MarkdownRenderer.render(
        plugin.app,           // app 实例
        content,              // 内容
        element,              // 容器元素
        sourcePath(),         // 源文件路径（关键！用于解析相对路径）
        newComponent          // Component 实例
      );
      
      // 加载组件（启用所有插件功能）
      newComponent.load();
      
      console.log('[GridCard] Markdown 渲染成功', {
        cardId: card.id,
        sourcePath: sourcePath(),
        contentLength: content.length
      });
      
      return newComponent;
    } catch (error) {
      console.error('[GridCard] Markdown 渲染失败:', error);
      element.textContent = content; // 降级为纯文本
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
    if ((event.target as HTMLElement).closest('.card-tags, .card-source, .card-actions')) {
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
    event.stopPropagation();
    showMenu = !showMenu;
  }
  
  /**
   * 处理编辑
   */
  function handleEdit(event: MouseEvent) {
    event.stopPropagation();
    showMenu = false;
    onEdit?.(card);
  }
  
  /**
   * 处理删除
   */
  function handleDelete(event: MouseEvent) {
    event.stopPropagation();
    showMenu = false;
    onDelete?.(card);
  }
  
  /**
   * 处理查看
   */
  function handleView(event: MouseEvent) {
    event.stopPropagation();
    showMenu = false;
    onView?.(card);
  }

  /**
   * 组件挂载时渲染内容
   */
  onMount(async () => {
    await tick();
    
    const content = fullContent();
    if (contentElement && content) {
      contentComponent = await renderContent(contentElement, content, contentComponent);
    }
  });

  // ❌ 删除$effect，它导致了无限循环重新渲染！
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
    {displayUuid()}
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
      <div class="action-menu">
        <button class="action-menu-item close-menu" onclick={toggleMenu} title="关闭">
          <EnhancedIcon name="x" size={16} />
        </button>
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

  <!-- 卡片底部 -->
  <div class="card-footer">
    <!-- 标签 -->
    {#if tags.length > 0}
      <div class="card-tags">
        {#each tags.slice(0, 3) as tag}
          <span class="tag tag-{getTagColor(tag)}">{tag}</span>
        {/each}
        {#if tags.length > 3}
          <span class="tag-more">+{tags.length - 3}</span>
        {/if}
      </div>
    {/if}

    <!-- 来源信息 -->
    {#if sourceDocument}
      <div class="card-source">
        <EnhancedIcon name="file-text" size={12} />
        <span>{sourceDocument}</span>
      </div>
    {/if}
  </div>

  <!-- 选中遮罩 -->
  {#if selected}
    <div class="selected-overlay"></div>
  {/if}
</div>

<style>
  .grid-card {
    position: relative;
    background: var(--background-primary);
    border: 2px solid var(--tuanki-border);
    border-radius: var(--tuanki-radius-lg);
    padding: var(--tuanki-space-md);
    cursor: pointer;
    transition: all 0.2s ease;
    overflow: hidden;
    display: flex;
    flex-direction: column;
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

  /* 悬停效果 */
  .grid-card:hover,
  .grid-card.hovered {
    border-color: var(--tuanki-border-hover);
    box-shadow: var(--tuanki-shadow-md);
    transform: translateY(-2px);
  }

  /* 选中效果 */
  .grid-card.selected {
    border-color: var(--interactive-accent);
    border-width: 3px;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--interactive-accent) 20%, transparent);
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
    box-shadow: var(--tuanki-shadow-sm);
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
    font-size: var(--tuanki-font-size-xs);
    font-weight: 600;
    color: var(--tuanki-text-faint);
    background: var(--background-secondary);
    padding: 2px 8px;
    border-radius: var(--tuanki-radius-sm);
    font-family: 'Courier New', monospace;
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
    background: var(--background-secondary);
    border: 1px solid var(--tuanki-border);
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
    box-shadow: var(--tuanki-shadow-sm);
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
    background: var(--background-secondary);
    border: 1px solid var(--tuanki-border);
    border-radius: 50%;
    cursor: pointer;
    color: var(--text-normal);
    transition: all 0.15s ease;
  }

  .action-menu-item:hover {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
    box-shadow: var(--tuanki-shadow-sm);
  }

  .action-menu-item.danger {
    color: var(--text-error);
  }

  .action-menu-item.danger:hover {
    background: var(--background-modifier-error);
    border-color: var(--text-error);
  }

  .action-menu-item.close-menu {
    order: -1; /* 确保关闭按钮始终在最右侧（flex开头） */
    color: var(--text-muted);
  }

  .action-menu-item.close-menu:hover {
    background: var(--background-modifier-hover);
    border-color: var(--tuanki-border);
    color: var(--text-normal);
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
    font-size: var(--tuanki-font-size-sm);
    line-height: 1.6;
    word-break: break-word;
    overflow: hidden;
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
    margin: var(--tuanki-space-md) 0;
    border: none;
    border-top: 2px dashed var(--tuanki-border);
    opacity: 0.5;
  }
  
  /* 图片和媒体 */
  .content-area.markdown-rendered :global(img),
  .content-area.markdown-rendered :global(video) {
    max-width: 100%;
    height: auto;
    border-radius: var(--tuanki-radius-sm);
    margin: var(--tuanki-space-xs) 0;
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

  /* 卡片底部 */
  .card-footer {
    margin-top: auto;
    padding-top: var(--tuanki-space-sm);
    border-top: 1px solid var(--tuanki-border);
    display: flex;
    flex-direction: column;
    gap: var(--tuanki-space-xs);
    position: relative;
    z-index: 2;
  }

  /* 标签 */
  .card-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .tag {
    font-size: var(--tuanki-font-size-xs);
    padding: 2px 8px;
    border-radius: var(--tuanki-radius-sm);
    font-weight: 500;
    transition: all 0.15s ease;
  }

  /* 多彩标签 */
  .tag-blue {
    background: var(--tuanki-tag-blue-bg);
    color: var(--tuanki-tag-blue-text);
    border: 1px solid var(--tuanki-tag-blue-border);
  }

  .tag-purple {
    background: var(--tuanki-tag-purple-bg);
    color: var(--tuanki-tag-purple-text);
    border: 1px solid var(--tuanki-tag-purple-border);
  }

  .tag-pink {
    background: var(--tuanki-tag-pink-bg);
    color: var(--tuanki-tag-pink-text);
    border: 1px solid var(--tuanki-tag-pink-border);
  }

  .tag-red {
    background: var(--tuanki-tag-red-bg);
    color: var(--tuanki-tag-red-text);
    border: 1px solid var(--tuanki-tag-red-border);
  }

  .tag-orange {
    background: var(--tuanki-tag-orange-bg);
    color: var(--tuanki-tag-orange-text);
    border: 1px solid var(--tuanki-tag-orange-border);
  }

  .tag-green {
    background: var(--tuanki-tag-green-bg);
    color: var(--tuanki-tag-green-text);
    border: 1px solid var(--tuanki-tag-green-border);
  }

  .tag-cyan {
    background: var(--tuanki-tag-cyan-bg);
    color: var(--tuanki-tag-cyan-text);
    border: 1px solid var(--tuanki-tag-cyan-border);
  }

  .tag-gray {
    background: var(--tuanki-tag-gray-bg);
    color: var(--tuanki-tag-gray-text);
    border: 1px solid var(--tuanki-tag-gray-border);
  }

  .tag-more {
    font-size: var(--tuanki-font-size-xs);
    color: var(--tuanki-text-faint);
    font-weight: 500;
  }

  /* 来源信息 */
  .card-source {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: var(--tuanki-font-size-xs);
    color: var(--tuanki-text-faint);
  }

  .card-source span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* 响应式 */
  @media (max-width: 768px) {
    .grid-card {
      padding: var(--tuanki-space-sm);
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

  /* 看板视图中隐藏部分元素以保持简洁 */
  .grid-card--kanban .card-source {
    font-size: 11px; /* 更小的来源信息字体 */
  }
</style>

