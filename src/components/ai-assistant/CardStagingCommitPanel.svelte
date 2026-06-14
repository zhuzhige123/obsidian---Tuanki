<script lang="ts">
  import { onMount } from 'svelte';
  import { Notice } from 'obsidian';
  import type { WeavePlugin } from '../../main';
  import type { CardStagingSession } from '../../types/card-staging-types';
  import { getCardStagingSessionService } from '../../services/ai/CardStagingSessionService';
  import {
    listStagingQuestionBankOptions,
    pickPreferredStagingQuestionBankId,
  } from '../../services/ai/card-staging-target-resolver';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';
  import ObsidianDropdown from '../ui/ObsidianDropdown.svelte';
  import { tr } from '../../utils/i18n';
  import { logger } from '../../utils/logger';

  interface Props {
    plugin: WeavePlugin;
    session: CardStagingSession;
    onCommitted?: () => void;
    onCancel?: () => void;
    onReturn?: () => void;
  }

  let { plugin, session, onCommitted, onCancel, onReturn }: Props = $props();

  let t = $derived($tr);
  let isCommitting = $state(false);
  let availableQuestionBanks = $state<Array<{ id: string; name: string }>>([]);
  let selectedQuestionBankId = $state('');

  const stagingService = getCardStagingSessionService();
  let summary = $derived(stagingService.getSummary(session.id));
  let isExamMode = $derived(session.studyMode === 'exam');
  let canCommitExam = $derived(!isExamMode || Boolean(selectedQuestionBankId));

  onMount(() => {
    if (!isExamMode) return;

    void (async () => {
      try {
        availableQuestionBanks = await listStagingQuestionBankOptions(plugin);
        selectedQuestionBankId = pickPreferredStagingQuestionBankId(
          availableQuestionBanks,
          session.targetQuestionBankId
        );
      } catch (error) {
        logger.error('[CardStagingCommitPanel] 加载考试题组失败:', error);
        availableQuestionBanks = [];
        selectedQuestionBankId = '';
      }
    })();
  });

  async function handleCommit() {
    if (isCommitting) return;
    if (isExamMode && !selectedQuestionBankId) {
      new Notice(t('aiAssistant.staging.selectQuestionBankFirst'));
      return;
    }

    isCommitting = true;
    try {
      const result = await stagingService.commitSession(plugin, session.id, {
        targetQuestionBankId: isExamMode ? selectedQuestionBankId : undefined,
      });

      if (isExamMode) {
        new Notice(
          t('aiAssistant.staging.commitSuccessExam', {
            count: String(result.importedCount),
            deck: result.targetDeckName || '',
            bank: result.targetQuestionBankName || '',
          })
        );
      } else {
        new Notice(
          t('aiAssistant.staging.commitSuccess', {
            count: String(result.importedCount),
            deck: result.targetDeckName || '',
          })
        );
      }
      onCommitted?.();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : t('aiAssistant.staging.commitFailed'));
    } finally {
      isCommitting = false;
    }
  }

  function handleDiscardAll() {
    stagingService.clearSession(session.id);
    void plugin.clearCardStagingSession();
    onCancel?.();
  }
</script>

<div
  class="card-staging-commit-overlay"
  role="dialog"
  aria-modal="true"
  aria-labelledby="card-staging-commit-title"
  tabindex="-1"
