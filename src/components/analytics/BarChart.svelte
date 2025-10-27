<script lang="ts">
  import { VALIDATION_CONFIG } from "../../config/analytics-config";
  import { i18n } from "../../utils/i18n";

  interface Props {
    data?: Array<{ key: string; value: number; color?: string }>;
    height?: number;
    showEmpty?: boolean;
  }

  let { data = [], height = 180, showEmpty = true }: Props = $props();

  // 数据验证和处理
  let validData = $derived(() => {
    if (!Array.isArray(data) || data.length === 0) {
      return [];
    }

    return data.filter(d => {
      // 验证数据结构
      if (!d || typeof d !== 'object') return false;
      if (typeof d.key !== 'string') return false;
      if (typeof d.value !== 'number') return false;
      if (isNaN(d.value) || !isFinite(d.value)) return false;

      // 验证数值范围
      if (d.value < 0) return false; // 柱状图通常不显示负值

      return true;
    }).map(d => ({
      ...d,
      value: Math.max(0, d.value) // 确保非负值
    }));
  });

  let hasValidData = $derived(validData().length > 0);
  let n = $derived(validData().length);
  let w = $derived(Math.max(280, n * 36));

  // 安全的最大值计算
  let maxV = $derived(() => {
    const values = validData().map(d => d.value);
    if (values.length === 0) return 1;
    const max = Math.max(...values);
    return max > 0 ? max : 1;
  });

  function x(i: number): number {
    if (n === 0) return 0;
    const pad = 12;
    const bw = (w - pad * 2) / n;
    return pad + i * bw;
  }

  function barW(): number {
    if (n === 0) return 0;
    const pad = 12;
    return Math.max(0, (w - pad * 2) / n - 8);
  }

  function y(v: number): number {
    const pad = 10;
    const h = height - pad * 2;
    const ratio = maxV() > 0 ? v / maxV() : 0;
    return pad + h - ratio * h;
  }

  // 格式化数值显示
  function formatValue(value: number): string {
    if (value >= 1000000) {
      return (value / 1000000).toFixed(1) + 'M';
    } else if (value >= 1000) {
      return (value / 1000).toFixed(1) + 'K';
    }
    return value.toString();
  }
</script>

{#if hasValidData}
  <div class="bc-wrap">
    <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} role="img" aria-label="柱状图">
      {#each validData() as d, i}
        <g>
          <rect
            x={x(i)}
            y={y(d.value)}
            width={barW()}
            height={Math.max(0, height - y(d.value) - 10)}
            fill={d.color || "#4f46e5"}
            rx="6"
            class="bar-rect"
          >
            <title>{d.key}: {formatValue(d.value)}</title>
          </rect>

          <!-- 数值标签 -->
          {#if d.value > 0 && barW() > 30}
            <text
              x={x(i) + barW() / 2}
              y={y(d.value) - 5}
              text-anchor="middle"
              class="bar-label"
              font-size="12"
              fill="var(--text-muted)"
            >
              {formatValue(d.value)}
            </text>
          {/if}
        </g>
      {/each}
    </svg>
  </div>
{:else if showEmpty}
  <div class="bc-empty">
    <div class="empty-icon">📊</div>
    <p class="empty-text">{i18n.t('analytics.dashboard.noData')}</p>
  </div>
{/if}

<style>
  .bc-wrap {
    width: 100%;
    overflow-x: auto;
    min-height: 180px;
  }

  svg {
    display: block;
    width: 100%;
  }

  .bar-rect {
    transition: opacity 0.2s ease;
  }

  .bar-rect:hover {
    opacity: 0.8;
  }

  .bar-label {
    font-family: var(--font-ui-small);
    pointer-events: none;
  }

  .bc-empty {
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
