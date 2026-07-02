<script lang="ts">
  import { logger } from '../../utils/logger';

  import EnhancedIcon from "../ui/EnhancedIcon.svelte";
  import type { Card, Rating, FSRSCard } from "../../data/types";
  import type { FSRS } from "../../algorithms/fsrs";
  import { UnifiedCardType } from "../../types/unified-card-types";
  import { StepIndexCalculator } from "../../utils/learning-steps/StepIndexCalculator";
  import { createDefaultMemorySchedulingSettings } from "../../utils/learning-steps/memorySchedulingConfig";
  import { detectClozeModeFromContent } from "../../utils/cloze-mode";
  import { predictRatingScheduledDays } from "../../utils/study/predictRatingInterval";
  import {
    DEFAULT_RATING_LABEL_STYLE,
    getRatingLabels,
    isMoodGraphicStyle,
    isMoodTimeStyle,
    normalizeRatingLabelStyle,
    shouldShowRatingIntervalOnButtons,
    type RatingLabelStyle,
  } from "./rating-label-style";
  
  //  导入国际化
  import { tr } from "../../utils/i18n";

  interface MoodFaceConfig {
    leftEyePath: string;
    rightEyePath: string;
    mouthPath: string;
    blushOpacity: number;
  }

  interface RatingConfigItem {
    rating: Rating;
    label: string;
    color: string;
    textColor: string;
    key: string;
    moodFace: MoodFaceConfig;
  }

  interface Props {
    card: Card;
    fsrs: FSRS;
    onRate: (rating: Rating) => void;
    showAnswer: boolean;
    onShowAnswer: () => void;
    cardType?: UnifiedCardType | null;  // 新增：卡片题型
    learningConfig?: {
      learningSteps: number[];
      relearningSteps: number[];
      graduatingInterval: number;
      easyInterval: number;
    };
    learningStepIndex?: number;
    ratingLabelStyle?: RatingLabelStyle;
    showRatingIntervalOnButtons?: boolean;
    shortcutEnabled?: boolean;
    ratingDisabled?: boolean;
  }

  let {
    card,
    fsrs,
    onRate,
    showAnswer,
    onShowAnswer,
    cardType,
    learningConfig,
    learningStepIndex,
    ratingLabelStyle = DEFAULT_RATING_LABEL_STYLE,
    showRatingIntervalOnButtons = shouldShowRatingIntervalOnButtons(DEFAULT_RATING_LABEL_STYLE),
    shortcutEnabled = true,
    ratingDisabled = false,
  }: Props = $props();
  
  //  响应式翻译函数
  let t = $derived($tr);
  let normalizedRatingLabelStyle = $derived(normalizeRatingLabelStyle(ratingLabelStyle));
  let ratingLabels = $derived(getRatingLabels(normalizedRatingLabelStyle, t));
  let useMoodGraphicStyle = $derived(isMoodGraphicStyle(normalizedRatingLabelStyle));
  let useMoodTimeStyle = $derived(isMoodTimeStyle(normalizedRatingLabelStyle));
  let showIntervalOnButtons = $derived(
    shouldShowRatingIntervalOnButtons(normalizedRatingLabelStyle) ||
      (showRatingIntervalOnButtons &&
        (normalizedRatingLabelStyle === "classic" || normalizedRatingLabelStyle === "mood"))
  );
  
  // 根据题型动态计算按钮文案
  let showAnswerButtonText = $derived(() => {
    const isClozeInputMode =
      cardType === UnifiedCardType.CLOZE_DELETION &&
      detectClozeModeFromContent(card?.content || '') === 'input';

    if (isClozeInputMode) {
      return t('studyInterface.confirmAnswer');
    }

    if (cardType === UnifiedCardType.MULTIPLE_CHOICE) {
      return t('studyInterface.confirmAnswer');
    }
    return t('studyInterface.showAnswer');
  });

  /**
   * 格式化预测间隔时间（支持精细时间粒度）
   * 专门用于学习界面评分按钮的时间间隔显示
   */
  function formatPredictedInterval(days: number): string {
    // 处理异常输入
    if (typeof days !== 'number' || Number.isNaN(days) || days === null || days === undefined) {
      return t('studyInterface.intervals.unknown');
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
      return t('studyInterface.intervals.lessThan1Min');
    }

    // 2. 处理分钟级别（1-59分钟）
    if (totalMinutes < 60) {
      const minutes = Math.round(totalMinutes);
      return t('studyInterface.intervals.minutes').replace('{n}', String(minutes));
    }

    // 3. 处理小时级别（1-23小时）
    const totalHours = totalMinutes / 60;
    if (totalHours < 24) {
      const hours = Math.round(totalHours);
      return t('studyInterface.intervals.hours').replace('{n}', String(hours));
    }

    // 4. 处理天级别（1-29天）
    if (days < DAYS_PER_MONTH) {
      const roundedDays = Math.round(days);
      return t('studyInterface.intervals.days').replace('{n}', String(roundedDays));
    }

    // 5. 处理月级别（30-364天）
    if (days < DAYS_PER_YEAR) {
      const months = Math.round(days / DAYS_PER_MONTH);
      return t('studyInterface.intervals.months').replace('{n}', String(months));
    }

    // 6. 处理年级别（≥365天）
    const years = (days / DAYS_PER_YEAR).toFixed(1);
    return t('studyInterface.intervals.years').replace('{n}', years);
  }

  // 获取评分预测时间
  function getPredictedInterval(rating: Rating): string {
    if (!card || !card.fsrs) return t('studyInterface.intervals.unknown');
    try {
      const cfg = learningConfig || createDefaultMemorySchedulingSettings();
      const days =
        predictRatingScheduledDays({
          card,
          fsrs,
          rating,
          learningConfig: cfg,
          learningStepIndex:
            typeof learningStepIndex === 'number'
              ? learningStepIndex
              : StepIndexCalculator.calculate(card, cfg.learningSteps, cfg.relearningSteps)
        }) ?? 0;
      return formatPredictedInterval(days);
    } catch (e) { 
      logger.error("Failed to predict interval for rating", rating, e);
      return t('studyInterface.intervals.unknown'); 
    }
  }

  function buildMoodFaceConfig(rating: Rating): MoodFaceConfig {
    switch (rating) {
      case 1:
        return {
          leftEyePath: "M7.8 9.7h1.4",
          rightEyePath: "M14.8 9.7h1.4",
          mouthPath: "M8.1 16.1c1.1-1.9 2.4-2.7 3.9-2.7s2.8.8 3.9 2.7",
          blushOpacity: 0.05,
        };
      case 2:
        return {
          leftEyePath: "M7.9 9.7h1.35",
          rightEyePath: "M14.75 9.7h1.35",
          mouthPath: "M8.25 15.2c1.15-.65 2.4-.95 3.75-.95 1.4 0 2.7.34 3.9 1.02",
          blushOpacity: 0.12,
        };
      case 3:
        return {
          leftEyePath: "M7.75 9.35h1.45",
          rightEyePath: "M14.8 9.35h1.45",
          mouthPath: "M8 14.2c1.12 1.38 2.47 2.02 4 2.02 1.56 0 2.92-.67 4.05-2.02",
          blushOpacity: 0.22,
        };
      default:
        return {
          leftEyePath: "M7.7 9.1h1.5",
          rightEyePath: "M14.8 9.1h1.5",
          mouthPath: "M7.75 13.55c1.2 1.85 2.63 2.72 4.25 2.72 1.65 0 3.08-.9 4.28-2.72",
          blushOpacity: 0.3,
        };
    }
  }

  // 获取评分配置
  const ratingConfig = $derived([
    { rating: 1 as Rating, label: ratingLabels.again, color: "#ff4f88", textColor: "#ffffff", key: "1", moodFace: buildMoodFaceConfig(1 as Rating) },
    { rating: 2 as Rating, label: ratingLabels.hard, color: "#ffc739", textColor: "#2f3a4d", key: "2", moodFace: buildMoodFaceConfig(2 as Rating) },
    { rating: 3 as Rating, label: ratingLabels.good, color: "#55c987", textColor: "#ffffff", key: "3", moodFace: buildMoodFaceConfig(3 as Rating) },
    { rating: 4 as Rating, label: ratingLabels.easy, color: "#8dbdff", textColor: "#1f3f6b", key: "4", moodFace: buildMoodFaceConfig(4 as Rating) },
  ] satisfies RatingConfigItem[]);

  const ratingCards = $derived(
    ratingConfig.map((cfg) => ({
      ...cfg,
      predictedInterval: getPredictedInterval(cfg.rating)
    }))
  );

  function withShortcutHint(action: string, key: string): string {
    if (!shortcutEnabled) return action;
    return t('studyInterface.shortcuts.actionWithKey', { action, key });
  }