>
  <div class="card-staging-commit-panel">
    <div class="commit-header">
      <ObsidianIcon name="check-circle-2" size={20} />
      <div>
        <h3 id="card-staging-commit-title">{t('aiAssistant.staging.commitTitle')}</h3>
        <p>
          {isExamMode
            ? t('aiAssistant.staging.importExamTitle')
            : t('aiAssistant.staging.importAllTitle')}
        </p>
        <p class="commit-subtext">{t('aiAssistant.staging.commitDescription', { source: session.sourceFileName || t('aiAssistant.staging.unknownSource') })}</p>
        <p class="commit-progress-hint">{t('aiAssistant.staging.commitProgressHint')}</p>
      </div>
    </div>

    <div class="commit-stats">
      <div class="stat">
        <span class="stat-value">{summary?.keptCount ?? 0}</span>
        <span class="stat-label">{t('aiAssistant.staging.keptCards')}</span>
      </div>
      <div class="stat">
        <span class="stat-value">{summary?.discardedCount ?? 0}</span>
        <span class="stat-label">{t('aiAssistant.staging.discardedCards')}</span>
      </div>
    </div>

    <div class="commit-deck">
      <span class="commit-deck-label">{t('aiAssistant.staging.targetDeck')}</span>
      <span class="commit-deck-name">{session.targetDeckName}</span>
    </div>

    {#if isExamMode}
      <div class="commit-deck">
        <span class="commit-deck-label">{t('aiAssistant.staging.targetQuestionBank')}</span>
        {#if availableQuestionBanks.length === 0}
          <span class="commit-deck-hint">{t('aiAssistant.staging.noQuestionBanks')}</span>
        {:else}
          <ObsidianDropdown
            className="target-question-bank-select"
            value={selectedQuestionBankId}
            disabled={isCommitting}
            iconPosition="left"
            options={availableQuestionBanks.map((bank) => ({
              id: bank.id,
              label: bank.name,
            }))}
            onchange={(value) => {
              selectedQuestionBankId = value;
            }}
          />
        {/if}
      </div>
    {/if}

    <div class="commit-actions">
      {#if onReturn && (summary?.keptCount ?? 0) > 0}
        <button type="button" class="commit-btn secondary" disabled={isCommitting} onclick={() => onReturn?.()}>
          {t('aiAssistant.staging.returnToStudy')}
        </button>
      {/if}
      <button type="button" class="commit-btn secondary" disabled={isCommitting} onclick={handleDiscardAll}>
        {t('aiAssistant.staging.cancelWithoutImport')}
      </button>
      <button
        type="button"
        class="commit-btn primary"
        disabled={isCommitting || (summary?.keptCount ?? 0) === 0 || !canCommitExam}
        onclick={() => void handleCommit()}
      >
        {isCommitting
          ? t('aiAssistant.staging.committing')
          : t('aiAssistant.staging.commitKept', { count: String(summary?.keptCount ?? 0) })}
      </button>
    </div>
  </div>
</div>

<style>
  .card-staging-commit-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--layer-modal, 80);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: color-mix(in srgb, var(--background-primary) 18%, transparent);
    backdrop-filter: blur(2px);
  }

  .card-staging-commit-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: min(100%, 520px);
    padding: 20px;
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--radius-l, 12px);
    background: var(--background-primary);
    box-shadow: var(--shadow-l, 0 8px 24px rgba(0, 0, 0, 0.12));
  }

  .commit-header {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    color: var(--text-normal);
  }

  .commit-header h3 {
    margin: 0 0 4px;
    font-size: 16px;
  }

  .commit-header p {
    margin: 0;
    font-size: 13px;
    color: var(--text-muted);
  }

  .commit-subtext {
    margin-top: 4px !important;
    font-size: 12px !important;
  }

  .commit-progress-hint {
    margin: 6px 0 0 !important;
    padding: 8px 10px;
    border-radius: var(--radius-m, 8px);
    background: color-mix(in srgb, var(--interactive-accent) 10%, var(--background-secondary));
    border: 1px solid color-mix(in srgb, var(--interactive-accent) 16%, var(--background-modifier-border));
    color: var(--text-muted);
    font-size: 12px !important;
    line-height: 1.5;
  }

  .commit-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px;
    border-radius: var(--radius-m, 8px);
    background: var(--background-secondary);
  }

  .stat-value {
    font-size: 24px;
    font-weight: 700;
    color: var(--text-normal);
  }

  .stat-label {
    font-size: 12px;
    color: var(--text-muted);
  }

  .commit-deck {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
  }

  .commit-deck-label {
    color: var(--text-muted);
  }

  .commit-deck-name {
    color: var(--text-normal);
    font-weight: 600;
  }

  .commit-deck-hint {
    color: var(--text-muted);
    font-size: 12px;
  }

  .commit-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .commit-btn {
    flex: 1 1 160px;
    min-height: 36px;
    padding: 0 14px;
    border-radius: var(--radius-m, 8px);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    color: var(--text-normal);
  }

  .commit-btn.primary {
    background: var(--interactive-accent);
    border-color: color-mix(in srgb, var(--interactive-accent) 82%, transparent);
    color: var(--text-on-accent, #fff);
  }

  .commit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
