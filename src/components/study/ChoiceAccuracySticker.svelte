<script lang="ts">
  import { tr } from '../../utils/i18n';

  interface Props {
    accuracy: number;
    correct: number;
    total: number;
  }

  let { accuracy, correct, total }: Props = $props();

  let t = $derived($tr);
  const formattedAccuracy = $derived(accuracy.toFixed(1));
  const toneClass = $derived.by(() => {
    if (accuracy >= 90) {
      return 'accuracy-sticker-excellent';
    }
    if (accuracy >= 70) {
      return 'accuracy-sticker-good';
    }
    if (accuracy >= 60) {
      return 'accuracy-sticker-pass';
    }
    return 'accuracy-sticker-needs-work';
  });
  const ariaLabel = $derived.by(() =>
    t('studyInterface.choiceAccuracy.ariaLabel', {
      accuracy: formattedAccuracy,
      correct,
      total,
    })
  );
</script>

<div
  class={`choice-accuracy-sticker priority-sticky-note ${toneClass}`}
  role="img"
  aria-label={ariaLabel}
  title={ariaLabel}
>
  <div class="sticky-number">{formattedAccuracy}%</div>
  <div class="sticky-label">{t('studyInterface.choiceAccuracy.label')}</div>
</div>

<style>
  .choice-accuracy-sticker.priority-sticky-note {
    --weave-sticker-slot: 1;
    --weave-sticky-paper: var(--weave-surface-background, var(--background-primary));
    --weave-sticky-surface: var(--weave-elevated-background, var(--background-secondary));
    position: absolute;
    top: var(--weave-sticker-top, 20px);
    right: calc(
      var(--weave-sticker-right-start, 24px) +
      (var(--weave-sticker-slot) * (var(--weave-sticker-size, 68px) + var(--weave-sticker-gap, 12px)))
    );
    width: var(--weave-sticker-size, 68px);
    height: var(--weave-sticker-size, 68px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25), 0 2px 4px rgba(0, 0, 0, 0.15);
    transform: rotate(-2deg);
    z-index: var(--weave-z-overlay);
    pointer-events: none;
    user-select: none;
    border: 1px solid color-mix(in srgb, var(--background-modifier-border) 70%, transparent);
  }

  .choice-accuracy-sticker.priority-sticky-note::before {
    content: '';
    position: absolute;
    top: -7px;
    left: 50%;
    transform: translateX(-50%);
    width: calc(var(--weave-sticker-size, 68px) * 0.7);
    height: calc(var(--weave-sticker-size, 68px) * 0.235);
    background: color-mix(in srgb, var(--weave-sticky-paper) 68%, transparent);
    border-radius: 2px;
    backdrop-filter: blur(4px);
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.1);
    border: 1px solid color-mix(in srgb, var(--background-modifier-border) 46%, transparent);
  }

  .choice-accuracy-sticker .sticky-number {
    font-size: clamp(0.95rem, calc(var(--weave-sticker-size, 68px) * 0.32), 1.35rem);
    font-weight: 900;
    line-height: 1;
    margin-bottom: 0.15rem;
    letter-spacing: -0.02em;
  }

  .choice-accuracy-sticker .sticky-label {
    font-size: clamp(0.52rem, calc(var(--weave-sticker-size, 68px) * 0.16), 0.68rem);
    font-weight: 700;
    letter-spacing: 0.5px;
    opacity: 0.9;
    text-align: center;
  }

  .accuracy-sticker-excellent {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--color-green, #22c55e) 18%, var(--weave-sticky-paper)) 0%,
      color-mix(in srgb, var(--color-green, #22c55e) 30%, var(--weave-sticky-surface)) 100%
    );
    color: color-mix(in srgb, var(--color-green, #22c55e) 80%, var(--text-normal));
  }

  .accuracy-sticker-good {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--color-blue, #3b82f6) 16%, var(--weave-sticky-paper)) 0%,
      color-mix(in srgb, var(--color-blue, #3b82f6) 28%, var(--weave-sticky-surface)) 100%
    );
    color: color-mix(in srgb, var(--color-blue, #3b82f6) 80%, var(--text-normal));
  }

  .accuracy-sticker-pass {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--color-orange, #f97316) 18%, var(--weave-sticky-paper)) 0%,
      color-mix(in srgb, var(--color-orange, #f97316) 30%, var(--weave-sticky-surface)) 100%
    );
    color: color-mix(in srgb, var(--color-orange, #f97316) 78%, var(--text-normal));
  }

  .accuracy-sticker-needs-work {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--color-red, #ef4444) 18%, var(--weave-sticky-paper)) 0%,
      color-mix(in srgb, var(--color-red, #ef4444) 30%, var(--weave-sticky-surface)) 100%
    );
    color: color-mix(in srgb, var(--color-red, #ef4444) 80%, var(--text-normal));
  }

  @media (max-width: 768px) {
    .choice-accuracy-sticker.priority-sticky-note::before { top: -6px; }
  }

  @media (max-width: 480px) {
    .choice-accuracy-sticker.priority-sticky-note::before { top: -5px; }
  }
</style>
