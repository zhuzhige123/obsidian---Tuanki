<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    byDay?: Record<string, number>;
    year?: number;
    className?: string;
  }

  let { byDay = {}, year = new Date().getFullYear(), className = "" }: Props = $props();

  const cell = 12, gap = 2;
  let hoveredDate = $state<string | null>(null);
  let tooltipPosition = $state<{ x: number; y: number } | null>(null);

  // 改进的日期计算函数，处理时区问题
  function dateToWeekDay(iso: string): { week: number; day: number; valid: boolean } {
    try {
      // 使用本地时区解析日期，避免时区偏移问题
      const dateParts = iso.split('-');
      if (dateParts.length !== 3) return { week: 0, day: 0, valid: false };

      const targetYear = parseInt(dateParts[0]);
      const month = parseInt(dateParts[1]) - 1; // 月份从0开始
      const date = parseInt(dateParts[2]);

      if (targetYear !== year) return { week: 0, day: 0, valid: false };

      const d = new Date(targetYear, month, date);
      const start = new Date(year, 0, 1);

      // 计算从年初到当前日期的天数
      const diffTime = d.getTime() - start.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays < 0) return { week: 0, day: 0, valid: false };

      // 计算周数和星期几
      const startDayOfWeek = start.getDay(); // 年初是星期几
      const adjustedDays = diffDays + startDayOfWeek;
      const week = Math.floor(adjustedDays / 7);
      const day = d.getDay();

      return { week: Math.min(week, 52), day, valid: true };
    } catch (error) {
      return { week: 0, day: 0, valid: false };
    }
  }

  // 数据验证和处理
  let validData = $derived(() => {
    const filtered: Record<string, number> = {};
    for (const [date, value] of Object.entries(byDay)) {
      if (typeof value === 'number' && !isNaN(value) && value >= 0) {
        const pos = dateToWeekDay(date);
        if (pos.valid) {
          filtered[date] = value;
        }
      }
    }
    return filtered;
  });

  let maxV = $derived(() => {
    const values = Object.values(validData());
    return values.length > 0 ? Math.max(...values) : 1;
  });

  // 改进的颜色映射函数
  function getColor(value: number): string {
    if (value === 0) return 'var(--background-secondary)';

    const intensity = Math.min(value / maxV(), 1);
    const baseColor = 'var(--interactive-accent)';

    // 使用CSS color-mix函数创建更好的颜色渐变
    if (intensity <= 0.25) {
      return `color-mix(in srgb, ${baseColor} ${Math.round(intensity * 40)}%, var(--background-secondary))`;
    } else if (intensity <= 0.5) {
      return `color-mix(in srgb, ${baseColor} ${Math.round(20 + intensity * 40)}%, var(--background-secondary))`;
    } else if (intensity <= 0.75) {
      return `color-mix(in srgb, ${baseColor} ${Math.round(40 + intensity * 40)}%, var(--background-secondary))`;
    } else {
      return `color-mix(in srgb, ${baseColor} ${Math.round(60 + intensity * 40)}%, var(--background-secondary))`;
    }
  }

  // 鼠标事件处理
  function handleMouseEnter(event: MouseEvent, date: string, value: number) {
    hoveredDate = date;
    const rect = (event.target as Element).getBoundingClientRect();
    
    const tooltipWidth = 200;
    const tooltipHeight = 60;
    
    // 计算水平位置，考虑边界
    let x = rect.left + rect.width / 2;
    if (x + tooltipWidth / 2 > window.innerWidth) {
      x = window.innerWidth - tooltipWidth / 2 - 10;
    } else if (x - tooltipWidth / 2 < 0) {
      x = tooltipWidth / 2 + 10;
    }
    
    // 计算垂直位置，如果上方空间不足则显示在下方
    let y = rect.top - 10;
    if (y - tooltipHeight < 0) {
      y = rect.bottom + 10;
    }
    
    tooltipPosition = { x, y };
  }

  function handleMouseLeave() {
    hoveredDate = null;
    tooltipPosition = null;
  }

  // 格式化日期显示
  function formatDate(dateStr: string): string {
    try {
      const date = new Date(dateStr + 'T00:00:00');
      return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  }
</script>

<div class="cal-wrap {className}" role="img" aria-label="学习日历热力图">
  {#if Object.keys(validData()).length === 0}
    <div class="cal-empty">
      <p>暂无 {year} 年学习数据</p>
    </div>
  {:else}
    <div class="cal-container">
      <!-- 月份标签 -->
      <div class="cal-months">
        {#each ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'] as month, i}
          <span class="month-label" style="left: {(i * 4.3 + 1) * (cell + gap)}px">{month}</span>
        {/each}
      </div>

      <!-- 星期标签 -->
      <div class="cal-days">
        {#each ['日', '一', '二', '三', '四', '五', '六'] as day, i}
          <span class="day-label" style="top: {gap + i * (cell + gap)}px">{day}</span>
        {/each}
      </div>

      <!-- 热力图主体 -->
      <svg width={(53*(cell+gap)+gap)} height={(7*(cell+gap)+gap)} class="cal-svg">
        {#each Object.entries(validData() || {}) as [dateStr, value]}
          {@const pos = dateToWeekDay(dateStr)}
          {#if pos.valid}
            <rect
              x={gap + pos.week*(cell+gap)}
              y={gap + pos.day*(cell+gap)}
              width={cell}
              height={cell}
              rx="2"
              fill={getColor(value)}
              class="cal-cell"
              role="button"
              tabindex="0"
              aria-label="{formatDate(dateStr)}: {value} 次学习"
              onmouseenter={(e) => handleMouseEnter(e, dateStr, value)}
              onmouseleave={handleMouseLeave}
            >
              <title>{formatDate(dateStr)}: {value} 次学习</title>
            </rect>
          {/if}
        {/each}
      </svg>

      <!-- 图例 -->
      <div class="cal-legend">
        <span class="legend-label">少</span>
        <div class="legend-colors">
          {#each [0, 0.25, 0.5, 0.75, 1] as intensity}
            <div
              class="legend-color"
              style="background-color: {intensity === 0 ? 'var(--background-secondary)' : getColor(intensity * maxV())}"
            ></div>
          {/each}
        </div>
        <span class="legend-label">多</span>
      </div>
    </div>
  {/if}

  <!-- 悬浮提示 -->
  {#if hoveredDate && tooltipPosition}
    <div
      class="cal-tooltip"
      style="left: {tooltipPosition.x}px; top: {tooltipPosition.y}px"
    >
      <div class="tooltip-date">{formatDate(hoveredDate)}</div>
      <div class="tooltip-value">{validData()[hoveredDate]} 次学习</div>
    </div>
  {/if}
</div>

<style>
  .cal-wrap {
    width: 100%;
    overflow-x: auto;
    position: relative;
    padding: 20px 0;
  }

  .cal-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 160px;
    color: var(--text-muted);
    font-size: 0.9rem;
    background: var(--background-secondary);
    border-radius: 8px;
    border: 1px dashed var(--background-modifier-border);
  }

  .cal-container {
    position: relative;
    min-width: 680px;
    padding-left: 30px;
    padding-top: 20px;
  }

  .cal-months {
    position: absolute;
    top: 0;
    left: 30px;
    right: 0;
    height: 20px;
  }

  .month-label {
    position: absolute;
    font-size: 0.75rem;
    color: var(--text-muted);
    font-weight: 500;
  }

  .cal-days {
    position: absolute;
    left: 0;
    top: 20px;
    width: 25px;
  }

  .day-label {
    position: absolute;
    font-size: 0.75rem;
    color: var(--text-muted);
    font-weight: 500;
    width: 20px;
    text-align: center;
  }

  .cal-svg {
    display: block;
    width: 100%;
    min-width: 650px;
  }

  .cal-cell {
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .cal-cell:hover {
    stroke: var(--interactive-accent);
    stroke-width: 1;
    transform: scale(1.1);
    transform-origin: center;
  }

  .cal-cell:focus {
    outline: 2px solid var(--interactive-accent);
    outline-offset: 1px;
  }

  .cal-legend {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-top: 16px;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .legend-colors {
    display: flex;
    gap: 2px;
  }

  .legend-color {
    width: 12px;
    height: 12px;
    border-radius: 2px;
    border: 1px solid var(--background-modifier-border);
  }

  .legend-label {
    font-weight: 500;
  }

  .cal-tooltip {
    position: fixed;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 0.8rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 1000;
    pointer-events: none;
    transform: translateX(-50%) translateY(-100%);
  }

  .tooltip-date {
    font-weight: 600;
    color: var(--text-normal);
    margin-bottom: 2px;
  }

  .tooltip-value {
    color: var(--text-muted);
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .cal-wrap {
      padding: 10px 0;
    }

    .cal-container {
      padding-left: 20px;
      padding-top: 15px;
    }

    .month-label,
    .day-label {
      font-size: 0.7rem;
    }

    .cal-tooltip {
      font-size: 0.75rem;
      padding: 6px 10px;
    }
  }
</style>
