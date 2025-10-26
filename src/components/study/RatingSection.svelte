<script lang="ts">
  import EnhancedIcon from "../ui/EnhancedIcon.svelte";
  import type { Card, Rating, FSRSCard } from "../../data/types";
  import type { FSRS } from "../../algorithms/fsrs";
  import { UnifiedCardType } from "../../types/unified-card-types";

  interface Props {
    card: Card;
    fsrs: FSRS;
    onRate: (rating: Rating) => void;
    showAnswer: boolean;
    onShowAnswer: () => void;
    onUndoShowAnswer?: () => void;  // 新增：撤销显示答案的回调
    cardType?: UnifiedCardType | null;  // 新增：卡片题型
    learningConfig?: {
      learningSteps: number[];
      relearningSteps: number[];
      graduatingInterval: number;
      easyInterval: number;
    };
    learningStepIndex?: number;
  }

  let { card, fsrs, onRate, showAnswer, onShowAnswer, onUndoShowAnswer, cardType, learningConfig, learningStepIndex }: Props = $props();
  
  // 根据题型动态计算按钮文案
  let showAnswerButtonText = $derived(() => {
    if (cardType === UnifiedCardType.MULTIPLE_CHOICE) {
      return "确认答案";
    }
    return "显示答案";
  });

  /**
   * 格式化预测间隔时间（支持精细时间粒度）
   * 专门用于学习界面评分按钮的时间间隔显示
   */
  function formatPredictedInterval(days: number): string {
    // 处理异常输入
    if (typeof days !== 'number' || Number.isNaN(days) || days === null || days === undefined) {
      return "未知";
    }

    // 转换常量
    const MINUTES_PER_DAY = 24 * 60;
    const SECONDS_PER_MINUTE = 60;
    const DAYS_PER_MONTH = 30;
    const DAYS_PER_YEAR = 365;

    // 转换为分钟以处理短时间间隔
    const totalMinutes = days * MINUTES_PER_DAY;

    // 1. 处理秒级别（< 1分钟）
    if (totalMinutes < 1) {
      const seconds = Math.round(totalMinutes * SECONDS_PER_MINUTE);
      if (seconds < 1) {
        return "<1秒";
      }
      return `${seconds}秒`;
    }

    // 2. 处理分钟级别（1-59分钟）
    if (totalMinutes < 60) {
      const minutes = Math.round(totalMinutes);
      return `${minutes}分钟`;
    }

    // 3. 处理小时级别（1-23小时）
    const totalHours = totalMinutes / 60;
    if (totalHours < 24) {
      const hours = Math.round(totalHours);
      return `${hours}小时`;
    }

    // 4. 处理天级别（1-29天）
    if (days < DAYS_PER_MONTH) {
      const roundedDays = Math.round(days);
      return roundedDays === 1 ? "1天" : `${roundedDays}天`;
    }

    // 5. 处理月级别（30-364天）
    if (days < DAYS_PER_YEAR) {
      const months = Math.round(days / DAYS_PER_MONTH);
      return `${months}个月`;
    }

    // 6. 处理年级别（≥365天）
    const years = (days / DAYS_PER_YEAR).toFixed(1);
    return `${years}年`;
  }

  // 获取评分预测时间
  function getPredictedInterval(rating: Rating): string {
    if (!card) return "未知";
    try {
      // 手动创建一个干净的 FSRSCard 对象，避免 structuredClone 失败
      const cloned: FSRSCard = {
        due: card.fsrs.due,
        stability: card.fsrs.stability,
        difficulty: card.fsrs.difficulty,
        elapsedDays: card.fsrs.elapsedDays,
        scheduledDays: card.fsrs.scheduledDays,
        reps: card.fsrs.reps,
        lapses: card.fsrs.lapses,
        state: card.fsrs.state,
        lastReview: card.fsrs.lastReview,
        retrievability: card.fsrs.retrievability
      };
      
      // 增强对新卡片或不完整数据的处理
      if (!cloned.lastReview) {
        cloned.lastReview = new Date().toISOString();
        cloned.elapsedDays = 0;
        cloned.state = 0; // CardState.New
      }
      if (typeof cloned.elapsedDays !== 'number' || isNaN(cloned.elapsedDays)) {
        cloned.elapsedDays = 0;
      }

      const { card: updatedCard } = fsrs.review(cloned, rating);

      // 若在新/重学阶段，应用与 StudyModal 相同的学习步骤/毕业覆盖逻辑以保持一致
      try {
        const prevState = card.fsrs.state;
        const cfg = learningConfig || { learningSteps: [1,10], relearningSteps: [10], graduatingInterval: 1, easyInterval: 4 };
        const minutesToDays = (min: number) => Math.max(0, (min || 0) / (24 * 60));
        const isNewOrLearning = prevState === 0 || prevState === 1; // CardState.New|Learning
        const isRelearning = prevState === 3; // CardState.Relearning
        
        if (isNewOrLearning || isRelearning) {
          const steps = isRelearning ? (cfg.relearningSteps || [10]) : (cfg.learningSteps || [1,10]);
          const nextStepDays = (idx: number) => minutesToDays(steps[Math.min(idx, steps.length - 1)] ?? 1);
          let stepIndex = learningStepIndex ?? 0;
          
          const setDueAfterDays = (days: number) => {
            updatedCard.scheduledDays = Math.max(0, days);
            const ms = Math.round(days * 24 * 60 * 60 * 1000);
            updatedCard.due = new Date(Date.now() + ms).toISOString();
          };
          
          switch (rating) {
            case 1:
              stepIndex = 0; 
              setDueAfterDays(nextStepDays(stepIndex)); 
              updatedCard.state = isNewOrLearning ? 1 : 3; 
              break;
            case 2:
              setDueAfterDays(nextStepDays(stepIndex)); 
              updatedCard.state = isNewOrLearning ? 1 : 3; 
              stepIndex = Math.min(stepIndex + 1, Math.max(steps.length - 1, 0)); 
              break;
            case 3:
              stepIndex += 1;
              if (stepIndex < steps.length) { 
                setDueAfterDays(nextStepDays(stepIndex)); 
                updatedCard.state = isNewOrLearning ? 1 : 3; 
              } else { 
                setDueAfterDays(Math.max(1, cfg.graduatingInterval || 1)); 
                updatedCard.state = 2; 
                stepIndex = 0; 
              }
              break;
            case 4:
              setDueAfterDays(Math.max(1, cfg.easyInterval || 4)); 
              updatedCard.state = 2; 
              stepIndex = 0; 
              break;
          }
        }
      } catch (e) {
        console.error("Error applying learning steps in prediction:", e);
      }

      // 使用精细时间粒度格式化函数
      const days = updatedCard.scheduledDays || 0;
      return formatPredictedInterval(days);
    } catch (e) { 
      console.error("Failed to predict interval for rating", rating, e);
      return "未知"; 
    }
  }

  // 获取评分配置
  const ratingConfig = [
    { rating: 1 as Rating, label: "重来", color: "var(--tuanki-error)", key: "1" },
    { rating: 2 as Rating, label: "困难", color: "var(--tuanki-warning)", key: "2" },
    { rating: 3 as Rating, label: "良好", color: "var(--tuanki-success)", key: "3" },
    { rating: 4 as Rating, label: "简单", color: "var(--tuanki-info)", key: "4" },
  ];

  // 已移除未使用的模式/建议函数，保持组件精简
