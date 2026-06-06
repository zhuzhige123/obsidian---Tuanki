<script lang="ts">
  import { Platform } from "obsidian";
  import ObsidianIcon from "../ui/ObsidianIcon.svelte";
  import ExamCountdownDisplay from "./ExamCountdownDisplay.svelte";
  import { tr } from "../../utils/i18n";

  interface Props {
    bankName: string;
    currentIndex: number;
    totalQuestions: number;
    statsCollapsed: boolean;
    showSidebar: boolean;
    showSidebarToggle?: boolean;
    showNavigator?: boolean;
    showNavigatorToggle?: boolean;
    onToggleStats: () => void;
    onToggleSidebar: () => void;
    onToggleNavigator?: () => void;
    mode?: "exam";
    remainingTime?: number;
    examDuration?: number;
    isPaused?: boolean;
    onTogglePause?: () => void;
  }

  let {
    bankName,
    currentIndex,
    totalQuestions,
    statsCollapsed,
    showSidebar,
    showSidebarToggle = true,
    showNavigator = true,
    showNavigatorToggle = true,
    onToggleStats,
    onToggleSidebar,
    onToggleNavigator,
    mode = "exam",
    remainingTime = 0,
    examDuration = 0,
    isPaused = false,
    onTogglePause,
  }: Props = $props();

  const isMobile = Platform.isMobile;
  let t = $derived($tr);

  const isExamMode = $derived(mode === "exam");
  const showExamCountdown = $derived(isExamMode && examDuration > 0);

  const timeProgressPercent = $derived.by(() => {
    if (!showExamCountdown || examDuration <= 0) return 0;
    const elapsed = examDuration - remainingTime;
    return Math.min(100, Math.max(0, (elapsed / examDuration) * 100));
  });

  const isTimeWarning = $derived(!isPaused && remainingTime > 0 && remainingTime < 5 * 60 * 1000);
  const isTimeCritical = $derived(!isPaused && remainingTime > 0 && remainingTime < 60 * 1000);

  const progressBarClass = $derived(
    isTimeCritical ? "critical" : isTimeWarning ? "warning" : ""
  );
</script>

