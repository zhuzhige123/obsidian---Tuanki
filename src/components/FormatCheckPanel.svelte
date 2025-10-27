<!--
  格式检查面板组件
  显示实时格式检查结果和修复建议
-->

<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { RealTimeFormatChecker, FormatCheckResult, FormatIssue } from '../utils/real-time-format-checker';

  // Props
  export let content: string = '';
  export let checker: RealTimeFormatChecker;
  export let visible: boolean = true;
  export let autoCheck: boolean = true;
  export let showScore: boolean = true;

  // State
  let checkResult: FormatCheckResult | null = $state(null);
  let isChecking: boolean = $state(false);
  let selectedIssue: FormatIssue | null = $state(null);
  let expandedCategories: Set<string> = $state(new Set(['error']));

  // Event dispatcher
  const dispatch = createEventDispatcher<{
    fix: { issueIds: string[] };
    fixAll: void;
    jumpToLine: { line: number; column: number };
    toggleRule: { ruleId: string; enabled: boolean };
  }>();

  // Reactive updates
  $effect(() => {
    if (autoCheck && content) {
      performCheck();
    }
  });

  /**
   * 执行格式检查
   */
  async function performCheck() {
    if (isChecking) return;

    isChecking = true;
    try {
      checkResult = await checker.checkFormat(content);
    } catch (error) {
      console.error('格式检查失败:', error);
    } finally {
      isChecking = false;
    }
  }

  /**
   * 手动刷新检查
   */
  function refreshCheck() {
    performCheck();
  }

  /**
   * 修复单个问题
   */
  function fixIssue(issue: FormatIssue) {
    dispatch('fix', { issueIds: [issue.id] });
  }

  /**
   * 修复所有可修复的问题
   */
  function fixAllIssues() {
    dispatch('fixAll');
  }

  /**
   * 跳转到问题位置
   */
  function jumpToIssue(issue: FormatIssue) {
    dispatch('jumpToLine', { line: issue.line, column: issue.column });
    selectedIssue = issue;
  }

  /**
   * 切换分类展开状态
   */
  function toggleCategory(category: string) {
    if (expandedCategories.has(category)) {
      expandedCategories.delete(category);
    } else {
      expandedCategories.add(category);
    }
    expandedCategories = new Set(expandedCategories);
  }

  /**
   * 获取问题类型图标
   */
  function getIssueIcon(type: string): string {
    const icons = {
      error: '❌',
      warning: '⚠️',
      suggestion: '💡'
    };
    return icons[type] || '📝';
  }

  /**
   * 获取分类图标
   */
  function getCategoryIcon(category: string): string {
    const icons = {
      heading: '📝',
      punctuation: '❓',
      spacing: '📏',
      structure: '🏗️',
      syntax: '⚙️'
    };
    return icons[category] || '📋';
  }

  /**
   * 获取分类显示名称
   */
  function getCategoryName(category: string): string {
    const names = {
      heading: '标题格式',
      punctuation: '标点符号',
      spacing: '空格格式',
      structure: '内容结构',
      syntax: 'Markdown语法'
    };
    return names[category] || category;
  }

  /**
   * 获取分数颜色
   */
  function getScoreColor(score: number): string {
    if (score >= 90) return '#10b981';
    if (score >= 80) return '#3b82f6';
    if (score >= 70) return '#f59e0b';
    if (score >= 60) return '#ef4444';
    return '#dc2626';
  }

  /**
   * 获取分数等级
   */
  function getScoreGrade(score: number): string {
    if (score >= 90) return '优秀';
    if (score >= 80) return '良好';
    if (score >= 70) return '一般';
    if (score >= 60) return '较差';
    return '很差';
  }

  /**
   * 按分类分组问题
   */
  function groupIssuesByCategory(issues: FormatIssue[]): Record<string, FormatIssue[]> {
    const grouped: Record<string, FormatIssue[]> = {};
    
    issues.forEach(issue => {
      if (!grouped[issue.category]) {
        grouped[issue.category] = [];
      }
      grouped[issue.category].push(issue);
    });

    return grouped;
  }

  /**
   * 获取可修复问题数量
   */
  function getFixableCount(issues: FormatIssue[]): number {
    return issues.filter(issue => issue.autoFixable).length;
  }
