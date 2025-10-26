<!--
  懒渲染网格卡片组件
  只在进入视口时才真正渲染Markdown内容
  默认显示骨架屏，性能极佳
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
    onClick,
    onEdit,
    onDelete,
    onView
  }: Props = $props();

  // 状态管理
  let cardElement = $state<HTMLElement>();
  let contentElement = $state<HTMLElement>();
  let hasRendered = $state(false); // 是否已渲染
  let isRendering = $state(false); // 正在渲染中
  let clickTimer: NodeJS.Timeout | null = null;
  let isHovered = $state(false);
  let showMenu = $state(false);
  let contentComponent: Component | null = null;
  let observer: IntersectionObserver | null = null;

  // 计算属性
  const frontText = $derived(card.fields?.front || card.fields?.question || '');
  const backText = $derived(card.fields?.back || card.fields?.answer || '');
  const tags = $derived(card.tags || []);
  const sourceDocument = $derived(card.fields?.source_document as string || '');
  
  // 合并完整内容
  const fullContent = $derived(() => {
    const front = frontText.trim();
    const back = backText.trim();
    if (!back) return front;
    return `${front}\n\n---\n\n${back}`;
  });
  
  // 获取源文件路径
  const sourcePath = $derived(() => {
    if (card.fields?.source_document) {
      const doc = card.fields.source_document as string;
      if (doc.endsWith('.md')) return doc;
      return `${doc}.md`;
    }
    if (card.customFields?.obsidianFilePath) {
      return card.customFields.obsidianFilePath as string;
    }
    return '';
  });
  
  // 根据标签名生成颜色
  function getTagColor(tag: string): string {
    const colors = ['blue', 'purple', 'pink', 'red', 'orange', 'green', 'cyan', 'gray'];
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
      hash = tag.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  }
  
  // UUID 显示格式
  const displayUuid = $derived(() => {
    const uuid = card.uuid || card.id;
    if (uuid.length > 12) {
      return `${uuid.slice(0, 8)}...${uuid.slice(-4)}`;
    }
    return uuid;
  });

  /**
   * 渲染 Markdown 内容
   */
  async function renderMarkdown() {
    if (!contentElement || !plugin?.app || isRendering || contentComponent) {
      return;
    }
    
    isRendering = true;
    
    try {
      contentElement.innerHTML = '';
      
      const component = new Component();
      const content = fullContent();
      
      await MarkdownRenderer.render(
        plugin.app,
        content,
        contentElement,
        sourcePath(),
        component
      );
      
      component.load();
      contentComponent = component;
      
    } catch (error) {
      console.error('[LazyGridCard] Render failed:', error);
      if (contentElement) {
        contentElement.textContent = fullContent();
      }
    } finally {
      isRendering = false;
    }
  }

  /**
   * 处理卡片点击
   */
  function handleCardClick(event: MouseEvent) {
    if ((event.target as HTMLElement).closest('.card-tags, .card-source, .card-actions')) {
      return;
    }

    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
      onEdit?.(card);
    } else {
      clickTimer = setTimeout(() => {
        onClick?.(card);
        clickTimer = null;
      }, 250);
    }
  }

  function handleMouseEnter() {
    isHovered = true;
  }

  function handleMouseLeave() {
    isHovered = false;
    showMenu = false;
  }
  
  function toggleMenu(event: MouseEvent) {
    event.stopPropagation();
    showMenu = !showMenu;
  }
  
  function handleEdit(event: MouseEvent) {
    event.stopPropagation();
    showMenu = false;
    onEdit?.(card);
  }
  
  function handleDelete(event: MouseEvent) {
    event.stopPropagation();
    showMenu = false;
    onDelete?.(card);
  }
  
  function handleView(event: MouseEvent) {
    event.stopPropagation();
    showMenu = false;
    onView?.(card);
  }

  /**
   * 监听hasRendered变化，当为true时渲染Markdown
   */
  $effect(() => {
    if (hasRendered && contentElement && !contentComponent) {
      // 使用setTimeout确保DOM完全更新
      setTimeout(() => {
        renderMarkdown();
      }, 0);
    }
  });

  /**
   * 组件挂载时设置Intersection Observer
   */
  onMount(() => {
    if (!cardElement) return;
    
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
      contentComponent?.unload();
      if (clickTimer) {
        clearTimeout(clickTimer);
      }
    };
  });
  
  /**
   * 组件销毁时清理
   */
  onDestroy(() => {
    observer?.disconnect();
    contentComponent?.unload();
  });
