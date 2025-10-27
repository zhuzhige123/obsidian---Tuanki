<!--
  文件选择器模态窗
  用于批量解析前预览和选择文件
-->
<script lang="ts">
  import { TFile, TFolder } from 'obsidian';
  import type { SimpleFileSelectorService, ScanStats } from '../../services/batch-parsing';

  interface Props {
    app: any;
    fileSelector: SimpleFileSelectorService;
    onConfirm: (files: TFile[]) => void;
    onCancel: () => void;
  }

  let { app, fileSelector, onConfirm, onCancel }: Props = $props();

  interface FileNode {
    file: TFile;
    name: string;
    path: string;
    selected: boolean;
  }

  interface FolderNode {
    folder: TFolder | null; // null for root
    name: string;
    path: string;
    files: FileNode[];
    subfolders: FolderNode[];
    expanded: boolean;
    allSelected: boolean;
    someSelected: boolean;
  }

  let rootNode = $state<FolderNode | null>(null);
  let flatFileList = $state<TFile[]>([]);
  let selectedCount = $state(0);
  let totalCount = $state(0);
  let loading = $state(true);
  let searchQuery = $state('');
  let showOnlySelected = $state(false);

  // 构建文件树
  function buildFileTree(): FolderNode {
    const root: FolderNode = {
      folder: null,
      name: '根目录',
      path: '',
      files: [],
      subfolders: [],
      expanded: true,
      allSelected: false,
      someSelected: false
    };

    const folderMap = new Map<string, FolderNode>();
    folderMap.set('', root);

    // 收集所有Markdown文件
    const allFiles = app.vault.getMarkdownFiles() as TFile[];
    flatFileList = allFiles;
    totalCount = allFiles.length;

    // 按文件夹组织文件
    for (const file of allFiles) {
      const parts = file.path.split('/');
      const fileName = parts.pop()!;
      const folderPath = parts.join('/');

      // 确保文件夹节点存在
      let currentPath = '';
      let parentNode = root;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const newPath = currentPath ? `${currentPath}/${part}` : part;

        if (!folderMap.has(newPath)) {
          const folderObj = app.vault.getAbstractFileByPath(newPath);
          const folderNode: FolderNode = {
            folder: folderObj instanceof TFolder ? folderObj : null,
            name: part,
            path: newPath,
            files: [],
            subfolders: [],
            expanded: false,
            allSelected: false,
            someSelected: false
          };

          folderMap.set(newPath, folderNode);
          parentNode.subfolders.push(folderNode);
        }

        parentNode = folderMap.get(newPath)!;
        currentPath = newPath;
      }

      // 添加文件到对应文件夹
      const fileNode: FileNode = {
        file,
        name: fileName,
        path: file.path,
        selected: false
      };

      parentNode.files.push(fileNode);
    }

    // 排序
    sortFolderNode(root);

    return root;
  }

  function sortFolderNode(node: FolderNode) {
    node.files.sort((a, b) => a.name.localeCompare(b.name));
    node.subfolders.sort((a, b) => a.name.localeCompare(b.name));
    node.subfolders.forEach(sortFolderNode);
  }

  // 初始化
  $effect(() => {
    rootNode = buildFileTree();
    loading = false;
  });

  // 切换文件夹展开状态
  function toggleFolder(node: FolderNode) {
    node.expanded = !node.expanded;
    rootNode = rootNode; // 触发更新
  }

  // 切换文件选择状态
  function toggleFile(fileNode: FileNode) {
    fileNode.selected = !fileNode.selected;
    updateSelectionCounts();
    updateFolderStates(rootNode!);
  }

  // 切换文件夹选择状态（递归）
  function toggleFolderSelection(node: FolderNode) {
    const newState = !node.allSelected;
    setFolderSelection(node, newState);
    updateSelectionCounts();
  }

  function setFolderSelection(node: FolderNode, selected: boolean) {
    // 选择所有文件
    node.files.forEach(f => f.selected = selected);
    
    // 递归选择子文件夹
    node.subfolders.forEach(subfolder => {
      setFolderSelection(subfolder, selected);
    });

    // 更新状态
    node.allSelected = selected;
    node.someSelected = false;
  }

  // 更新文件夹选择状态（从底向上）
  function updateFolderStates(node: FolderNode): void {
    // 递归更新子文件夹
    node.subfolders.forEach(updateFolderStates);

    // 统计选择情况
    const fileSelections = node.files.map(f => f.selected);
    const subfolderSelections = node.subfolders.map(f => f.allSelected);
    const allSelections = [...fileSelections, ...subfolderSelections];

    if (allSelections.length === 0) {
      node.allSelected = false;
      node.someSelected = false;
      return;
    }

    const selectedCount = allSelections.filter(Boolean).length;
    const totalCount = allSelections.length;

    node.allSelected = selectedCount === totalCount && totalCount > 0;
    node.someSelected = selectedCount > 0 && selectedCount < totalCount;
  }

  // 更新选择计数
  function updateSelectionCounts() {
    selectedCount = countSelectedFiles(rootNode!);
  }

  function countSelectedFiles(node: FolderNode): number {
    let count = node.files.filter(f => f.selected).length;
    node.subfolders.forEach(subfolder => {
      count += countSelectedFiles(subfolder);
    });
    return count;
  }

  // 全选/取消全选
  function toggleSelectAll() {
    if (rootNode) {
      const newState = selectedCount === 0;
      setFolderSelection(rootNode, newState);
      updateSelectionCounts();
    }
  }

  // 获取选中的文件
  function getSelectedFiles(): TFile[] {
    const selected: TFile[] = [];
    
    function collect(node: FolderNode) {
      node.files.forEach(f => {
        if (f.selected) selected.push(f.file);
      });
      node.subfolders.forEach(collect);
    }

    if (rootNode) {
      collect(rootNode);
    }

    return selected;
  }

  // 确认选择
  function handleConfirm() {
    const selectedFiles = getSelectedFiles();
    onConfirm(selectedFiles);
  }

  // 搜索过滤
  let filteredNode = $derived.by(() => {
    if (!rootNode || !searchQuery.trim()) {
      return rootNode;
    }

    const query = searchQuery.toLowerCase();
    
    function filterNode(node: FolderNode): FolderNode | null {
      const filteredFiles = node.files.filter(f => 
        f.name.toLowerCase().includes(query)
      );

      const filteredSubfolders = node.subfolders
        .map(filterNode)
        .filter(Boolean) as FolderNode[];

      if (filteredFiles.length === 0 && filteredSubfolders.length === 0) {
        return null;
      }

      return {
        ...node,
        files: filteredFiles,
        subfolders: filteredSubfolders,
        expanded: true // 搜索时自动展开
      };
    }

    return filterNode(rootNode);
  });
