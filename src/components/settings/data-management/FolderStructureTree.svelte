<!--
  文件夹结构树组件
  显示可折叠的文件夹和文件结构
-->
<script lang="ts">
  import type { FolderStructure, FolderNode } from '../../../types/data-management-types';
  import { formatFileSize } from '../../../utils/format-utils';
  import { createEventDispatcher } from 'svelte';

  interface Props {
    structure: FolderStructure | null;
    expandedNodes?: Set<string>;
    onNodeToggle?: (nodeId: string) => void;
    onOpenFolder?: (path: string) => void;
  }

  let { 
    structure, 
    expandedNodes = new Set(['root']), 
    onNodeToggle,
    onOpenFolder 
  }: Props = $props();

  const dispatch = createEventDispatcher<{
    nodeToggle: { nodeId: string };
    openFolder: { path: string };
  }>();

  // 文件夹图标映射
  const folderIcons: Record<string, string> = {
    'tuanki': '🗄️',
    'decks': '🎴',
    'learning': '📚',
    'profile': '👤',
    'templates': '🎨',
    'backups': '💾',
    'media': '🖼️',
    'default': '📁'
  };

  // 文件图标映射
  const fileIcons: Record<string, string> = {
    'json': '📄',
    'md': '📝',
    'txt': '📃',
    'png': '🖼️',
    'jpg': '🖼️',
    'jpeg': '🖼️',
    'gif': '🖼️',
    'mp3': '🎵',
    'mp4': '🎬',
    'default': '📄'
  };

  // 获取文件扩展名
  function getFileExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    return lastDot !== -1 ? filename.substring(lastDot + 1).toLowerCase() : '';
  }

  // 获取节点图标
  function getNodeIcon(node: FolderNode): string {
    if (node.type === 'folder') {
      return folderIcons[node.name] || folderIcons.default;
    } else {
      const ext = getFileExtension(node.name);
      return fileIcons[ext] || fileIcons.default;
    }
  }

  // 检查节点是否展开
  function isNodeExpanded(nodeId: string): boolean {
    return expandedNodes.has(nodeId);
  }

  // 切换节点展开状态
  function toggleNode(nodeId: string) {
    if (onNodeToggle) {
      onNodeToggle(nodeId);
    } else {
      // 默认行为
      if (expandedNodes.has(nodeId)) {
        expandedNodes.delete(nodeId);
      } else {
        expandedNodes.add(nodeId);
      }
      expandedNodes = new Set(expandedNodes); // 触发响应式更新
    }
    
    dispatch('nodeToggle', { nodeId });
  }

  // 打开文件夹
  function openFolder(path: string) {
    if (onOpenFolder) {
      onOpenFolder(path);
    }
    dispatch('openFolder', { path });
  }

  // 递归渲染节点
  function renderNode(node: FolderNode, depth: number = 0): {
    node: FolderNode;
    depth: number;
    isExpanded: boolean;
    hasChildren: boolean;
    icon: string;
    children: ReturnType<typeof renderNode>[];
  } {
    const isExpanded = isNodeExpanded(node.id);
    const hasChildren = Boolean(node.children && node.children.length > 0);
    const icon = getNodeIcon(node);

    return {
      node,
      depth,
      isExpanded,
      hasChildren,
      icon,
      children: isExpanded && hasChildren ?
        node.children!.map(child => renderNode(child, depth + 1)) : []
    };
  }

  // 计算渲染数据
  let treeData = $derived.by(() => {
    if (!structure?.root) return null;
    return renderNode(structure.root);
  });

  // 统计信息
  let statsText = $derived(
    structure ? `${structure.totalFolders} 个文件夹, ${structure.totalFiles} 个文件` : ''
  );

  let scannedTimeText = $derived.by(() => {
    if (!structure?.scannedAt) return '';
    const scannedTime = new Date(structure.scannedAt);
    return `扫描时间: ${scannedTime.toLocaleString()}`;
  });
</script>

