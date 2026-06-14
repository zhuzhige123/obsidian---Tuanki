<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { Notice } from 'obsidian';
  import type { WeavePlugin } from '../../main';
  import type { WeaveDataStorage } from '../../data/storage';
  import type { FSRS } from '../../algorithms/fsrs';
  import type { Card } from '../../data/types';
  import type { CardStagingSession } from '../../types/card-staging-types';
  import { buildStagingBankId } from '../../services/ai/card-staging-card-builder';
  import { getCardStagingSessionService } from '../../services/ai/CardStagingSessionService';
  import StudyInterface from '../study/StudyInterface.svelte';
  import QuestionBankStudyInterface from '../question-bank/QuestionBankStudyInterface.svelte';
  import CardStagingCommitPanel from './CardStagingCommitPanel.svelte';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';
  import { tr } from '../../utils/i18n';

  interface Props {
    plugin: WeavePlugin;
    dataStorage: WeaveDataStorage;
    fsrs: FSRS;
    sessionId: string;
    viewInstance?: any;
    onClose?: () => void;
  }

  let { plugin, dataStorage, fsrs, sessionId, viewInstance, onClose }: Props = $props();

  let t = $derived($tr);
  const stagingService = getCardStagingSessionService();

  let session = $state<CardStagingSession | null>(null);
  let initialStudyCards = $state<Card[]>([]);
  let showCommitPanel = $state(false);
  let studyRenderKey = $state(0);
  let stagingSummary = $derived(
    session ? stagingService.getSummary(session.id) : null
  );

  function handleCardReviewed(card: Card) {
    const item = stagingService.findItemByCardUuid(sessionId, card.uuid);
    if (!item) return;
    stagingService.markItemReviewed(sessionId, item.id, card);
    session = stagingService.getSession(sessionId);
  }

  function handleCardEdited(card: Card) {
    const item = stagingService.findItemByCardUuid(sessionId, card.uuid);
    if (!item) return;
    stagingService.updateItemPreviewCard(sessionId, item.id, card);
    session = stagingService.getSession(sessionId);
  }

  function handleDiscard(cardUuid: string) {
    const item = stagingService.findItemByCardUuid(sessionId, cardUuid);
    if (!item) return;
    stagingService.discardItem(sessionId, item.id);
    session = stagingService.getSession(sessionId);
  }

  function handleSessionComplete() {
    showCommitPanel = true;
    session = stagingService.getSession(sessionId);
  }

  function handleCommitted() {
    onClose?.();
  }

  function handleCancelCommit() {
    onClose?.();
  }

  function handleReturnToStudy() {
    const cards = stagingService.reopenKeptItemsForStudy(sessionId);
    if (cards.length === 0) return;
    initialStudyCards = cards;
    showCommitPanel = false;
    studyRenderKey += 1;
    session = stagingService.getSession(sessionId);
  }

  onMount(() => {
    if (activeDocument.body.classList.contains('is-phone')) {
      activeDocument.body.classList.add('weave-study-active');
    }

    session = stagingService.getSession(sessionId);
    if (!session) {
      new Notice(t('aiAssistant.staging.sessionMissing'));
      onClose?.();
      return;
    }
    initialStudyCards = stagingService.getPendingCards(sessionId);
    if (initialStudyCards.length === 0) {
      showCommitPanel = true;
    }
  });

  onDestroy(() => {
    activeDocument.body.classList.remove('weave-study-active');
  });
</script>

<div class="card-staging-study-shell">
  {#if session}
    {#if initialStudyCards.length === 0 && !showCommitPanel}
      <div class="staging-empty">
        <p>{t('aiAssistant.staging.noMatchingCards')}</p>
      </div>
    {:else if !showCommitPanel && initialStudyCards.length > 0}
      <div class="staging-session-banner" role="note">
        <div class="staging-session-banner-main">
          <ObsidianIcon name="info" size={14} />
          <span>{t('aiAssistant.staging.studySessionHint')}</span>
        </div>
        {#if stagingSummary}
          <span class="staging-session-progress">
            {t('aiAssistant.staging.progress', {
              kept: String(stagingSummary.keptCount),
              pending: String(stagingSummary.pendingCount),
              total: String(stagingSummary.totalCount),
            })}
          </span>
        {/if}
      </div>
    {/if}

    {#if !showCommitPanel && session.studyMode === 'exam' && initialStudyCards.length > 0}
      {#key studyRenderKey}
      <QuestionBankStudyInterface
        bankId={buildStagingBankId(session.id)}
        bankName={session.sourceFileName || t('aiAssistant.staging.stagingExam')}
        {plugin}
        questions={initialStudyCards}
        mode="exam"
        config={{ options: { pureExamMode: true } }}
        resumeBehavior="restart"
        {viewInstance}
        isStagingSession={true}
        onStagingQuestionReviewed={handleCardReviewed}
        onStagingDiscard={handleDiscard}
        onStagingSessionComplete={handleSessionComplete}
        onStagingCardEdited={handleCardEdited}
        onExit={onClose}
      />
      {/key}
    {:else if !showCommitPanel && initialStudyCards.length > 0}
      {#key studyRenderKey}
      <StudyInterface
        cards={initialStudyCards}
        {fsrs}
        {dataStorage}
        {plugin}
        {viewInstance}
        sessionDeckId={session.targetDeckId}
        forcedDeckName={session.targetDeckName}
        isStagingSession={true}
        onStagingCardReviewed={handleCardReviewed}
        onStagingCardEdited={handleCardEdited}
        onStagingDiscard={handleDiscard}
        onStagingSessionComplete={handleSessionComplete}
        onClose={() => onClose?.()}
        onComplete={() => {}}
      />
      {/key}
    {/if}

    {#if showCommitPanel}
      <CardStagingCommitPanel
        {plugin}
        {session}
        onCommitted={handleCommitted}
        onCancel={handleCancelCommit}
        onReturn={handleReturnToStudy}
      />
    {/if}
  {/if}
</div>

<style>
  .card-staging-study-shell {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .staging-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-muted);
    font-size: 14px;
    padding: 24px;
    text-align: center;
  }

  .staging-session-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    padding: 8px 12px;
    border-bottom: 1px solid var(--background-modifier-border);
    background: color-mix(in srgb, var(--interactive-accent) 8%, var(--background-primary));
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.45;
    flex-shrink: 0;
  }

  .staging-session-banner-main {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    min-width: 0;
    flex: 1 1 240px;
  }

  .staging-session-banner-main :global(svg) {
    color: var(--interactive-accent);
    flex-shrink: 0;
    margin-top: 1px;
  }

  .staging-session-progress {
    color: var(--text-normal);
    font-weight: 600;
    white-space: nowrap;
  }
</style>
