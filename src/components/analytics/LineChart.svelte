<script lang="ts">
  // Minimal SVG line/area chart (no heavy deps)
  interface Props {
    data?: Array<{ key: string; value: number }>;
    height?: number;
    stroke?: string;
    fill?: string;
  }
  let { data = [], height = 180, stroke = "#8b5cf6", fill = "rgba(139,92,246,0.15)" }: Props = $props();
  let hoverIdx = $state<number | null>(null);
  let focusIdx = $state<number | null>(null);
  let showTip = $derived(hoverIdx!=null ? hoverIdx : focusIdx);

  // 数据验证和处理
  let validData = $derived(() => {
    if (!Array.isArray(data) || data.length === 0) {
      return [];
    }
    return data.filter(d => d && typeof d.value === 'number' && !isNaN(d.value) && isFinite(d.value));
  });

  let values = $derived(validData().map(d => d.value));
  let maxV = $derived(values.length > 0 ? Math.max(...values) : 1);
  let minV = $derived(values.length > 0 ? Math.min(0, ...values) : 0);
  let n = $derived(validData().length);
  let w = $derived(Math.max(280, n * 28));

  // 改进的坐标计算函数
  function x(i: number): number {
    if (n <= 1) return w / 2;
    return (w / (n - 1)) * i;
  }

  function y(v: number): number {
    const pad = 10;
    const h = height - pad * 2;
    const range = maxV - minV;
    if (range === 0) return pad + h / 2;
    return pad + h - ((v - minV) / range) * h;
  }

  // 路径生成 - 处理边界情况
  let path = $derived(() => {
    const data = validData();
    if (data.length === 0) return '';
    if (data.length === 1) {
      const px = x(0);
      const py = y(data[0].value);
      return `M ${px} ${py} L ${px} ${py}`;
    }
    return data.map((d, i) =>
      `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`
    ).join(' ');
  });

  let area = $derived(() => {
    const data = validData();
    if (data.length === 0) return '';
    const baseLine = y(minV);
    if (data.length === 1) {
      const px = x(0);
      const py = y(data[0].value);
      return `M ${px} ${baseLine} L ${px} ${py} L ${px} ${baseLine} Z`;
    }
    return `M ${x(0)} ${baseLine} ${path().replace('M', 'L')} L ${x(n-1)} ${baseLine} Z`;
  });

  function handleMouseMove(e: MouseEvent) {
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const pxNorm = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    const idx = Math.round(pxNorm * Math.max(0, n - 1));
    hoverIdx = Math.max(0, Math.min(n - 1, idx));
  }
  function handleMouseLeave() { hoverIdx = null; }
  function onKey(e: KeyboardEvent) {
    if (n === 0) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); focusIdx = Math.max(0, (focusIdx ?? n-1) - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); focusIdx = Math.min(n-1, (focusIdx ?? 0) + 1); }
  }
</script>

{#if validData().length === 0}
  <div class="lc-empty">
    <p>暂无数据</p>
  </div>
{:else}
  <div class="lc-wrap">
    <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} role="img" aria-label="趋势折线图" onmousemove={handleMouseMove} onmouseleave={handleMouseLeave}>
      <path d={area()} fill={fill} stroke="none" />
      <path d={path()} fill="none" stroke={stroke} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      {#if showTip != null && showTip < validData().length}
        {@const currentData = validData()[showTip]}
        {@const tooltipWidth = 110}
        {@const tooltipHeight = 22}
        {@const pointY = y(currentData.value)}
        {@const tooltipX = Math.min(w - tooltipWidth - 10, Math.max(10, x(showTip) - tooltipWidth / 2))}
        {@const tooltipY = pointY < tooltipHeight + 15 ? pointY + 10 : pointY - tooltipHeight - 8}
        <line x1={x(showTip)} y1={10} x2={x(showTip)} y2={height-10} stroke="#94a3b8" stroke-dasharray="3 3" />
        <circle cx={x(showTip)} cy={pointY} r="3.5" fill={stroke} />
        <g transform={`translate(${tooltipX}, ${tooltipY})`}>
          <rect width={tooltipWidth} height={tooltipHeight} rx="6" fill="var(--background-primary)" stroke="var(--background-modifier-border)" />
          <text x="8" y="15" fill="var(--text-normal)" font-size="12">{currentData.key}: {currentData.value}</text>
        </g>
      {/if}
    </svg>
    <button class="lc-focus" aria-label="趋势图键盘导航，使用左右方向键切换数据点" onkeydown={onKey}></button>
  </div>
{/if}

<style>
  .lc-wrap {
    width: 100%;
    overflow-x: auto;
    position: relative;
    min-height: 180px;
  }

  .lc-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 180px;
    color: var(--text-muted);
    font-size: 0.9rem;
    background: var(--background-secondary);
    border-radius: 8px;
    border: 1px dashed var(--background-modifier-border);
  }

  svg {
    display: block;
    width: 100%;
    min-width: 280px;
  }

  path {
    vector-effect: non-scaling-stroke;
  }

  .lc-focus {
    position: absolute;
    inset: 0;
    opacity: 0;
    pointer-events: none;
  }

  .lc-focus:focus {
    outline: 2px solid var(--interactive-accent);
    outline-offset: 2px;
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .lc-wrap {
      overflow-x: scroll;
    }

    svg {
      min-width: 320px;
    }
  }
</style>
