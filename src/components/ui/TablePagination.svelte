<script lang="ts">
  interface Props {
    currentPage: number;
    totalItems: number;
    itemsPerPage: number;
    onPageChange: (page: number) => void;
    onItemsPerPageChange: (size: number) => void;
  }

  let {
    currentPage,
    totalItems,
    itemsPerPage,
    onPageChange,
    onItemsPerPageChange
  }: Props = $props();

  const pageSizes = [20, 50, 100, 200, 500];

  let totalPages = $derived(Math.ceil(totalItems / itemsPerPage));
  let isTransitioning = $state(false);

  function goToPage(page: number) {
    if (page >= 1 && page <= totalPages && !isTransitioning) {
      isTransitioning = true;
      onPageChange(page);
      // 重置动画状态
      setTimeout(() => {
        isTransitioning = false;
      }, 300);
    }
  }


  function handleItemsPerPageChange(event: Event) {
    const newSize = parseInt((event.target as HTMLSelectElement).value, 10);
    onItemsPerPageChange(newSize);
  }
</script>

<div class="table-pagination" class:transitioning={isTransitioning}>
  <div class="items-per-page">
    <span>每页显示</span>
    <select value={itemsPerPage} onchange={handleItemsPerPageChange}>
      {#each pageSizes as size}
        <option value={size}>{size}</option>
      {/each}
    </select>
    <span>项</span>
  </div>
  <div class="pagination-controls">
    <button onclick={() => goToPage(1)} disabled={currentPage === 1}>&laquo;</button>
    <button onclick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}>&lsaquo;</button>
    <span class="page-info">
      第 {currentPage} / {totalPages} 页
    </span>
    <button onclick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages}>&rsaquo;</button>
    <button onclick={() => goToPage(totalPages)} disabled={currentPage === totalPages}>&raquo;</button>
  </div>
  <div class="total-items">
    共 {totalItems} 张卡片
  </div>
</div>

<style>
  .table-pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  .items-per-page,
  .pagination-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  select {
    background-color: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s);
    color: var(--text-normal);
    padding: 0.25rem 0.5rem;
  }

  button {
    background: none;
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-s);
    color: var(--text-normal);
    cursor: pointer;
    padding: 0.25rem 0.75rem;
    transition: all 0.2s ease;
    transform: scale(1);
  }

  button:hover:not(:disabled) {
    background: var(--background-modifier-hover);
    border-color: var(--text-muted);
    transform: scale(1.05);
  }

  button:active:not(:disabled) {
    transform: scale(0.95);
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* 翻页动画效果 */
  .table-pagination.transitioning {
    opacity: 0.8;
  }

  .pagination-controls {
    position: relative;
  }

  .pagination-controls button:not(:disabled):active {
    animation: pageChangeClick 0.3s ease;
  }

  @keyframes pageChangeClick {
    0% { transform: scale(1); }
    50% { transform: scale(0.9); }
    100% { transform: scale(1); }
  }
</style>
