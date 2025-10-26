<script lang="ts">
  import type { Card } from '../../data/types';
  import { EnhancedFSRS } from '../../algorithms/enhanced-fsrs';

  interface Props {
    cards: Card[];
    sessionAccuracy: number;
    className?: string;
  }

  let { cards, sessionAccuracy, className = '' }: Props = $props();

  // 增强的FSRS实例
  let enhancedFSRS = new EnhancedFSRS();

  // 状态管理 - 只保留时间范围选择
  let timeRange = $state(30); // 30, 60, 90天

  // 数据验证和默认值
  let validCards = $derived(() => {
    if (!Array.isArray(cards) || cards.length === 0) {
      return [];
    }
    return cards.filter(card =>
      card &&
      card.fsrs &&
      Array.isArray(card.reviewHistory) &&
      card.reviewHistory.length > 0
    );
  });

  // 设置用户历史数据
  $effect(() => {
    if (validCards().length > 0) {
      const allReviews = validCards().flatMap(card => card.reviewHistory || []);
      enhancedFSRS.setUserHistory(allReviews);
    }
  });

  // 记忆曲线数据计算 - 添加错误处理
  let memoryCurveData = $derived(() => {
    try {
      const data = validCards();
      if (data.length === 0) {
        return enhancedFSRS.generateMemoryCurve([], timeRange, sessionAccuracy);
      }

      // 验证sessionAccuracy
      const validAccuracy = typeof sessionAccuracy === 'number' &&
                           !isNaN(sessionAccuracy) &&
                           sessionAccuracy >= 0 &&
                           sessionAccuracy <= 100
                           ? sessionAccuracy
                           : 85; // 默认值

      return enhancedFSRS.generateMemoryCurve(data, timeRange, validAccuracy);
    } catch (error) {
      console.error('Error generating memory curve data:', error);
      return enhancedFSRS.generateMemoryCurve([], timeRange, 85);
    }
  });
</script>

