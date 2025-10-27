<!--
  置信度指示器组件
  显示解析结果的置信度分数和相关警告信息
-->

<script lang="ts">
  // Props
  interface Props {
    confidence?: number;
    method?: string;
    showDetails?: boolean;
    showWarnings?: boolean;
    interactive?: boolean;
    size?: 'small' | 'medium' | 'large';
    onclick?: (event: { confidence: number; method: string }) => void;
    onimprove?: () => void;
    ondetails?: () => void;
  }

  let {
    confidence = 0,
    method = '',
    showDetails = false,
    showWarnings = true,
    interactive = true,
    size = 'medium',
    onclick,
    onimprove,
    ondetails
  }: Props = $props();

  // State
  let expanded: boolean = $state(false);
  let animationClass: string = $state('');

  // Reactive computations
  const confidenceLevel = $derived(() => {
    if (confidence >= 0.9) return 'excellent';
    if (confidence >= 0.8) return 'good';
    if (confidence >= 0.6) return 'fair';
    if (confidence >= 0.4) return 'poor';
    return 'very-poor';
  });

  const confidenceLabel = $derived(() => {
    const labels = {
      'excellent': '优秀',
      'good': '良好',
      'fair': '一般',
      'poor': '较差',
      'very-poor': '很差'
    };
    return labels[confidenceLevel()];
  });

  const confidenceColor = $derived(() => {
    const colors = {
      'excellent': '#10b981',
      'good': '#3b82f6',
      'fair': '#f59e0b',
      'poor': '#ef4444',
      'very-poor': '#dc2626'
    };
    return colors[confidenceLevel()];
  });

  const confidenceIcon = $derived(() => {
    const icons = {
      'excellent': '🎯',
      'good': '✅',
      'fair': '⚠️',
      'poor': '❌',
      'very-poor': '🚨'
    };
    return icons[confidenceLevel()];
  });

  const warningMessage = $derived(() => {
    if (confidence >= 0.8) return null;
    if (confidence >= 0.6) return '解析结果可能不够准确，建议检查';
    if (confidence >= 0.4) return '解析结果准确性较低，请仔细检查';
    return '解析结果可能不正确，强烈建议手动检查';
  });

  const improvementSuggestions = $derived(() => {
    const suggestions = [];
    
    if (confidence < 0.8) {
      suggestions.push('尝试使用更标准的Markdown格式');
    }
    
    if (confidence < 0.6) {
      suggestions.push('确保问题和答案结构清晰');
      suggestions.push('检查标题格式是否正确');
    }
    
    if (confidence < 0.4) {
      suggestions.push('考虑重新组织内容结构');
      suggestions.push('使用更明确的问答分隔');
    }
    
    return suggestions;
  });

  // Methods
  function handleClick() {
    if (interactive) {
      expanded = !expanded;
      onclick?.({ confidence, method });
    }
  }

  function handleImprove() {
    onimprove?.();
  }

  function handleDetails() {
    ondetails?.();
  }

  // Animation effect
  $effect(() => {
    if (confidence > 0) {
      animationClass = 'animate-in';
      const timer = setTimeout(() => {
        animationClass = '';
      }, 500);
      
      return () => clearTimeout(timer);
    }
  });

  /**
   * 格式化置信度百分比
   */
  function formatConfidence(value: number): string {
    return Math.round(value * 100) + '%';
  }

  /**
   * 获取方法显示名称
   */
  function getMethodDisplayName(methodName: string): string {
    const methodNames: Record<string, string> = {
      'regex': '正则匹配',
      'intelligent': '智能解析',
      'fuzzy': '模糊匹配',
      'semantic': '语义分析',
      'hybrid': '混合解析',
      'fallback': '后备解析'
    };
    return methodNames[methodName] || methodName;
  }
</script>

