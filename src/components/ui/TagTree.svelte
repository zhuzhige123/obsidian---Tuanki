<script lang="ts">
  import Icon from "./Icon.svelte";
  import { createEventDispatcher } from 'svelte';
  
  interface TagNode {
    name: string;
    fullPath: string;
    children: TagNode[];
    count: number;
    selected: boolean;
    expanded: boolean;
  }

  interface Props {
    tags: string[];
    selectedTags: string[];
    onTagSelect?: (tag: string) => void;
  }

  let { tags, selectedTags, onTagSelect }: Props = $props();

  const dispatch = createEventDispatcher<{ tagSelect: string }>();

  // 构建标签树
  let tagTree = $derived(buildTagTree(tags, selectedTags));

  function buildTagTree(allTags: string[], selected: string[]): TagNode[] {
    const tagCounts = new Map<string, number>();
    const pathSet = new Set<string>();

    // 统计标签出现次数并收集所有路径
    allTags.forEach(tag => {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      
      // 处理层级标签（支持 / 分隔符）
      const parts = tag.split('/').filter(Boolean);
      for (let i = 1; i <= parts.length; i++) {
        const path = parts.slice(0, i).join('/');
        pathSet.add(path);
      }
    });

    // 构建树结构
    const root: TagNode[] = [];
    const nodeMap = new Map<string, TagNode>();

    // 按路径长度排序，确保父节点先创建
    const sortedPaths = Array.from(pathSet).sort((a, b) => a.split('/').length - b.split('/').length);

    sortedPaths.forEach(path => {
      const parts = path.split('/');
      const name = parts[parts.length - 1];
      const count = tagCounts.get(path) || 0;
      
      const node: TagNode = {
        name,
        fullPath: path,
        children: [],
        count,
        selected: selected.includes(path),
        expanded: false
      };

      nodeMap.set(path, node);

      if (parts.length === 1) {
        // 根级标签
        root.push(node);
      } else {
        // 子标签
        const parentPath = parts.slice(0, -1).join('/');
        const parent = nodeMap.get(parentPath);
        if (parent) {
          parent.children.push(node);
        }
      }
    });

    return root;
  }

  function toggleExpanded(node: TagNode) {
    node.expanded = !node.expanded;
  }

  function selectTag(node: TagNode) {
    onTagSelect?.(node.fullPath);
    dispatch('tagSelect', node.fullPath);
  }

  function hasSelectedDescendants(node: TagNode): boolean {
    if (node.selected) return true;
    return node.children.some(child => hasSelectedDescendants(child));
  }

  interface NodeData {
    node: TagNode;
    hasChildren: boolean;
    isSelected: boolean;
    hasSelectedDesc: boolean;
  }

  function renderNode(node: TagNode): NodeData {
    return {
      node,
      hasChildren: node.children.length > 0,
      isSelected: node.selected,
      hasSelectedDesc: hasSelectedDescendants(node)
    };
  }
</script>

<div class="tag-tree">
  {#each tagTree as node}
    {@render TagTreeNode(renderNode(node))}
  {/each}
</div>

{#snippet TagTreeNode(data: NodeData)}
  {@const { node, hasChildren, isSelected, hasSelectedDesc } = data}
  <div class="tag-node" class:has-children={hasChildren}>
    <div class="tag-item" class:selected={isSelected} class:has-selected-descendants={hasSelectedDesc}>
      {#if hasChildren}
        <button 
          class="expand-button" 
          onclick={() => toggleExpanded(node)}
          aria-label={node.expanded ? '收起' : '展开'}
        >
          <Icon name={node.expanded ? "chevronDown" : "chevronRight"} size="12" />
        </button>
      {:else}
        <div class="expand-placeholder"></div>
      {/if}
      
      <button 
        class="tag-button" 
        onclick={() => selectTag(node)}
        title={node.fullPath}
      >
        <Icon name="tag" size="12" />
        <span class="tag-name">{node.name}</span>
        {#if node.count > 0}
          <span class="tag-count">{node.count}</span>
        {/if}
      </button>
    </div>
    
    {#if node.expanded && hasChildren}
      <div class="tag-children">
        {#each node.children as child}
          {@render TagTreeNode(renderNode(child))}
        {/each}
      </div>
    {/if}
  </div>
{/snippet}

<style>
  .tag-tree {
    font-size: 13px;
    color: var(--text-normal);
  }

  .tag-node {
    margin-bottom: 2px;
  }

  .tag-item {
    display: flex;
    align-items: center;
    padding: 4px 8px;
    border-radius: 4px;
    transition: all 0.15s ease;
    position: relative;
  }

  .tag-item:hover {
    background: var(--background-modifier-hover);
  }

  .tag-item.selected {
    background: rgba(var(--color-accent-rgb), 0.15);
    color: var(--color-accent);
  }

  .tag-item.has-selected-descendants {
    background: rgba(var(--color-accent-rgb), 0.05);
  }

  .expand-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border: none;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: 2px;
    margin-right: 4px;
    flex-shrink: 0;
  }

  .expand-button:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .expand-placeholder {
    width: 16px;
    height: 16px;
    margin-right: 4px;
    flex-shrink: 0;
  }

  .tag-button {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    border: none;
    background: none;
    color: inherit;
    cursor: pointer;
    padding: 0;
    text-align: left;
    border-radius: 3px;
    padding: 2px 4px;
    transition: all 0.15s ease;
  }

  .tag-button:hover {
    background: rgba(var(--text-muted-rgb), 0.1);
  }

  .tag-name {
    flex: 1;
    font-size: 13px;
    font-weight: 400;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tag-count {
    font-size: 11px;
    color: var(--text-muted);
    background: var(--background-modifier-border);
    padding: 1px 6px;
    border-radius: 10px;
    font-weight: 500;
    flex-shrink: 0;
  }

  .tag-item.selected .tag-count {
    background: rgba(var(--color-accent-rgb), 0.3);
    color: var(--color-accent);
  }

  .tag-children {
    margin-left: 20px;
    padding-left: 8px;
    border-left: 1px solid var(--background-modifier-border);
  }

  /* 深色模式优化 - 使用 Obsidian 主题类 */
  :global(body.theme-dark) .tag-item:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  :global(body.theme-dark) .expand-button:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  :global(body.theme-dark) .tag-button:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  /* 焦点样式 */
  .expand-button:focus,
  .tag-button:focus {
    outline: 2px solid var(--color-accent);
    outline-offset: 1px;
  }

  /* 动画效果 */
  .tag-children {
    animation: slideDown 0.2s ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
