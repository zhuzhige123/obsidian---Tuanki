<script lang="ts">
  import type { DifficultyBin } from '../../data/analytics';
  
  interface Props {
    data: DifficultyBin[];
    height?: number;
    showPercentage?: boolean;
  }
  
  let { data, height = 250, showPercentage = true }: Props = $props();
  
  // 计算图表尺寸和边距
  const margin = { top: 20, right: 40, bottom: 60, left: 60 };
  const width = 500;
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  
  // 计算数据范围
  let maxCount = $derived(() => {
    return data.length > 0 ? Math.max(...data.map(d => d.count)) : 0;
  });

  let maxPercentage = $derived(() => {
    return data.length > 0 ? Math.max(...data.map(d => d.percentage)) : 0;
  });

  // 比例尺
  let xScale = $derived(() => {
    const binWidth = data.length > 0 ? chartWidth / data.length : 0;
    return {
      binWidth,
      scale: (index: number) => index * binWidth
    };
  });

  let yScale = $derived(() => {
    const maxValue = showPercentage ? maxPercentage() : maxCount();
    const safeMaxValue = maxValue > 0 ? maxValue : 1; // 防止除零错误
    return {
      max: maxValue,
      scale: (value: number) => chartHeight - (value / safeMaxValue) * chartHeight
    };
  });
  
  // 生成Y轴刻度
  let yTicks = $derived.by(() => {
    const maxValue = showPercentage ? maxPercentage() : maxCount();
    const tickCount = 5;
    const safeMaxValue = maxValue > 0 ? maxValue : 1;
    return Array.from({ length: tickCount }, (_, i) => {
      const value = (safeMaxValue / (tickCount - 1)) * i;
      return {
        value: showPercentage ? value.toFixed(1) : Math.round(value).toString(),
        y: yScale().scale(value)
      };
    });
  });
  
  // 计算统计信息
  let stats = $derived(() => {
    if (data.length === 0) return { total: 0, avgDifficulty: 0, mostCommon: '' };
    
    const total = data.reduce((sum, d) => sum + d.count, 0);
    const weightedSum = data.reduce((sum, d) => sum + (d.x0 + d.x1) / 2 * d.count, 0);
    const avgDifficulty = total > 0 ? weightedSum / total : 0;
    
    const maxBin = data.reduce((max, d) => d.count > max.count ? d : max, data[0]);
    const mostCommon = maxBin ? maxBin.label : '';
    
    return { total, avgDifficulty, mostCommon };
  });
  
  // 获取柱状图颜色
  function getBarColor(bin: DifficultyBin): string {
    const difficulty = (bin.x0 + bin.x1) / 2;
    if (difficulty < 2) return 'var(--color-green)';
    if (difficulty < 4) return 'var(--color-yellow)';
    if (difficulty < 6) return 'var(--color-orange)';
    return 'var(--color-red)';
  }
</script>