<div 
  class="confidence-indicator {confidenceLevel()} {size} {animationClass}"
  class:interactive
  class:expanded
  onclick={handleClick}
  role={interactive ? 'button' : undefined}
  tabindex={interactive ? 0 : undefined}
>
  <!-- 主要指示器 -->
  <div class="confidence-main">
    <div class="confidence-visual">
      <!-- 圆形进度条 -->
      <div class="confidence-circle">
        <svg class="circle-svg" viewBox="0 0 36 36">
          <path
            class="circle-bg"
            d="M18 2.0845
              a 15.9155 15.9155 0 0 1 0 31.831
              a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            opacity="0.1"
          />
          <path
            class="circle-progress"
            d="M18 2.0845
              a 15.9155 15.9155 0 0 1 0 31.831
              a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke={confidenceColor()}
            stroke-width="2"
            stroke-dasharray="{confidence * 100}, 100"
            stroke-linecap="round"
          />
        </svg>
        
        <!-- 中心内容 -->
        <div class="circle-content">
          <span class="confidence-icon">{confidenceIcon()}</span>
          <span class="confidence-value">{formatConfidence(confidence)}</span>
        </div>
      </div>
    </div>

    <div class="confidence-info">
      <div class="confidence-header">
        <span class="confidence-label">{confidenceLabel()}</span>
        {#if method}
          <span class="confidence-method">{getMethodDisplayName(method)}</span>
        {/if}
      </div>
      
      {#if showWarnings && warningMessage()}
        <div class="confidence-warning">
          <span class="warning-icon">⚠️</span>
          <span class="warning-text">{warningMessage()}</span>
        </div>
      {/if}
    </div>

    {#if interactive}
      <div class="confidence-actions">
        <button 
          class="expand-button"
          class:expanded
          title={expanded ? '收起详情' : '展开详情'}
        >
          <span class="expand-icon">{expanded ? '▼' : '▶'}</span>
        </button>
      </div>
    {/if}
  </div>

  <!-- 详细信息 -->
  {#if expanded && showDetails}
    <div class="confidence-details">
      <!-- 置信度说明 -->
      <div class="detail-section">
        <h6>置信度说明</h6>
        <div class="confidence-explanation">
          <p>
            置信度反映了系统对解析结果准确性的评估。
            {#if confidence >= 0.9}
              当前结果非常可靠，可以放心使用。
            {:else if confidence >= 0.8}
              当前结果比较可靠，建议简单检查。
            {:else if confidence >= 0.6}
              当前结果可能存在小问题，建议仔细检查。
            {:else if confidence >= 0.4}
              当前结果可能不够准确，建议详细检查。
            {:else}
              当前结果可能存在较大问题，强烈建议手动检查。
            {/if}
          </p>
        </div>
      </div>

      <!-- 影响因素 -->
      <div class="detail-section">
        <h6>影响因素</h6>
        <div class="factors-list">
          <div class="factor-item">
            <span class="factor-label">解析方法:</span>
            <span class="factor-value">{getMethodDisplayName(method)}</span>
          </div>
          <div class="factor-item">
            <span class="factor-label">内容格式:</span>
            <span class="factor-value">
              {#if confidence >= 0.8}
                标准格式
              {:else if confidence >= 0.6}
                基本规范
              {:else}
                格式不规范
              {/if}
            </span>
          </div>
          <div class="factor-item">
            <span class="factor-label">结构清晰度:</span>
            <span class="factor-value">
              {#if confidence >= 0.8}
                结构清晰
              {:else if confidence >= 0.6}
                结构一般
              {:else}
                结构模糊
              {/if}
            </span>
          </div>
        </div>
      </div>

      <!-- 改进建议 -->
      {#if improvementSuggestions().length > 0}
        <div class="detail-section">
          <h6>改进建议</h6>
          <ul class="suggestions-list">
            {#each improvementSuggestions() as suggestion}
              <li>{suggestion}</li>
            {/each}
          </ul>
          
          <div class="improvement-actions">
            <button class="improve-button" onclick={handleImprove}>
              🔧 获取改进建议
            </button>
          </div>
        </div>
      {/if}

      <!-- 置信度等级说明 -->
      <div class="detail-section">
        <h6>置信度等级</h6>
        <div class="confidence-scale">
          <div class="scale-item excellent">
            <span class="scale-range">90-100%</span>
            <span class="scale-label">优秀</span>
            <span class="scale-desc">结果非常可靠</span>
          </div>
          <div class="scale-item good">
            <span class="scale-range">80-89%</span>
            <span class="scale-label">良好</span>
            <span class="scale-desc">结果比较可靠</span>
          </div>
          <div class="scale-item fair">
            <span class="scale-range">60-79%</span>
            <span class="scale-label">一般</span>
            <span class="scale-desc">建议检查结果</span>
          </div>
          <div class="scale-item poor">
            <span class="scale-range">40-59%</span>
            <span class="scale-label">较差</span>
            <span class="scale-desc">需要仔细检查</span>
          </div>
          <div class="scale-item very-poor">
            <span class="scale-range">0-39%</span>
            <span class="scale-label">很差</span>
            <span class="scale-desc">强烈建议手动检查</span>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .confidence-indicator {
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    background: var(--background-primary);
    transition: all 0.3s ease;
    overflow: hidden;
  }

  .confidence-indicator.interactive {
    cursor: pointer;
  }

  .confidence-indicator.interactive:hover {
    border-color: var(--interactive-accent);
    background: var(--background-modifier-hover);
  }

  .confidence-indicator.expanded {
    border-color: var(--interactive-accent);
  }

  /* 尺寸变体 */
  .confidence-indicator.small {
    font-size: 12px;
  }

  .confidence-indicator.medium {
    font-size: 14px;
  }

  .confidence-indicator.large {
    font-size: 16px;
  }

  /* 动画 */
  .confidence-indicator.animate-in {
    animation: slideIn 0.5s ease-out;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .confidence-main {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
  }

  .confidence-visual {
    flex-shrink: 0;
  }

  .confidence-circle {
    position: relative;
    width: 48px;
    height: 48px;
  }

  .small .confidence-circle {
    width: 36px;
    height: 36px;
  }

  .large .confidence-circle {
    width: 60px;
    height: 60px;
  }

  .circle-svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }

  .circle-progress {
    transition: stroke-dasharray 0.5s ease;
  }

  .circle-content {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  .confidence-icon {
    font-size: 16px;
    line-height: 1;
    margin-bottom: 2px;
  }

  .small .confidence-icon {
    font-size: 12px;
  }

  .large .confidence-icon {
    font-size: 20px;
  }

  .confidence-value {
    font-size: 10px;
    font-weight: 600;
    color: var(--text-normal);
    line-height: 1;
  }

  .small .confidence-value {
    font-size: 8px;
  }

  .large .confidence-value {
    font-size: 12px;
  }

  .confidence-info {
    flex: 1;
    min-width: 0;
  }

  .confidence-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .confidence-label {
    font-weight: 600;
    color: var(--text-normal);
  }

  .confidence-method {
    font-size: 12px;
    color: var(--text-muted);
    background: var(--background-modifier-border);
    padding: 2px 6px;
    border-radius: 3px;
  }

  .confidence-warning {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-muted);
  }

  .warning-icon {
    font-size: 14px;
  }

  .warning-text {
    line-height: 1.3;
  }

  .confidence-actions {
    flex-shrink: 0;
  }

  .expand-button {
    background: none;
    border: none;
    padding: 4px;
    cursor: pointer;
    color: var(--text-muted);
    border-radius: 4px;
    transition: all 0.2s;
  }

  .expand-button:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .expand-icon {
    font-size: 12px;
    transition: transform 0.2s;
  }

  .expand-button.expanded .expand-icon {
    transform: rotate(90deg);
  }

  /* 置信度等级样式 */
  .confidence-indicator.excellent {
    border-left: 4px solid #10b981;
  }

  .confidence-indicator.good {
    border-left: 4px solid #3b82f6;
  }

  .confidence-indicator.fair {
    border-left: 4px solid #f59e0b;
  }

  .confidence-indicator.poor {
    border-left: 4px solid #ef4444;
  }

  .confidence-indicator.very-poor {
    border-left: 4px solid #dc2626;
  }

  /* 详细信息 */
  .confidence-details {
    border-top: 1px solid var(--background-modifier-border);
    padding: 16px;
    background: var(--background-secondary);
  }

  .detail-section {
    margin-bottom: 16px;
  }

  .detail-section:last-child {
    margin-bottom: 0;
  }

  .detail-section h6 {
    margin: 0 0 8px 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-normal);
  }

  .confidence-explanation p {
    margin: 0;
    font-size: 13px;
    color: var(--text-muted);
    line-height: 1.4;
  }

  .factors-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .factor-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
  }

  .factor-label {
    color: var(--text-muted);
  }

  .factor-value {
    color: var(--text-normal);
    font-weight: 500;
  }

  .suggestions-list {
    margin: 0 0 12px 0;
    padding-left: 16px;
    font-size: 12px;
    color: var(--text-normal);
  }

  .suggestions-list li {
    margin-bottom: 4px;
    line-height: 1.4;
  }

  .improvement-actions {
    display: flex;
    gap: 8px;
  }

  .improve-button {
    background: var(--interactive-accent);
    color: white;
    border: none;
    border-radius: 4px;
    padding: 6px 12px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition: all 0.2s;
  }

  .improve-button:hover {
    background: var(--interactive-accent-hover);
  }

  .confidence-scale {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .scale-item {
    display: grid;
    grid-template-columns: 60px 50px 1fr;
    gap: 8px;
    align-items: center;
    padding: 6px 8px;
    border-radius: 4px;
    font-size: 11px;
    border-left: 3px solid transparent;
  }

  .scale-item.excellent {
    border-left-color: #10b981;
    background: rgba(16, 185, 129, 0.1);
  }

  .scale-item.good {
    border-left-color: #3b82f6;
    background: rgba(59, 130, 246, 0.1);
  }

  .scale-item.fair {
    border-left-color: #f59e0b;
    background: rgba(245, 158, 11, 0.1);
  }

  .scale-item.poor {
    border-left-color: #ef4444;
    background: rgba(239, 68, 68, 0.1);
  }

  .scale-item.very-poor {
    border-left-color: #dc2626;
    background: rgba(220, 38, 38, 0.1);
  }

  .scale-range {
    font-weight: 600;
    color: var(--text-normal);
  }

  .scale-label {
    font-weight: 500;
    color: var(--text-normal);
  }

  .scale-desc {
    color: var(--text-muted);
  }

  /* 响应式设计 */
  @media (max-width: 600px) {
    .confidence-main {
      padding: 10px 12px;
      gap: 10px;
    }

    .confidence-circle {
      width: 40px;
      height: 40px;
    }

    .confidence-details {
      padding: 12px;
    }

    .scale-item {
      grid-template-columns: 1fr;
      gap: 4px;
      text-align: center;
    }
  }

  /* 深色模式适配 */
  .theme-dark .scale-item.excellent {
    background: rgba(16, 185, 129, 0.15);
  }

  .theme-dark .scale-item.good {
    background: rgba(59, 130, 246, 0.15);
  }

  .theme-dark .scale-item.fair {
    background: rgba(245, 158, 11, 0.15);
  }

  .theme-dark .scale-item.poor {
    background: rgba(239, 68, 68, 0.15);
  }

  .theme-dark .scale-item.very-poor {
    background: rgba(220, 38, 38, 0.15);
  }
</style>
