<script lang="ts">
  import EnhancedIcon from "../ui/EnhancedIcon.svelte";

  interface Props {
    selectedCount: number;
    visible: boolean;
    onBatchCopy?: () => void;
    onBatchChangeDeck?: () => void;
    onBatchChangeTemplate?: () => void;
    onBatchAddTags?: () => void;
    onBatchRemoveTags?: () => void;
    onBatchDelete?: () => void;
    onClearSelection?: () => void;
  }

  let {
    selectedCount,
    visible,
    onBatchCopy,
    onBatchChangeDeck,
    onBatchChangeTemplate,
    onBatchAddTags,
    onBatchRemoveTags,
    onBatchDelete,
    onClearSelection
  }: Props = $props();

  // 处理批量复制
  function handleBatchCopyClick() {
    onBatchCopy?.();
  }

  // 处理更换牌组
  function handleBatchChangeDeckClick() {
    onBatchChangeDeck?.();
  }

  // 处理更换模板
  function handleBatchChangeTemplateClick() {
    onBatchChangeTemplate?.();
  }

  // 处理添加标签
  function handleBatchAddTagsClick() {
    onBatchAddTags?.();
  }

  // 处理删除标签
  function handleBatchRemoveTagsClick() {
    onBatchRemoveTags?.();
  }

  // 处理批量删除
  function handleBatchDeleteClick() {
    const confirmed = confirm(`确定要删除选中的 ${selectedCount} 张卡片吗？此操作不可撤销。`);
    if (confirmed) {
      onBatchDelete?.();
    }
  }

  // 清除选择
  function handleClearSelectionClick() {
    onClearSelection?.();
  }
</script>

{#if visible}
  <div class="tuanki-batch-toolbar" class:visible={selectedCount > 0}>
    <div class="tuanki-toolbar-info">
      <span>已选择 {selectedCount} 张卡片</span>
    </div>
    <div class="tuanki-toolbar-actions">
      <button class="tuanki-toolbar-btn" title="复制" onclick={handleBatchCopyClick}>
        <EnhancedIcon name="copy" size={16} />
      </button>
      <button class="tuanki-toolbar-btn tuanki-btn-danger" title="删除" onclick={handleBatchDeleteClick}>
        <EnhancedIcon name="trash-2" size={16} />
      </button>
      <button class="tuanki-toolbar-btn" title="更换牌组" onclick={handleBatchChangeDeckClick}>
        <EnhancedIcon name="folder" size={16} />
      </button>
      <button class="tuanki-toolbar-btn" title="更换模板（暂不可用）" disabled onclick={handleBatchChangeTemplateClick}>
        <EnhancedIcon name="file-text" size={16} />
      </button>
      <button class="tuanki-toolbar-btn" title="删除标签" onclick={handleBatchRemoveTagsClick}>
        <EnhancedIcon name="tag-x" size={16} />
      </button>
      <button class="tuanki-toolbar-btn" title="添加标签" onclick={handleBatchAddTagsClick}>
        <EnhancedIcon name="tag-plus" size={16} />
      </button>
      <button class="tuanki-toolbar-btn tuanki-btn-secondary" title="取消" onclick={handleClearSelectionClick}>
        <EnhancedIcon name="x" size={16} />
      </button>
    </div>
  </div>
{/if}

<style>
  .tuanki-batch-toolbar {
    position: fixed;
    bottom: 1rem;
    left: 50%;
    transform: translateX(-50%);
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.75rem;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
    backdrop-filter: blur(8px);
    z-index: 1000;
    animation: slideInUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    max-width: calc(100vw - 2rem);
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1rem;
  }

  .tuanki-toolbar-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text-accent);
    font-size: 0.875rem;
    font-weight: 500;
  }

  .tuanki-toolbar-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .tuanki-toolbar-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    color: var(--text-normal);
    padding: 0.5rem;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.2s ease;
    width: 2.5rem;
    height: 2.5rem;
  }

  .tuanki-toolbar-btn:hover {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
  }

  .tuanki-toolbar-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: var(--background-primary);
    border-color: var(--background-modifier-border);
  }

  .tuanki-toolbar-btn:disabled:hover {
    background: var(--background-primary);
    border-color: var(--background-modifier-border);
  }

  .tuanki-btn-danger {
    color: var(--text-error);
    border-color: var(--background-modifier-error);
  }

  .tuanki-btn-danger:hover {
    background: var(--background-modifier-error);
    color: white;
  }

  .tuanki-btn-secondary {
    color: var(--text-muted);
    border-color: var(--background-modifier-border);
  }

  .tuanki-btn-secondary:hover {
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
  @media (max-width: 768px) {
    .tuanki-batch-toolbar {
      flex-direction: column;
      gap: 0.75rem;
      padding: 1rem;
      border-radius: 0.75rem 0.75rem 0 0;
      bottom: 0;
      left: 0;
      right: 0;
      transform: none;
      max-width: none;
    }

    .tuanki-toolbar-info {
      align-self: flex-start;
    }

    .tuanki-toolbar-actions {
      width: 100%;
      justify-content: space-around;
      flex-wrap: wrap;
    }

    .tuanki-toolbar-btn {
      width: 2.5rem;
      height: 2.5rem;
      flex: none;
    }
  }
</style>
