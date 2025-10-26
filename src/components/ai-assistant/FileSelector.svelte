<script lang="ts">
  import { onMount } from 'svelte';
  import type AnkiPlugin from '../../main';
  import type { ObsidianFileInfo } from '../../types/ai-types';
  import { fileToInfo, filterMarkdownFiles, searchFiles, sortFilesByPath, formatFileSize } from '../../utils/file-utils';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';

  interface Props {
    plugin: AnkiPlugin;
    selectedFile: ObsidianFileInfo | null;
    onFileSelect: (file: ObsidianFileInfo) => void;
  }

  let { plugin, selectedFile = $bindable(), onFileSelect }: Props = $props();

  // 状态
  let isOpen = $state(false);
  let files = $state<ObsidianFileInfo[]>([]);
  let filteredFiles = $state<ObsidianFileInfo[]>([]);
  let searchQuery = $state('');
  let searchInputElement = $state<HTMLInputElement | undefined>(undefined);

  function loadFiles() {
    const markdownFiles = filterMarkdownFiles(plugin.app.vault.getMarkdownFiles());
    const fileInfos = markdownFiles.map(fileToInfo);
    files = sortFilesByPath(fileInfos);
    filteredFiles = files;
  }

  // 切换下拉菜单
  function toggleDropdown() {
    isOpen = !isOpen;
    if (isOpen) {
      // 重新加载文件列表
      loadFiles();
      // 聚焦搜索框
      setTimeout(() => {
        searchInputElement?.focus();
      }, 50);
    } else {
      // 关闭时重置搜索
      searchQuery = '';
      filteredFiles = files;
    }
  }

  // 搜索文件
  function handleSearch(event: Event) {
    const target = event.target as HTMLInputElement;
    searchQuery = target.value;
    
    if (searchQuery.trim()) {
      filteredFiles = searchFiles(files, searchQuery);
    } else {
      filteredFiles = files;
    }
  }

  // 选择文件
  function selectFile(file: ObsidianFileInfo) {
    selectedFile = file;
    onFileSelect(file);
    isOpen = false;
    searchQuery = '';
    filteredFiles = files;
  }

  // 点击外部关闭
  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.file-selector-wrapper')) {
      isOpen = false;
      searchQuery = '';
      filteredFiles = files;
    }
  }

  // 生命周期
  onMount(() => {
    loadFiles();
  });

  // 监听下拉菜单打开状态
  $effect(() => {
    if (isOpen) {
      const handleGlobalClick = (event: MouseEvent) => {
        handleClickOutside(event);
      };
      
      // 延迟添加监听器，避免立即触发
      const timeoutId = setTimeout(() => {
        document.addEventListener('click', handleGlobalClick);
      }, 0);
      
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('click', handleGlobalClick);
      };
    }
  });
</script>

<div class="file-selector-wrapper">
  <button 
    class="file-selector-btn"
    class:active={isOpen}
    onclick={toggleDropdown}
  >
    <ObsidianIcon name="folder" size={16} />
    <span class="file-selector-text">
      {selectedFile ? selectedFile.name : '选择Obsidian文件'}
    </span>
    <ObsidianIcon name="chevron-down" size={14} />
  </button>

  {#if isOpen}
    <div class="file-dropdown">
      <!-- 搜索框 - 固定在顶部 -->
      <div class="dropdown-search">
        <ObsidianIcon name="search" size={14} />
        <input
          bind:this={searchInputElement}
          type="search"
          placeholder="搜索文件名或路径..."
          value={searchQuery}
          oninput={handleSearch}
          class="search-input"
        />
        {#if searchQuery}
          <button 
            class="clear-search-btn"
            onclick={() => {
              searchQuery = '';
              filteredFiles = files;
              searchInputElement?.focus();
            }}
            title="清除搜索"
          >
            <ObsidianIcon name="x" size={12} />
          </button>
        {/if}
      </div>

      <!-- 文件列表 -->
      <div class="file-list">
        {#if filteredFiles.length === 0}
          <div class="empty-state">
            <ObsidianIcon name="file-x" size={32} />
            <p>没有找到匹配的文件</p>
          </div>
        {:else}
          {#each filteredFiles as file}
            <button
              class="file-item"
              class:selected={selectedFile?.path === file.path}
              onclick={() => selectFile(file)}
              title={file.path}
            >
              <div class="file-name">{file.name}</div>
              <div class="file-size">{formatFileSize(file.size)}</div>
            </button>
          {/each}
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .file-selector-wrapper {
    position: relative;
  }

  .file-selector-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    color: var(--text-normal);
    font-size: 0.9em;
    cursor: pointer;
    transition: all 0.2s ease;
    min-width: 200px;
  }

  .file-selector-btn:hover {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
  }

  .file-selector-btn.active {
    border-color: var(--interactive-accent);
    background: var(--background-modifier-hover);
  }

  .file-selector-text {
    flex: 1;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    min-width: 400px;
    max-width: 600px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 10000;
    display: flex;
    flex-direction: column;
    max-height: 500px;
  }

  .dropdown-search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    border-bottom: 1px solid var(--background-modifier-border);
    flex-shrink: 0;
  }

  .search-input {
    flex: 1;
    padding: 6px 8px;
    border: none;
    background: transparent;
    color: var(--text-normal);
    font-size: 0.9em;
    outline: none;
  }

  .search-input::placeholder {
    color: var(--text-muted);
  }

  .clear-search-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.2s ease;
  }

  .clear-search-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .file-list {
    overflow-y: auto;
    max-height: 440px;
    flex: 1;
  }

  .file-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    padding: 8px 16px;
    border: none;
    background: transparent;
    color: var(--text-normal);
    text-align: left;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .file-item:hover {
    background: var(--background-modifier-hover);
  }

  .file-item.selected {
    background: color-mix(in srgb, var(--interactive-accent) 15%, transparent);
  }

  .file-item.selected .file-name {
    color: var(--interactive-accent);
    font-weight: 600;
  }

  .file-item.selected .file-size {
    color: var(--interactive-accent);
  }

  .file-name {
    flex: 1;
    font-size: 0.875rem;
    color: var(--text-normal);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .file-size {
    font-size: 0.75rem;
    color: var(--text-muted);
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
    text-transform: uppercase;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    color: var(--text-muted);
  }

  .empty-state p {
    margin-top: 12px;
    font-size: 0.9em;
  }

  /* 滚动条样式 */
  .file-list::-webkit-scrollbar {
    width: 8px;
  }

  .file-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .file-list::-webkit-scrollbar-thumb {
    background: var(--background-modifier-border);
    border-radius: 4px;
  }

  .file-list::-webkit-scrollbar-thumb:hover {
    background: var(--background-modifier-border-hover);
  }
</style>