</script>

<div class="file-selector-modal">
  <div class="modal-header">
    <h2>选择要解析的文件</h2>
    <button class="close-btn" onclick={onCancel}>×</button>
  </div>

  <div class="modal-toolbar">
    <input
      type="text"
      class="search-input"
      placeholder="搜索文件..."
      bind:value={searchQuery}
    />
    
    <div class="toolbar-actions">
      <button class="toolbar-btn" onclick={toggleSelectAll}>
        {selectedCount === totalCount ? '取消全选' : '全选'}
      </button>
      
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={showOnlySelected} />
        <span>仅显示已选</span>
      </label>
    </div>
  </div>

  <div class="selection-info">
    <span>已选择 <strong>{selectedCount}</strong> / {totalCount} 个文件</span>
  </div>

  <div class="file-tree-container">
    {#if loading}
      <div class="loading-state">加载中...</div>
    {:else if filteredNode}
      {@render FileTree(filteredNode, 0)}
    {:else}
      <div class="empty-state">
        {searchQuery ? '未找到匹配的文件' : '没有文件'}
      </div>
    {/if}
  </div>

  <div class="modal-footer">
    <button class="cancel-btn" onclick={onCancel}>取消</button>
    <button 
      class="confirm-btn" 
      onclick={handleConfirm}
      disabled={selectedCount === 0}
    >
      确认选择 ({selectedCount})
    </button>
  </div>
</div>

<!-- 递归组件：文件树 -->
{#snippet FileTree(node: FolderNode, level: number)}
  <div class="folder-node" style="margin-left: {level * 20}px">
    <div class="folder-header">
      {#if node.files.length > 0 || node.subfolders.length > 0}
        <button class="expand-btn" onclick={() => toggleFolder(node)}>
          {node.expanded ? '▼' : '▶'}
        </button>
      {:else}
        <span class="expand-spacer"></span>
      {/if}
      
      <input
        type="checkbox"
        checked={node.allSelected}
        indeterminate={node.someSelected}
        onchange={() => toggleFolderSelection(node)}
      />
      
      <svg class="folder-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
      </svg>
      
      <span class="folder-name">{node.name}</span>
      <span class="file-count">({node.files.length})</span>
    </div>
    
    {#if node.expanded}
      <div class="folder-content">
        {#each node.subfolders as subfolder}
          {@render FileTree(subfolder, level + 1)}
        {/each}
        
        {#each node.files as fileNode}
          {#if !showOnlySelected || fileNode.selected}
            <div class="file-node" style="margin-left: {(level + 1) * 20}px">
              <span class="expand-spacer"></span>
              
              <input
                type="checkbox"
                checked={fileNode.selected}
                onchange={() => toggleFile(fileNode)}
              />
              
              <svg class="file-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                <polyline points="13 2 13 9 20 9"></polyline>
              </svg>
              
              <span class="file-name">{fileNode.name}</span>
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  </div>
{/snippet}

<style>
  .file-selector-modal {
    width: 700px;
    max-width: 90vw;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    background: var(--background-primary);
    border-radius: 8px;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.2em;
    font-weight: 600;
    color: var(--text-normal);
  }

  .close-btn {
    width: 32px;
    height: 32px;
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-size: 1.8em;
    line-height: 1;
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .modal-toolbar {
    display: flex;
    gap: 1rem;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
  }

  .search-input {
    flex: 1;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.9em;
  }

  .toolbar-actions {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }

  .toolbar-btn {
    padding: 0.5rem 1rem;
    background: var(--interactive-normal);
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    color: var(--text-normal);
    font-size: 0.9em;
    cursor: pointer;
    transition: all 0.2s;
  }

  .toolbar-btn:hover {
    background: var(--interactive-hover);
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9em;
    color: var(--text-normal);
    cursor: pointer;
    user-select: none;
  }

  .selection-info {
    padding: 0.75rem 1.5rem;
    background: var(--background-secondary);
    border-bottom: 1px solid var(--background-modifier-border);
    font-size: 0.9em;
    color: var(--text-muted);
  }

  .selection-info strong {
    color: var(--interactive-accent);
    font-weight: 600;
  }

  .file-tree-container {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
  }

  .loading-state,
  .empty-state {
    padding: 3rem;
    text-align: center;
    color: var(--text-muted);
  }

  .folder-node,
  .file-node {
    margin: 2px 0;
  }

  .folder-header,
  .file-node {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.5rem;
    border-radius: 4px;
    transition: background 0.2s;
    cursor: pointer;
    user-select: none;
  }

  .folder-header:hover,
  .file-node:hover {
    background: var(--background-modifier-hover);
  }

  .expand-btn {
    width: 20px;
    height: 20px;
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8em;
  }

  .expand-spacer {
    width: 20px;
    flex-shrink: 0;
  }

  input[type="checkbox"] {
    cursor: pointer;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  .folder-icon,
  .file-icon {
    flex-shrink: 0;
    color: var(--text-muted);
  }

  .folder-name,
  .file-name {
    flex: 1;
    font-size: 0.9em;
    color: var(--text-normal);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-count {
    font-size: 0.85em;
    color: var(--text-faint);
  }

  .folder-content {
    margin-left: 0;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
  }

  .cancel-btn,
  .confirm-btn {
    padding: 0.6rem 1.5rem;
    border: none;
    border-radius: 4px;
    font-size: 0.95em;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .cancel-btn {
    background: transparent;
    border: 1px solid var(--background-modifier-border);
    color: var(--text-normal);
  }

  .cancel-btn:hover {
    background: var(--background-modifier-hover);
  }

  .confirm-btn {
    background: var(--interactive-accent);
    color: white;
  }

  .confirm-btn:hover:not(:disabled) {
    opacity: 0.9;
  }

  .confirm-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* 滚动条样式 */
  .file-tree-container::-webkit-scrollbar {
    width: 8px;
  }

  .file-tree-container::-webkit-scrollbar-track {
    background: var(--background-secondary);
  }

  .file-tree-container::-webkit-scrollbar-thumb {
    background: var(--background-modifier-border);
    border-radius: 4px;
  }

  .file-tree-container::-webkit-scrollbar-thumb:hover {
    background: var(--text-faint);
  }
</style>