{#if isMobile && isExamMode}
  <div class="study-header study-header-mobile-exam">
    <div class="mobile-exam-left">
      <span class="mobile-exam-progress" aria-label={t("study.questionBankUI.header.progressAria", { current: currentIndex, total: totalQuestions })}>
        <span class="progress-current">{currentIndex}</span>
        <span class="progress-divider">/</span>
        <span class="progress-total">{totalQuestions}</span>
      </span>
    </div>

    {#if showExamCountdown}
      <div class="clock-container mobile-clock">
        <ExamCountdownDisplay remainingTimeMs={remainingTime} {isPaused} compact />
        {#if onTogglePause}
          <button
            type="button"
            class="clickable-icon study-header-icon-btn pause-btn"
            onclick={onTogglePause}
            aria-label={isPaused ? t("study.questionBankUI.header.resumeTimer") : t("study.questionBankUI.header.pauseTimer")}
            title={isPaused ? t("study.questionBankUI.header.resume") : t("study.questionBankUI.header.pause")}
          >
            <ObsidianIcon name={isPaused ? "play" : "pause"} size={14} />
          </button>
        {/if}
      </div>
    {/if}

    {#if showExamCountdown}
      <div
        class="header-progress-bar {progressBarClass}"
        style:width="{timeProgressPercent}%"
        aria-hidden="true"
      ></div>
    {/if}
  </div>
{:else if !isMobile}
  <div class="study-header">
    <div class="header-left">
      <h2 class="study-title">{bankName || t("study.questionBankUI.header.defaultBank")}</h2>
      <div class="study-progress">
        <span
          class="progress-text"
          aria-label={t("study.questionBankUI.header.progressAria", { current: currentIndex, total: totalQuestions })}
        >
          <span class="progress-current">{currentIndex}</span>
          <span class="progress-divider">/</span>
          <span class="progress-total">{totalQuestions}</span>
        </span>
      </div>

      {#if showExamCountdown}
        <div class="clock-container">
          <ExamCountdownDisplay remainingTimeMs={remainingTime} {isPaused} />

          {#if onTogglePause}
            <button
              type="button"
              class="clickable-icon study-header-icon-btn pause-btn"
              onclick={onTogglePause}
              aria-label={isPaused ? t("study.questionBankUI.header.resumeTimer") : t("study.questionBankUI.header.pauseTimer")}
              title={isPaused ? t("study.questionBankUI.header.resume") : t("study.questionBankUI.header.pause")}
            >
              <ObsidianIcon name={isPaused ? "play" : "pause"} size={14} />
            </button>
          {/if}
        </div>
      {/if}
    </div>

    <div class="header-right">
      {#if showNavigatorToggle && onToggleNavigator}
        <button
          type="button"
          class="clickable-icon study-header-icon-btn"
          class:active={showNavigator}
          onclick={onToggleNavigator}
          aria-label={showNavigator ? t("study.questionBankUI.header.hideNavigator") : t("study.questionBankUI.header.showNavigator")}
          title={showNavigator ? t("study.questionBankUI.header.hideNavigator") : t("study.questionBankUI.header.showNavigator")}
        >
          <ObsidianIcon name="panel-left" size={16} />
        </button>
      {/if}

      <button
        type="button"
        class="clickable-icon study-header-icon-btn"
        onclick={onToggleStats}
        aria-label={statsCollapsed ? t("study.questionBankUI.header.expandStats") : t("study.questionBankUI.header.collapseStats")}
        title={statsCollapsed ? t("study.questionBankUI.header.expandStats") : t("study.questionBankUI.header.collapseStats")}
      >
        <ObsidianIcon name={statsCollapsed ? "chevron-down" : "chevron-up"} size={16} />
      </button>

      {#if showSidebarToggle}
        <button
          type="button"
          class="clickable-icon study-header-icon-btn"
          class:active={showSidebar}
          onclick={onToggleSidebar}
          aria-label={showSidebar ? t("study.questionBankUI.header.hideSidebar") : t("study.questionBankUI.header.showSidebar")}
          title={showSidebar ? t("study.questionBankUI.header.hideSidebar") : t("study.questionBankUI.header.showSidebar")}
        >
          <ObsidianIcon name="panel-right" size={16} />
        </button>
      {/if}
    </div>

    {#if showExamCountdown}
      <div
        class="header-progress-bar {progressBarClass}"
        style:width="{timeProgressPercent}%"
        aria-hidden="true"
      ></div>
    {/if}
  </div>
{/if}

<style>
  .study-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1.5rem;
    border-bottom: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
    flex-shrink: 0;
    position: relative;
  }

  .study-header-mobile-exam {
    justify-content: center;
    padding: 0.5rem 1rem;
    min-height: 44px;
  }

  .mobile-exam-left {
    position: absolute;
    left: 1rem;
    display: flex;
    align-items: center;
  }

  .mobile-exam-progress {
    display: inline-flex;
    align-items: baseline;
    gap: 0.15rem;
    font-size: 0.8125rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
  }

  .mobile-clock {
    margin-left: 0;
    margin-right: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex: 1;
    min-width: 0;
  }

  .study-title {
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--text-normal);
    margin: 0;
    white-space: nowrap;
  }

  .study-progress {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.22rem 0.5rem;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--background-modifier-border) 78%, transparent);
    background: color-mix(in srgb, var(--background-primary) 90%, var(--background-secondary) 10%);
    min-width: 0;
  }

  .progress-text {
    display: inline-flex;
    align-items: baseline;
    gap: 0.2rem;
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    font-size: 0.8125rem;
    color: var(--text-muted);
    font-weight: 600;
    min-width: 66px;
    background: color-mix(in srgb, var(--background-modifier-hover) 86%, transparent);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
    justify-content: center;
  }

  .progress-current {
    color: var(--text-normal);
    font-weight: 700;
  }

  .progress-divider {
    color: var(--text-faint);
    font-weight: 500;
  }

  .progress-total {
    color: var(--text-muted);
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    flex-shrink: 0;
  }

  .study-header-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--icon-color);
    cursor: pointer;
    transition: background-color 0.15s ease, color 0.15s ease;
    position: relative;
  }

  .study-header-icon-btn:hover:not(:disabled) {
    background: var(--background-modifier-hover);
    color: var(--icon-color-hover, var(--text-normal));
  }

  .study-header-icon-btn.active {
    background: color-mix(in srgb, var(--interactive-accent) 14%, transparent);
    color: var(--interactive-accent);
  }

  .study-header-icon-btn:active:not(:disabled) {
    background: var(--background-modifier-active-hover, var(--background-modifier-border));
  }

  .study-header-icon-btn:focus-visible {
    outline: 2px solid var(--interactive-accent);
    outline-offset: 2px;
  }

  .study-header-icon-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .clock-container {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
    margin-right: 1rem;
  }

  .pause-btn {
    color: var(--interactive-accent);
    background: color-mix(in srgb, var(--interactive-accent) 12%, transparent);
  }

  .pause-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--interactive-accent) 20%, transparent);
    color: var(--interactive-accent);
  }

  .header-progress-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 2px;
    background: var(--color-accent);
    transition: width 1s linear, background 0.3s ease;
    border-radius: 0 1px 1px 0;
    pointer-events: none;
  }

  .header-progress-bar.warning {
    background: var(--weave-warning, var(--color-yellow));
  }

  .header-progress-bar.critical {
    background: var(--weave-error, var(--color-red));
  }
</style>
