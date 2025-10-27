<script lang="ts">
  import EnhancedIcon from "../../ui/EnhancedIcon.svelte";
  import { ICON_NAMES } from "../../../icons/index.js";
  import type { TableEmptyStateProps } from "../types/table-types";

  let { loading = false, isEmpty = false }: TableEmptyStateProps = $props();
</script>

{#if loading}
  <div class="tuanki-table-loading">
    <EnhancedIcon name={ICON_NAMES.REFRESH} size={24} />
    <span>正在加载卡片...</span>
  </div>
{:else if isEmpty}
  <div class="tuanki-table-empty">
    <EnhancedIcon name="layer-group" size={48} />
    <h3>暂无卡片</h3>
    <p>没有找到符合条件的卡片，点击"新增卡片"开始创建</p>
  </div>
{/if}

<style>
  .tuanki-table-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 300px;
    text-align: center;
    color: var(--text-muted);
    gap: 1rem;
  }

  .tuanki-table-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 300px;
    text-align: center;
    color: var(--text-muted);
    gap: 1rem;
  }

  .tuanki-table-empty h3 {
    margin: 0;
    color: var(--text-normal);
    font-size: 1.125rem;
  }

  .tuanki-table-empty p {
    margin: 0;
    font-size: 0.875rem;
  }
</style>


