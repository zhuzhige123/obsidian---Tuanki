<script lang="ts">
/**
 * Difficulty Indicator
 * 
 * 显示卡片难度等级的指示器组件
 * 
 * @version 1.0.0
 * @since 2025-12-04
 */

import type { DifficultyTracking } from '../../types/queue-optimization-types';
import { tr } from '../../utils/i18n';

interface Props {
  tracking: DifficultyTracking;
  compact?: boolean;
  sticky?: boolean;  // 新增：贴纸模式
}

let { tracking, compact = false, sticky = false }: Props = $props();

let t = $derived($tr);

// 难度等级配置 - 方案13：纯数字
const levelConfig = {
  easy: { 
    emoji: '', 
    number: '1',
    label: '', 
    color: 'var(--color-green)',
    bgColor: 'rgba(var(--color-green-rgb), 0.1)'
  },
  medium: { 
    emoji: '',
    number: '2',
    label: '', 
    color: 'var(--color-yellow)',
    bgColor: 'rgba(var(--color-yellow-rgb), 0.1)'
  },
  hard: { 
    emoji: '',
    number: '3',
    label: '', 
    color: 'var(--color-orange)',
    bgColor: 'rgba(var(--color-orange-rgb), 0.1)'
  },
  very_hard: { 
    emoji: '',
    number: '4',
    label: '', 
    color: 'var(--color-red)',
    bgColor: 'rgba(var(--color-red-rgb), 0.1)'
  }
};

const levelLabels = $derived({
  easy: t('study.difficultyIndicator.easy'),
  medium: t('study.difficultyIndicator.medium'),
  hard: t('study.difficultyIndicator.hard'),
  very_hard: t('study.difficultyIndicator.veryHard'),
});
const rawConfig = $derived(levelConfig[tracking.currentLevel]);
const config = $derived({ ...rawConfig, label: levelLabels[tracking.currentLevel] });
const showTrend = $derived(tracking.trend !== 'stable');
const showIntervention = $derived(tracking.interventionLevel >= 2);

// 贴纸模式：只在困难级别时显示
const shouldShowSticky = $derived(
  sticky && (tracking.currentLevel === 'hard' || tracking.currentLevel === 'very_hard')
);

// Hover状态
let isHovered = $state(false);

// 延迟显示，避免卡片切换时闪烁
let isVisible = $state(false);

$effect(() => {
  // 当tracking变化时，延迟显示
  if (tracking && shouldShowSticky) {
    isVisible = false;
    const timer = window.setTimeout(() => {
      isVisible = true;
    }, 150); // 150ms延迟
    
    return () => window.clearTimeout(timer);
  } else {
    isVisible = false;
  }
});
</script>

