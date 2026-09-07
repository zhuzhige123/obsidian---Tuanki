<script lang="ts">
  import { logger } from '../../utils/logger';

/**
 * 题库学习容器组件
 * 管理学习界面、结果界面、解析界面的状态切换
 */

import { onMount } from 'svelte';
import type WeavePlugin from '../../main';
import type { Card } from '../../data/types';
import type { TestSession, TestMode, QuestionBankModeConfig, QuestionBankResumeBehavior } from '../../types/question-bank-types';
import type { QuestionBankView } from '../../views/QuestionBankView';
import QuestionBankStudyInterface from './QuestionBankStudyInterface.svelte';
import TestResultView from './TestResultView.svelte';
import { tr } from '../../utils/i18n';

// Props
let {
  plugin,
  bankId,
  bankName = '',
  questions = [],
  mode = 'exam',
  config,
  resumeBehavior = 'prompt',
  viewInstance,
  onBack = () => {}
}: {
  plugin: WeavePlugin;
  bankId: string;
  bankName?: string;
  questions?: Card[];
  mode?: TestMode;
  config?: QuestionBankModeConfig;
  resumeBehavior?: QuestionBankResumeBehavior;
  viewInstance?: QuestionBankView; //  视图实例用于移动端回调
  onBack?: () => void;
} = $props();
let t = $derived($tr);
$effect(() => {
  if (!bankName) bankName = t('study.questionBankUI.studyInterface.defaultBankName');
});

// 状态管理
type ViewState = 'studying' | 'result';
let currentView = $state<ViewState>('studying');
let completedSession = $state<TestSession | null>(null);

/**
 * 处理测试完成
 */
function handleTestComplete(session: TestSession) {
  logger.debug('[StudyContainer] 测试完成:', session);
  logger.debug('[StudyContainer] 测试模式:', session.mode);
  completedSession = session;
  currentView = 'result';
}

/**
 * 返回题库
 */
async function handleBackToBank() {
  logger.debug('[StudyContainer] 返回题库');

  if (currentView === 'result') {
    await plugin.returnToDeckStudyView('question-bank');
  }

  onBack();
}

onMount(() => {
  logger.debug('[StudyContainer] 初始化:', {
    bankId,
    bankName,
    questionCount: questions.length,
    mode
  });
});
</script>

<div class="question-bank-study-container">
  {#if currentView === 'studying'}
    <QuestionBankStudyInterface
      {plugin}
      {bankId}
      {bankName}
      {questions}
      {mode}
      {config}
      {resumeBehavior}
      {viewInstance}
      onComplete={handleTestComplete}
      onExit={handleBackToBank}
    />
  {:else if currentView === 'result' && completedSession}
    <TestResultView
      {plugin}
      session={completedSession}
      soundEnabled={true}
      soundVolume={0.5}
      {viewInstance}
      onBackToBank={handleBackToBank}
    />
  {/if}
</div>

<style>
  .question-bank-study-container {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--background-primary);
    overflow: hidden;
  }
</style>