<div class="memory-curve-chart {className}">
  <!-- 简化的图表标题 -->
  <div class="chart-header">
    <h3>记忆曲线</h3>
    <p class="chart-description">实际记忆曲线与预测记忆曲线对比</p>
  </div>

  <!-- 时间范围选择 -->
  <div class="time-range-selector">
    <span class="selector-label">时间段:</span>
    {#each [30, 60, 90] as range}
      <button
        class="time-button"
        class:active={timeRange === range}
        onclick={() => timeRange = range}
      >
        {range}天
      </button>
    {/each}
  </div>

  <!-- 图例 -->
  <div class="chart-legend">
    <div class="legend-item">
      <div class="legend-line fsrs"></div>
      <span>预测记忆曲线</span>
    </div>
    <div class="legend-item">
      <div class="legend-line actual"></div>
      <span>实际记忆曲线</span>
    </div>
  </div>

  <!-- SVG曲线图 -->
  <div class="chart-container">
    {#if memoryCurveData().length === 0}
      <div class="no-data-message">
        <div class="no-data-icon">📊</div>
        <h4>暂无记忆曲线数据</h4>
        <p>需要至少有一些学习记录才能生成记忆曲线分析</p>
        <p class="no-data-hint">开始学习后，这里将显示您的记忆保持率趋势</p>
      </div>
    {:else}
      {@const curveData = memoryCurveData()}
      {@const validCurveData = curveData.filter(point =>
        point &&
        typeof point.day === 'number' &&
        typeof point.fsrsPredicted === 'number' &&
        typeof point.actualPredicted === 'number' &&
        !isNaN(point.fsrsPredicted) &&
        !isNaN(point.actualPredicted)
      )}

      {#if validCurveData.length === 0}
        <div class="no-data-message">
          <div class="no-data-icon">⚠️</div>
          <h4>数据处理错误</h4>
          <p>记忆曲线数据存在问题，请检查学习记录</p>
        </div>
      {:else}
        <svg viewBox="0 0 600 320" class="curve-svg">
      <!-- 背景网格 -->
      <defs>
        <pattern id="grid" width="40" height="30" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 30" fill="none" stroke="var(--background-modifier-border)" stroke-width="0.5" opacity="0.3"/>
        </pattern>

        <!-- 渐变填充 -->
        <linearGradient id="gapGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:var(--interactive-accent);stop-opacity:0.1" />
          <stop offset="100%" style="stop-color:var(--interactive-accent);stop-opacity:0.05" />
        </linearGradient>
      </defs>
      
      <!-- 网格背景 -->
      <rect width="600" height="280" fill="url(#grid)"/>
      
      <!-- Y轴刻度和标签 -->
      {#each [100, 80, 60, 40, 20, 0] as value, i}
        <g>
          <line
            x1="80"
            y1={50 + i * 35}
            x2="550"
            y2={50 + i * 35}
            stroke="var(--background-modifier-border)"
            stroke-width="1"
            opacity="0.3"
          />
          <text
            x="70"
            y={55 + i * 35}
            fill="var(--text-normal)"
            font-size="8"
            font-weight="400"
            text-anchor="end"
            font-family="var(--font-interface)"
          >
            {value}%
          </text>
        </g>
      {/each}
      
      <!-- X轴刻度和标签 - 动态适应时间范围 -->
      {#each (timeRange === 30 ? [0, 5, 10, 15, 20, 25, 30] :
                            timeRange === 60 ? [0, 10, 20, 30, 40, 50, 60] :
                            [0, 15, 30, 45, 60, 75, 90]) as day, i}
        {@const xAxisLabels = timeRange === 30 ? [0, 5, 10, 15, 20, 25, 30] :
                              timeRange === 60 ? [0, 10, 20, 30, 40, 50, 60] :
                              [0, 15, 30, 45, 60, 75, 90]}
        {@const stepWidth = 470 / (xAxisLabels.length - 1)}
        <g>
          <line
            x1={80 + i * stepWidth}
            y1="50"
            y2="260"
            x2={80 + i * stepWidth}
            stroke="var(--background-modifier-border)"
            stroke-width="1"
            opacity="0.2"
          />
          <text
            x={80 + i * stepWidth}
            y="275"
            fill="var(--text-normal)"
            font-size="8"
            font-weight="400"
            text-anchor="middle"
            font-family="var(--font-interface)"
          >
            {day}
          </text>
        </g>
      {/each}

      <!-- 坐标轴 - 加粗显示 -->
      <line
        x1="80"
        y1="50"
        x2="80"
        y2="260"
        stroke="var(--text-normal)"
        stroke-width="2"
        opacity="0.8"
      />
      <line
        x1="80"
        y1="260"
        x2="550"
        y2="260"
        stroke="var(--text-normal)"
        stroke-width="2"
        opacity="0.8"
      />
      
      <!-- 差距填充区域 -->
      <path
        d={[
          `M 80 ${Math.max(50, Math.min(260, 260 - (curveData[0].fsrsPredicted * 2.1)))}`,
          ...curveData.map((point) =>
            `L ${80 + (point.day - 1) * (470 / (timeRange - 1))} ${Math.max(50, Math.min(260, 260 - (point.fsrsPredicted * 2.1)))}`
          ),
          ...curveData.slice().reverse().map((point) =>
            `L ${80 + (point.day - 1) * (470 / (timeRange - 1))} ${Math.max(50, Math.min(260, 260 - (point.actualPredicted * 2.1)))}`
          ),
          'Z'
        ].join(' ')}
        fill="url(#gapGradient)"
        opacity="0.6"
      />
      
      <!-- FSRS5预测曲线 -->
      <path
        d={curveData.map((point, i) =>
          `${i === 0 ? 'M' : 'L'} ${80 + (point.day - 1) * (470 / (timeRange - 1))} ${Math.max(50, Math.min(260, 260 - (point.fsrsPredicted * 2.1)))}`
        ).join(' ')}
        fill="none"
        stroke="var(--interactive-accent)"
        stroke-width="3"
        stroke-dasharray="8,4"
        stroke-linecap="round"
        opacity="0.9"
      />

      <!-- 实际表现曲线 -->
      <path
        d={curveData.map((point, i) =>
          `${i === 0 ? 'M' : 'L'} ${80 + (point.day - 1) * (470 / (timeRange - 1))} ${Math.max(50, Math.min(260, 260 - (point.actualPredicted * 2.1)))}`
        ).join(' ')}
        fill="none"
        stroke="var(--text-success)"
        stroke-width="3"
        stroke-linecap="round"
      />
      
      <!-- 关键节点标记 - 动态适应时间范围 -->
      {#each (timeRange === 30 ? [6, 14, 29] : 
                          timeRange === 60 ? [6, 29, 59] : 
                          [14, 44, 89]) as dayIndex}
        {@const point = curveData[dayIndex]}
        {#if point}
        {@const x = 80 + (point.day - 1) * (470 / (timeRange - 1))}
        {@const fsrsY = Math.max(50, Math.min(260, 260 - (point.fsrsPredicted * 2.1)))}
        {@const actualY = Math.max(50, Math.min(260, 260 - (point.actualPredicted * 2.1)))}
        
        <!-- FSRS预测节点 -->
        <circle
          cx={x}
          cy={fsrsY}
          r="3"
          fill="var(--interactive-accent)"
          stroke="var(--background-primary)"
          stroke-width="2"
        />

        <!-- FSRS数值标签 -->
        <text
          x={x}
          y={fsrsY - 12}
          fill="var(--interactive-accent)"
          font-size="10"
          text-anchor="middle"
          font-weight="500"
          font-family="var(--font-interface)"
        >
          {point.fsrsPredicted.toFixed(0)}%
        </text>

        <!-- 实际表现节点 -->
        <circle
          cx={x}
          cy={actualY}
          r="3"
          fill="var(--text-success)"
          stroke="var(--background-primary)"
          stroke-width="2"
        />

        <!-- 实际表现数值标签 -->
        <text
          x={x}
          y={actualY + 18}
          fill="var(--text-success)"
          font-size="10"
          text-anchor="middle"
          font-weight="500"
          font-family="var(--font-interface)"
        >
          {point.actualPredicted.toFixed(0)}%
        </text>
        {/if}
      {/each}
      
      <!-- 坐标轴标题 -->
      <text
        x="40"
        y="155"
        fill="var(--text-muted)"
        font-size="11"
        text-anchor="middle"
        transform="rotate(-90, 40, 155)"
        font-family="var(--font-interface)"
        font-weight="500"
      >
        记忆保留率 (%)
      </text>

      <text
        x="315"
        y="295"
        fill="var(--text-muted)"
        font-size="11"
        text-anchor="middle"
        font-family="var(--font-interface)"
        font-weight="500"
      >
        天数
      </text>
        </svg>
      {/if}
    {/if}
  </div>

</div>

<style>
  .memory-curve-chart {
    background: transparent;
    border-radius: 0;
    padding: 0;
    border: none;
    box-shadow: none;
    position: relative;
    color: var(--text-normal);
    font-family: var(--font-interface, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
    width: 100%;
    height: 100%;
  }

  .chart-header {
    margin-bottom: 16px;
    padding: 0 4px;
  }

  .chart-header h3 {
    font-size: 1.2rem;
    font-weight: 600;
    margin: 0 0 4px 0;
    color: var(--text-normal);
  }

  .chart-description {
    font-size: 0.85rem;
    color: var(--text-muted);
    margin: 0;
  }

  /* 时间范围选择器 */
  .time-range-selector {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
    padding: 0 4px;
  }

  .selector-label {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .time-button {
    padding: 8px 16px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
    color: var(--text-muted);
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .time-button:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .time-button.active {
    background: var(--interactive-accent);
    border-color: var(--interactive-accent);
    color: white;
  }

  .chart-legend {
    display: flex;
    align-items: center;
    gap: 20px;
    margin-bottom: 16px;
    flex-wrap: wrap;
    font-size: 0.85rem;
    padding: 0 4px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .legend-line {
    width: 20px;
    height: 3px;
    border-radius: 2px;
  }

  .legend-line.fsrs {
    background: var(--interactive-accent);
    position: relative;
    border: 1px solid var(--interactive-accent);
    opacity: 0.9;
  }

  .legend-line.fsrs::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 0;
    width: 100%;
    height: 2px;
    background: var(--background-primary);
    transform: translateY(-50%);
    background-image: repeating-linear-gradient(
      to right,
      transparent,
      transparent 8px,
      var(--background-primary) 8px,
      var(--background-primary) 12px
    );
  }

  .legend-line.actual {
    background: var(--text-success);
    border: 1px solid var(--text-success);
    height: 4px;
    border-radius: 2px;
  }

  .chart-container {
    width: calc(100% - 8px);
    height: 320px;
    margin: 0 4px 16px 4px;
  }

  .curve-svg {
    width: 100%;
    height: 100%;
  }

  /* SVG文本优化 - 统一字体大小控制 */
  .curve-svg text {
    font-feature-settings: 'tnum' 1; /* 等宽数字 */
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  /* 强制限制所有SVG文本的最大字体大小 */
  .memory-curve-chart svg text {
    font-size: clamp(6px, 1em, 10px) !important;
  }

  /* 坐标轴标签专用样式 */
  .memory-curve-chart svg text[text-anchor="end"],
  .memory-curve-chart svg text[text-anchor="middle"] {
    font-size: clamp(6px, 0.75em, 9px) !important;
    font-weight: 400 !important;
  }

  /* 数据点标签专用样式 */
  .memory-curve-chart svg text[font-weight="500"] {
    font-size: clamp(5px, 0.6em, 8px) !important;
  }


  /* 响应式设计 */
  @media (max-width: 640px) {
    .chart-header {
      flex-direction: column;
      gap: 12px;
      align-items: stretch;
    }

    .key-metrics {
      flex-direction: column;
      gap: 12px;
    }

    .metric-item {
      flex-direction: row;
      justify-content: space-between;
    }

    .chart-legend {
      flex-direction: column;
      gap: 8px;
    }
  }

  .no-data-message {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 280px;
    color: var(--text-muted);
    gap: 12px;
    background: var(--background-secondary);
    border-radius: 8px;
    border: 1px dashed var(--background-modifier-border);
    text-align: center;
    padding: 20px;
  }

  .no-data-icon {
    font-size: 2rem;
    margin-bottom: 8px;
  }

  .no-data-message h4 {
    margin: 0 0 8px 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .no-data-message p {
    margin: 0 0 4px 0;
    font-size: 0.9rem;
    line-height: 1.4;
  }

  .no-data-hint {
    font-size: 0.8rem !important;
    color: var(--text-faint) !important;
    font-style: italic;
  }

  .debug-info {
    margin-top: 12px;
    padding: 8px 12px;
    background: rgba(255, 193, 7, 0.1);
    border: 1px solid rgba(255, 193, 7, 0.3);
    border-radius: 8px;
    font-family: monospace;
    font-size: 12px;
    color: var(--tuanki-text-secondary);
  }

  /* 深色模式优化 */
  :global(.theme-dark) .curve-svg text {
    fill: var(--text-normal) !important;
  }

  :global(.theme-dark) .curve-svg line {
    stroke: var(--background-modifier-border) !important;
  }

  :global(.theme-dark) .curve-svg text[font-size="10"],
  :global(.theme-dark) .curve-svg text[font-size="11"] {
    fill: var(--text-normal) !important;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3) !important;
  }
</style>
