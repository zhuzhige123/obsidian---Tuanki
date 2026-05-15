<!--
  题库分析模态窗组件
  显示EWMA分析
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Deck } from '../../data/types';
  import type { WeavePlugin } from '../../main';
  import type { QuestionBankAnalyticsSnapshot } from '../../utils/question-bank-analytics';
  import { getQuestionBankAnalyticsSnapshot } from '../../utils/question-bank-analytics';
  import { logger } from '../../utils/logger';
  import QuestionBankEWMATab from './tabs/QuestionBankEWMATab.svelte';

  interface Props {
    /** 插件实例 */
    plugin: WeavePlugin;

    /** 当前题库（在系统中题库就是Deck） */
    questionBank: Deck;
  }

  let { 
    plugin, 
    questionBank 
  }: Props = $props();

  let snapshot = $state<QuestionBankAnalyticsSnapshot | null>(null);
  let isLoading = $state(true);

  onMount(() => {
    const loadSnapshot = async () => {
      isLoading = true;
      try {
        snapshot = await getQuestionBankAnalyticsSnapshot(plugin, questionBank.id);
      } catch (error) {
        logger.error('[QuestionBankAnalyticsModal] 加载题库分析快照失败:', error);
        snapshot = {
          ewmaSeries: { dates: [], ewmaData: [], historicalData: [], confidenceData: [] }
        };
      } finally {
        isLoading = false;
      }
    };

    void loadSnapshot();
  });
</script>

<div class="analytics-container">
    <div class="tab-content">
      <QuestionBankEWMATab {snapshot} {isLoading} />
    </div>
  </div>

<style>
  .analytics-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
  }

  /* 内容区 */
  .tab-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    height: 100%;
    width: 100%;
  }
</style>
