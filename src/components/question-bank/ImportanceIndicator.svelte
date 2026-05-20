<script lang="ts">
/**
 * Importance Indicator - 重要程度指示器
 * 
 * 复用 DifficultyIndicator 的贴纸设计，用于显示考试卡片的重要程度
 * 
 * @version 1.0.0
 * @since 2025-12-06
 */

import { tr } from '../../utils/i18n';

interface Props {
  importance: number;  // 1-4 的重要程度
  sticky?: boolean;    // 贴纸模式
}

let { importance, sticky = false }: Props = $props();
let t = $derived($tr);

// 重要程度等级配置
const levelConfig = {
  1: { 
    number: '1',
    label: () => t('study.questionBankUI.studyInterface.priorityLow'),
    color: '#10b981',  // 绿色
    bgGradient: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
    textColor: '#065f46',
    wiggle: false
  },
  2: { 
    number: '2',
    label: () => t('study.questionBankUI.studyInterface.priorityMedium'),
    color: '#3b82f6',  // 蓝色
    bgGradient: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
    textColor: '#1e40af',
    wiggle: false
  },
  3: { 
    number: '3',
    label: () => t('study.questionBankUI.studyInterface.priorityHigh'),
    color: '#f59e0b',  // 橙色
    bgGradient: 'linear-gradient(135deg, #fed7aa 0%, #fdba74 100%)',
    textColor: '#7c2d12',
    wiggle: false
  },
  4: { 
    number: '4',
    label: () => t('study.questionBankUI.studyInterface.priorityVeryHigh'),
    color: '#ef4444',  // 红色
    bgGradient: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
    textColor: '#991b1b',
    wiggle: true  // 4级重要度添加摇摆动画
  }
};

const config = $derived(levelConfig[importance as keyof typeof levelConfig] || levelConfig[1]);

// Hover状态
let isHovered = $state(false);

// 延迟显示，避免卡片切换时闪烁
let isVisible = $state(false);

$effect(() => {
  // 当importance变化时，延迟显示
  if (importance && sticky) {
    isVisible = false;
    const timer = setTimeout(() => {
      isVisible = true;
    }, 150); // 150ms延迟
    
    return () => clearTimeout(timer);
  } else {
    isVisible = false;
  }
});
</script>

{#if sticky && isVisible}
  <!-- 贴纸模式 -->
  <div 
    class="importance-sticky-note"
    class:wiggle={config.wiggle}
    style="background: {config.bgGradient}; color: {config.textColor};"
    role="button"
    tabindex="0"
    onmouseenter={() => isHovered = true}
    onmouseleave={() => isHovered = false}
  >
    <div class="sticky-number">{config.number}</div>
    <div class="sticky-label">{config.label()}</div>
    
    <!-- Hover详情 -->
    {#if isHovered}
      <div class="sticky-tooltip">
        <div class="tooltip-row">
          <span class="tooltip-label">{t('study.questionBankUI.importanceIndicator.title')}</span>
          <span class="tooltip-value">{config.label()}</span>
        </div>
        <div class="tooltip-row">
          <span class="tooltip-label">{t('study.questionBankUI.importanceIndicator.level')}</span>
          <span class="tooltip-value">{importance}/4</span>
        </div>
        {#if importance >= 3}
          <div class="tooltip-row highlight">
            <span class="tooltip-label">{t('study.questionBankUI.importanceIndicator.hint')}</span>
            <span class="tooltip-value">{t('study.questionBankUI.importanceIndicator.focus')}</span>
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
/* =============== 贴纸模式样式 - 复用 DifficultyIndicator 设计 =============== */
.importance-sticky-note {
  position: absolute;
  top: 16px;
  right: 80px;  /* 在考试界面中，显示在右上角合适位置 */
  width: 75px;
  height: 75px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25), 0 2px 4px rgba(0, 0, 0, 0.15);
  transform: rotate(-3deg);
  transition: all 0.3s cubic-bezier(0, 0, 0.2, 1);
  z-index: var(--weave-z-overlay);
  cursor: pointer;
  user-select: none;
  
  /* 淡入动画，避免闪烁 */
  animation: fadeInImportance 0.2s ease-out;
}

@keyframes fadeInImportance {
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
.importance-sticky-note::before {
  content: '';
  position: absolute;
  top: -7px;
  left: 50%;
  transform: translateX(-50%);
  width: 48px;
  height: 16px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  backdrop-filter: blur(4px);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.1);
}

/* 摇摆动画 - 只用于4级重要度 */
.importance-sticky-note.wiggle {
  animation: fadeInImportance 0.2s ease-out, wiggle-importance 0.8s ease-in-out 0.3s infinite;
}

@keyframes wiggle-importance {
  0%, 100% { transform: rotate(-3deg); }
  25% { transform: rotate(-5deg); }
  75% { transform: rotate(-1deg); }
}

/* 数字显示 */
.sticky-number {
  font-size: 2.8rem;
  line-height: 1;
  font-weight: 900;
  margin-bottom: 0.1rem;
  letter-spacing: 0;
}

.sticky-label {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.9;
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

.tooltip-row.highlight {
  margin-top: 4px;
  padding-top: 6px;
  border-top: 1px solid var(--background-modifier-border);
}

.tooltip-row.highlight .tooltip-label,
.tooltip-row.highlight .tooltip-value {
  color: var(--color-orange);
}

:global(body.theme-dark) .sticky-tooltip {
  background: #2d2d2d;
  border-color: #4d4d4d;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

/* 移动端响应式 */
@media (max-width: 768px) {
  .importance-sticky-note {
    width: 65px;
    height: 65px;
    top: 14px;
    right: 170px;
  }
  
  .sticky-number {
    font-size: 2rem;
  }
  
  .sticky-label {
    font-size: 0.6rem;
  }
  
  .sticky-tooltip {
    font-size: 10px;
  }
}
</style>