</script>

<div
  bind:this={cardElement}
  class="lazy-grid-card"
  class:selected
  class:hovered={isHovered}
  class:fixed-height={layoutMode === 'fixed'}
  class:masonry={layoutMode === 'masonry'}
  class:rendering={isRendering}
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

  <!-- 功能菜单 -->
  <div class="card-actions">
    <button class="menu-button" onclick={toggleMenu} title="更多操作">
      <EnhancedIcon name="more-horizontal" size={16} />
    </button>
    
    {#if showMenu}
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
  .lazy-grid-card {
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
  .lazy-grid-card.fixed-height {
    height: 280px;
  }

  .lazy-grid-card.fixed-height .card-body {
    flex: 1;
    overflow: hidden;
  }

  .lazy-grid-card.fixed-height .content-area {
    max-height: 160px;
  }

  /* 瀑布流模式 */
  .lazy-grid-card.masonry {
    height: auto;
    min-height: 200px;
  }

  .lazy-grid-card.masonry .content-area {
    max-height: none;
  }

  /* 悬停效果 */
  .lazy-grid-card:hover,
  .lazy-grid-card.hovered {
    border-color: var(--tuanki-border-hover);
    box-shadow: var(--tuanki-shadow-md);
    transform: translateY(-2px);
  }

  /* 选中效果 */
  .lazy-grid-card.selected {
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
  }

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
  }

  .action-menu-item.danger {
    color: var(--text-error);
  }

  .action-menu-item.danger:hover {
    background: var(--background-modifier-error);
    border-color: var(--text-error);
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

  /* 骨架屏 */
  .skeleton-placeholder {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: var(--tuanki-space-sm) 0;
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

  /* Markdown 渲染样式 */
  .content-area.markdown-rendered :global(p) {
    margin: 0.25em 0;
  }

  .content-area.markdown-rendered :global(hr) {
    margin: var(--tuanki-space-md) 0;
    border: none;
    border-top: 2px dashed var(--tuanki-border);
    opacity: 0.5;
  }

  .content-area.markdown-rendered :global(img),
  .content-area.markdown-rendered :global(video) {
    max-width: 100%;
    height: auto;
    border-radius: var(--tuanki-radius-sm);
    margin: var(--tuanki-space-xs) 0;
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
  }

  /* 多彩标签 */
  .tag-blue { background: var(--tuanki-tag-blue-bg); color: var(--tuanki-tag-blue-text); border: 1px solid var(--tuanki-tag-blue-border); }
  .tag-purple { background: var(--tuanki-tag-purple-bg); color: var(--tuanki-tag-purple-text); border: 1px solid var(--tuanki-tag-purple-border); }
  .tag-pink { background: var(--tuanki-tag-pink-bg); color: var(--tuanki-tag-pink-text); border: 1px solid var(--tuanki-tag-pink-border); }
  .tag-red { background: var(--tuanki-tag-red-bg); color: var(--tuanki-tag-red-text); border: 1px solid var(--tuanki-tag-red-border); }
  .tag-orange { background: var(--tuanki-tag-orange-bg); color: var(--tuanki-tag-orange-text); border: 1px solid var(--tuanki-tag-orange-border); }
  .tag-green { background: var(--tuanki-tag-green-bg); color: var(--tuanki-tag-green-text); border: 1px solid var(--tuanki-tag-green-border); }
  .tag-cyan { background: var(--tuanki-tag-cyan-bg); color: var(--tuanki-tag-cyan-text); border: 1px solid var(--tuanki-tag-cyan-border); }
  .tag-gray { background: var(--tuanki-tag-gray-bg); color: var(--tuanki-tag-gray-text); border: 1px solid var(--tuanki-tag-gray-border); }

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
</style>