{#if sticky}
  <!-- 贴纸模式：只在困难时显示，延迟显示避免闪烁 -->
  {#if shouldShowSticky && isVisible}
    <div 
      class="difficulty-sticky-note difficulty-{tracking.currentLevel}"
      role="button"
      tabindex="0"
      onmouseenter={() => isHovered = true}
      onmouseleave={() => isHovered = false}
    >
      <div class="sticky-number">{config.number}</div>
      <div class="sticky-label">{config.label}</div>
      
      <!-- Hover详情 -->
      {#if isHovered}
        <div class="sticky-tooltip">
          <div class="tooltip-row">
            <span class="tooltip-label">{t('study.difficultyIndicator.level')}</span>
            <span class="tooltip-value">{config.label}</span>
          </div>
          {#if tracking.consecutiveHard > 0}
            <div class="tooltip-row">
              <span class="tooltip-label">{t('study.difficultyIndicator.consecutiveHard')}</span>
              <span class="tooltip-value">{t('study.difficultyIndicator.consecutiveHardTimes', { n: String(tracking.consecutiveHard) })}</span>
            </div>
          {/if}
          <div class="tooltip-row warning">
            <span class="tooltip-label">{t('study.difficultyIndicator.suggestion')}</span>
            <span class="tooltip-value">{t('study.difficultyIndicator.improveSuggestion')}</span>
          </div>
        </div>
      {/if}
    </div>
  {/if}
  <!-- 非困难级别时不显示任何内容 -->
{:else if compact}
  <!-- 紧凑模式 -->
  <div 
    class="difficulty-indicator compact"
    style="color: {config.color}; border-color: {config.color};"
  >
    <span class="emoji">{config.emoji}</span>
    <span class="label">{config.label}</span>
  </div>
{:else}
  <!-- 完整模式 -->
  <div 
    class="difficulty-indicator full"
    style="border-left-color: {config.color}; background: {config.bgColor};"
  >
    <div class="indicator-main">
      <div class="level-info">
        <span class="emoji">{config.emoji}</span>
        <span class="label" style="color: {config.color};">{config.label}</span>
      </div>
      
      {#if showTrend}
        <div class="trend" class:rising={tracking.trend === 'rising'}>
          {#if tracking.trend === 'rising'}
            <span class="trend-text">{t('study.difficultyIndicator.trendRising')}</span>
          {:else}
            <span class="trend-text">{t('study.difficultyIndicator.trendFalling')}</span>
          {/if}
        </div>
      {/if}
    </div>
    
    {#if showIntervention}
      <div class="intervention-notice">
        <span class="notice-text">{t('study.difficultyIndicator.interventionNotice')}</span>
      </div>
    {/if}
    
    <!-- 连续Hard提示 -->
    {#if tracking.consecutiveHard >= 3}
      <div class="consecutive-info">
        {t('study.difficultyIndicator.consecutiveInfo', { n: String(tracking.consecutiveHard) })}
      </div>
    {/if}
  </div>
{/if}

<style>
/* =============== 贴纸模式样式 - 完全复用优先级贴纸设计 =============== */
.difficulty-sticky-note {
  --weave-sticker-slot: 3;
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
  animation: fadeInDifficulty 0.2s ease-out;
}

@keyframes fadeInDifficulty {
  from {
    opacity: 0;
    transform: rotate(-3deg) translateY(-5px);
  }
  to {
    opacity: 1;
    transform: rotate(-3deg) translateY(0);
  }
}

/* 胶带效果 */
.difficulty-sticky-note::before {
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

/* 困难 - 橙色贴纸 */
.difficulty-hard {
  background: linear-gradient(135deg, #fed7aa 0%, #fdba74 100%);
  color: #7c2d12;
}

/* 非常困难 - 红色贴纸 + 摇摆动画 */
.difficulty-very_hard {
  background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
  color: #991b1b;
  /* 先淡入，延迟后开始摇摆 */
  animation: fadeInDifficulty 0.2s ease-out, wiggle-difficulty 0.8s ease-in-out 0.3s infinite;
}

@keyframes wiggle-difficulty {
  0%, 100% { transform: rotate(-3deg); }
  25% { transform: rotate(-5deg); }
  75% { transform: rotate(-1deg); }
}

/* 数字显示 - 方案13：纯数字 */
.sticky-number {
  font-size: clamp(1.9rem, calc(var(--weave-sticker-size, 68px) * 0.47), 2.8rem);
  line-height: 1;
  font-weight: 900;
  margin-bottom: 0.1rem;
  letter-spacing: 0;
}

.sticky-label {
  font-size: clamp(0.54rem, calc(var(--weave-sticker-size, 68px) * 0.16), 0.65rem);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.9;
}

/* 向后兼容：保留emoji样式供其他模式使用 */
.sticky-emoji {
  font-size: 2.5rem;
  line-height: 1;
  margin-bottom: 0.1rem;
}

/* Tooltip样式 */
.sticky-tooltip {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
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
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

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

.tooltip-row.warning {
  margin-top: 4px;
  padding-top: 6px;
  border-top: 1px solid var(--background-modifier-border);
}

.tooltip-row.warning .tooltip-label,
.tooltip-row.warning .tooltip-value {
  color: var(--color-orange);
}

:global(body.theme-dark) .sticky-tooltip {
  background: #2d2d2d;
  border-color: #4d4d4d;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

/* 移动端响应式 */
@media (max-width: 768px) {
  .difficulty-sticky-note::before { top: -6px; }

  .sticky-emoji { font-size: 1.5rem; }

  .sticky-tooltip {
    font-size: 10px;
  }
}

/* =============== 原有样式 =============== */
.difficulty-indicator {
  font-size: 13px;
  transition: all 0.2s ease;
}

/* 紧凑模式 */
.difficulty-indicator.compact {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border: 1px solid;
  border-radius: 12px;
  background: var(--background-secondary);
  font-size: 11px;
}

.difficulty-indicator.compact .emoji {
  font-size: 12px;
}

.difficulty-indicator.compact .label {
  font-weight: 500;
}

/* 完整模式 */
.difficulty-indicator.full {
  border-left: 3px solid;
  border-radius: 4px;
  padding: 8px 12px;
  margin-bottom: 12px;
}

.indicator-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.level-info {
  display: flex;
  align-items: center;
  gap: 6px;
}

.emoji {
  font-size: 16px;
}

.label {
  font-weight: 600;
}

/* 趋势显示 */
.trend {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  background: var(--background-secondary);
}

.trend.rising {
  color: var(--color-orange);
}

.trend-icon {
  font-size: 12px;
}

.trend-text {
  font-weight: 500;
}

/* 干预建议 */
.intervention-notice {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 6px 10px;
  background: rgba(var(--interactive-accent-rgb), 0.1);
  border: 1px solid rgba(var(--interactive-accent-rgb), 0.3);
  border-radius: 4px;
  color: var(--interactive-accent);
  font-size: 12px;
  font-weight: 500;
}

.notice-icon {
  font-size: 14px;
}

/* 连续Hard信息 */
.consecutive-info {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-muted);
  font-style: italic;
}

/* 响应式 */
@media (max-width: 768px) {
  .difficulty-indicator.full {
    padding: 6px 10px;
  }
  
  .indicator-main {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }
  
  .intervention-notice {
    padding: 4px 8px;
    font-size: 11px;
  }
}
</style>
