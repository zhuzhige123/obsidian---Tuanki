<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { Notice, TFile } from 'obsidian';
  import type { WeavePlugin } from '../../main';
  import type { Card } from '../../data/types';
  import type { TestSession } from '../../types/question-bank-types';
  import QuestionBankStudyInterface from '../question-bank/QuestionBankStudyInterface.svelte';
  import TestResultView from '../question-bank/TestResultView.svelte';
  import { buildDocumentQuizBankId } from '../../services/document-quiz/DocumentQuizSessionService';
  import { getDocumentQuizSessionService } from '../../services/document-quiz/DocumentQuizSessionService';
  import { DocumentQuizStatsWriter } from '../../services/document-quiz/DocumentQuizStatsWriter';
  import { DocumentQuizContentWriter } from '../../services/document-quiz/DocumentQuizContentWriter';
  import { DocumentQuizWriteBackSummaryModal } from '../../modals/document-quiz/DocumentQuizWriteBackSummaryModal';
  import type { DocumentQuizWriteBackResult } from '../../types/document-quiz-types';
  import { tr } from '../../utils/i18n';
  import { logger } from '../../utils/logger';

  import type { QuestionBankView } from '../../views/QuestionBankView';

  interface Props {
    plugin: WeavePlugin;
    sessionId: string;
    viewInstance?: QuestionBankView;
    onClose?: () => void;
  }

  let { plugin, sessionId, viewInstance, onClose }: Props = $props();
  let t = $derived($tr);

  const sessionService = getDocumentQuizSessionService();
  let session = $state(sessionService.getSession(sessionId));
  let completedSession = $state<TestSession | null>(null);
  let writeBackResults = $state<DocumentQuizWriteBackResult[]>([]);
  const statsWriter = new DocumentQuizStatsWriter(plugin.app);
  const contentWriter = new DocumentQuizContentWriter(plugin.app);

  async function handleStagingCardEdited(card: Card) {
    const quizSession = sessionService.getSession(sessionId);
    if (!quizSession) return;

    const file = plugin.app.vault.getAbstractFileByPath(quizSession.filePath);
    if (!(file instanceof TFile)) {
      new Notice(t('documentQuiz.contentWriteBack.noSourceFile'));
      return;
    }

    const item = sessionService.findItemByCardUuid(sessionId, card.uuid);
    if (!item) return;

    const result = await contentWriter.writeBackFromEditedCard(
      file,
      item,
      card.content || '',
      quizSession.items
    );

    if (!result.success) {
      logger.warn('[DocumentQuizStudyShell] 题目内容写回失败:', result);
      new Notice(
        t('documentQuiz.contentWriteBack.failed', {
          error: result.error || t('study.questionBankUI.studyInterface.unknownError'),
        })
      );
      return;
    }

    item.blockId = result.blockId;
    card.sourceBlock = result.blockId;

    const cardIndex = quizSession.cards.findIndex((entry) => entry.uuid === card.uuid);
    if (cardIndex >= 0) {
      quizSession.cards[cardIndex] = {
        ...quizSession.cards[cardIndex],
        content: card.content,
        sourceBlock: result.blockId,
        modified: card.modified,
      };
    }

    new Notice(t('documentQuiz.contentWriteBack.success'));
  }

  interface QuestionReviewContext {
    isCorrect: boolean;
  }

  async function handleQuestionReviewed(
    card: Card,
    context: QuestionReviewContext | undefined = undefined
  ) {
    const quizSession = sessionService.getSession(sessionId);
    if (!quizSession) return;

    const file = plugin.app.vault.getAbstractFileByPath(quizSession.filePath);
    if (!(file instanceof TFile)) {
      return;
    }

    const item = sessionService.findItemByCardUuid(sessionId, card.uuid);
    if (!item) return;

    const isCorrect = context?.isCorrect ?? false;
    const result = await statsWriter.writeBackFromReviewedCard(
      file,
      item,
      isCorrect,
      quizSession.mode
    );
    writeBackResults = [...writeBackResults, result];

    if (!result.success) {
      logger.warn('[DocumentQuizStudyShell] 写回失败:', result);
    }
  }

  async function handleSessionComplete(completed: TestSession | undefined = undefined) {
    if (completed) {
      completedSession = completed;
    }

    const failed = writeBackResults.filter((r) => !r.success);
    if (failed.length > 0) {
      new DocumentQuizWriteBackSummaryModal(plugin.app, writeBackResults).open();
    } else if (writeBackResults.length > 0) {
      new Notice(t('documentQuiz.writeBack.allSuccess', { count: String(writeBackResults.length) }));
    }
  }

  function handleBack() {
    sessionService.clearSession(sessionId);
    onClose?.();
  }

  onMount(() => {
    if (!session) {
      new Notice(t('documentQuiz.sessionMissing'));
      onClose?.();
    }
  });

  onDestroy(() => {
    activeDocument.body.classList.remove('weave-study-active');
  });

  onMount(() => {
    if (activeDocument.body.classList.contains('is-phone')) {
      activeDocument.body.classList.add('weave-study-active');
    }
  });
</script>

<div class="document-quiz-study-shell">
  {#if session}
    {#if !completedSession}
      <QuestionBankStudyInterface
        bankId={buildDocumentQuizBankId(session.id)}
        bankName={session.fileName}
        plugin={plugin}
        questions={session.cards}
        mode={session.mode}
        config={session.config}
        resumeBehavior="restart"
        {viewInstance}
        isStagingSession={true}
        onStagingQuestionReviewed={handleQuestionReviewed}
        onStagingCardEdited={handleStagingCardEdited}
        onStagingSessionComplete={handleSessionComplete}
        onExit={handleBack}
      />
    {:else}
      <TestResultView
        plugin={plugin}
        session={completedSession}
        soundEnabled={true}
        soundVolume={0.5}
        showTrendSection={false}
        onBackToBank={handleBack}
      />
    {/if}
  {/if}
</div>

<style>
  .document-quiz-study-shell {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
  }
</style>
