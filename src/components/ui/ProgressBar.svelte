<script lang="ts">
// 进度条组件
export let current: number = 0;
export let total: number = 100;
export let showPercentage: boolean = true;
export let showNumbers: boolean = false;
export let variant: 'primary' | 'success' | 'warning' | 'error' = 'primary';
export let size: 'small' | 'medium' | 'large' = 'medium';
export let animated: boolean = true;

$: percentage = total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : 0;
$: isComplete = percentage >= 100;

function getVariantClass(variant: string): string {
  switch (variant) {
    case 'success': return 'progress-success';
    case 'warning': return 'progress-warning';
    case 'error': return 'progress-error';
    default: return 'progress-primary';
  }
}

function getSizeClass(size: string): string {
  switch (size) {
    case 'small': return 'progress-small';
    case 'large': return 'progress-large';
    default: return 'progress-medium';
  }
}
</script>

<div 
  class="progress-container {getSizeClass(size)}"
  role="progressbar"
  aria-valuenow={current}
  aria-valuemin={0}
  aria-valuemax={total}
  aria-label="进度条"
>
  <div class="progress-track">
    <div 
      class="progress-fill {getVariantClass(variant)}"
      class:animated
      class:complete={isComplete}
      style="width: {percentage}%"
    ></div>
  </div>
  
  {#if showPercentage || showNumbers}
    <div class="progress-text">
      {#if showPercentage}
        <span class="percentage">{Math.round(percentage)}%</span>
      {/if}
      {#if showNumbers}
        <span class="numbers">{current} / {total}</span>
      {/if}
    </div>
  {/if}
</div>

<style>
.progress-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.progress-track {
  background: var(--background-modifier-border);
  border-radius: 8px;
  overflow: hidden;
  position: relative;
}

.progress-fill {
  height: 100%;
  border-radius: 8px;
  transition: width 0.3s ease;
  position: relative;
}

.progress-fill.animated::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    45deg,
    transparent 25%,
    rgba(255, 255, 255, 0.1) 25%,
    rgba(255, 255, 255, 0.1) 50%,
    transparent 50%,
    transparent 75%,
    rgba(255, 255, 255, 0.1) 75%
  );
  background-size: 20px 20px;
  animation: progress-stripes 1s linear infinite;
}

@keyframes progress-stripes {
  0% {
    background-position: 0 0;
  }
  100% {
    background-position: 20px 0;
  }
}

/* Variants */
.progress-primary {
  background: linear-gradient(90deg, #6366f1, #8b5cf6);
}

.progress-success {
  background: linear-gradient(90deg, #10b981, #34d399);
}

.progress-warning {
  background: linear-gradient(90deg, #f59e0b, #fbbf24);
}

.progress-error {
  background: linear-gradient(90deg, #ef4444, #f87171);
}

/* Sizes */
.progress-small .progress-track {
  height: 4px;
}

.progress-medium .progress-track {
  height: 8px;
}

.progress-large .progress-track {
  height: 12px;
}

.progress-text {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
  color: var(--text-muted);
}

.percentage {
  font-weight: 600;
  color: var(--text-normal);
}

.numbers {
  font-size: 0.8rem;
}

.progress-fill.complete {
  background: linear-gradient(90deg, #10b981, #34d399) !important;
}

.progress-fill.complete.animated::after {
  animation: none;
}

/* 响应式设计 */
@media (max-width: 600px) {
  .progress-text {
    font-size: 0.8rem;
  }
  
  .numbers {
    font-size: 0.7rem;
  }
}

/* 无障碍支持 */
.progress-container:focus-within {
  outline: 2px solid var(--text-accent);
  outline-offset: 2px;
  border-radius: 4px;
}

/* 高对比度模式支持 */
@media (prefers-contrast: high) {
  .progress-track {
    border: 1px solid var(--text-normal);
  }
  
  .progress-fill {
    border: 1px solid var(--text-normal);
  }
}

/* 减少动画模式支持 */
@media (prefers-reduced-motion: reduce) {
  .progress-fill {
    transition: none;
  }
  
  .progress-fill.animated::after {
    animation: none;
  }
}
</style>
