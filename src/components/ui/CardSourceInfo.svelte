<script lang="ts">
  import { logger } from '../../utils/logger';

  import type { WeavePlugin } from '../../main';
  import { ObsidianNavigationService, type NavigationTarget } from '../../services/obsidian-navigation-service';
  import { showNotification } from '../../utils/notifications';
  import { writeSystemClipboardText } from '../../utils/system-clipboard';
  import EnhancedIcon from './EnhancedIcon.svelte';

  interface Props {
    plugin: WeavePlugin;
    /** 源文档路径 */
    sourceDocument?: string;
    /** Obsidian块链接 */
    blockLink?: string;
    /** Obsidian URI链接 */
    uriLink?: string;
    /** 卡片UUID */
    cardUuid?: string;
    /** 显示模式 */
    mode?: 'compact' | 'full';
    /** 是否显示详细信息 */
    showDetails?: boolean;
  }

  let { 
    plugin, 
    sourceDocument, 
    blockLink, 
    uriLink, 
    cardUuid,
    mode = 'compact',
    showDetails = false 
  }: Props = $props();

  // 状态管理
  let navigationService: ObsidianNavigationService;
  let isNavigating = $state(false);
  let showFullPath = $state(false);

  // 初始化导航服务
  $effect(() => {
    if (plugin) {
      navigationService = new ObsidianNavigationService(plugin);
    }
  });

  // 计算属性
  const hasSource = $derived(sourceDocument || blockLink || uriLink);
  const fileName = $derived.by(() => {
    if (!sourceDocument) return '';
    return sourceDocument.split('/').pop()?.replace('.md', '') || '';
  });
  const folderPath = $derived.by(() => {
    if (!sourceDocument) return '';
    const parts = sourceDocument.split('/');
    return parts.slice(0, -1).join('/');
  });

  async function navigateToSource() {
    if (!navigationService || isNavigating) return;

    try {
      isNavigating = true;

      // 优先使用URI链接
      if (uriLink) {
        logger.debug('🔗 使用URI链接导航:', uriLink);
        const result = await navigationService.navigateToURI(uriLink);
        
        if (result.success) {
          showNotification('已跳转到源文档', 'success');
          return;
        } else {
          logger.warn('URI导航失败，尝试文件路径导航');
        }
      }

      // 使用文件路径导航
      if (sourceDocument) {
        logger.debug('📁 使用文件路径导航:', sourceDocument);
        
        const target: NavigationTarget = {
          filePath: sourceDocument
        };

        // 如果有块链接，尝试提取块ID
        if (blockLink) {
          const blockIdMatch = blockLink.match(/\^([a-zA-Z0-9-]+)/);
          if (blockIdMatch) {
            target.blockId = blockIdMatch[1];
          }
        }

        const result = await navigationService.navigateToFile(target, {
          newTab: false,
          focus: true,
          showNotification: true
        });

        if (!result.success) {
          showNotification(`导航失败: ${result.error}`, 'error');
        }
      } else {
        showNotification('没有可用的源文档信息', 'warning');
      }

    } catch (error) {
      logger.error('导航到源文档失败:', error);
      showNotification('导航失败', 'error');
    } finally {
      isNavigating = false;
    }
  }

  function copySourceInfo() {
    const info = [];
    
    if (sourceDocument) {
      info.push(`文档: ${sourceDocument}`);
    }
    
    if (blockLink) {
      info.push(`块链接: ${blockLink}`);
    }
    
    if (uriLink) {
      info.push(`URI: ${uriLink}`);
    }
    
    if (cardUuid) {
      info.push(`UUID: ${cardUuid}`);
    }

    const text = info.join('\n');
    
    writeSystemClipboardText(text).then((copied) => {
      showNotification(copied ? '源信息已复制' : '复制失败', copied ? 'success' : 'error');
    }).catch(() => {
      showNotification('复制失败', 'error');
    });
  }

  function toggleDetails() {
    showDetails = !showDetails;
  }

  function toggleFullPath() {
    showFullPath = !showFullPath;
  }
</script>

