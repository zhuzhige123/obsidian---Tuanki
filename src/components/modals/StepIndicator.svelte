<!--
  步骤指示器组件
  用于显示多步骤流程的当前进度
-->
<script lang="ts">
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';
  
  // UI类型定义
  type ImportStepId = 'select' | 'preview' | 'import' | 'result';
  
  interface ImportStep {
    id: ImportStepId;
    label: string;
    description: string;
  }
  
  interface Props {
    steps: readonly ImportStep[];
    currentStep: ImportStepId;
    completedSteps: ImportStepId[];
  }
  
  let { steps, currentStep, completedSteps }: Props = $props();
  
  function getStepStatus(stepId: ImportStepId): 'completed' | 'active' | 'pending' {
    if (completedSteps.includes(stepId)) return 'completed';
    if (stepId === currentStep) return 'active';
    return 'pending';
  }
</script>

<div class="step-indicator">
  {#each steps as step, index}
    {@const status = getStepStatus(step.id)}
    {@const isLast = index === steps.length - 1}
    
    <div 
      class="step-item" 
      class:completed={status === 'completed'}
      class:active={status === 'active'}
      class:pending={status === 'pending'}
    >
      <!-- 步骤圆圈 -->
      <div class="step-circle">
        {#if status === 'completed'}
          <EnhancedIcon name="check" size={16} />
        {:else if status === 'active'}
          <span class="step-number">{index + 1}</span>
        {:else}
          <span class="step-number step-pending">{index + 1}</span>
        {/if}
      </div>
      
      <!-- 步骤信息 -->
      <div class="step-info">
        <div class="step-label">{step.label}</div>
        {#if status === 'active'}
          <div class="step-description">{step.description}</div>
        {/if}
      </div>
      
      <!-- 连接线 -->
      {#if !isLast}
        <div class="step-connector" class:completed={status === 'completed'}></div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .step-indicator {
    display: flex;
    align-items: flex-start;
    gap: var(--tuanki-space-md, 1rem);
    padding: var(--tuanki-space-lg, 1.25rem);
    background: var(--tuanki-bg-secondary, var(--background-secondary));
    border-radius: var(--tuanki-radius-lg, 12px);
    margin-bottom: var(--tuanki-space-lg, 1.25rem);
    position: relative;
  }
  
  .step-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
  }
  
  /* 步骤圆圈 */
  .step-circle {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    transition: all var(--tuanki-transition-normal, 250ms);
    z-index: 2;
    position: relative;
  }
  
  /* 待完成状态 */
  .step-item.pending .step-circle {
    background: var(--tuanki-bg-primary, var(--background-primary));
    border: 2px solid var(--tuanki-border, var(--background-modifier-border));
    color: var(--tuanki-text-muted, var(--text-muted));
  }
  
  /* 进行中状态 */
  .step-item.active .step-circle {
    background: var(--tuanki-accent, var(--interactive-accent));
    border: 2px solid var(--tuanki-accent, var(--interactive-accent));
    color: white;
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--interactive-accent) 20%, transparent);
  }
  
  /* 已完成状态 */
  .step-item.completed .step-circle {
    background: var(--tuanki-success, var(--color-green));
    border: 2px solid var(--tuanki-success, var(--color-green));
    color: white;
  }
  
  /* 步骤信息 */
  .step-info {
    margin-top: var(--tuanki-space-sm, 0.5rem);
    text-align: center;
  }
  
  .step-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--tuanki-text-normal, var(--text-normal));
  }
  
  .step-item.pending .step-label {
    color: var(--tuanki-text-muted, var(--text-muted));
  }
  
  .step-item.active .step-label {
    color: var(--tuanki-accent, var(--interactive-accent));
  }
  
  .step-description {
    font-size: 0.75rem;
    color: var(--tuanki-text-muted, var(--text-muted));
    margin-top: var(--tuanki-space-xs, 0.25rem);
  }
  
  /* 连接线 */
  .step-connector {
    position: absolute;
    top: 20px;
    left: calc(50% + 20px);
    right: calc(-50% + 20px);
    height: 2px;
    background: var(--tuanki-border, var(--background-modifier-border));
    z-index: 1;
    transition: background var(--tuanki-transition-normal, 250ms);
  }
  
  .step-connector.completed {
    background: var(--tuanki-success, var(--color-green));
  }
  
  /* 响应式 */
  @media (max-width: 768px) {
    .step-indicator {
      flex-direction: column;
      gap: var(--tuanki-space-sm, 0.5rem);
    }
    
    .step-item {
      flex-direction: row;
      width: 100%;
      align-items: center;
    }
    
    .step-info {
      margin-top: 0;
      margin-left: var(--tuanki-space-md, 1rem);
      text-align: left;
      flex: 1;
    }
    
    .step-connector {
      display: none;
    }
  }
</style>

