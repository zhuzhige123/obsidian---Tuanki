<script lang="ts">
  import { Menu, Platform } from "obsidian";
  import { tr } from "../../utils/i18n";
  import ObsidianIcon from "./ObsidianIcon.svelte";

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

  let t = $derived($tr);

  const isMobile = Platform.isMobile;
  const pageSizes = [20, 25, 50, 100, 200, 500];

  let totalPages = $derived(Math.max(1, Math.ceil(totalItems / itemsPerPage)));
  let isTransitioning = $state(false);

  function goToPage(page: number) {
    if (page >= 1 && page <= totalPages && !isTransitioning) {
      isTransitioning = true;
      onPageChange(page);
      window.setTimeout(() => {
        isTransitioning = false;
      }, 300);
    }
  }

  function showPageSizeMenu(event: MouseEvent) {
    const menu = new Menu();

    pageSizes.forEach((size) => {
      menu.addItem((item) => {
        item.setTitle(String(size));
        if (size === itemsPerPage) {
          item.setIcon("check");
        }
        item.onClick(() => {
          onItemsPerPageChange(size);
        });
      });
    });

    menu.showAtMouseEvent(event);
  }

</script>

<div
  class="table-pagination weave-bottom-toolbar"
  class:transitioning={isTransitioning}
  class:mobile={isMobile}
>
  <div class="toolbar-row">
    <div class="toolbar-group toolbar-group--start">
      <button
        type="button"
        class="weave-toolbar-tab"
        onclick={showPageSizeMenu}
        aria-label={t("ui.pagination.itemsPerPage")}
      >
        <span class="weave-toolbar-tab-label">{itemsPerPage}</span>
        <ObsidianIcon name="chevron-down" size={12} class="weave-toolbar-tab-icon" />
      </button>
    </div>

    <div class="toolbar-group toolbar-group--center">
      <button
        type="button"
        class="weave-toolbar-tab"
        disabled={currentPage === 1}
        onclick={() => goToPage(1)}
        title={t("ui.pagination.first")}
        aria-label={t("ui.pagination.first")}
      >
        &laquo;
      </button>
      <button
        type="button"
        class="weave-toolbar-tab"
        disabled={currentPage === 1}
        onclick={() => goToPage(currentPage - 1)}
        title={t("ui.pagination.previous")}
        aria-label={t("ui.pagination.previous")}
      >
        &lsaquo;
      </button>
      <span class="weave-toolbar-tab weave-toolbar-tab--static">
        {t("ui.pagination.page").replace("{n}", `${currentPage}/${totalPages}`)}
      </span>
      <button
        type="button"
        class="weave-toolbar-tab"
        disabled={currentPage === totalPages}
        onclick={() => goToPage(currentPage + 1)}
        title={t("ui.pagination.next")}
        aria-label={t("ui.pagination.next")}
      >
        &rsaquo;
      </button>
      <button
        type="button"
        class="weave-toolbar-tab"
        disabled={currentPage === totalPages}
        onclick={() => goToPage(totalPages)}
        title={t("ui.pagination.last")}
        aria-label={t("ui.pagination.last")}
      >
        &raquo;
      </button>
    </div>

    <div class="toolbar-group toolbar-group--end">
      <span class="weave-toolbar-tab weave-toolbar-tab--static weave-toolbar-tab--meta">
        {t("ui.pagination.total").replace("{n}", String(totalItems))}
      </span>
    </div>
  </div>
</div>

<style>
  .table-pagination {
    flex-shrink: 0;
    padding: 0.5rem 0.75rem;
    background: transparent;
    font-size: var(--font-ui-small);
    color: var(--text-muted);
  }

  .table-pagination.mobile {
    padding: 0.5rem 0.625rem;
  }

  .toolbar-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    width: 100%;
    min-width: 0;
  }

  .toolbar-group {
    display: flex;
    align-items: center;
    gap: 0.125rem;
    min-width: 0;
  }

  .toolbar-group .weave-toolbar-tab + .weave-toolbar-tab {
    margin-left: 0;
  }

  .toolbar-group--center {
    flex: 1;
    justify-content: center;
  }

  .toolbar-group--end {
    flex-shrink: 0;
    justify-content: flex-end;
  }

  /* 类 VS Code 底栏：纯文本片段，无边框无阴影 */
  .weave-toolbar-tab {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    min-height: var(--clickable-icon-size, 28px);
    padding: 0.25rem 0.5rem;
    margin: 0;
    border: none;
    outline: none;
    box-shadow: none;
    background: transparent;
    background-image: none;
    border-radius: var(--clickable-icon-radius, var(--radius-s));
    color: var(--text-muted);
    font-family: var(--font-interface);
    font-size: var(--font-ui-small);
    font-weight: var(--font-normal);
    line-height: 1.2;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
    transition: color 0.15s ease, background-color 0.15s ease;
  }

  .weave-toolbar-tab:hover:not(:disabled):not(.weave-toolbar-tab--static) {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
    border: none;
    box-shadow: none;
  }

  .weave-toolbar-tab:active:not(:disabled):not(.weave-toolbar-tab--static) {
    color: var(--text-normal);
    background: var(--background-modifier-active-hover);
    transform: none;
    opacity: 1;
    border: none;
    box-shadow: none;
  }

  .weave-toolbar-tab:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--background-modifier-border-focus);
  }

  .weave-toolbar-tab:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .weave-toolbar-tab--static {
    cursor: default;
    user-select: none;
    white-space: nowrap;
  }

  .weave-toolbar-tab--meta {
    color: var(--text-faint);
    font-size: var(--font-ui-smaller);
  }

  .weave-toolbar-tab-label {
    white-space: nowrap;
  }

  .weave-toolbar-tab :global(.weave-toolbar-tab-icon) {
    flex-shrink: 0;
    color: var(--text-faint);
  }

  .table-pagination.transitioning {
    opacity: 0.85;
  }

  @media (max-width: 768px) {
    .toolbar-row {
      gap: 0.375rem;
    }

    .toolbar-group--end {
      display: none;
    }

    .weave-toolbar-tab--static:not(.weave-toolbar-tab--meta) {
      padding-inline: 0.375rem;
      min-width: 3.25rem;
      text-align: center;
    }
  }
</style>