<!-- 文件夹结构树 -->
<div class="folder-structure-tree">
  <!-- 头部信息 -->
  <div class="tree-header">
    <div class="header-content">
      <div class="header-icon">📂</div>
      <div class="header-text">
        <h3>文件夹结构</h3>
        <p class="stats-text">{statsText}</p>
        {#if scannedTimeText}
          <p class="scanned-time">{scannedTimeText}</p>
        {/if}
      </div>
    </div>
  </div>

  <!-- 树形结构 -->
  <div class="tree-container">
    {#if treeData}
      {@render TreeNode(treeData)}
    {:else}
      <div class="empty-state">
        <div class="empty-icon">📁</div>
        <div class="empty-text">暂无文件夹结构数据</div>
      </div>
    {/if}
  </div>
</div>

<!-- 递归树节点组件 -->
{#snippet TreeNode(nodeData: ReturnType<typeof renderNode>)}
  <div class="tree-node" style="--depth: {nodeData.depth}">
    <!-- 节点内容 -->
    <div class="node-content" class:folder={nodeData.node.type === 'folder'}>
      <!-- 展开/收起按钮 -->
      {#if nodeData.hasChildren}
        <button 
          class="expand-button"
          onclick={() => toggleNode(nodeData.node.id)}
          title={nodeData.isExpanded ? '收起' : '展开'}
        >
          <span class="expand-icon" class:expanded={nodeData.isExpanded}>▶</span>
        </button>
      {:else}
        <div class="expand-spacer"></div>
      {/if}

      <!-- 节点图标 -->
      <div class="node-icon">{nodeData.icon}</div>

      <!-- 节点信息 -->
      <div class="node-info">
        <div class="node-name" title={nodeData.node.name}>
          {nodeData.node.name}
        </div>
        
        {#if nodeData.node.description}
          <div class="node-description">{nodeData.node.description}</div>
        {/if}
        
        {#if nodeData.node.type === 'file' && nodeData.node.size !== undefined}
          <div class="node-size">{formatFileSize(nodeData.node.size)}</div>
        {/if}
      </div>

      <!-- 操作按钮 -->
      {#if nodeData.node.type === 'folder'}
        <div class="node-actions">
          <button 
            class="action-button open-button"
            onclick={() => openFolder(nodeData.node.path)}
            title="打开文件夹"
          >
            <span class="action-icon">🔗</span>
          </button>
        </div>
      {/if}
    </div>

    <!-- 子节点 -->
    {#if nodeData.isExpanded && nodeData.children.length > 0}
      <div class="node-children">
        {#each nodeData.children as childData}
          {@render TreeNode(childData)}
        {/each}
      </div>
    {/if}
  </div>
{/snippet}

<style>
  .folder-structure-tree {
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    overflow: hidden;
  }

  /* 头部样式 */
  .tree-header {
    padding: 1rem 1.5rem;
    background: var(--background-secondary);
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .header-content {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .header-icon {
    font-size: 1.5rem;
    opacity: 0.8;
  }

  .header-text h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .stats-text {
    margin: 0.25rem 0 0 0;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .scanned-time {
    margin: 0.125rem 0 0 0;
    font-size: 0.7rem;
    color: var(--text-faint);
  }

  /* 树容器 */
  .tree-container {
    max-height: 400px;
    overflow-y: auto;
    padding: 0.5rem 0;
  }

  /* 空状态 */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    color: var(--text-muted);
  }

  .empty-icon {
    font-size: 2rem;
    margin-bottom: 0.5rem;
    opacity: 0.5;
  }

  .empty-text {
    font-size: 0.875rem;
  }

  /* 树节点样式 */
  .tree-node {
    --indent: calc(var(--depth) * 1.5rem);
  }

  .node-content {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 1rem;
    padding-left: calc(1rem + var(--indent));
    transition: all 0.2s ease;
    cursor: pointer;
  }

  .node-content:hover {
    background: var(--background-modifier-hover);
  }

  .node-content.folder {
    font-weight: 500;
  }

  /* 展开按钮 */
  .expand-button {
    width: 1rem;
    height: 1rem;
    border: none;
    background: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    transition: all 0.2s ease;
  }

  .expand-button:hover {
    color: var(--text-normal);
  }

  .expand-spacer {
    width: 1rem;
    height: 1rem;
  }

  .expand-icon {
    font-size: 0.75rem;
    transition: transform 0.2s ease;
  }

  .expand-icon.expanded {
    transform: rotate(90deg);
  }

  /* 节点图标 */
  .node-icon {
    font-size: 1rem;
    flex-shrink: 0;
  }

  /* 节点信息 */
  .node-info {
    flex: 1;
    min-width: 0;
  }

  .node-name {
    font-size: 0.875rem;
    color: var(--text-normal);
    word-break: break-all;
  }

  .node-description {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-top: 0.125rem;
  }

  .node-size {
    font-size: 0.7rem;
    color: var(--text-faint);
    font-family: var(--font-monospace);
    margin-top: 0.125rem;
  }

  /* 操作按钮 */
  .node-actions {
    display: flex;
    gap: 0.25rem;
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .node-content:hover .node-actions {
    opacity: 1;
  }

  .action-button {
    width: 1.5rem;
    height: 1.5rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 3px;
    background: var(--background-primary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  }

  .action-button:hover {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-normal);
  }

  .action-icon {
    font-size: 0.75rem;
  }

  /* 子节点容器 */
  .node-children {
    border-left: 1px solid var(--background-modifier-border);
    margin-left: calc(1rem + var(--indent) + 0.5rem);
  }

  /* 滚动条样式 */
  .tree-container::-webkit-scrollbar {
    width: 6px;
  }

  .tree-container::-webkit-scrollbar-track {
    background: var(--background-secondary);
  }

  .tree-container::-webkit-scrollbar-thumb {
    background: var(--background-modifier-border);
    border-radius: 3px;
  }

  .tree-container::-webkit-scrollbar-thumb:hover {
    background: var(--interactive-normal);
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .tree-header {
      padding: 0.75rem 1rem;
    }

    .node-content {
      padding: 0.5rem 0.75rem;
      padding-left: calc(0.75rem + var(--indent));
    }

    .node-children {
      margin-left: calc(0.75rem + var(--indent) + 0.5rem);
    }
  }
</style>
