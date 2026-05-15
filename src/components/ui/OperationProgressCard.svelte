<script lang="ts">
  import BouncingBallsLoader from "./BouncingBallsLoader.svelte";

  interface Props {
    title: string;
    counter?: string;
    message?: string;
    detail?: string;
    percent?: number;
    status?: "idle" | "running" | "success" | "error";
    statusLabel?: string;
    footerHint?: string;
    footerPrimary?: string;
    footerSecondary?: string;
    compactLoader?: boolean;
    centered?: boolean;
    detailInCard?: boolean;
    showProgressBar?: boolean;
    progressValueMin?: number;
    progressValueMax?: number;
    progressValueNow?: number;
    progressValueText?: string;
  }

  let {
    title,
    counter = "",
    message = "",
    detail = "",
    percent = 0,
    status = "running",
    statusLabel = "进行中",
    footerHint = "",
    footerPrimary = "",
    footerSecondary = "",
    compactLoader = false,
    centered = false,
    detailInCard = false,
    showProgressBar = true,
    progressValueMin = 0,
    progressValueMax = 100,
    progressValueNow = 0,
    progressValueText = "",
  }: Props = $props();

  let normalizedPercent = $derived(Math.max(0, Math.min(100, Number(percent) || 0)));
  let resolvedValueText = $derived(progressValueText || counter || `${normalizedPercent}%`);
  let hasFooter = $derived(Boolean(footerHint || footerPrimary || footerSecondary));
</script>

<div class={`operation-progress-card ${centered ? 'is-centered' : 'is-start'}`} data-status={status}>
  <div class="operation-progress-loader-slot" aria-hidden="true">
    {#if status === 'running'}
      <BouncingBallsLoader compact={compactLoader} showMessage={false} />
    {:else}
      <div class="operation-progress-status-badge" data-state={status}>{statusLabel}</div>
    {/if}
  </div>

  <div class="operation-progress-title-row">
    <h3 class="operation-progress-title">{title}</h3>
    {#if counter}
      <span class="operation-progress-counter">{counter}</span>
    {/if}
  </div>

  {#if message}
    <p class="operation-progress-message">{message}</p>
  {/if}

  {#if detail}
    <div class:operation-progress-detail-box={detailInCard} class="operation-progress-detail">{detail}</div>
  {/if}

  {#if showProgressBar}
    <div
      class="operation-progress-track"
      role="progressbar"
      aria-valuemin={progressValueMin}
      aria-valuemax={progressValueMax}
      aria-valuenow={progressValueNow}
      aria-valuetext={resolvedValueText}
    >
      <div class="operation-progress-fill" style={`width: ${normalizedPercent}%`}></div>
    </div>
  {/if}

  {#if hasFooter}
    <div class="operation-progress-footer">
      {#if footerHint}
        <span class="operation-progress-navigation-hint">{footerHint}</span>
      {/if}
      {#if footerPrimary || footerSecondary}
        <div class="operation-progress-meta">
          {#if footerPrimary}
            <span class="operation-progress-percent">{footerPrimary}</span>
          {/if}
          {#if footerSecondary}
            <span class="operation-progress-status-label">{footerSecondary}</span>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .operation-progress-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 12px;
    background: color-mix(in srgb, var(--background-primary) 36%, var(--weave-surface-secondary, var(--background-secondary)));
    box-shadow: 0 8px 20px color-mix(in srgb, var(--background-modifier-border) 24%, transparent);
  }

  .operation-progress-card.is-centered {
    align-items: stretch;
    justify-content: center;
    text-align: center;
  }

  .operation-progress-card.is-start {
    align-items: stretch;
    text-align: left;
  }

  .operation-progress-loader-slot {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 34px;
  }

  .operation-progress-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .operation-progress-card.is-centered .operation-progress-title-row {
    justify-content: center;
  }

  .operation-progress-title {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: var(--text-normal);
  }

  .operation-progress-counter,
  .operation-progress-status-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 28px;
    padding: 0 12px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
  }

  .operation-progress-counter {
    background: color-mix(in srgb, var(--interactive-accent) 16%, transparent);
    color: var(--interactive-accent);
    border: 1px solid color-mix(in srgb, var(--interactive-accent) 22%, transparent);
  }

  .operation-progress-message,
  .operation-progress-navigation-hint,
  .operation-progress-status-label,
  .operation-progress-percent,
  .operation-progress-detail {
    color: var(--text-muted);
  }

  .operation-progress-message,
  .operation-progress-navigation-hint,
  .operation-progress-detail {
    line-height: 1.5;
  }

  .operation-progress-message {
    margin: 0;
    font-size: 13px;
  }

  .operation-progress-detail {
    font-size: 12px;
    word-break: break-word;
  }

  .operation-progress-detail.operation-progress-detail-box {
    padding: 0.625rem 0.75rem;
    border-radius: 8px;
    background: var(--background-primary);
  }

  .operation-progress-track {
    position: relative;
    width: 100%;
    height: 12px;
    border-radius: 999px;
    overflow: hidden;
    background: var(--background-primary-alt, var(--background-primary));
    border: 1px solid var(--background-modifier-border);
  }

  .operation-progress-fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(
      90deg,
      var(--interactive-accent),
      color-mix(in srgb, var(--interactive-accent) 78%, white)
    );
    transition: width 0.18s ease;
    box-shadow: 0 0 10px color-mix(in srgb, var(--interactive-accent) 30%, transparent);
  }

  .operation-progress-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .operation-progress-meta {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
  }

  .operation-progress-status-badge {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .operation-progress-status-badge[data-state='success'] {
    background: color-mix(in srgb, var(--color-green, var(--interactive-success)) 16%, var(--background-secondary));
    color: var(--color-green, var(--interactive-success));
  }

  .operation-progress-status-badge[data-state='error'] {
    background: color-mix(in srgb, var(--color-red, var(--text-error)) 16%, var(--background-secondary));
    color: var(--color-red, var(--text-error));
  }

  .operation-progress-card[data-status='success'] .operation-progress-fill {
    background: var(--color-green, var(--interactive-success));
  }

  .operation-progress-card[data-status='error'] .operation-progress-fill {
    background: var(--color-red, var(--text-error));
  }

  .operation-progress-card[data-status='running'] .operation-progress-fill {
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--interactive-accent) 24%, transparent);
  }

  .operation-progress-status-label,
  .operation-progress-percent {
    font-size: 12px;
    white-space: nowrap;
  }

  .operation-progress-card.is-centered .operation-progress-footer {
    flex-direction: column;
  }

  @media (max-width: 720px) {
    .operation-progress-footer,
    .operation-progress-title-row {
      flex-direction: column;
      align-items: flex-start;
    }

    .operation-progress-card.is-centered .operation-progress-title-row {
      align-items: center;
    }

    .operation-progress-card.is-start .operation-progress-meta,
    .operation-progress-card.is-start .operation-progress-counter,
    .operation-progress-card.is-start .operation-progress-status-badge {
      width: 100%;
      justify-content: flex-start;
    }

    .operation-progress-card.is-centered .operation-progress-meta {
      justify-content: center;
    }
  }
</style>
