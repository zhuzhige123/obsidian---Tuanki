<script lang="ts">
  import ObsidianIcon from "../ui/ObsidianIcon.svelte";
  import { formatCountdownMs } from "../../utils/format-utils";
  import { tr } from "../../utils/i18n";

  interface Props {
    remainingTimeMs: number;
    isPaused?: boolean;
    compact?: boolean;
  }

  let {
    remainingTimeMs,
    isPaused = false,
    compact = false,
  }: Props = $props();

  let t = $derived($tr);

  const formattedTime = $derived(formatCountdownMs(remainingTimeMs));
  const isTimeWarning = $derived(!isPaused && remainingTimeMs > 0 && remainingTimeMs < 5 * 60 * 1000);
  const isTimeCritical = $derived(!isPaused && remainingTimeMs > 0 && remainingTimeMs < 60 * 1000);
  const label = $derived(
    isPaused
      ? t("study.questionBankUI.header.countdownPaused")
      : t("study.questionBankUI.header.countdownRemaining")
  );
</script>

<div
  class="countdown-chip"
  class:compact
  class:warning={isTimeWarning && !isTimeCritical}
  class:critical={isTimeCritical}
  class:paused={isPaused}
  role="timer"
  aria-live="polite"
  aria-label={t("study.questionBankUI.header.countdownAria", { time: formattedTime, status: label })}
>
  <span class="countdown-icon" aria-hidden="true">
    <ObsidianIcon name="clock" size={compact ? 12 : 13} />
  </span>
  <span class="countdown-value">{formattedTime}</span>
  <span class="countdown-sep" aria-hidden="true"></span>
  <span class="countdown-label">{label}</span>
</div>

<style>
  .countdown-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0.28rem 0.75rem;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--color-accent) 35%, var(--background-modifier-border));
    background: color-mix(in srgb, var(--color-accent) 6%, var(--background-primary));
    transition:
      border-color 0.3s ease,
      background 0.3s ease,
      opacity 0.3s ease;
    user-select: none;
  }

  .countdown-chip.compact {
    padding: 0.22rem 0.55rem;
    gap: 5px;
  }

  .countdown-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    opacity: 0.75;
    color: var(--icon-color);
  }

  .countdown-value {
    font-family: var(--font-monospace);
    font-variant-numeric: tabular-nums;
    font-size: 0.9375rem;
    font-weight: 700;
    color: var(--color-accent);
    letter-spacing: 0.04em;
    line-height: 1;
    min-width: 3.25rem;
    text-align: center;
  }

  .countdown-chip.compact .countdown-value {
    font-size: 0.8125rem;
    min-width: 2.75rem;
  }

  .countdown-sep {
    width: 1px;
    height: 14px;
    background: color-mix(in srgb, var(--background-modifier-border) 80%, var(--color-accent) 20%);
    flex-shrink: 0;
  }

  .countdown-chip.compact .countdown-sep {
    height: 12px;
  }

  .countdown-label {
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--text-muted);
    letter-spacing: 0.02em;
    white-space: nowrap;
  }

  .countdown-chip.compact .countdown-label {
    font-size: 0.625rem;
  }

  .countdown-chip.warning {
    border-color: color-mix(in srgb, var(--weave-warning, var(--color-yellow)) 50%, var(--background-modifier-border));
    background: color-mix(in srgb, var(--weave-warning, var(--color-yellow)) 8%, var(--background-primary));
  }

  .countdown-chip.warning .countdown-value {
    color: var(--weave-warning, var(--color-yellow));
  }

  .countdown-chip.critical {
    border-color: color-mix(in srgb, var(--weave-error, var(--color-red)) 55%, var(--background-modifier-border));
    background: color-mix(in srgb, var(--weave-error, var(--color-red)) 10%, var(--background-primary));
    animation: critical-pulse 2s ease-in-out infinite;
  }

  .countdown-chip.critical .countdown-value {
    color: var(--weave-error, var(--color-red));
  }

  @keyframes critical-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.75;
    }
  }

  .countdown-chip.paused {
    opacity: 0.65;
    border-style: dashed;
  }

  .countdown-chip.paused .countdown-value {
    color: var(--text-muted);
  }
</style>
