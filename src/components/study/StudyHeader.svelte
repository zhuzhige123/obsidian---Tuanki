<script lang="ts">
  import ObsidianIcon from "../ui/ObsidianIcon.svelte";
  import StudyProgressBar from "./StudyProgressBar.svelte";
  import type { WeaveDataStorage } from "../../data/storage";
  import type { StudySession } from "../../data/study-types";
  import type { Card } from "../../data/types";
  import { onMount } from "svelte";
  import { tr } from '../../utils/i18n';

  interface Props {
    currentDeckName: string;
    currentIndexDisplay: number;
    cardsLength: number;
    statsCollapsed: boolean;
    sourceInfoCollapsed?: boolean;
    showSourceInfoToggle?: boolean;
    showSidebar: boolean;
    session: StudySession;
    dataStorage: WeaveDataStorage;
    progressBarRefreshTrigger: number;
    // 多牌组引用信息
    referencedDecks?: Array<{ id: string; name: string }>;
    // 可选的卡片数组，作为进度条的备用数据源
    cards?: Card[];
    onToggleStats: () => void;
    onToggleSourceInfo?: () => void;
    onToggleSidebar: () => void;
  }

  let {
    currentDeckName,
    currentIndexDisplay,
    cardsLength,
    statsCollapsed,
    sourceInfoCollapsed = false,
    showSourceInfoToggle = false,
    showSidebar,
    session,
    dataStorage,
    progressBarRefreshTrigger,
    referencedDecks = [],
    cards,
    onToggleStats,
    onToggleSourceInfo = () => {},
    onToggleSidebar
  }: Props = $props();

  // 是否显示多牌组引用标识
  let hasMultipleReferences = $derived(referencedDecks.length > 1);

  // 检测是否为移动端（Obsidian 移动端会添加 is-phone 或 is-mobile 类）
  let t = $derived($tr);

  let isMobile = $state(false);
  
  onMount(() => {
    isMobile = activeDocument.body.classList.contains('is-phone') || activeDocument.body.classList.contains('is-mobile');
  });
</script>

<!-- 头部工具栏 -->
<!--  移动端完全隐藏自定义顶部栏，所有功能按钮已移到 Obsidian 原生顶部栏 -->
{#if !isMobile}
<div class="study-header">
  <!--  桌面端布局 -->
  <div class="header-left">
    <div class="deck-info">
      <h2 class="study-title">{currentDeckName || t('study.header.defaultTitle')}</h2>
      {#if hasMultipleReferences}
        <span class="multi-deck-badge" title={t('study.header.multiDeckBadge', { decks: referencedDecks.map(d => d.name).join(', ') })}>
          +{referencedDecks.length - 1}
        </span>
      {/if}
    </div>
    <div class="study-progress">
      <StudyProgressBar deckId={session.deckId} {dataStorage} refreshTrigger={progressBarRefreshTrigger} {cards} />
      <span class="progress-text" aria-label={`Study progress ${currentIndexDisplay} / ${cardsLength}`}>
        <span class="progress-current">{currentIndexDisplay}</span>
        <span class="progress-divider">/</span>
        <span class="progress-total">{cardsLength}</span>
      </span>
    </div>
  </div>

  <div class="header-right">
    <!-- 来源信息栏展开/收起按钮 -->
    {#if showSourceInfoToggle}
      <button
        type="button"
        onclick={onToggleSourceInfo}
        aria-label={sourceInfoCollapsed ? t('study.header.expandSourceInfo') : t('study.header.collapseSourceInfo')}
        title={sourceInfoCollapsed ? t('study.header.expandSourceInfo') : t('study.header.collapseSourceInfo')}
        class="clickable-icon study-header-icon-btn source-info-toggle-btn"
      >
        <ObsidianIcon name="book-open" size={16} />
      </button>
    {/if}

    <!-- 统计展开/收起按钮 -->
    <button
      type="button"
      onclick={onToggleStats}
      aria-label={statsCollapsed ? t('study.header.expandStats') : t('study.header.collapseStats')}
      title={statsCollapsed ? t('study.header.expandStats') : t('study.header.collapseStats')}
      class="clickable-icon study-header-icon-btn stats-toggle-btn"
    >
      <ObsidianIcon name={statsCollapsed ? "chevron-down" : "chevron-up"} size={16} />
    </button>

    <!-- 侧边栏切换按钮 -->
    <button
      type="button"
      onclick={onToggleSidebar}
      aria-label={showSidebar ? t('study.header.hideSidebar') : t('study.header.showSidebar')}
      title={showSidebar ? t('study.header.hideSidebar') : t('study.header.showSidebar')}
      class="clickable-icon study-header-icon-btn sidebar-toggle-btn"
    >
      <ObsidianIcon name="panel-left" size={16} />
    </button>

    <!-- 关闭按钮 -->
  </div>
</div>
{/if}

<style>
  /* 头部工具栏 */
  .study-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
    flex-shrink: 0;
    border-radius: var(--weave-radius-lg, 8px) var(--weave-radius-lg, 8px) 0 0;
    position: relative;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    flex: 1;
  }

  /* 牌组信息容器 */
  .deck-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .study-title {
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--text-normal);
    margin: 0;
  }

  /* 多牌组引用标识 */
  .multi-deck-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.5rem;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-accent);
    background: var(--background-modifier-hover);
    border-radius: var(--weave-radius-sm, 4px);
    cursor: help;
    transition: background 0.2s ease;
  }

  .multi-deck-badge:hover {
    background: var(--background-modifier-active-hover);
  }

  .study-progress {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.25rem 0.55rem;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--background-modifier-border) 78%, transparent);
    background: color-mix(in srgb, var(--background-primary) 90%, var(--background-secondary) 10%);
    min-width: 0;
  }

  .progress-text {
    display: inline-flex;
    align-items: baseline;
    gap: 0.2rem;
    padding: 0.12rem 0.5rem;
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
  }

  .study-header-icon-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--icon-color-hover, var(--text-normal));
  }

  .study-header-icon-btn:active {
    background: var(--background-modifier-active-hover, var(--background-modifier-border));
  }

  .study-header-icon-btn:focus-visible {
    outline: 2px solid var(--interactive-accent);
    outline-offset: 2px;
  }

  /* ==================== Obsidian 移动端适配 ==================== */
  /*  移动端完全隐藏自定义顶部栏，所有功能按钮已移到 Obsidian 原生顶部栏 */
  
  /* 平板端：保持桌面端布局 */
  :global(body.is-tablet) .study-header {
    flex-direction: row;
    padding: 0.75rem 1rem;
  }

  :global(body.is-tablet) .header-left {
    flex-direction: row;
    gap: 1rem;
  }

  :global(body.is-tablet) .study-progress {
    padding: 0.22rem 0.45rem;
    gap: 0.5rem;
  }
</style>