</script>

<div class="rating-section">
  {#if !showAnswer}
    <!-- 显示答案区域 -->
    <div class="show-answer-area">
      <button
        class="clickable-icon weave-toolbar-tab show-answer-btn"
        onclick={onShowAnswer}
        title={withShortcutHint(showAnswerButtonText(), t('studyInterface.shortcuts.showAnswerKeys'))}
        aria-keyshortcuts="Space Enter"
      >
        <EnhancedIcon name="eye" size="20" />
        <span>{showAnswerButtonText()}</span>
      </button>
    </div>
  {:else}
  <!-- 评分区域（Cursor风格卡片按钮） -->
  <div class="rating-modern">
    <div class="rate-grid">
      {#each ratingCards as cfg}
        <button
          class="rate-card"
          class:mood-graphic={useMoodGraphicStyle}
          class:mood-time-layout={useMoodTimeStyle}
          style="--accent: {cfg.color}; --text-color: {cfg.textColor};"
          aria-label={`评分：${cfg.label}（下一次：${cfg.predictedInterval}）`}
          title={showIntervalOnButtons
            ? withShortcutHint(cfg.label, cfg.key)
            : withShortcutHint(`${cfg.label} · ${cfg.predictedInterval}`, cfg.key)}
          aria-keyshortcuts={cfg.key}
          disabled={ratingDisabled}
          onclick={() => {
            if (showAnswer && !ratingDisabled) {onRate(cfg.rating);}
          }}
        >
          <div class="rate-content">
            {#if useMoodGraphicStyle}
              <div class="rate-primary">
                <div
                  class="rate-face"
                  aria-hidden="true"
                  style={`--blush-opacity:${cfg.moodFace.blushOpacity};`}
                >
                  <svg class="rate-face-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <circle class="face-outline" cx="12" cy="12" r="8.75"></circle>
                    <circle class="face-blush-svg" cx="8.15" cy="13.2" r="1.55"></circle>
                    <circle class="face-blush-svg" cx="15.85" cy="13.2" r="1.55"></circle>
                    <path class="face-eye-svg" d={cfg.moodFace.leftEyePath}></path>
                    <path class="face-eye-svg" d={cfg.moodFace.rightEyePath}></path>
                    <path class="face-mouth-svg" d={cfg.moodFace.mouthPath}></path>
                  </svg>
                </div>
                <div class="rate-copy">
                  <span class="rate-label">{useMoodTimeStyle ? cfg.predictedInterval : cfg.label}</span>
                  {#if showIntervalOnButtons && !useMoodTimeStyle}
                    <span class="rate-next rate-next-badge">{cfg.predictedInterval}</span>
                  {/if}
                </div>
              </div>
            {:else}
              <div class="rate-primary">
                <span class="rate-label">{cfg.label}</span>
              </div>
            {/if}
            {#if !useMoodGraphicStyle && showIntervalOnButtons}
              <span class="rate-next">{cfg.predictedInterval}</span>
            {/if}
          </div>
          {#if !showIntervalOnButtons}
            <span class="rate-tooltip" aria-hidden="true">{cfg.predictedInterval}</span>
          {/if}
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
    display: inline-flex;
    align-items: center;
    gap: 0.75rem;
    background: transparent;
    color: var(--text-normal);
    border: none;
    box-shadow: none;
    border-radius: var(--clickable-icon-radius, 0.75rem);
    padding: 0 1.25rem;
    min-height: 48px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.15s ease, color 0.15s ease;
  }

  .show-answer-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .show-answer-btn:active {
    background: var(--background-modifier-active-hover);
    transform: none;
  }


  /* 评分区域（现代卡片按钮 - 优化版） */
  .rating-modern { 
    --rating-mood-pill-min-height: clamp(3.45rem, 3.18rem + 0.42vw, 3.7rem);
    --rating-mood-pill-padding-block: clamp(0.58rem, 0.54rem + 0.08vw, 0.64rem);
    --rating-mood-pill-padding-inline: clamp(0.95rem, 0.88rem + 0.22vw, 1.08rem);
    --rating-mood-pill-radius: clamp(1.08rem, 1rem + 0.18vw, 1.18rem);
    --rating-mood-gap: clamp(0.48rem, 0.42rem + 0.12vw, 0.58rem);
    --rating-mood-face-size: clamp(1.14rem, 1.08rem + 0.16vw, 1.24rem);
    --rating-mood-label-size: clamp(0.9rem, 0.86rem + 0.09vw, 0.96rem);
    --rating-mood-badge-size: clamp(0.61rem, 0.58rem + 0.05vw, 0.64rem);
    display: flex; 
    flex-direction: column; 
    gap: 0.75rem; /* 减小间距 */
    max-width: min(100%, 820px); 
    margin: 0 auto;
    position: relative;
  }


  
  .rate-grid { 
    display: grid; 
    grid-template-columns: repeat(auto-fit, minmax(min(9.35rem, 100%), 1fr)); 
    gap: clamp(0.62rem, 0.58rem + 0.12vw, 0.7rem);
  }
  
  .rate-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.875rem;
    padding: 0.875rem 1rem;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
    isolation: isolate;
    min-height: 56px;
    min-width: 0;
    box-shadow: none;
  }
  
  .rate-card:hover {
    border-color: var(--accent);
    background: var(--background-modifier-hover);
    box-shadow: 0 12px 24px rgba(0,0,0,.12), 0 4px 8px rgba(0,0,0,.08);
    transform: translateY(-2px);
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
  
  .rate-content {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    gap: 0.9rem;
    min-width: 0;
  }

  .rate-primary {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.72rem;
    min-width: 0;
    flex: 1 1 auto;
  }
  
  .rate-label { 
    font-weight: 700; 
    letter-spacing: 0.025em; 
    font-size: 0.9rem;
    color: var(--text-normal);
    line-height: 1.15;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .rate-copy {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 0.22rem;
    min-width: 0;
  }
  
  .rate-next { 
    color: var(--text-muted); 
    font-weight: 600; 
    font-size: 0.875rem;
    flex-shrink: 0;
    text-align: right;
  }

  .rate-tooltip {
    position: absolute;
    left: 50%;
    bottom: calc(100% + 10px);
    transform: translateX(-50%) translateY(6px);
    padding: 0.28rem 0.55rem;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--text-normal) 10%, transparent);
    background: color-mix(in srgb, var(--background-primary) 68%, transparent);
    color: var(--text-normal);
    font-size: 0.72rem;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
    backdrop-filter: blur(12px) saturate(135%);
    -webkit-backdrop-filter: blur(12px) saturate(135%);
    pointer-events: none;
    opacity: 0;
    visibility: hidden;
    transition:
      opacity 0.18s ease,
      transform 0.18s ease,
      visibility 0.18s ease;
    z-index: 3;
  }

  .rate-card:hover .rate-tooltip,
  .rate-card:focus-visible .rate-tooltip {
    opacity: 1;
    visibility: visible;
    transform: translateX(-50%) translateY(0);
  }

  .rate-face {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    height: 2.75rem;
    aspect-ratio: 1 / 1;
    flex-shrink: 0;
    flex-grow: 0;
    color: var(--face-color, var(--text-color, var(--text-normal)));
  }

  .rate-face-svg {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .face-outline,
  .face-eye-svg,
  .face-mouth-svg {
    fill: none;
    stroke: currentColor;
    vector-effect: non-scaling-stroke;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .face-outline {
    stroke-width: 1.75;
  }

  .face-eye-svg {
    stroke-width: 2.2;
  }

  .face-mouth-svg {
    stroke-width: 1.9;
  }

  .face-blush-svg {
    fill: rgba(255, 255, 255, calc(var(--blush-opacity) * 0.72));
  }

  .rate-card.mood-graphic {
    min-height: var(--rating-mood-pill-min-height);
    padding: var(--rating-mood-pill-padding-block) var(--rating-mood-pill-padding-inline);
    border: 1px solid color-mix(in srgb, var(--accent) 22%, rgba(255, 255, 255, 0.22));
    border-radius: var(--rating-mood-pill-radius);
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--accent) 94%, #ffffff 6%) 0%, color-mix(in srgb, var(--accent) 78%, #ffffff 22%) 100%);
    backdrop-filter: blur(16px) saturate(138%);
    -webkit-backdrop-filter: blur(16px) saturate(138%);
    box-shadow:
      0 10px 18px color-mix(in srgb, var(--accent) 18%, transparent),
      0 2px 8px rgba(0, 0, 0, 0.08),
      inset 0 1px 0 rgba(255,255,255,0.38),
      inset 0 -8px 14px rgba(255,255,255,0.06);
  }

  .rate-card.mood-graphic::before,
  .rate-card.mood-graphic::after {
    content: "";
    position: absolute;
    pointer-events: none;
  }

  .rate-card.mood-graphic::before {
    inset: 1px;
    border-radius: calc(var(--rating-mood-pill-radius) - 1px);
    background:
      linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 28%, rgba(255,255,255,0) 68%),
      radial-gradient(circle at 18% 20%, rgba(255,255,255,0.24), rgba(255,255,255,0) 36%);
    opacity: 0.92;
  }

  .rate-card.mood-graphic::after {
    top: -145%;
    left: -36%;
    width: 52%;
    height: 320%;
    background: linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.34), rgba(255,255,255,0));
    transform: rotate(18deg) translateX(-135%);
    opacity: 0.62;
    transition: transform 0.55s ease, opacity 0.28s ease;
  }

  .rate-card.mood-graphic .rate-content {
    justify-content: center;
    align-items: center;
    gap: 0.2rem;
    position: relative;
    z-index: 1;
  }

  .rate-card.mood-graphic .rate-next-badge {
    min-width: 0;
    text-align: left;
    white-space: nowrap;
    line-height: 1;
    color: var(--text-color);
    font-size: var(--rating-mood-badge-size);
    font-weight: 700;
    opacity: 0.92;
    padding: 0.14rem 0.34rem;
    border-radius: 999px;
    background: rgba(255,255,255,0.16);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.22);
    backdrop-filter: blur(7px);
  }

  .rate-card.mood-graphic .rate-label {
    display: block;
    color: var(--text-color);
    font-size: var(--rating-mood-label-size);
    line-height: 1;
    font-weight: 800;
    letter-spacing: 0;
    white-space: nowrap;
  }

  .rate-card.mood-graphic .rate-face {
    --face-color: var(--text-color);
    width: var(--rating-mood-face-size);
    height: var(--rating-mood-face-size);
    min-width: var(--rating-mood-face-size);
    min-height: var(--rating-mood-face-size);
  }

  .rate-card.mood-graphic:hover {
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--accent) 88%, #ffffff 12%) 0%, color-mix(in srgb, var(--accent) 70%, #ffffff 30%) 100%);
    box-shadow:
      0 14px 24px color-mix(in srgb, var(--accent) 20%, transparent),
      0 0 0 1px rgba(255,255,255,0.18),
      inset 0 1px 0 rgba(255,255,255,0.42),
      inset 0 -10px 14px rgba(255,255,255,0.07);
    transform: translateY(-1px) scale(1.006);
  }

  .rate-card.mood-graphic:hover::after {
    transform: rotate(18deg) translateX(230%);
    opacity: 0.88;
  }

  .rate-card.mood-graphic .rate-accent {
    display: block;
    position: absolute;
    inset: 0;
    width: auto;
    height: auto;
    z-index: 0;
    background:
      linear-gradient(120deg, rgba(255,255,255,0.28) 10%, rgba(255,255,255,0.08) 26%, rgba(255,255,255,0) 44%),
      radial-gradient(circle at 22% 18%, rgba(255,255,255,0.34), rgba(255,255,255,0) 34%),
      radial-gradient(circle at 78% 78%, rgba(255,255,255,0.14), rgba(255,255,255,0) 30%);
    opacity: 0.72;
    transition: transform 0.35s ease, opacity 0.35s ease;
    pointer-events: none;
  }

  .rate-card.mood-graphic:hover .rate-accent {
    opacity: 0.9;
    transform: translateX(6px) translateY(-2px);
  }

  .rate-card.mood-graphic .rate-primary {
    position: relative;
    z-index: 1;
    gap: var(--rating-mood-gap);
    flex: 0 1 auto;
  }

