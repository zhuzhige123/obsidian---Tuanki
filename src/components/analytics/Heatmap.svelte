<script lang="ts">
  import { i18n } from "../../utils/i18n";

  interface Props {
    matrix?: number[][];
    cell?: number;
    gap?: number;
    showEmpty?: boolean;
  }

  let { matrix = [], cell = 14, gap = 2, showEmpty = true }: Props = $props();

  // 数据验证和处理
  let validMatrix = $derived(() => {
    if (!Array.isArray(matrix) || matrix.length === 0) {
      return [];
    }

    // 验证矩阵结构
    const validRows = matrix.filter(row => {
      if (!Array.isArray(row)) return false;
      return row.every(val => typeof val === 'number' && isFinite(val) && !isNaN(val));
    });

    if (validRows.length === 0) return [];

    // 确保所有行长度一致
    const maxCols = Math.max(...validRows.map(row => row.length));
    return validRows.map(row => {
      const paddedRow = [...row];
      while (paddedRow.length < maxCols) {
        paddedRow.push(0);
      }
      return paddedRow.map(val => Math.max(0, val)); // 确保非负值
    });
  });

  let hasValidData = $derived(validMatrix().length > 0 && validMatrix()[0]?.length > 0);
  let rows = $derived(validMatrix().length);
  let cols = $derived(validMatrix()[0]?.length || 0);
  let w = $derived(cols * (cell + gap) + gap);
  let h = $derived(rows * (cell + gap) + gap);

  // 安全的最大值计算
  let maxV = $derived(() => {
    const flatValues = validMatrix().flat();
    if (flatValues.length === 0) return 1;
    const max = Math.max(...flatValues);
    return max > 0 ? max : 1;
  });

  function color(v: number): string {
    const normalizedValue = Math.max(0, Math.min(1, v / maxV()));
    const alpha = Math.round(30 + normalizedValue * 60);
    return `rgba(139,92,246,${alpha/100})`;
  }

  function formatValue(v: number): string {
    if (v >= 1000) {
      return (v / 1000).toFixed(1) + 'K';
    }
    return v.toString();
  }
</script>

{#if hasValidData}
  <div class="hm-wrap" role="img" aria-label="heatmap">
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {#each validMatrix() as row, r}
        {#each row as v, c}
          <rect
            x={gap + c * (cell + gap)}
            y={gap + r * (cell + gap)}
            width={cell}
            height={cell}
            rx="3"
            fill={color(v)}
            class="heatmap-cell"
          >
            <title>值: {formatValue(v)}</title>
          </rect>
        {/each}
      {/each}
    </svg>
  </div>
{:else if showEmpty}
  <div class="hm-empty">
    <div class="empty-icon">🔥</div>
    <p class="empty-text">{i18n.t('analytics.dashboard.noData')}</p>
  </div>
{/if}

<style>
  .hm-wrap {
    width: 100%;
    overflow-x: auto;
    min-height: 180px;
  }

  svg {
    display: block;
    width: 100%;
  }

  .heatmap-cell {
    transition: opacity 0.2s ease;
  }

  .heatmap-cell:hover {
    opacity: 0.8;
    stroke: var(--interactive-accent);
    stroke-width: 1;
  }

  .hm-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 180px;
    color: var(--text-muted);
    background: var(--background-secondary);
    border-radius: 8px;
    border: 1px dashed var(--background-modifier-border);
  }

  .empty-icon {
    font-size: 2rem;
    margin-bottom: 0.5rem;
    opacity: 0.5;
  }

  .empty-text {
    margin: 0;
    font-size: 0.875rem;
  }
</style>
