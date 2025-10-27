<script lang="ts">
  import type { MemoryCurvePoint } from '../../data/analytics';
  
  interface Props {
    data: MemoryCurvePoint[];
    height?: number;
    showPrediction?: boolean;
  }
  
  let { data, height = 300, showPrediction = true }: Props = $props();
  
  // 计算图表尺寸和边距
  const margin = { top: 20, right: 80, bottom: 40, left: 60 };
  const width = 600;
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  
  // 计算数据范围
  let xScale = $derived(() => {
    if (data.length === 0) return { min: 0, max: 100, scale: (x: number) => 0 };
    
    const maxDay = Math.max(...data.map(d => d.day));
    const minDay = Math.min(...data.map(d => d.day));
    
    return {
      min: minDay,
      max: maxDay,
      scale: (x: number) => ((x - minDay) / (maxDay - minDay)) * chartWidth
    };
  });
  
  let yScale = $derived(() => {
    return {
      min: 0,
      max: 1,
      scale: (y: number) => chartHeight - (y * chartHeight)
    };
  });
  
  // 生成路径数据
  let actualPath = $derived(() => {
    if (data.length === 0) return '';

    const points = data.map(d =>
      `${xScale().scale(d.day)},${yScale().scale(d.actualRetention)}`
    );

    return `M ${points.join(' L ')}`;
  });

  let predictedPath = $derived(() => {
    if (data.length === 0 || !showPrediction) return '';

    const points = data.map(d =>
      `${xScale().scale(d.day)},${yScale().scale(d.fsrsPredicted)}`
    );

    return `M ${points.join(' L ')}`;
  });
  
  // 生成X轴刻度
  let xTicks = $derived(() => {
    if (data.length === 0) return [];

    const tickCount = 6;
    const xScaleValue = xScale();
    const step = (xScaleValue.max - xScaleValue.min) / (tickCount - 1);

    return Array.from({ length: tickCount }, (_, i) => {
      const value = xScaleValue.min + (step * i);
      return {
        value: Math.round(value),
        x: xScaleValue.scale(value)
      };
    });
  });

  // 生成Y轴刻度
  let yTicks = $derived(() => {
    const tickCount = 6;
    const yScaleValue = yScale();
    return Array.from({ length: tickCount }, (_, i) => {
      const value = i / (tickCount - 1);
      return {
        value: Math.round(value * 100),
        y: yScaleValue.scale(value)
      };
    });
  });
</script>

<div class="memory-curve-chart">
  <svg width={width} height={height}>
    <!-- 背景网格 -->
    <g class="grid" transform="translate({margin.left},{margin.top})">
      <!-- 水平网格线 -->
      {#each yTicks() as tick}
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

      <!-- 垂直网格线 -->
      {#each xTicks() as tick}
        <line
          x1={tick.x}
          y1="0"
          x2={tick.x}
          y2={chartHeight}
          stroke="var(--background-modifier-border)"
          stroke-width="1"
          opacity="0.3"
        />
      {/each}
    </g>
    
    <!-- 图表内容 -->
    <g transform="translate({margin.left},{margin.top})">
      <!-- FSRS预测曲线 -->
      {#if showPrediction && predictedPath()}
        <path
          d={predictedPath()}
          fill="none"
          stroke="var(--color-accent)"
          stroke-width="2"
          stroke-dasharray="5,5"
          opacity="0.7"
        />
      {/if}

      <!-- 实际记忆曲线 -->
      {#if actualPath()}
        <path
          d={actualPath()}
          fill="none"
          stroke="var(--interactive-accent)"
          stroke-width="3"
        />
      {/if}
      
      <!-- 数据点 -->
      {#each data as point}
        <g>
          <!-- 实际数据点 -->
          <circle
            cx={xScale().scale(point.day)}
            cy={yScale().scale(point.actualRetention)}
            r="4"
            fill="var(--interactive-accent)"
            stroke="var(--background-primary)"
            stroke-width="2"
          />

          <!-- FSRS预测点 -->
          {#if showPrediction}
            <circle
              cx={xScale().scale(point.day)}
              cy={yScale().scale(point.fsrsPredicted)}
              r="3"
              fill="var(--color-accent)"
              stroke="var(--background-primary)"
              stroke-width="1"
              opacity="0.7"
            />
          {/if}

          <!-- 样本大小指示器 -->
          <circle
            cx={xScale().scale(point.day)}
            cy={yScale().scale(point.actualRetention)}
            r={Math.sqrt(point.sampleSize) + 2}
            fill="var(--interactive-accent)"
            opacity="0.1"
          />
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
      
      {#each xTicks() as tick}
        <g transform="translate({tick.x},0)">
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
            font-size="12"
          >
            {tick.value}天
          </text>
        </g>
      {/each}
      
      <!-- X轴标签 -->
      <text
        x={chartWidth / 2}
        y="35"
        text-anchor="middle"
        fill="var(--text-normal)"
        font-size="14"
        font-weight="500"
      >
        复习间隔 (天)
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
      
      {#each yTicks() as tick}
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
            font-size="12"
          >
            {tick.value}%
          </text>
        </g>
      {/each}
      
      <!-- Y轴标签 -->
      <text
        x="-40"
        y={chartHeight / 2}
        text-anchor="middle"
        fill="var(--text-normal)"
        font-size="14"
        font-weight="500"
        transform="rotate(-90, -40, {chartHeight / 2})"
      >
        记忆保持率
      </text>
    </g>
    
    <!-- 图例 -->
    <g class="legend" transform="translate({width - margin.right + 10},{margin.top + 20})">
      <g>
        <line
          x1="0"
          y1="0"
          x2="20"
          y2="0"
          stroke="var(--interactive-accent)"
          stroke-width="3"
        />
        <text
          x="25"
          y="4"
          fill="var(--text-normal)"
          font-size="12"
        >
          实际保持率
        </text>
      </g>
      
      {#if showPrediction}
        <g transform="translate(0,20)">
          <line
            x1="0"
            y1="0"
            x2="20"
            y2="0"
            stroke="var(--color-accent)"
            stroke-width="2"
            stroke-dasharray="5,5"
            opacity="0.7"
          />
          <text
            x="25"
            y="4"
            fill="var(--text-normal)"
            font-size="12"
          >
            FSRS预测
          </text>
        </g>
      {/if}
    </g>
  </svg>
  
  <!-- 数据统计 -->
  {#if data.length > 0}
    <div class="chart-stats">
      <div class="stat-item">
        <span class="stat-label">数据点:</span>
        <span class="stat-value">{data.length}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">总样本:</span>
        <span class="stat-value">{data.reduce((sum, d) => sum + d.sampleSize, 0)}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">平均保持率:</span>
        <span class="stat-value">{(data.reduce((sum, d) => sum + d.actualRetention, 0) / data.length * 100).toFixed(1)}%</span>
      </div>
    </div>
  {:else}
    <div class="no-data">
      <p>暂无记忆曲线数据</p>
      <span class="muted">需要更多复习数据来生成记忆曲线</span>
    </div>
  {/if}
</div>

<style>
  .memory-curve-chart {
    background: var(--background-primary);
    border-radius: 0.5rem;
    padding: 1rem;
    border: 1px solid var(--background-modifier-border);
  }
  
  .chart-stats {
    display: flex;
    gap: 1rem;
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
