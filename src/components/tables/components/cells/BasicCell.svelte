<script lang="ts">
  import { truncateText } from "../../utils/table-utils";
  import type { BasicCellProps } from "../../types/table-types";

  let { content, title = content, columnKey }: BasicCellProps = $props();

  const displayContent = $derived(truncateText(content));
</script>

<td class="tuanki-content-column tuanki-{columnKey}-column">
  <div class="tuanki-cell-content">
    <span class="tuanki-text-content" {title}>
      {displayContent}
    </span>
  </div>
</td>

<style>
  @import '../../styles/cell-common.css';

  .tuanki-content-column {
    width: 25%;
    min-width: 200px;
    max-width: 300px;
  }
</style>


