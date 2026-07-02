<script lang="ts">
/**
 * Learning Steps Indicator - 贴纸式设计
 * 
 * 参考优先级贴纸风格，显示Learning Steps进度
 * 上方显示步骤（如 1/2），下方显示时间（如 1分钟）
 * 
 * @version 2.0.0
 * @since 2025-12-05
 */

import type { LearningStepsData } from '../../types/queue-optimization-types';
import { tr } from '../../utils/i18n';

interface Props {
  steps: LearningStepsData;
}

let { steps }: Props = $props();

let t = $derived($tr);

// 当前步骤索引
const currentStepIndex = $derived(steps.currentStep);

// 步骤文本（如 "1/2"）
const stepText = $derived(`${currentStepIndex + 1}/${steps.steps.length}`);

// 当前步骤的时间（如 "1分"，简洁版本）
const currentTime = $derived(t('study.learningSteps.minutes', { n: String(steps.steps[currentStepIndex]) }));

// 下一步骤的时间（用于Tooltip）
const nextStepTime = $derived(
  currentStepIndex + 1 < steps.steps.length 
    ? t('study.learningSteps.minutes', { n: String(steps.steps[currentStepIndex + 1]) })
    : t('study.learningSteps.completed')
);

// 是否显示警告（失败次数过多）
const showWarning = $derived(steps.failureCount > 2);

// Hover状态
let isHovered = $state(false);

// 延迟显示，避免卡片切换时闪烁
let isVisible = $state(false);

$effect(() => {
  // 当steps变化时，延迟显示
  if (steps) {
    isVisible = false;
    const timer = window.setTimeout(() => {
      isVisible = true;
    }, 150); // 150ms延迟
    
    return () => window.clearTimeout(timer);
  }
});
</script>

{#if isVisible}
<div 
  class="learning-sticky-note"
  role="button"
  tabindex="0"
  onmouseenter={() => isHovered = true}
  onmouseleave={() => isHovered = false}
>
  <!-- 上方大号数字：步骤 -->
  <div class="sticky-number">{stepText}</div>
  <!-- 下方小号文字：时间 -->
  <div class="sticky-label">{currentTime}</div>
  
  <!-- Hover详情提示 -->
  {#if isHovered}
    <div class="badge-tooltip">
      <div class="tooltip-row">
        <span class="tooltip-label">{t('study.learningSteps.currentStep')}</span>
        <span class="tooltip-value">{t('study.learningSteps.stepN', { n: String(currentStepIndex + 1) })}</span>
      </div>
      <div class="tooltip-row">
        <span class="tooltip-label">{t('study.learningSteps.nextAppear')}</span>
        <span class="tooltip-value">{t('study.learningSteps.minutesLater', { n: String(steps.steps[currentStepIndex]) })}</span>
      </div>
      <div class="tooltip-row">
        <span class="tooltip-label">{t('study.learningSteps.nextStep')}</span>
        <span class="tooltip-value">{nextStepTime}</span>
      </div>
      {#if showWarning}
        <div class="tooltip-row warning">
          <span class="tooltip-label">{t('study.learningSteps.repeated')}</span>
          <span class="tooltip-value">{t('study.learningSteps.repeatedTimes', { n: String(steps.failureCount) })}</span>
        </div>
      {/if}
    </div>
  {/if}
</div>
{/if}

<style>
/* 完全复用优先级贴纸设计，只改颜色为浅绿色 */
.learning-sticky-note {
  --weave-sticker-slot: 2;
  position: absolute;
  top: var(--weave-sticker-top, 20px);
  right: calc(
    var(--weave-sticker-right-start, 24px) +
    (var(--weave-sticker-slot) * (var(--weave-sticker-size, 68px) + var(--weave-sticker-gap, 12px)))
  );
  width: var(--weave-sticker-size, 68px);
  height: var(--weave-sticker-size, 68px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25), 0 2px 4px rgba(0, 0, 0, 0.15);
  transform: rotate(-3deg);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: var(--weave-z-overlay);
  cursor: pointer;
  user-select: none;
  
  /* 淡入动画，避免闪烁 */
  animation: fadeInSticky 0.2s ease-out;
  
  /* 浅绿色渐变 - 类似优先级1的黄色，但改为绿色 */
  background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
  color: #065f46;
}

@keyframes fadeInSticky {
  from {
    opacity: 0;
    transform: rotate(-3deg) translateY(-5px);
  }
  to {
    opacity: 1;
    transform: rotate(-3deg) translateY(0);
  }
}

/* 胶带效果 - 完全一致 */
.learning-sticky-note::before {
  content: '';
  position: absolute;
  top: -7px;
  left: 50%;
  transform: translateX(-50%);
  width: calc(var(--weave-sticker-size, 68px) * 0.7);
  height: calc(var(--weave-sticker-size, 68px) * 0.235);
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  backdrop-filter: blur(4px);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.1);
}

/* 上方大号数字 - 完全一致 */
.sticky-number {
  font-size: clamp(1.35rem, calc(var(--weave-sticker-size, 68px) * 0.47), 2rem);
  font-weight: 900;
  line-height: 1;
  margin-bottom: 0.2rem;
}

/* 下方小号文字 - 完全一致 */
.sticky-label {
  font-size: clamp(0.56rem, calc(var(--weave-sticker-size, 68px) * 0.16), 0.7rem);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.9;
}

/* Tooltip提示框 */
.badge-tooltip {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;  /* 从右侧对齐 */
  
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 8px;
  padding: 10px 12px;
  
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  
  white-space: nowrap;
  font-size: 11px;
  color: var(--text-normal);
  font-weight: 400;
  
  z-index: var(--weave-z-float);
  
  /* 淡入动画 */
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Tooltip行 */
.tooltip-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 3px 0;
}

.tooltip-label {
  color: var(--text-muted);
  font-size: 11px;
}

.tooltip-value {
  font-weight: 600;
  color: var(--text-normal);
  font-size: 11px;
}

/* 警告行样式 */
.tooltip-row.warning {
  margin-top: 4px;
  padding-top: 6px;
  border-top: 1px solid var(--background-modifier-border);
}

.tooltip-row.warning .tooltip-label,
.tooltip-row.warning .tooltip-value {
  color: var(--color-orange);
}

/* 暗色主题 Tooltip适配 */
:global(body.theme-dark) .badge-tooltip {
  background: #2d2d2d;
  border-color: #4d4d4d;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

/* 移动端响应式 */
@media (max-width: 768px) {
  .learning-sticky-note::before { top: -6px; }

  .badge-tooltip {
    font-size: 10px;
  }
}
</style>