</script>

{#if visible}
  <div class="format-check-panel">
    <!-- 面板头部 -->
    <div class="panel-header">
      <div class="header-left">
        <h4 class="panel-title">格式检查</h4>
        {#if checkResult}
          <span class="check-time">
            {checkResult.processingTime}ms
          </span>
        {/if}
      </div>
      
      <div class="header-actions">
        <button 
          class="refresh-button"
          class:loading={isChecking}
          on:click={refreshCheck}
          disabled={isChecking}
          title="刷新检查"
        >
          <span class="refresh-icon" class:spinning={isChecking}>🔄</span>
        </button>
        
        <label class="auto-check-toggle">
          <input type="checkbox" bind:checked={autoCheck} />
          <span>自动检查</span>
        </label>
      </div>
    </div>

    <!-- 检查结果概览 -->
    {#if checkResult}
      <div class="check-overview">
        {#if showScore}
          <div class="score-section">
            <div class="score-circle" style="--score-color: {getScoreColor(checkResult.score)}">
              <div class="score-value">{checkResult.score}</div>
              <div class="score-label">{getScoreGrade(checkResult.score)}</div>
            </div>
          </div>
        {/if}

        <div class="summary-section">
          <div class="summary-stats">
            <div class="stat-item error">
              <span class="stat-icon">❌</span>
              <span class="stat-count">{checkResult.summary.errors}</span>
              <span class="stat-label">错误</span>
            </div>
            <div class="stat-item warning">
              <span class="stat-icon">⚠️</span>
              <span class="stat-count">{checkResult.summary.warnings}</span>
              <span class="stat-label">警告</span>
            </div>
            <div class="stat-item suggestion">
              <span class="stat-icon">💡</span>
              <span class="stat-count">{checkResult.summary.suggestions}</span>
              <span class="stat-label">建议</span>
            </div>
          </div>

          {#if checkResult.issues.length > 0}
            <div class="quick-actions">
              {#if getFixableCount(checkResult.issues) > 0}
                <button class="fix-all-button" on:click={fixAllIssues}>
                  🔧 修复全部 ({getFixableCount(checkResult.issues)})
                </button>
              {/if}
            </div>
          {/if}
        </div>
      </div>

      <!-- 建议列表 -->
      {#if checkResult.recommendations.length > 0}
        <div class="recommendations-section">
          <h5>建议</h5>
          <ul class="recommendations-list">
            {#each checkResult.recommendations as recommendation}
              <li>{recommendation}</li>
            {/each}
          </ul>
        </div>
      {/if}

      <!-- 问题列表 -->
      {#if checkResult.issues.length > 0}
        <div class="issues-section">
          <h5>问题详情</h5>
          
          {#each Object.entries(groupIssuesByCategory(checkResult.issues)) as [category, issues]}
            <div class="category-group">
              <button 
                class="category-header"
                class:expanded={expandedCategories.has(category)}
                on:click={() => toggleCategory(category)}
              >
                <span class="category-icon">{getCategoryIcon(category)}</span>
                <span class="category-name">{getCategoryName(category)}</span>
                <span class="category-count">({issues.length})</span>
                <span class="expand-arrow">{expandedCategories.has(category) ? '▼' : '▶'}</span>
              </button>

              {#if expandedCategories.has(category)}
                <div class="issues-list">
                  {#each issues as issue}
                    <div 
                      class="issue-item {issue.type}"
                      class:selected={selectedIssue?.id === issue.id}
                      on:click={() => jumpToIssue(issue)}
                      role="button"
                      tabindex="0"
                    >
                      <div class="issue-header">
                        <div class="issue-info">
                          <span class="issue-icon">{getIssueIcon(issue.type)}</span>
                          <span class="issue-message">{issue.message}</span>
                        </div>
                        
                        <div class="issue-location">
                          <span class="line-number">第{issue.line}行</span>
                          {#if issue.column > 0}
                            <span class="column-number">第{issue.column}列</span>
                          {/if}
                        </div>
                      </div>

                      <div class="issue-description">
                        {issue.description}
                      </div>

                      {#if issue.suggestion}
                        <div class="issue-suggestion">
                          <span class="suggestion-label">建议:</span>
                          <code class="suggestion-code">{issue.suggestion}</code>
                        </div>
                      {/if}

                      <div class="issue-actions">
                        <button 
                          class="jump-button"
                          on:click|stopPropagation={() => jumpToIssue(issue)}
                        >
                          📍 跳转
                        </button>
                        
                        {#if issue.autoFixable}
                          <button 
                            class="fix-button"
                            on:click|stopPropagation={() => fixIssue(issue)}
                          >
                            🔧 修复
                          </button>
                        {/if}
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {:else}
        <div class="no-issues">
          <div class="no-issues-icon">✅</div>
          <h5>格式完美！</h5>
          <p>没有发现任何格式问题</p>
        </div>
      {/if}
    {:else if isChecking}
      <div class="checking-state">
        <div class="loading-spinner"></div>
        <p>正在检查格式...</p>
      </div>
    {:else}
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <h5>等待检查</h5>
        <p>输入内容后将自动进行格式检查</p>
      </div>
    {/if}
  </div>
{/if}

<style>
  .format-check-panel {
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    background: var(--background-primary);
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: var(--background-secondary);
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .panel-title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-normal);
  }

  .check-time {
    font-size: 11px;
    color: var(--text-muted);
    background: var(--background-modifier-border);
    padding: 2px 6px;
    border-radius: 3px;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .refresh-button {
    background: none;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    padding: 4px 8px;
    cursor: pointer;
    color: var(--text-normal);
    transition: all 0.2s;
  }

  .refresh-button:hover {
    background: var(--background-modifier-hover);
  }

  .refresh-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .refresh-icon {
    display: inline-block;
    transition: transform 0.5s;
  }

  .refresh-icon.spinning {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .auto-check-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-muted);
    cursor: pointer;
  }

  .auto-check-toggle input {
    margin: 0;
  }

  .check-overview {
    display: flex;
    gap: 16px;
    padding: 16px;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .score-section {
    flex-shrink: 0;
  }

  .score-circle {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    border: 4px solid var(--score-color);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: var(--background-secondary);
  }

  .score-value {
    font-size: 20px;
    font-weight: 700;
    color: var(--score-color);
    line-height: 1;
  }

  .score-label {
    font-size: 10px;
    color: var(--text-muted);
    margin-top: 2px;
  }

  .summary-section {
    flex: 1;
  }

  .summary-stats {
    display: flex;
    gap: 16px;
    margin-bottom: 12px;
  }

  .stat-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .stat-icon {
    font-size: 16px;
  }

  .stat-count {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-normal);
  }

  .stat-label {
    font-size: 12px;
    color: var(--text-muted);
  }

  .quick-actions {
    display: flex;
    gap: 8px;
  }

  .fix-all-button {
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

  .fix-all-button:hover {
    background: var(--interactive-accent-hover);
  }

  .recommendations-section {
    padding: 16px;
    border-bottom: 1px solid var(--background-modifier-border);
    background: #fef3cd;
  }

  .recommendations-section h5 {
    margin: 0 0 8px 0;
    font-size: 13px;
    font-weight: 600;
    color: #92400e;
  }

  .recommendations-list {
    margin: 0;
    padding-left: 16px;
    color: #92400e;
    font-size: 12px;
  }

  .recommendations-list li {
    margin-bottom: 4px;
    line-height: 1.4;
  }

  .issues-section {
    padding: 16px;
  }

  .issues-section h5 {
    margin: 0 0 12px 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-normal);
  }

  .category-group {
    margin-bottom: 12px;
  }

  .category-header {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-normal);
    font-size: 13px;
    font-weight: 500;
    transition: all 0.2s;
  }

  .category-header:hover {
    background: var(--background-modifier-hover);
  }

  .category-header.expanded {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }

  .category-icon {
    font-size: 14px;
  }

  .category-name {
    flex: 1;
    text-align: left;
  }

  .category-count {
    color: var(--text-muted);
    font-size: 12px;
  }

  .expand-arrow {
    color: var(--text-muted);
    font-size: 12px;
    transition: transform 0.2s;
  }

  .issues-list {
    border: 1px solid var(--background-modifier-border);
    border-top: none;
    border-radius: 0 0 4px 4px;
    background: var(--background-primary);
  }

  .issue-item {
    padding: 12px;
    border-bottom: 1px solid var(--background-modifier-border);
    cursor: pointer;
    transition: all 0.2s;
  }

  .issue-item:last-child {
    border-bottom: none;
  }

  .issue-item:hover {
    background: var(--background-modifier-hover);
  }

  .issue-item.selected {
    background: var(--background-modifier-hover);
    border-left: 3px solid var(--interactive-accent);
  }

  .issue-item.error {
    border-left: 3px solid #ef4444;
  }

  .issue-item.warning {
    border-left: 3px solid #f59e0b;
  }

  .issue-item.suggestion {
    border-left: 3px solid #3b82f6;
  }

  .issue-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 6px;
  }

  .issue-info {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
  }

  .issue-icon {
    font-size: 14px;
    flex-shrink: 0;
  }

  .issue-message {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-normal);
  }

  .issue-location {
    display: flex;
    gap: 6px;
    font-size: 11px;
    color: var(--text-muted);
  }

  .issue-description {
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.4;
    margin-bottom: 8px;
  }

  .issue-suggestion {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
  }

  .suggestion-label {
    font-size: 11px;
    color: var(--text-muted);
  }

  .suggestion-code {
    background: var(--background-modifier-border);
    padding: 2px 6px;
    border-radius: 3px;
    font-family: var(--font-monospace);
    font-size: 11px;
    color: var(--text-normal);
  }

  .issue-actions {
    display: flex;
    gap: 8px;
  }

  .jump-button, .fix-button {
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 3px;
    padding: 4px 8px;
    cursor: pointer;
    font-size: 11px;
    color: var(--text-normal);
    transition: all 0.2s;
  }

  .jump-button:hover, .fix-button:hover {
    background: var(--background-modifier-hover);
  }

  .fix-button {
    background: #10b981;
    color: white;
    border-color: #10b981;
  }

  .fix-button:hover {
    background: #059669;
  }

  /* 状态样式 */
  .checking-state, .empty-state, .no-issues {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    text-align: center;
  }

  .loading-spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--background-modifier-border);
    border-top: 2px solid var(--interactive-accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 12px;
  }

  .empty-icon, .no-issues-icon {
    font-size: 32px;
    margin-bottom: 12px;
  }

  .checking-state h5, .empty-state h5, .no-issues h5 {
    margin: 0 0 8px 0;
    color: var(--text-normal);
  }

  .checking-state p, .empty-state p, .no-issues p {
    margin: 0;
    color: var(--text-muted);
    font-size: 14px;
  }

  /* 响应式设计 */
  @media (max-width: 600px) {
    .check-overview {
      flex-direction: column;
      gap: 12px;
    }

    .summary-stats {
      flex-direction: column;
      gap: 8px;
    }

    .issue-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
    }

    .issue-actions {
      width: 100%;
      justify-content: space-between;
    }
  }

  /* 深色模式适配 */
  .theme-dark .recommendations-section {
    background: #451a03;
  }

  .theme-dark .recommendations-section h5,
  .theme-dark .recommendations-list {
    color: #fbbf24;
  }
</style>
