<script lang="ts">
  import ObsidianIcon from "../ui/ObsidianIcon.svelte";
  import { tr } from "../../utils/i18n";
  import { showObsidianConfirm } from "../../utils/obsidian-confirm";
  import type { App } from "obsidian";

  interface Props {
    selectedCount: number;
    visible: boolean;
    app: App;
    dataSource?: 'memory' | 'questionBank' | 'incremental-reading';
    onBatchChangeDeck?: (event: MouseEvent) => void;
    onBatchAddTagsMenu?: (event: MouseEvent) => void;
    onBatchRemoveTagsMenu?: (event: MouseEvent) => void;
    onBatchExportSummaryMd?: () => void;
    onBatchDelete?: () => void;
    onClearSelection?: () => void;
    // 组建牌组
    onBuildDeck?: () => void;
    // 增量阅读操作
    onIRChangeDeck?: (event: MouseEvent) => void;
    onIRExtractCards?: () => void;
    isMobile?: boolean;
  }

  let {
    selectedCount,
    visible,
    app,
    dataSource = 'memory',
    onBatchChangeDeck,
    onBatchAddTagsMenu,
    onBatchRemoveTagsMenu,
    onBatchExportSummaryMd,
    onBatchDelete,
    onClearSelection,
    onBuildDeck,
    onIRChangeDeck,
    onIRExtractCards,
    isMobile = false
  }: Props = $props();
  
  let t = $derived($tr);

  // 处理更换牌组
  function handleBatchChangeDeckClick(event: MouseEvent) {
    onBatchChangeDeck?.(event);
  }

  function handleBatchAddTagsMenuClick(event: MouseEvent) {
    onBatchAddTagsMenu?.(event);
  }

  function handleBatchRemoveTagsMenuClick(event: MouseEvent) {
    onBatchRemoveTagsMenu?.(event);
  }

  function handleBatchExportSummaryMdClick() {
    onBatchExportSummaryMd?.();
  }

  // 处理批量删除
  async function handleBatchDeleteClick() {
    const confirmed = await showObsidianConfirm(
      app,
      t('cardManagement.batchDelete.confirm').replace('{count}', String(selectedCount)),
      { title: t('ui.confirmDelete'), confirmText: t('ui.delete') }
    );
    if (confirmed) {
      onBatchDelete?.();
    }
  }

  // 组建牌组
  function handleBuildDeckClick() {
    onBuildDeck?.();
  }

  // IR: 更换专题
  function handleIRChangeDeckClick(event: MouseEvent) {
    onIRChangeDeck?.(event);
  }

  // IR: 提取卡片
  function handleIRExtractCardsClick() {
    onIRExtractCards?.();
  }

  // 是否为增量阅读数据源
  const isIRDataSource = $derived(dataSource === 'incremental-reading');

</script>

