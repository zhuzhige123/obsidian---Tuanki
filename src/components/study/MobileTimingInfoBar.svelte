<script lang="ts">
  /**
   * 移动端卡片计时信息栏组件
   * 
   * 显示：当前卡片计时、历史平均计时、状态
   * 采用三栏式布局：当前 | 平均 | 状态
   * 
   * 状态判断基于认知科学原理：
   * - 使用描述性而非评判性文字
   * - 阈值计算优先级：历史平均×难度系数 > 全局平均 > 兜底60秒
   * 
   * @module components/study/MobileTimingInfoBar
   * @version 3.0.0
   */

  import { tr } from '../../utils/i18n';

  // 默认阈值常量
  const DEFAULT_THRESHOLD_MS = 60000; // 兜底60秒
  const FSRS_DIFFICULTY_RANGE = { min: 1, max: 10 }; // FSRS难度范围

  interface Props {
    /** 是否展开 */
    expanded: boolean;
    /** 当前卡片计时（毫秒） */
    currentTime: number;
    /** 历史平均计时（毫秒） */
    averageTime: number;
    /** FSRS难度参数 (1-10, 可选) */
    difficulty?: number;
    /** 同牌组全局平均用时（毫秒, 可选） */
    deckAverageTime?: number;
  }

  let {
    expanded = false,
    currentTime = 0,
    averageTime = 0,
    difficulty = 5,
    deckAverageTime = 0
  }: Props = $props();

  let t = $derived($tr);

  /**
   * 格式化时间（毫秒 -> MM:SS 或 H:MM:SS）
   */
  function formatTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * 计算难度系数：将FSRS难度(1-10)映射为时间调整系数
   * 难度越高，允许的时间越长
   * 难度5(中等) = 1.0, 难度10(最难) = 1.5, 难度1(最简单) = 0.7
   */
  function getDifficultyMultiplier(d: number): number {
    const normalized = (d - FSRS_DIFFICULTY_RANGE.min) / (FSRS_DIFFICULTY_RANGE.max - FSRS_DIFFICULTY_RANGE.min);
    return 0.7 + normalized * 0.8; // 范围: 0.7 ~ 1.5
  }

  /**
   * 计算动态阈值
   * 优先级：历史平均×难度系数 > 同牌组全局平均 > 兜底60秒
   */
  function calculateThreshold(): number {
    const difficultyMultiplier = getDifficultyMultiplier(difficulty);
    
    // 首选：该卡片历史平均 × 难度系数
    if (averageTime > 0) {
      return averageTime * difficultyMultiplier;
    }
    
    // 备选：同牌组全局平均
    if (deckAverageTime > 0) {
      return deckAverageTime * difficultyMultiplier;
    }
    
    // 兜底：默认60秒 × 难度系数
    return DEFAULT_THRESHOLD_MS * difficultyMultiplier;
  }

  /**
   * 获取计时状态：基于动态阈值，使用描述性文字
   */
  function getTimingStatus(): { text: string; class: string } {
    if (currentTime === 0) {
      return { text: t('study.timing.ready'), class: 'status-idle' };
    }
    
    const threshold = calculateThreshold();
    const ratio = currentTime / threshold;
    
    if (ratio < 0.6) {
      return { text: t('study.timing.recalling'), class: 'status-normal' };
    }
    if (ratio < 1.0) {
      return { text: t('study.timing.thinking'), class: 'status-normal' };
    }
    if (ratio < 1.5) {
      return { text: t('study.timing.deepRecall'), class: 'status-warning' };
    }
    return { text: t('study.timing.reviewNeeded'), class: 'status-overtime' };
  }

  // 派生状态
  let currentTimeFormatted = $derived(formatTime(currentTime));
  let averageTimeFormatted = $derived(averageTime > 0 ? formatTime(averageTime) : '--:--');
  let status = $derived(getTimingStatus());
</script>

{#if expanded}
  <div class="study-timing-info-bar mobile-timing-info-bar {status.class}">
    <!-- 三栏式布局：当前 | 平均 | 状态 -->
    <div class="timing-item current">
      <span class="timing-label">{t('study.timing.current')}</span>
      <span class="timing-value">{currentTimeFormatted}</span>
    </div>
    
    <div class="timing-divider"></div>
    
    <div class="timing-item">
      <span class="timing-label">{t('study.timing.average')}</span>
      <span class="timing-value">{averageTimeFormatted}</span>
    </div>
    
    <div class="timing-divider"></div>
    
    <div class="timing-item status">
      <span class="timing-label">{t('study.timing.status')}</span>
      <span class="timing-status-badge">{status.text}</span>
    </div>
  </div>
{/if}

<style>
  .study-timing-info-bar,
  .mobile-timing-info-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    margin: 8px 12px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 12px;
    flex-shrink: 0;
    animation: slideDown 0.2s ease-out;
    gap: 0;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .timing-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    flex: 1;
  }

  .timing-label {
    font-size: 10px;
    color: var(--text-muted);
  }

  .timing-value {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-normal);
    font-variant-numeric: tabular-nums;
  }

  .timing-item.current .timing-label {
    color: var(--color-accent);
  }

  .timing-item.current .timing-value {
    font-size: 20px;
    color: var(--text-normal);
  }

  .timing-divider {
    width: 1px;
    height: 30px;
    background: var(--background-modifier-border);
    flex-shrink: 0;
  }

  .timing-status-badge {
    font-size: 11px;
    font-weight: 500;
    padding: 3px 8px;
    border-radius: 10px;
    background: rgba(var(--color-accent-rgb), 0.2);
    color: var(--color-accent);
  }

  /* 状态样式 - 正常 */
  .mobile-timing-info-bar.status-normal .timing-item.current .timing-value {
    color: var(--text-normal);
  }

  .mobile-timing-info-bar.status-normal .timing-status-badge {
    background: rgba(var(--color-accent-rgb), 0.2);
    color: var(--color-accent);
  }

  /* 状态样式 - 警告（偏慢） */
  .mobile-timing-info-bar.status-warning .timing-item.current .timing-value {
    color: var(--color-yellow);
  }

  .mobile-timing-info-bar.status-warning .timing-status-badge {
    background: rgba(251, 191, 36, 0.2);
    color: var(--color-yellow);
  }

  /* 状态样式 - 超时 */
  .mobile-timing-info-bar.status-overtime .timing-item.current .timing-value {
    color: var(--color-red);
  }

  .mobile-timing-info-bar.status-overtime .timing-status-badge {
    background: rgba(239, 68, 68, 0.2);
    color: var(--color-red);
  }

  /* 状态样式 - 未开始 */
  .mobile-timing-info-bar.status-idle .timing-status-badge {
    background: var(--background-modifier-border);
    color: var(--text-muted);
  }
</style>