/* styles aligned to current design */

  /* 评分按钮组 */
/* styles aligned to current design */

/* styles aligned to current design */

  /* 评分建议 */
/* styles aligned to current design */
  /* 无需特殊的浅色模式适配，使用CSS变量自动适配 */

  /* 桌面端不进行布局重排，评分按钮始终4列 */
  /* 移动端布局由 :global(body.is-phone) 控制 */

  /* ==================== Obsidian 移动端适配 ==================== */
  
  /* 手机端：4列单行布局（难度在上，时间在下） */
  :global(body.is-phone) .rating-section {
    /*  修复：精确控制各方向的 padding */
    padding-top: 0.5rem;
    padding-left: 0.5rem;
    padding-right: 0.5rem;
    padding-bottom: calc(0.5rem + env(safe-area-inset-bottom, 0px));
    /*  修复：使用与 Obsidian 底部导航栏一致的背景色 */
    background: var(--background-primary);
    /*  优化：使用更细腻的顶部边框 */
    border-top: 1px solid color-mix(in srgb, var(--background-modifier-border) 60%, transparent);
    /*  修复：移除可能的 margin */
    margin: 0;
  }

  :global(body.is-phone) .rate-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    width: 100%;
    max-width: 100%;
  }

  :global(body.is-phone) .rate-card {
    min-height: 56px;
    padding: 0.5rem 0.375rem;
    border-radius: 0.625rem;
  }

  :global(body.is-phone) .rate-card.mood-graphic {
    min-height: clamp(3.12rem, 3rem + 0.25vw, 3.28rem);
    padding: 0.46rem 0.46rem;
    border-radius: 0.92rem;
  }
  
  :global(body.is-phone) .rate-content {
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 2px;
  }

  :global(body.is-phone) .rate-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-align: center;
  }

  :global(body.is-phone) .rate-next {
    font-size: 0.6875rem;
    text-align: center;
  }

  :global(body.is-phone) .rate-tooltip {
    display: none;
  }

  :global(body.is-phone) .rate-face {
    width: 1.85rem;
    height: 1.85rem;
  }

  :global(body.is-phone) .rate-card.mood-graphic .rate-content {
    gap: 0;
  }

  :global(body.is-phone) .rate-card.mood-graphic .rate-next-badge {
    font-size: 0.47rem;
    padding: 0.1rem 0.26rem;
  }

  :global(body.is-phone) .rate-card.mood-graphic .rate-label {
    font-size: 0.74rem;
  }

  :global(body.is-phone) .rate-card.mood-graphic .rate-face {
    width: 1.04rem;
    height: 1.04rem;
    min-width: 1.04rem;
    min-height: 1.04rem;
  }

  :global(body.is-phone) .rate-card.mood-graphic .rate-primary {
    gap: 0.28rem;
  }

  :global(body.is-phone) .rate-card.mood-graphic.mood-time-layout .rate-copy,
  .rate-card.mood-graphic.mood-time-layout .rate-copy {
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 0;
  }

  :global(body.is-phone) .rate-card.mood-graphic.mood-time-layout .rate-content,
  .rate-card.mood-graphic.mood-time-layout .rate-content {
    gap: 0;
  }

  :global(body.is-phone) .rate-card.mood-graphic.mood-time-layout .rate-label,
  .rate-card.mood-graphic.mood-time-layout .rate-label {
    text-align: left;
  }

  :global(body.is-phone) .show-answer-btn {
    padding: 0.875rem 1.5rem;
    font-size: var(--weave-mobile-font-base, 0.875rem);
    min-height: var(--weave-mobile-touch-primary, 48px);
    width: 100%;
    max-width: 100%;
    /*  优化：更圆润的按钮设计 */
    border-radius: 0.75rem;
  }

  /* 平板端：4列横排布局 */
  :global(body.is-tablet) .rate-grid {
    grid-template-columns: repeat(4, 1fr);
  }

/* animations aligned to current design */
</style>