</script>

<div class="rating-section">
  {#if !showAnswer}
    <!-- 显示答案区域 -->
    <div class="show-answer-area">
      <button class="show-answer-btn" onclick={onShowAnswer}>
        <EnhancedIcon name="eye" size="20" />
        <span>{showAnswerButtonText()}</span>
        <kbd>空格</kbd>
      </button>
    </div>
  {:else}
  <!-- 评分区域（Cursor风格卡片按钮） -->
  <div class="rating-modern">
    <!-- 返回按钮区域 -->
    {#if onUndoShowAnswer}
      <div class="undo-section">
        <button 
          class="undo-btn"
          onclick={onUndoShowAnswer}
          title="返回预览状态（重新隐藏答案）"
          aria-label="返回预览状态"
        >
          <EnhancedIcon name="arrow-left" size="18" />
          <span>返回</span>
        </button>
      </div>
    {/if}

    <div class="rate-grid">
      {#each ratingConfig as cfg}
        <button
          class="rate-card"
          style="--accent: {cfg.color}"
          aria-label={`评分：${cfg.label}（下一次：${getPredictedInterval(cfg.rating)}）`}
          aria-keyshortcuts={cfg.key}
          onclick={() => {
            console.log('[RatingSection] Button clicked:', {
              rating: cfg.rating,
              label: cfg.label,
              showAnswer
            });
            onRate(cfg.rating);
          }}
        >
          <div class="rate-head">
            <span class="rate-label">{cfg.label}</span>
            <kbd class="rate-key">{cfg.key}</kbd>
          </div>
          <div class="rate-body">
            <span class="rate-next">{getPredictedInterval(cfg.rating)}</span>
          </div>
          <div class="rate-accent" aria-hidden="true"></div>
        </button>
      {/each}
    </div>
  <!-- 移除快捷键提示以简化界面 -->
  </div>
  {/if}
</div>

<style>
  .rating-section {
    background: var(--background-primary);
    border-top: 1px solid var(--background-modifier-border);
    padding: 1rem 1.5rem 1.25rem; /* 减小内边距以突出内容区 */
  }

  /* 显示答案区域 */
  .show-answer-area {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .show-answer-btn {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: var(--tuanki-info);
    color: white;
    border: none;
    border-radius: 0.75rem;
    padding: 1rem 2rem;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: var(--tuanki-shadow-md);
  }

  .show-answer-btn:hover {
    transform: translateY(-2px);
    box-shadow: var(--tuanki-shadow-lg);
    background: color-mix(in srgb, var(--tuanki-info) 90%, black);
  }

  .show-answer-btn:active {
    transform: translateY(0);
  }

  .show-answer-btn kbd {
    background: rgba(255, 255, 255, 0.2);
    color: white;
    padding: 0.25rem 0.5rem;
    border-radius: 0.375rem;
    font-size: 0.75rem;
    font-weight: bold;
    margin: 0;
  }


  /* 评分区域（现代卡片按钮 - 优化版） */
  .rating-modern { 
    display: flex; 
    flex-direction: column; 
    gap: 0.75rem; /* 减小间距 */
    max-width: 700px; 
    margin: 0 auto;
  }

  /* 撤销按钮区域 */
  .undo-section {
    display: flex;
    justify-content: flex-start;
    margin-bottom: 0.5rem;
  }

  .undo-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--background-secondary);
    color: var(--text-muted);
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.75rem;
    padding: 0.75rem 1.25rem;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  }

  .undo-btn:hover {
    transform: translateY(-2px);
    background: var(--background-modifier-hover);
    border-color: var(--text-accent);
    color: var(--text-normal);
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  }

  .undo-btn:active {
    transform: translateY(0);
    transition: transform 0.1s ease;
  }
  
  .rate-grid { 
    display: grid; 
    grid-template-columns: repeat(4, 1fr); 
    gap: 0.75rem; /* 减小间距以更紧凑 */
  }
  
  .rate-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.5rem; /* 减小内部间距 */
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.875rem; /* 稍微减小圆角 */
    padding: 0.875rem 1rem; /* 减小内边距 */
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
    isolation: isolate;
    min-height: 72px; /* 减小最小高度 */
  }
  
  .rate-card:hover {
    transform: translateY(-3px);
    border-color: var(--accent);
    background: var(--background-modifier-hover);
    box-shadow: 0 12px 24px rgba(0,0,0,.12), 0 4px 8px rgba(0,0,0,.08);
  }
  
  .rate-card:active {
    transform: translateY(-1px);
    transition: transform 0.1s ease;
  }
  
  .rate-card:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent);
  }
  
  .rate-accent {
    position: absolute; 
    inset: -30% -30% auto auto; 
    height: 120%; 
    width: 120%;
    background: radial-gradient(50% 50% at 75% 25%, 
      color-mix(in srgb, var(--accent) 15%, transparent), 
      transparent 65%);
    pointer-events: none; 
    z-index: -1;
  }
  
  .rate-head { 
    display: flex; 
    align-items: center; 
    justify-content: space-between; 
  }
  
  .rate-label { 
    font-weight: 700; 
    letter-spacing: 0.025em; 
    font-size: 0.9rem;
    color: var(--text-normal);
  }
  
  .rate-key { 
    background: var(--background-primary); 
    border: 1px solid var(--background-modifier-border); 
    border-radius: 0.375rem; 
    padding: 0.2rem 0.5rem; 
    font-size: 0.75rem; 
    font-weight: 600;
    color: var(--text-muted);
  }
  
  .rate-body { 
    display: flex; 
    align-items: center; 
    gap: 0.5rem; 
    margin-top: auto;
  }
  
  .rate-next { 
    color: var(--text-muted); 
    font-weight: 600; 
    font-size: 0.875rem; 
  }

/* styles aligned to current design */

  /* 评分按钮组 */
/* styles aligned to current design */

/* styles aligned to current design */

  /* 评分建议 */
/* styles aligned to current design */

  /* 已移除 keyboard-hints 未使用样式 */

  /* 浅色模式适配 */
  :global(.theme-light) .show-answer-btn {
    background: var(--tuanki-info);
    color: white;
  }

  :global(.theme-light) .show-answer-btn:hover {
    background: color-mix(in srgb, var(--tuanki-info) 85%, black);
  }

  :global(.theme-light) .show-answer-btn kbd {
    background: rgba(255, 255, 255, 0.25);
    color: white;
  }

  /* 响应式设计 */
  @media (max-width: 1024px) {
    .rating-section { padding: 0.875rem 1.25rem 1rem; } /* 平板端减小 */
  }

  @media (max-width: 640px) {
    .rating-section { padding: 0.75rem 1rem; } /* 手机端减小 */
    .show-answer-btn { padding: 0.875rem 1.5rem; font-size: 0.875rem; }
    .rate-grid { grid-template-columns: 1fr 1fr; gap: 0.5rem; } /* 手机端减小间距 */
  }

/* animations aligned to current design */
</style>
