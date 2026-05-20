<script lang="ts">
  import { logger } from '../../utils/logger';

  import { onMount } from "svelte";
  import type { TestHistoryEntry, TestSession } from "../../types/question-bank-types";
  import { TestScoringEngine } from "../../services/question-bank";
  import ConfettiEffect from "../celebration/ConfettiEffect.svelte";
  import { getCelebrationSound } from "../../services/audio/CelebrationSound";
  import TestTrendChart from "./TestTrendChart.svelte";
  import EmptyTrendState from "./EmptyTrendState.svelte";
  import type WeavePlugin from "../../main";
  import { getWorkspaceBounds, isMobileDevice, type WorkspaceBounds } from '../../utils/mobile-modal-bounds';
  import { tr } from '../../utils/i18n';

  interface TestHistoryPoint {
    sessionId: string;
    date: string;
    timestamp: number;
    accuracy: number;
    score: number;
    timeSpent: number;
    correctCount: number;
    totalQuestions: number;
  }

  interface Props {
    session: TestSession;
    plugin: WeavePlugin;
    soundEnabled?: boolean;
    soundVolume?: number;
    onBackToBank?: () => void;
  }

  let { 
    session,
    plugin,
    soundEnabled = true,
    soundVolume = 0.5,
    onBackToBank 
  }: Props = $props();
  let t = $derived($tr);

  // 趋势图状态
  let testHistory = $state<TestHistoryPoint[]>([]);
  let currentMetric = $state<'accuracy' | 'score'>('accuracy');
  let isLoadingHistory = $state(false);

  //  移动端边界状态
  let mobileBounds = $state<WorkspaceBounds | null>(null);
  let isMobile = $state(false);

  // 更新移动端边界
  function updateMobileBounds() {
    isMobile = isMobileDevice();
    if (isMobile) {
      mobileBounds = getWorkspaceBounds();
      logger.debug('[TestResultView] 移动端边界检测:', mobileBounds);
    }
  }

  // 计算得分
  const sessionScore = $derived.by(() => TestScoringEngine.scoreSession(session));

  // 格式化时间
  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    
    if (mins === 0) return t('study.questionBankUI.result.seconds', { count: secs });
    if (mins < 60) return t('study.questionBankUI.result.minutes', { count: mins });
    
    const hours = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return t('study.questionBankUI.result.hoursMinutes', { hours, minutes: remainMins });
  }

  // 获取成绩标题
  function getGradeTitle(grade: string): string {
    const titleMap: Record<string, string> = {
      'A+': t('study.questionBankUI.result.gradeAPlus'),
      'A': t('study.questionBankUI.result.gradeA'),
      'B+': t('study.questionBankUI.result.gradeBPlus'),
      'B': t('study.questionBankUI.result.gradeB'),
      'C': t('study.questionBankUI.result.gradeC'),
      'D': t('study.questionBankUI.result.gradeD'),
      'F': t('study.questionBankUI.result.gradeF')
    };
    return titleMap[grade] || t('study.questionBankUI.result.titleDefault');
  }

  // 获取成绩副标题
  function getGradeSubtitle(score: number): string {
    if (score >= 95) return t('study.questionBankUI.result.subtitleExcellentPlus');
    if (score >= 90) return t('study.questionBankUI.result.subtitleExcellent');
    if (score >= 80) return t('study.questionBankUI.result.subtitleGood');
    if (score >= 60) return t('study.questionBankUI.result.subtitlePass');
    return t('study.questionBankUI.result.subtitleRetry');
  }

  // 加载历史数据
  async function loadTestHistory() {
    if (!session?.bankId) return;
    
    isLoadingHistory = true;
    try {
      const storage = plugin.questionBankStorage;
      if (!storage) {
        logger.warn('[TestResultView] QuestionBankStorage not available');
        return;
      }

      const history = await storage.loadTestHistory(session.bankId);

      const recent = (history || [])
        .filter((h: TestHistoryEntry) => h && h.bankId === session.bankId)
        .sort((a: TestHistoryEntry, b: TestHistoryEntry) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        .slice(-10);

      testHistory = recent.map((h: TestHistoryEntry) => {
        const timestamp = new Date(h.timestamp).getTime();
        const date = new Date(timestamp);
        return {
          sessionId: h.sessionId,
          date: `${date.getMonth() + 1}-${date.getDate()}`,
          timestamp,
          accuracy: h.accuracy,
          score: h.score,
          timeSpent: h.durationSeconds,
          correctCount: h.correctCount,
          totalQuestions: h.totalQuestions
        };
      });
      
      logger.debug('[TestResultView] 加载历史数据成功:', testHistory.length, '条');
    } catch (error) {
      logger.error('[TestResultView] 加载历史数据失败:', error);
      testHistory = [];
    } finally {
      isLoadingHistory = false;
    }
  }

  // 动画状态
  let showContent = $state(false);
  
  onMount(() => {
    //  初始化移动端边界检测
    updateMobileBounds();
    
    // 播放音效
    if (soundEnabled) {
      const sound = getCelebrationSound();
      sound.play(soundVolume).catch(err => {
        logger.error('[TestResultView] 音效播放失败:', err);
      });
    }

    // 延迟显示内容（等待礼花动画）
    setTimeout(() => {
      showContent = true;
    }, 300);
    
    // 加载历史数据
    loadTestHistory();

    // 键盘事件
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onBackToBank?.();
      }
    };

    document.addEventListener('keydown', handleKeydown);

    return () => {
      document.removeEventListener('keydown', handleKeydown);
    };
  });
