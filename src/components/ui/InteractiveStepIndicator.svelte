<script lang="ts">
  /**
   * 交互式步骤指示器
   * 提供直观的步骤导航和进度反馈
   */
  
  import EnhancedIcon from './EnhancedIcon.svelte';
  import { createEventDispatcher } from 'svelte';

  interface Step {
    id: string;
    name: string;
    description?: string;
    icon?: string;
    isCompleted?: boolean;
    isActive?: boolean;
    isDisabled?: boolean;
    hasError?: boolean;
    hasWarning?: boolean;
  }

  interface Props {
    steps: Step[];
    currentStepId: string;
    allowNavigation?: boolean;
    showProgress?: boolean;
    orientation?: 'horizontal' | 'vertical';
    size?: 'sm' | 'md' | 'lg';
  }

  let {
    steps,
    currentStepId,
    allowNavigation = true,
    showProgress = true,
    orientation = 'horizontal',
    size = 'md'
  }: Props = $props();

  const dispatch = createEventDispatcher<{
    stepClick: { stepId: string; step: Step };
    stepChange: { fromStepId: string; toStepId: string };
  }>();

  // 计算当前步骤索引
  let currentStepIndex = $derived(
    steps.findIndex(step => step.id === currentStepId)
  );

  // 计算进度百分比
  let progressPercentage = $derived(
    steps.length > 0 ? ((currentStepIndex + 1) / steps.length) * 100 : 0
  );

  // 处理步骤点击
  function handleStepClick(step: Step, index: number) {
    if (!allowNavigation || step.isDisabled) {
      return;
    }

    const fromStepId = currentStepId;
    dispatch('stepClick', { stepId: step.id, step });
    
    if (step.id !== currentStepId) {
      dispatch('stepChange', { fromStepId, toStepId: step.id });
    }
  }

  // 获取步骤状态类
  function getStepClasses(step: Step, index: number): string {
    const classes = ['step'];
    
    if (step.id === currentStepId) {
      classes.push('step--active');
    }
    
    if (step.isCompleted || index < currentStepIndex) {
      classes.push('step--completed');
    }
    
    if (step.isDisabled) {
      classes.push('step--disabled');
    }
    
    if (step.hasError) {
      classes.push('step--error');
    }
    
    if (step.hasWarning) {
      classes.push('step--warning');
    }
    
    if (allowNavigation && !step.isDisabled) {
      classes.push('step--clickable');
    }
    
    return classes.join(' ');
  }

  // 获取连接线状态类
  function getConnectorClasses(index: number): string {
    const classes = ['step-connector'];
    
    if (index < currentStepIndex) {
      classes.push('step-connector--completed');
    } else if (index === currentStepIndex) {
      classes.push('step-connector--active');
    }
    
    return classes.join(' ');
  }
</script>

<div 
  class="step-indicator step-indicator--{orientation} step-indicator--{size}"
  role="navigation"
  aria-label="步骤导航"