{#if hasSource}
  <div class="card-source-info {mode}">
    <!-- 紧凑模式 -->
    {#if mode === 'compact'}
      <div class="source-compact">
        <button 
          class="source-button"
          onclick={navigateToSource}
          disabled={isNavigating}
          title="跳转到源文档"
        >
          <EnhancedIcon name="external-link" size="12" />
          <span class="source-text">
            {fileName || '源文档'}
          </span>
          {#if isNavigating}
            <EnhancedIcon name="loader" size="10" />
          {/if}
        </button>

        {#if showDetails}
          <button 
            class="details-button"
            onclick={toggleDetails}
            title="隐藏详情"
          >
            <EnhancedIcon name="chevron-up" size="10" />
          </button>
        {:else}
          <button 
            class="details-button"
            onclick={toggleDetails}
            title="显示详情"
          >
            <EnhancedIcon name="chevron-down" size="10" />
          </button>
        {/if}
      </div>
    {:else}
      <!-- 完整模式 -->
      <div class="source-full">
        <div class="source-header">
          <div class="source-title">
            <EnhancedIcon name="file-text" size="14" />
            <span>源文档信息</span>
          </div>
          <div class="source-actions">
            <button 
              class="action-button"
              onclick={copySourceInfo}
              title="复制源信息"
            >
              <EnhancedIcon name="copy" size="12" />
            </button>
            <button 
              class="action-button"
              onclick={navigateToSource}
              disabled={isNavigating}
              title="跳转到源文档"
            >
              <EnhancedIcon name={isNavigating ? "loader" : "external-link"} size="12" />
            </button>
          </div>
        </div>

        <div class="source-content">
          {#if sourceDocument}
            <div class="source-item">
              <span class="item-label">文档:</span>
              <div class="item-value">
                <button 
                  class="path-button"
                  onclick={toggleFullPath}
                  title={showFullPath ? '显示文件名' : '显示完整路径'}
                >
                  {#if showFullPath}
                    <span class="full-path">{sourceDocument}</span>
                  {:else}
                    <span class="file-name">{fileName}</span>
                    {#if folderPath}
                      <span class="folder-hint">在 {folderPath}</span>
                    {/if}
                  {/if}
                </button>
              </div>
            </div>
          {/if}

          {#if blockLink}
            <div class="source-item">
              <span class="item-label">块链接:</span>
              <div class="item-value">
                <code class="block-link">{blockLink}</code>
              </div>
            </div>
          {/if}

          {#if cardUuid}
            <div class="source-item">
              <span class="item-label">UUID:</span>
              <div class="item-value">
                <code class="uuid">{cardUuid}</code>
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- 详情展开区域（紧凑模式） -->
    {#if mode === 'compact' && showDetails}
      <div class="source-details">
        {#if sourceDocument}
          <div class="detail-item">
            <span class="detail-label">文档:</span>
            <span class="detail-value">{sourceDocument}</span>
          </div>
        {/if}

        {#if blockLink}
          <div class="detail-item">
            <span class="detail-label">块链接:</span>
            <code class="detail-code">{blockLink}</code>
          </div>
        {/if}

        {#if cardUuid}
          <div class="detail-item">
            <span class="detail-label">UUID:</span>
            <code class="detail-code">{cardUuid}</code>
          </div>
        {/if}

        <div class="detail-actions">
          <button 
            class="detail-action"
            onclick={copySourceInfo}
            title="复制源信息"
          >
            <EnhancedIcon name="copy" size="10" />
            复制
          </button>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .card-source-info {
    font-size: 12px;
    color: var(--text-muted);
  }

  .card-source-info.compact {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .card-source-info.full {
    background: var(--background-secondary);
    border-radius: 4px;
    padding: 8px;
  }

  /* 紧凑模式样式 */
  .source-compact {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .source-button {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    background: none;
    border: 1px solid var(--background-modifier-border);
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
    color: var(--text-muted);
    transition: all 0.2s ease;
  }

  .source-button:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
    border-color: var(--text-accent);
  }

  .source-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .source-text {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .details-button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px;
    color: var(--text-muted);
    transition: color 0.2s ease;
  }

  .details-button:hover {
    color: var(--text-normal);
  }

  /* 完整模式样式 */
  .source-full {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .source-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .source-title {
    display: flex;
    align-items: center;
    gap: 4px;
    font-weight: 500;
    color: var(--text-normal);
  }

  .source-actions {
    display: flex;
    gap: 4px;
  }

  .action-button {
    background: none;
    border: 1px solid var(--background-modifier-border);
    border-radius: 3px;
    padding: 4px;
    cursor: pointer;
    color: var(--text-muted);
    transition: all 0.2s ease;
  }

  .action-button:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
    border-color: var(--text-accent);
  }

  .action-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .source-content {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .source-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }

  .item-label {
    min-width: 50px;
    font-weight: 500;
    color: var(--text-normal);
  }

  .item-value {
    flex: 1;
    min-width: 0;
  }

  .path-button {
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    padding: 0;
    color: var(--text-muted);
    transition: color 0.2s ease;
  }

  .path-button:hover {
    color: var(--text-accent);
  }

  .full-path {
    word-break: break-all;
  }

  .file-name {
    font-weight: 500;
    color: var(--text-normal);
  }

  .folder-hint {
    font-size: 10px;
    color: var(--text-muted);
    margin-left: 4px;
  }

  .block-link,
  .uuid {
    background: var(--background-modifier-border);
    padding: 2px 4px;
    border-radius: 2px;
    font-family: var(--font-monospace);
    font-size: 10px;
    word-break: break-all;
  }

  /* 详情展开区域样式 */
  .source-details {
    background: var(--background-secondary);
    border-radius: 4px;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    border: 1px solid var(--background-modifier-border);
  }

  .detail-item {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    font-size: 10px;
  }

  .detail-label {
    min-width: 40px;
    font-weight: 500;
    color: var(--text-normal);
  }

  .detail-value {
    flex: 1;
    word-break: break-all;
    color: var(--text-muted);
  }

  .detail-code {
    background: var(--background-modifier-border);
    padding: 1px 3px;
    border-radius: 2px;
    font-family: var(--font-monospace);
    font-size: 9px;
    word-break: break-all;
  }

  .detail-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 4px;
    padding-top: 4px;
    border-top: 1px solid var(--background-modifier-border);
  }

  .detail-action {
    display: flex;
    align-items: center;
    gap: 2px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 2px;
    font-size: 9px;
    color: var(--text-muted);
    transition: all 0.2s ease;
  }

  .detail-action:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }
</style>