</script>

<!-- 背景遮罩 -->
<div 
  class="test-result-backdrop"
  class:is-mobile={isMobile}
  style={isMobile && mobileBounds ? `top: ${mobileBounds.top}px; bottom: ${mobileBounds.bottom}px;` : ''}
  onclick={(event) => {
    if (event.target === event.currentTarget) {
      onBackToBank?.();
    }
  }}
  onkeydown={(event) => {
    if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
      onBackToBank?.();
    }
  }}
  role="button"
  tabindex="0"
  aria-label={t('study.questionBankUI.result.closeAria')}
>
  <!-- 礼花动画层 -->
  <ConfettiEffect />
  
  <!-- 内容卡片 -->
  <div 
  class="test-result-card"
  class:show={showContent}
  class:is-mobile={isMobile}
  style={isMobile && mobileBounds ? `max-height: ${mobileBounds.height - 24}px;` : ''}
  role="dialog"
  tabindex="-1"
    aria-labelledby="result-title"
    aria-modal="true"
  >
    <!-- 简洁成绩展示 -->
    <div class="score-header-simple">
      <!-- 成绩环和等级 -->
      <div class="score-badge" style="color: {TestScoringEngine.getGradeColor(sessionScore.grade)}">
        <div class="score-ring">
          <svg viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="currentColor"
              stroke-width="8"
              opacity="0.2"
            />
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="currentColor"
              stroke-width="8"
              stroke-dasharray="283"
              stroke-dashoffset={283 - (283 * sessionScore.accuracy / 100)}
              transform="rotate(-90 50 50)"
              class="progress-ring"
            />
          </svg>
          <div class="score-text">
            <div class="score-letter">{sessionScore.grade}</div>
          </div>
        </div>
      </div>
      
      <!-- 标题 -->
      <h2 id="result-title" class="result-title-simple">
        {getGradeTitle(sessionScore.grade)}
      </h2>
    </div>
    
    <!-- 测试统计 - 网格布局 -->
    <div class="stats-section">
      <div class="stats-title">{t('study.questionBankUI.result.statsTitle')}</div>
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-label">{t('study.questionBankUI.result.score')}</div>
          <div class="stat-value">{sessionScore.totalScore.toFixed(1)}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">{t('study.questionBankUI.result.correct')}</div>
          <div class="stat-value">{sessionScore.correctCount}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">{t('study.questionBankUI.result.timeSpent')}</div>
          <div class="stat-value">{formatTime(session.totalTimeSpent || 0)}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">{t('study.questionBankUI.result.accuracy')}</div>
          <div class="stat-value">{sessionScore.accuracy.toFixed(0)}%</div>
        </div>
      </div>
    </div>
    
    <!-- 历史趋势 -->
    <div class="trend-section">
      <div class="trend-header">
        <div class="trend-title">{t('study.questionBankUI.result.trendTitle')}</div>
        <div class="metric-toggle">
          <button 
            class="metric-btn" 
            class:active={currentMetric === 'accuracy'}
            onclick={() => currentMetric = 'accuracy'}
          >
            {t('study.questionBankUI.trendChart.accuracy')}
          </button>
          <button 
            class="metric-btn" 
            class:active={currentMetric === 'score'}
            onclick={() => currentMetric = 'score'}
          >
            {t('study.questionBankUI.trendChart.score')}
          </button>
        </div>
      </div>

      {#if isLoadingHistory}
        <div class="loading-chart">{t('study.questionBankUI.result.loading')}</div>
      {:else if testHistory.length > 0}
        <TestTrendChart history={testHistory} {currentMetric} />
      {:else}
        <EmptyTrendState />
      {/if}
    </div>
    
    
    <!-- 底部按钮 -->
    <div class="result-footer">
      <button class="btn-close" onclick={() => onBackToBank?.()}>
        {t('study.questionBankUI.result.close')}
      </button>
    </div>
  </div>
</div>

<style>
  /* 背景遮罩 */
  .test-result-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--weave-z-toast);
    padding: 20px;
    animation: backdrop-fade-in 0.3s ease-out;
    overflow: auto;
  }

  @keyframes backdrop-fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* 内容卡片 */
  .test-result-card {
    position: relative;
    max-width: 700px;
    width: 100%;
    background: var(--background-primary);
    border-radius: 16px;
    border: 1px solid var(--background-modifier-border);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    padding: 32px 28px;
    opacity: 0;
    transform: scale(0.9);
    transition: all 0.4s cubic-bezier(0.68, -0.55, 0.27, 1.55);
    z-index: calc(var(--weave-z-top) + 1);
    text-align: center;
  }

  .test-result-card.show {
    opacity: 1;
    transform: scale(1);
  }

  /* 简洁成绩展示 - 居中垂直布局 */
  .score-header-simple {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 24px 28px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 12px;
    margin-bottom: 24px;
    animation: score-slide-up 0.5s ease-out 0.2s both;
  }

  @keyframes score-slide-up {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .score-badge {
    flex-shrink: 0;
  }

  .score-ring {
    position: relative;
    width: 80px;
    height: 80px;
  }

  .score-ring svg {
    width: 100%;
    height: 100%;
  }

  .progress-ring {
    transition: stroke-dashoffset 1s ease-out;
  }

  .score-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
  }

  .score-letter {
    font-size: 28px;
    font-weight: 700;
    line-height: 1;
  }

  .result-title-simple {
    font-size: 22px;
    font-weight: 600;
    color: var(--text-normal);
    margin: 0;
    background: linear-gradient(135deg, var(--interactive-accent) 0%, var(--interactive-accent-hover) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    line-height: 1.2;
  }

  /* 统计区域 */
  .stats-section {
    margin-bottom: 24px;
    animation: stats-fade-in 0.5s ease-out 0.8s both;
  }

  @keyframes stats-fade-in {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .stats-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-muted);
    margin-bottom: 16px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
  }

  .stat-item {
    background: var(--background-secondary);
    padding: 20px 16px;
    border-radius: 10px;
    border: 1px solid var(--background-modifier-border);
    transition: all 0.2s;
    text-align: center;
  }

  .stat-item:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px color-mix(in srgb, var(--interactive-accent) 15%, transparent);
    border-color: color-mix(in srgb, var(--interactive-accent) 30%, transparent);
  }

  .stat-label {
    font-size: 13px;
    color: var(--text-muted);
    margin-bottom: 8px;
    font-weight: 500;
  }

  .stat-value {
    font-size: 28px;
    font-weight: 700;
    line-height: 1;
    color: var(--interactive-accent);
  }

  /* 趋势图区域 */
  .trend-section {
    margin-bottom: 24px;
    animation: trend-fade-in 0.5s ease-out 0.9s both;
  }

  @keyframes trend-fade-in {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .trend-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .trend-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .metric-toggle {
    display: flex;
    gap: 8px;
  }

  .metric-btn {
    padding: 6px 16px;
    border: 1px solid var(--background-modifier-border);
    background: transparent;
    color: var(--text-muted);
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .metric-btn:hover {
    border-color: var(--interactive-accent);
    color: var(--interactive-accent);
  }

  .metric-btn.active {
    background: var(--interactive-accent);
    color: white;
    border-color: transparent;
  }

  .loading-chart {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 240px;
    background: var(--background-secondary);
    border-radius: 10px;
    border: 1px solid var(--background-modifier-border);
    color: var(--text-muted);
    font-size: 14px;
  }


  /* 底部按钮 */
  .result-footer {
    text-align: center;
    margin-top: 8px;
    animation: footer-fade-in 0.5s ease-out 1.0s both;
  }

  @keyframes footer-fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .btn-close {
    background: var(--interactive-accent);
    color: white;
    border: none;
    border-radius: 8px;
    padding: 12px 48px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 4px 12px color-mix(in srgb, var(--interactive-accent) 30%, transparent);
    min-width: 120px;
  }

  .btn-close:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px color-mix(in srgb, var(--interactive-accent) 40%, transparent);
  }

  .btn-close:active {
    transform: translateY(0);
  }

  /* 响应式 */
  @media (max-width: 600px) {
    .test-result-card {
      padding: 20px 16px;
    }

    /* 移动端：简化成绩展示 */
    .score-header-simple {
      padding: 16px;
      gap: 8px;
    }

    .score-ring {
      width: 64px;
      height: 64px;
    }

    .score-letter {
      font-size: 24px;
    }

    .result-title-simple {
      font-size: 18px;
    }

    /*  移动端统计网格 - 保持4列 */
    .stats-grid {
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }

    .stat-item {
      padding: 12px 8px;
    }

    .stat-label {
      font-size: 12px;
      margin-bottom: 4px;
    }

    .stat-value {
      font-size: 20px;
    }

    .trend-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
    }

    .metric-toggle {
      width: 100%;
    }

    .metric-btn {
      flex: 1;
    }
  }

  /*  移动端适配 - 使用动态边界检测 */
  .test-result-backdrop.is-mobile {
    position: fixed;
    left: 0;
    right: 0;
    padding: 12px;
    background: transparent;
    backdrop-filter: none;
    overflow-y: auto;
  }

  .test-result-card.is-mobile {
    overflow-y: auto;
    margin: 0 auto;
    max-width: 100%;
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  :global(body.is-phone) .test-result-backdrop.is-mobile {
    padding: 8px;
  }

  :global(body.is-phone) .test-result-card.is-mobile {
    padding: 16px 12px;
    border-radius: 12px;
  }

  :global(body.is-phone) .score-ring {
    width: 60px;
    height: 60px;
  }

</style>










