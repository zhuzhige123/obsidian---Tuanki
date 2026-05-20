<script lang="ts">
  import { Platform } from "obsidian";
  import EnhancedIcon from "../ui/EnhancedIcon.svelte";
  import { tr } from "../../utils/i18n";

  interface Props {
    hasSubmitted: boolean;
    hasAnswer: boolean;
    isLastQuestion: boolean;
    onSubmit: () => void;
    onNext: () => void;
    canUndo?: boolean;
    undoRemaining?: number;
    onUndo?: () => void;
  }

  let {
    hasSubmitted,
    hasAnswer,
    isLastQuestion,
    onSubmit,
    onNext,
    canUndo = false,
    undoRemaining = 0,
    onUndo
  }: Props = $props();

  const isMobile = Platform.isMobile;
  let t = $derived($tr);
</script>

<div class="action-section" class:is-mobile={isMobile}>
  {#if !hasSubmitted}
    <div class="submit-answer-area">
      <button
        class="qb-action-card qb-action-card-primary submit-answer-btn"
        onclick={onSubmit}
        disabled={!hasAnswer}
      >
        <span>{t('study.questionBankUI.actionSection.submit')}</span>
      </button>
    </div>
  {:else if isMobile}
    <div class="mobile-action-row">
      {#if canUndo && onUndo}
        <button
          class="qb-action-card qb-action-card-neutral mobile-undo-btn"
          onclick={onUndo}
          disabled={!canUndo}
        >
          <EnhancedIcon name="undo" size="16" />
          <span>{t('study.questionBankUI.actionSection.undo', { count: undoRemaining })}</span>
        </button>
      {/if}

      <button class="qb-action-card qb-action-card-success next-question-btn" onclick={onNext}>
        {#if isLastQuestion}
          <span>{t('study.questionBankUI.actionSection.finish')}</span>
        {:else}
          <span>{t('study.questionBankUI.actionSection.next')}</span>
        {/if}
      </button>
    </div>
  {:else}
    <div class="next-question-area">
      <button class="qb-action-card qb-action-card-success next-question-btn" onclick={onNext}>
        {#if isLastQuestion}
          <EnhancedIcon name="check" size="20" />
          <span>{t('study.questionBankUI.actionSection.finish')}</span>
        {:else}
          <EnhancedIcon name="chevron-right" size="20" />
          <span>{t('study.questionBankUI.actionSection.next')}</span>
        {/if}
      </button>
    </div>
  {/if}
</div>

<style>
  .action-section {
    background: transparent;
    padding: 0;
  }

  .submit-answer-area,
  .next-question-area {
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .mobile-action-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
  }

  .qb-action-card {
    --accent: var(--interactive-accent);
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    min-height: 56px;
    padding: 0.875rem 1.5rem;
    border-radius: 0.875rem;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
    color: var(--text-normal);
    font-size: 0.95rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
    isolation: isolate;
    box-shadow: none;
  }

  .qb-action-card::before {
    content: "";
    position: absolute;
    inset: 0;
    background: radial-gradient(
      50% 50% at 75% 25%,
      color-mix(in srgb, var(--accent) 15%, transparent),
      transparent 65%
    );
    pointer-events: none;
    z-index: -1;
  }

  .qb-action-card:hover:not(:disabled) {
    border-color: var(--accent);
    background: var(--background-modifier-hover);
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.12), 0 4px 8px rgba(0, 0, 0, 0.08);
    transform: translateY(-2px);
  }

  .qb-action-card:active:not(:disabled) {
    transform: translateY(-1px);
  }

  .qb-action-card:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent);
  }

  .qb-action-card:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  .qb-action-card-primary {
    --accent: var(--interactive-accent);
  }

  .qb-action-card-success {
    --accent: var(--weave-success);
  }

  .qb-action-card-neutral {
    --accent: var(--text-muted);
    color: var(--text-muted);
  }

  .submit-answer-btn {
    min-width: 152px;
  }

  .next-question-btn {
    min-width: 160px;
  }

  .mobile-undo-btn {
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    font-size: 0.85rem;
  }

  .action-section.is-mobile {
    padding: 0.5rem 1rem;
  }

  .action-section.is-mobile .submit-answer-btn {
    width: 100%;
    padding: 0.75rem 1.5rem;
    font-size: 0.9rem;
  }

  .mobile-action-row .next-question-btn {
    flex: 1;
    max-width: 160px;
    padding: 0.6rem 1.25rem;
    font-size: 0.9rem;
  }
</style>