>
  {#if showProgress}
    <div class="progress-bar">
      <div 
        class="progress-fill" 
        style="width: {progressPercentage}%"
        role="progressbar"
        aria-valuenow={progressPercentage}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-label="完成进度"
      ></div>
    </div>
  {/if}

  <div class="steps-container">
    {#each steps as step, index}
      <div class="step-wrapper">
        <button
          type="button"
          class={getStepClasses(step, index)}
          onclick={() => handleStepClick(step, index)}
          disabled={step.isDisabled || !allowNavigation}
          aria-current={step.id === currentStepId ? 'step' : undefined}
          aria-describedby={step.description ? `step-desc-${step.id}` : undefined}
          title={step.description}
        >
          <div class="step-indicator-circle">
            {#if step.hasError}
              <EnhancedIcon name="x" size="16" />
            {:else if step.hasWarning}
              <EnhancedIcon name="alert-triangle" size="16" />
            {:else if step.isCompleted || index < currentStepIndex}
              <EnhancedIcon name="check" size="16" />
            {:else if step.icon}
              <EnhancedIcon name={step.icon} size="16" />
            {:else}
              <span class="step-number">{index + 1}</span>
            {/if}
          </div>
          
          <div class="step-content">
            <div class="step-name">{step.name}</div>
            {#if step.description && orientation === 'vertical'}
              <div class="step-description" id="step-desc-{step.id}">
                {step.description}
              </div>
            {/if}
          </div>
        </button>

        {#if index < steps.length - 1}
          <div class={getConnectorClasses(index)}></div>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .step-indicator {
    position: relative;
    width: 100%;
  }

  .progress-bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background-color: var(--background-modifier-border);
    border-radius: 1px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--interactive-accent), var(--interactive-accent-hover));
    transition: width 0.3s ease;
    border-radius: 1px;
  }

  .steps-container {
    display: flex;
    padding-top: 8px;
  }

  .step-indicator--horizontal .steps-container {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }

  .step-indicator--vertical .steps-container {
    flex-direction: column;
    align-items: stretch;
  }

  .step-wrapper {
    display: flex;
    align-items: center;
    flex: 1;
  }

  .step-indicator--vertical .step-wrapper {
    flex-direction: column;
    align-items: stretch;
    margin-bottom: 16px;
  }

  .step {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: default;
    transition: all 0.2s ease;
    text-align: left;
    width: 100%;
    min-height: 44px;
  }

  .step--clickable {
    cursor: pointer;
  }

  .step--clickable:hover {
    background-color: var(--background-modifier-hover);
  }

  .step--active {
    background-color: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .step--completed {
    color: var(--text-success);
  }

  .step--disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .step--error {
    color: var(--text-error);
  }

  .step--warning {
    color: var(--text-warning);
  }

  .step-indicator-circle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background-color: var(--background-modifier-border);
    margin-right: 12px;
    flex-shrink: 0;
    transition: all 0.2s ease;
  }

  .step--active .step-indicator-circle {
    background-color: var(--text-on-accent);
    color: var(--interactive-accent);
  }

  .step--completed .step-indicator-circle {
    background-color: var(--text-success);
    color: var(--text-on-accent);
  }

  .step--error .step-indicator-circle {
    background-color: var(--text-error);
    color: var(--text-on-accent);
  }

  .step--warning .step-indicator-circle {
    background-color: var(--text-warning);
    color: var(--text-on-accent);
  }

  .step-number {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
  }

  .step--active .step-number {
    color: var(--interactive-accent);
  }

  .step-content {
    flex: 1;
    min-width: 0;
  }

  .step-name {
    font-weight: 500;
    font-size: 14px;
    line-height: 1.4;
    margin-bottom: 2px;
  }

  .step-description {
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.3;
  }

  .step-connector {
    flex: 1;
    height: 2px;
    background-color: var(--background-modifier-border);
    margin: 0 8px;
    transition: background-color 0.2s ease;
  }

  .step-indicator--vertical .step-connector {
    width: 2px;
    height: 16px;
    margin: 4px auto;
    flex: none;
  }

  .step-connector--completed {
    background-color: var(--text-success);
  }

  .step-connector--active {
    background: linear-gradient(90deg, var(--text-success), var(--background-modifier-border));
  }

  .step-indicator--vertical .step-connector--active {
    background: linear-gradient(180deg, var(--text-success), var(--background-modifier-border));
  }

  /* 尺寸变体 */
  .step-indicator--sm .step {
    padding: 6px 8px;
    min-height: 36px;
  }

  .step-indicator--sm .step-indicator-circle {
    width: 20px;
    height: 20px;
    margin-right: 8px;
  }

  .step-indicator--sm .step-name {
    font-size: 13px;
  }

  .step-indicator--sm .step-description {
    font-size: 11px;
  }

  .step-indicator--lg .step {
    padding: 12px 16px;
    min-height: 52px;
  }

  .step-indicator--lg .step-indicator-circle {
    width: 28px;
    height: 28px;
    margin-right: 16px;
  }

  .step-indicator--lg .step-name {
    font-size: 15px;
  }

  .step-indicator--lg .step-description {
    font-size: 13px;
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .step-indicator--horizontal {
      overflow-x: auto;
    }

    .step-indicator--horizontal .steps-container {
      min-width: max-content;
    }

    .step-name {
      white-space: nowrap;
    }
  }

  /* 动画效果 */
  @keyframes stepComplete {
    0% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.1);
    }
    100% {
      transform: scale(1);
    }
  }

  .step--completed .step-indicator-circle {
    animation: stepComplete 0.3s ease;
  }

  /* 焦点样式 */
  .step:focus-visible {
    outline: 2px solid var(--interactive-accent);
    outline-offset: 2px;
  }

  /* 高对比度模式支持 */
  @media (prefers-contrast: high) {
    .step-indicator-circle {
      border: 1px solid currentColor;
    }

    .step-connector {
      border: 1px solid var(--background-modifier-border);
    }
  }

  /* 减少动画模式支持 */
  @media (prefers-reduced-motion: reduce) {
    .step,
    .step-indicator-circle,
    .step-connector,
    .progress-fill {
      transition: none;
    }

    .step--completed .step-indicator-circle {
      animation: none;
    }
  }
</style>