<div class="difficulty-distribution-chart">
  <div class="chart-header">
    <h4>难度分布</h4>
    <div class="chart-controls">
      <label class="toggle-label">
        <input 
          type="checkbox" 
          bind:checked={showPercentage}
        />
        显示百分比
      </label>
    </div>
  </div>
  
  <svg width={width} height={height}>
    <!-- 背景网格 -->
    <g class="grid" transform="translate({margin.left},{margin.top})">
      {#each yTicks as tick}
        <line
          x1="0"
          y1={tick.y}
          x2={chartWidth}
          y2={tick.y}
          stroke="var(--background-modifier-border)"
          stroke-width="1"
          opacity="0.3"
        />
      {/each}
    </g>
    
    <!-- 柱状图 -->
    <g class="bars" transform="translate({margin.left},{margin.top})">
      {#each data as bin, index}
        {@const barHeight = chartHeight - yScale().scale(showPercentage ? bin.percentage : bin.count)}
        {@const barY = yScale().scale(showPercentage ? bin.percentage : bin.count)}

        <g class="bar-group">
          <!-- 柱子 -->
          <rect
            x={xScale().scale(index) + 2}
            y={barY}
            width={xScale().binWidth - 4}
            height={barHeight}
            fill={getBarColor(bin)}
            opacity="0.8"
            stroke="var(--background-primary)"
            stroke-width="1"
            rx="2"
          />

          <!-- 数值标签 -->
          {#if bin.count > 0}
            <text
              x={xScale().scale(index) + xScale().binWidth / 2}
              y={barY - 5}
              text-anchor="middle"
              fill="var(--text-normal)"
              font-size="11"
              font-weight="500"
            >
              {showPercentage ? `${bin.percentage.toFixed(1)}%` : bin.count}
            </text>
          {/if}
        </g>
      {/each}
    </g>
    
    <!-- X轴 -->
    <g class="x-axis" transform="translate({margin.left},{margin.top + chartHeight})">
      <line
        x1="0"
        y1="0"
        x2={chartWidth}
        y2="0"
        stroke="var(--text-muted)"
        stroke-width="1"
      />
      
      {#each data as bin, index}
        <g transform="translate({xScale().scale(index) + xScale().binWidth / 2},0)">
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="6"
            stroke="var(--text-muted)"
            stroke-width="1"
          />
          <text
            x="0"
            y="20"
            text-anchor="middle"
            fill="var(--text-muted)"
            font-size="10"
            transform="rotate(-45, 0, 20)"
          >
            {bin.label}
          </text>
        </g>
      {/each}
      
      <!-- X轴标签 -->
      <text
        x={chartWidth / 2}
        y="50"
        text-anchor="middle"
        fill="var(--text-normal)"
        font-size="12"
        font-weight="500"
      >
        难度区间
      </text>
    </g>
    
    <!-- Y轴 -->
    <g class="y-axis" transform="translate({margin.left},{margin.top})">
      <line
        x1="0"
        y1="0"
        x2="0"
        y2={chartHeight}
        stroke="var(--text-muted)"
        stroke-width="1"
      />
      
      {#each yTicks as tick}
        <g transform="translate(0,{tick.y})">
          <line
            x1="-6"
            y1="0"
            x2="0"
            y2="0"
            stroke="var(--text-muted)"
            stroke-width="1"
          />
          <text
            x="-10"
            y="4"
            text-anchor="end"
            fill="var(--text-muted)"
            font-size="11"
          >
            {tick.value}{showPercentage ? '%' : ''}
          </text>
        </g>
      {/each}
      
      <!-- Y轴标签 -->
      <text
        x="-40"
        y={chartHeight / 2}
        text-anchor="middle"
        fill="var(--text-normal)"
        font-size="12"
        font-weight="500"
        transform="rotate(-90, -40, {chartHeight / 2})"
      >
        {showPercentage ? '百分比' : '卡片数量'}
      </text>
    </g>
    
    <!-- 难度等级图例 -->
    <g class="legend" transform="translate({width - margin.right - 120},{margin.top})">
      <g>
        <rect x="0" y="0" width="12" height="12" fill="var(--color-green)" rx="2"/>
        <text x="16" y="9" fill="var(--text-normal)" font-size="10">简单 (0-2)</text>
      </g>
      <g transform="translate(0,16)">
        <rect x="0" y="0" width="12" height="12" fill="var(--color-yellow)" rx="2"/>
        <text x="16" y="9" fill="var(--text-normal)" font-size="10">中等 (2-4)</text>
      </g>
      <g transform="translate(0,32)">
        <rect x="0" y="0" width="12" height="12" fill="var(--color-orange)" rx="2"/>
        <text x="16" y="9" fill="var(--text-normal)" font-size="10">困难 (4-6)</text>
      </g>
      <g transform="translate(0,48)">
        <rect x="0" y="0" width="12" height="12" fill="var(--color-red)" rx="2"/>
        <text x="16" y="9" fill="var(--text-normal)" font-size="10">极难 (6+)</text>
      </g>
    </g>
  </svg>
  
  <!-- 统计信息 -->
  {#if data.length > 0}
    <div class="chart-stats">
      <div class="stat-item">
        <span class="stat-label">总卡片数</span>
        <span class="stat-value">{stats.total}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">平均难度</span>
        <span class="stat-value">{stats.avgDifficulty.toFixed(2)}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">最常见难度</span>
        <span class="stat-value">{stats.mostCommon}</span>
      </div>
    </div>
  {:else}
    <div class="no-data">
      <p>暂无难度分布数据</p>
      <span class="muted">需要包含FSRS数据的卡片来生成难度分布</span>
    </div>
  {/if}
</div>

<style>
  .difficulty-distribution-chart {
    background: var(--background-primary);
    border-radius: 0.5rem;
    padding: 1rem;
    border: 1px solid var(--background-modifier-border);
  }
  
  .chart-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }
  
  .chart-header h4 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-normal);
  }
  
  .chart-controls {
    display: flex;
    gap: 1rem;
  }
  
  .toggle-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--text-normal);
    cursor: pointer;
  }
  
  .toggle-label input[type="checkbox"] {
    margin: 0;
  }
  
  .chart-stats {
    display: flex;
    gap: 1.5rem;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--background-modifier-border);
  }
  
  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }
  
  .stat-label {
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  
  .stat-value {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-normal);
  }
  
  .no-data {
    text-align: center;
    padding: 2rem;
    color: var(--text-muted);
  }
  
  .no-data p {
    margin: 0 0 0.5rem 0;
    font-size: 1rem;
    color: var(--text-normal);
  }
  
  .muted {
    font-size: 0.875rem;
    color: var(--text-muted);
  }
</style>