{#if visible}
  <div class="weave-batch-toolbar-anchor" class:mobile={isMobile}>
    <div class="weave-toolbar-info">
      <span>{t('cardManagement.batchToolbar.selected', { count: selectedCount })}</span>
    </div>
    <div class="weave-batch-toolbar">
      <div class="weave-toolbar-actions">
      {#if isIRDataSource}
        <!-- 增量阅读模式按钮顺序：更换专题、提取卡片、标签操作、删除 -->
        {#if onIRChangeDeck}
          <button type="button" class="clickable-icon weave-toolbar-btn" title={t('cardManagement.batchToolbar.changeTopic')} onclick={handleIRChangeDeckClick}>
            <ObsidianIcon name="folder" size={16} />
          </button>
        {/if}
        {#if onIRExtractCards}
          <button type="button" class="clickable-icon weave-toolbar-btn" title={t('cardManagement.batchToolbar.extractCards')} onclick={handleIRExtractCardsClick}>
            <ObsidianIcon name="file-plus" size={16} />
          </button>
        {/if}
      {:else}
        <!-- 记忆/考试模式按钮顺序：组建牌组、更换牌组、标签操作、删除 -->
        {#if onBuildDeck}
          <button type="button" class="clickable-icon weave-toolbar-btn weave-btn-primary" title={t('cardManagement.batchToolbar.buildDeck')} onclick={handleBuildDeckClick}>
            <ObsidianIcon name="layers" size={16} />
          </button>
        {/if}
        {#if onBatchChangeDeck}
          <button type="button" class="clickable-icon weave-toolbar-btn" title={t('cardManagement.batchToolbar.changeDeck')} onclick={handleBatchChangeDeckClick}>
            <ObsidianIcon name="folder" size={16} />
          </button>
        {/if}
      {/if}
      <!-- 通用按钮：新增标签、移除标签、删除 -->
      {#if onBatchAddTagsMenu}
        <button
          type="button"
          class="clickable-icon weave-toolbar-btn"
          title={t('cardManagement.batchToolbar.addTags')}
          aria-label={t('cardManagement.batchToolbar.addTags')}
          onclick={handleBatchAddTagsMenuClick}
        >
          <ObsidianIcon name="plus-circle" size={16} />
        </button>
      {/if}
      {#if onBatchRemoveTagsMenu}
        <button
          type="button"
          class="clickable-icon weave-toolbar-btn"
          title={t('cardManagement.batchToolbar.removeTags')}
          aria-label={t('cardManagement.batchToolbar.removeTags')}
          onclick={handleBatchRemoveTagsMenuClick}
        >
          <ObsidianIcon name="minus-circle" size={16} />
        </button>
      {/if}
      {#if onBatchExportSummaryMd}
        <button
          type="button"
          class="clickable-icon weave-toolbar-btn"
          title={t('cardManagement.batchToolbar.exportSummaryMd')}
          aria-label={t('cardManagement.batchToolbar.exportSummaryMd')}
          onclick={handleBatchExportSummaryMdClick}
        >
          <ObsidianIcon name="file-down" size={16} />
        </button>
      {/if}
      <button type="button" class="clickable-icon weave-toolbar-btn weave-btn-danger" title={t('ui.delete')} onclick={handleBatchDeleteClick}>
        <ObsidianIcon name="trash-2" size={16} />
      </button>
      <button type="button" class="clickable-icon weave-toolbar-btn weave-btn-secondary" title={t('cardManagement.batchToolbar.clearSelection')} onclick={() => onClearSelection?.()}>
        <ObsidianIcon name="x-circle" size={16} />
      </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .weave-batch-toolbar-anchor {
    position: fixed;
    bottom: 1rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: var(--weave-z-overlay);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    max-width: calc(100vw - 2rem);
    animation: slideInUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .weave-batch-toolbar {
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.75rem;
    box-shadow: none;
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    padding: 0.75rem 1rem;
  }

  .weave-toolbar-info {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    color: var(--text-accent);
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.2;
    text-align: center;
    white-space: nowrap;
  }

  .weave-toolbar-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .weave-toolbar-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--text-normal);
    padding: 0.5rem;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.2s ease;
    width: 2.5rem;
    height: 2.5rem;
    box-shadow: none;
    outline: none;
  }

  .weave-toolbar-btn:hover {
    background: var(--background-modifier-hover);
  }

  .weave-toolbar-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: transparent;
  }

  .weave-toolbar-btn:disabled:hover {
    background: transparent;
  }

  .weave-toolbar-btn:focus-visible {
    outline: 2px solid var(--background-modifier-border-focus);
    outline-offset: 1px;
  }

  .weave-btn-danger {
    color: var(--text-error);
  }

  .weave-btn-danger:hover {
    background: var(--background-modifier-error);
    color: white;
  }

  .weave-btn-secondary {
    color: var(--text-muted);
  }

  .weave-btn-secondary:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .weave-btn-primary {
    color: var(--text-normal);
    font-weight: 600;
  }

  .weave-btn-primary:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }


  @keyframes slideInUp {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  /* 移动端适配 */
  .weave-batch-toolbar-anchor.mobile {
    --weave-batch-toolbar-mobile-bottom-gap: 8px;
    gap: 0.75rem;
    bottom: calc(
      var(--weave-workspace-bottom-offset, var(--weave-modal-bottom, env(safe-area-inset-bottom, 0px)))
      + var(--weave-batch-toolbar-mobile-bottom-gap)
    );
    left: env(safe-area-inset-left, 0px);
    right: env(safe-area-inset-right, 0px);
    transform: none;
    max-width: none;
  }

  .weave-batch-toolbar-anchor.mobile .weave-batch-toolbar {
    width: 100%;
    padding: 1rem;
    border-radius: 0.75rem 0.75rem 0 0;
  }

  .weave-batch-toolbar-anchor.mobile .weave-toolbar-actions {
    width: 100%;
    justify-content: space-around;
    flex-wrap: wrap;
  }

  .weave-batch-toolbar-anchor.mobile .weave-toolbar-btn {
    width: 2.5rem;
    height: 2.5rem;
    flex: none;
  }
</style>
