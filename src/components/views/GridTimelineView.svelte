<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { Card } from '../../data/types';
  import type { WeavePlugin } from '../../main';
  import LazyGridCard from '../cards/LazyGridCard.svelte';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';
  import { compareGridTimelineEntries } from '../../utils/grid-timeline-utils';

  type GridCardAttributeType =
    | 'none'
    | 'uuid'
    | 'source'
    | 'priority'
    | 'retention'
    | 'modified'
    | 'accuracy'
    | 'question_type'
    | 'ir_state'
    | 'ir_priority';

  type DocumentFilterMode = 'all' | 'current';

  interface Props {
    cards: Card[];
    selectedCards: Set<string>;
    focusedCards?: Set<string>;
    plugin: WeavePlugin;
    attributeType?: GridCardAttributeType;
    isMobile?: boolean;
    documentFilterMode?: DocumentFilterMode;
    activeDocumentName?: string | null;
    onCardClick?: (card: Card) => void;
    onCardEdit?: (card: Card) => void;
    onCardDelete?: (card: Card) => void;
    onCardView?: (card: Card) => void;
    onCardConvertToMarkdown?: (card: Card) => void;
    onSourceJump?: (card: Card) => void;
    onCardLongPress?: (card: Card) => void;
    loading?: boolean;
  }

  interface TimelineEntry {
    card: Card;
    timestamp: number;
    timeLabel: string;
    dayKey: string;
    daySortValue: number;
    year: number | null;
    monthKey: string | null;
    monthLabel: string;
    dayLabel: string;
    weekdayLabel: string;
    yearLabel: string;
    isUnknown: boolean;
  }

  interface TimelineGroup {
    key: string;
    year: number | null;
    monthKey: string | null;
    monthLabel: string;
    dayLabel: string;
    weekdayLabel: string;
    yearLabel: string;
    count: number;
    sortValue: number;
    cards: TimelineEntry[];
    showYearLabel: boolean;
    showMonthLabel: boolean;
    isUnknown: boolean;
    connectFromPrevious: boolean;
    connectToNext: boolean;
    isToday: boolean;
    isRecentWeek: boolean;
  }

  const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const DAY_MS = 24 * 60 * 60 * 1000;

  let {
    cards,
    selectedCards,
    focusedCards = new Set<string>(),
    plugin,
    attributeType = 'uuid',
    isMobile = false,
    documentFilterMode = 'all',
    activeDocumentName = null,
    onCardClick,
    onCardEdit,
    onCardDelete,
    onCardView,
    onCardConvertToMarkdown,
    onSourceJump,
    onCardLongPress,
    loading = false
  }: Props = $props();

  let scrollContainer = $state<HTMLElement>();
  let sentinel = $state<HTMLElement>();
  let observer: IntersectionObserver | null = null;
  let visibleCount = $state(60);
  let isLoadingMore = $state(false);
  let lastAutoScrollKey = $state('');

  function pad2(value: number): string {
    return String(value).padStart(2, '0');
  }

  function getTodayStart(): number {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }

  function getDayDistance(daySortValue: number): number | null {
    if (daySortValue <= 0) return null;
    return Math.floor((getTodayStart() - daySortValue) / DAY_MS);
  }

  function getTimelineDate(card: Card): Date | null {
    const rawValue = card.created || card.modified || '';
    if (!rawValue) return null;

    const parsed = new Date(rawValue);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function createTimelineEntry(card: Card): TimelineEntry {
    const date = getTimelineDate(card);
    if (!date) {
      return {
        card,
        timestamp: 0,
        timeLabel: '--:--',
        dayKey: 'unknown',
        daySortValue: 0,
        year: null,
        monthKey: null,
        monthLabel: '未记录',
        dayLabel: '未记录',
        weekdayLabel: '--',
        yearLabel: '未记录',
        isUnknown: true
      };
    }

    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    return {
      card,
      timestamp: date.getTime(),
      timeLabel: `${pad2(date.getHours())}:${pad2(date.getMinutes())}`,
      dayKey: `${year}-${pad2(month)}-${pad2(day)}`,
      daySortValue: new Date(year, month - 1, day).getTime(),
      year,
      monthKey: `${year}-${pad2(month)}`,
      monthLabel: `${pad2(month)} 月`,
      dayLabel: `${pad2(month)}-${pad2(day)}`,
      weekdayLabel: WEEKDAY_LABELS[date.getDay()],
      yearLabel: `${year} 年`,
      isUnknown: false
    };
  }

  function compareTimelineEntries(a: TimelineEntry, b: TimelineEntry): number {
    return compareGridTimelineEntries({
      daySortValue: a.daySortValue,
      timestamp: a.timestamp,
      uuid: a.card.uuid
    }, {
      daySortValue: b.daySortValue,
      timestamp: b.timestamp,
      uuid: b.card.uuid
    });
  }

  const timelineEntries = $derived.by(() => (
    [...cards]
      .map(createTimelineEntry)
      .sort(compareTimelineEntries)
  ));

  const shouldUseProgressiveRender = $derived(timelineEntries.length > 80);
  const visibleEntries = $derived.by(() => (
    shouldUseProgressiveRender
      ? timelineEntries.slice(0, visibleCount)
      : timelineEntries
  ));
  const hasMore = $derived(visibleEntries.length < timelineEntries.length);

  const timelineGroups = $derived.by(() => {
    const metaMap = new Map<string, Omit<TimelineGroup, 'cards' | 'showYearLabel' | 'showMonthLabel' | 'connectFromPrevious' | 'connectToNext'>>();
    const visibleMap = new Map<string, TimelineEntry[]>();

    for (const entry of timelineEntries) {
      const existing = metaMap.get(entry.dayKey);
      if (existing) {
        existing.count += 1;
      } else {
        const dayDistance = getDayDistance(entry.daySortValue);
        metaMap.set(entry.dayKey, {
          key: entry.dayKey,
          year: entry.year,
          monthKey: entry.monthKey,
          monthLabel: entry.monthLabel,
          dayLabel: entry.dayLabel,
          weekdayLabel: entry.weekdayLabel,
          yearLabel: entry.yearLabel,
          count: 1,
          sortValue: entry.daySortValue,
          isUnknown: entry.isUnknown,
          isToday: dayDistance === 0,
          isRecentWeek: dayDistance !== null && dayDistance > 0 && dayDistance <= 6
        });
      }
    }

    for (const entry of visibleEntries) {
      const groupEntries = visibleMap.get(entry.dayKey) ?? [];
      groupEntries.push(entry);
      visibleMap.set(entry.dayKey, groupEntries);
    }

    const ordered = Array.from(metaMap.values()).sort((a, b) => b.sortValue - a.sortValue);
    const groups: TimelineGroup[] = [];
    let lastVisibleYear: number | null = null;
    let lastVisibleMonthKey: string | null = null;

    for (const meta of ordered) {
      const groupCards = visibleMap.get(meta.key) ?? [];
      if (groupCards.length === 0) {
        continue;
      }

      groupCards.sort(compareTimelineEntries);

      const showYearLabel = meta.year !== null && meta.year !== lastVisibleYear;
      const showMonthLabel = !meta.isUnknown && meta.monthKey !== null && meta.monthKey !== lastVisibleMonthKey;
      if (meta.year !== null) {
        lastVisibleYear = meta.year;
      }
      if (meta.monthKey !== null) {
        lastVisibleMonthKey = meta.monthKey;
      }

      groups.push({
        ...meta,
        cards: groupCards,
        showYearLabel,
        showMonthLabel,
        connectFromPrevious: false,
        connectToNext: false
      });
    }

    for (let index = 0; index < groups.length; index += 1) {
      const currentGroup = groups[index];
      const previousGroup = groups[index - 1];
      const nextGroup = groups[index + 1];

      currentGroup.connectFromPrevious = !!previousGroup && previousGroup.year === currentGroup.year;
      currentGroup.connectToNext = !!nextGroup && nextGroup.year === currentGroup.year;
    }

    return groups;
  });

  function isCardSelected(cardId: string): boolean {
    return selectedCards.has(cardId);
  }

  function isCardFocused(cardId: string): boolean {
    return focusedCards.has(cardId);
  }

  function loadMore(): void {
    if (isLoadingMore || !hasMore) return;

    isLoadingMore = true;
    requestAnimationFrame(() => {
      visibleCount = Math.min(visibleCount + 48, timelineEntries.length);
      isLoadingMore = false;
    });
  }

  function setupIntersectionObserver(): void {
    observer?.disconnect();
    observer = null;

    if (!sentinel || !hasMore) return;

    const rootEl = scrollContainer && scrollContainer.scrollHeight > scrollContainer.clientHeight + 2
      ? scrollContainer
      : null;

    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && hasMore && !isLoadingMore) {
            loadMore();
          }
        }
      },
      {
        root: rootEl,
        rootMargin: '200px',
        threshold: 0.1
      }
    );

    observer.observe(sentinel);
  }

  async function scrollToRelevantTimelinePosition(): Promise<void> {
    if (!scrollContainer) return;

    await tick();
    if (!scrollContainer) return;

    const target =
      scrollContainer.querySelector<HTMLElement>('[data-scroll-anchor="today"]')
      ?? scrollContainer.querySelector<HTMLElement>('[data-scroll-anchor="latest"]');

    if (!target) {
      scrollContainer.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }

    scrollContainer.scrollTo({
      top: Math.max(target.offsetTop - 12, 0),
      behavior: 'auto'
    });
  }

  const autoScrollKey = $derived.by(() => {
    const firstEntry = timelineEntries[0];
    return [
      documentFilterMode,
      activeDocumentName ?? '',
      loading ? 'loading' : 'ready',
      timelineEntries.length,
      firstEntry?.card.uuid ?? '',
      firstEntry?.timestamp ?? 0
    ].join('|');
  });

  onMount(() => {
    tick().then(() => {
      setupIntersectionObserver();
    });

    return () => {
      observer?.disconnect();
    };
  });

  $effect(() => {
    const totalEntries = timelineEntries.length;
    visibleCount = shouldUseProgressiveRender ? Math.min(totalEntries, 60) : totalEntries;
  });

  $effect(() => {
    const more = hasMore;
    const hasSentinel = !!sentinel;
    if (more && hasSentinel) {
      setupIntersectionObserver();
    }
  });

  $effect(() => {
    const scrollKey = autoScrollKey;
    const groupCount = timelineGroups.length;
    const containerReady = !!scrollContainer;

    if (!containerReady || groupCount === 0 || loading) {
      return;
    }

    if (scrollKey === lastAutoScrollKey) {
      return;
    }

    lastAutoScrollKey = scrollKey;
    void scrollToRelevantTimelinePosition();
  });
</script>

<div class="grid-timeline-view" bind:this={scrollContainer}>
  {#if loading}
    <div class="weave-loading-state">
      <div class="weave-spinner"></div>
      <p>加载中...</p>
    </div>
  {:else if cards.length === 0}
    <div class="weave-empty-state">
      <EnhancedIcon name="history" size={48} />
      <h3>暂无时间线卡片</h3>
      <p>当前筛选条件下没有可展示的卡片记录</p>
    </div>
  {:else}
    {#if documentFilterMode === 'current' && activeDocumentName}
      <div class="timeline-status-banner">
        <EnhancedIcon name="file-text" size={14} />
        <span>当前仅显示与 {activeDocumentName} 关联的卡片时间线</span>
      </div>
    {/if}

    <div class="timeline-groups">
      {#each timelineGroups as group, index (group.key)}
        <section
          class="timeline-group"
          data-scroll-anchor={group.isToday ? 'today' : index === 0 ? 'latest' : undefined}
        >
          {#if group.showYearLabel || group.showMonthLabel}
            <div class="timeline-period-header">
              {#if group.showYearLabel}
                <div class="timeline-year">{group.yearLabel}</div>
              {/if}
              {#if group.showMonthLabel}
                <div class="timeline-month">{group.monthLabel}</div>
              {/if}
            </div>
          {/if}

          <div
            class="timeline-flow"
            class:connect-from-previous={group.connectFromPrevious}
            class:connect-to-next={group.connectToNext}
            class:is-today={group.isToday}
            class:is-recent-week={group.isRecentWeek}
          >
            <div class="timeline-date-row">
              <div class="timeline-date-main">
                <div class="timeline-date-label">{group.dayLabel}</div>
                <div class="timeline-date-weekday">{group.weekdayLabel}</div>
              </div>
              <div class="timeline-date-axis" aria-hidden="true">
                <div class="timeline-date-dot"></div>
              </div>
              <div class="timeline-date-note">
                {#if group.isUnknown}
                  <span class="timeline-date-badge is-muted">时间缺失</span>
                {:else if group.isToday}
                  <span class="timeline-date-badge is-today">今天</span>
                {:else if group.isRecentWeek}
                  <span class="timeline-date-badge is-recent">近7天</span>
                {/if}
              </div>
            </div>

            <div class="timeline-entry-list">
              {#each group.cards as entry, index (entry.card.uuid || `${group.key}-${index}`)}
                <article class="timeline-entry">
                  <div class="timeline-time">{entry.timeLabel}</div>

                  <div class="timeline-entry-axis" aria-hidden="true">
                    <div class="timeline-entry-dot"></div>
                  </div>

                  <div class="timeline-entry-card">
                    <LazyGridCard
                      card={entry.card}
                      selected={isCardSelected(entry.card.uuid)}
                      emphasized={isCardFocused(entry.card.uuid)}
                      {plugin}
                      layoutMode="masonry"
                      {attributeType}
                      {isMobile}
                      onClick={onCardClick}
                       onEdit={onCardEdit}
                       onDelete={onCardDelete}
                       onView={onCardView}
                       onConvertToMarkdown={onCardConvertToMarkdown}
                       onSourceJump={onSourceJump}
                       onLongPress={onCardLongPress}
                     />
                  </div>
                </article>
              {/each}
            </div>
          </div>
        </section>
      {/each}
    </div>

    {#if hasMore}
      <div bind:this={sentinel} class="load-more-sentinel">
        {#if isLoadingMore}
          <div class="loading-more">
            <div class="weave-spinner-small"></div>
            <span>继续展开更早的时间节点...</span>
          </div>
        {/if}
      </div>
    {/if}

    {#if shouldUseProgressiveRender}
      <div class="performance-hint">
        <EnhancedIcon name="history" size={14} />
        <span>时间线分批加载中（已显示 {visibleEntries.length} / {timelineEntries.length} 张卡片）</span>
      </div>
    {/if}
  {/if}
</div>

<style>
  @import './styles/grid-common.css';

  .grid-timeline-view {
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
    padding: var(--weave-space-lg) var(--weave-space-lg) var(--weave-space-lg) var(--weave-space-sm);
    background: var(--background-primary);
  }

  .timeline-status-banner {
    display: flex;
    align-items: center;
    gap: var(--weave-space-sm);
    margin-bottom: var(--weave-space-lg);
    padding: 10px 12px;
    border-radius: var(--weave-radius-md);
    background: color-mix(in srgb, var(--interactive-accent) 8%, var(--background-secondary));
    border: 1px solid color-mix(in srgb, var(--interactive-accent) 16%, var(--background-modifier-border));
    color: var(--text-muted);
    font-size: 0.78rem;
    line-height: 1.4;
  }

  .timeline-groups {
    --timeline-time-width: 52px;
    --timeline-axis-width: 24px;
    --timeline-column-gap: 6px;
    --timeline-axis-center-x: calc(
      var(--timeline-time-width) + var(--timeline-column-gap) + (var(--timeline-axis-width) / 2)
    );
    --timeline-entry-gap: var(--weave-space-md);
    --timeline-group-gap: var(--weave-space-xl);
    display: flex;
    flex-direction: column;
    gap: var(--timeline-group-gap);
  }

  .timeline-group {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .timeline-period-header {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: baseline;
    gap: var(--weave-space-sm);
    margin: 0 calc(-1 * var(--weave-space-xs)) var(--weave-space-sm);
    padding: 6px var(--weave-space-xs) 8px;
    background:
      linear-gradient(
        to bottom,
        color-mix(in srgb, var(--background-primary) 96%, transparent),
        color-mix(in srgb, var(--background-primary) 88%, transparent)
      );
    backdrop-filter: blur(8px);
  }

  .timeline-year {
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--text-normal);
    letter-spacing: 0.02em;
  }

  .timeline-month {
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--text-muted);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .timeline-flow {
    position: relative;
  }

  .timeline-flow::before {
    content: '';
    position: absolute;
    left: var(--timeline-axis-center-x);
    top: 14px;
    bottom: 14px;
    width: 2px;
    transform: translateX(-50%);
    background:
      linear-gradient(
        to bottom,
        color-mix(in srgb, var(--interactive-accent) 32%, transparent),
        color-mix(in srgb, var(--background-modifier-border) 88%, transparent)
      );
    opacity: 0.95;
    pointer-events: none;
  }

  .timeline-flow.connect-from-previous::before {
    top: calc(-1 * var(--timeline-group-gap));
  }

  .timeline-flow.connect-to-next::before {
    bottom: calc(-1 * var(--timeline-group-gap));
  }

  .timeline-flow.is-today .timeline-date-label,
  .timeline-flow.is-today .timeline-date-weekday {
    color: var(--interactive-accent);
  }

  .timeline-flow.is-today .timeline-date-dot {
    box-shadow:
      0 0 0 6px color-mix(in srgb, var(--interactive-accent) 20%, transparent),
      0 0 0 1px color-mix(in srgb, var(--interactive-accent) 42%, transparent);
  }

  .timeline-flow.is-recent-week .timeline-date-dot {
    box-shadow:
      0 0 0 5px color-mix(in srgb, var(--interactive-accent) 12%, transparent),
      0 0 0 1px color-mix(in srgb, var(--interactive-accent) 24%, transparent);
  }

  .timeline-date-row,
  .timeline-entry {
    display: grid;
    grid-template-columns: var(--timeline-time-width) var(--timeline-axis-width) minmax(0, 1fr);
    column-gap: var(--timeline-column-gap);
    align-items: start;
  }

  .timeline-date-row {
    margin-bottom: var(--timeline-entry-gap);
  }

  .timeline-date-main {
    padding-top: 2px;
    justify-self: end;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
    text-align: right;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .timeline-date-label {
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--text-normal);
    letter-spacing: 0.02em;
  }

  .timeline-date-weekday {
    font-size: 0.68rem;
    font-weight: 600;
    line-height: 1.1;
    color: var(--text-muted);
  }

  .timeline-time {
    padding-top: 6px;
    text-align: right;
    justify-self: end;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .timeline-date-note {
    min-height: 1px;
    padding-top: 4px;
    display: flex;
    align-items: flex-start;
  }

  .timeline-date-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 20px;
    padding: 0 8px;
    border-radius: 999px;
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.01em;
    white-space: nowrap;
  }

  .timeline-date-badge.is-today {
    color: var(--interactive-accent);
    background: color-mix(in srgb, var(--interactive-accent) 14%, transparent);
  }

  .timeline-date-badge.is-recent {
    color: var(--text-normal);
    background: color-mix(in srgb, var(--interactive-accent) 8%, var(--background-secondary));
  }

  .timeline-date-badge.is-muted {
    color: var(--text-muted);
    background: var(--background-secondary);
  }

  .timeline-entry-list {
    display: flex;
    flex-direction: column;
    gap: var(--timeline-entry-gap);
  }

  .timeline-date-axis,
  .timeline-entry-axis {
    position: relative;
    min-height: 28px;
    display: flex;
    justify-content: center;
    pointer-events: none;
  }

  .timeline-date-dot,
  .timeline-entry-dot {
    position: absolute;
    left: 50%;
    border-radius: 999px;
    transform: translateX(-50%);
    background: var(--interactive-accent);
  }

  .timeline-date-dot {
    top: 6px;
    width: 14px;
    height: 14px;
    box-shadow:
      0 0 0 5px color-mix(in srgb, var(--interactive-accent) 14%, transparent),
      0 0 0 1px color-mix(in srgb, var(--interactive-accent) 28%, transparent);
  }

  .timeline-entry-dot {
    top: 7px;
    width: 12px;
    height: 12px;
    box-shadow:
      0 0 0 4px color-mix(in srgb, var(--interactive-accent) 18%, transparent),
      0 0 0 1px color-mix(in srgb, var(--interactive-accent) 35%, transparent);
  }

  .timeline-entry-card {
    min-width: 0;
  }

  .load-more-sentinel {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--weave-space-lg);
    min-height: 60px;
  }

  .loading-more {
    display: flex;
    align-items: center;
    gap: var(--weave-space-sm);
    color: var(--weave-text-secondary);
    font-size: var(--weave-font-size-sm);
  }

  .performance-hint {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--weave-space-xs);
    padding: var(--weave-space-md);
    margin-top: var(--weave-space-lg);
    background: var(--background-secondary);
    border-radius: var(--weave-radius-md);
    color: var(--weave-text-secondary);
    font-size: var(--weave-font-size-xs);
  }

  @media (max-width: 1023px) {
    .grid-timeline-view {
      padding: var(--weave-space-md) var(--weave-space-md) var(--weave-space-md) var(--weave-space-xs);
    }

    .timeline-groups {
      --timeline-time-width: 48px;
      --timeline-axis-width: 22px;
      --timeline-column-gap: 6px;
    }
  }

  @media (max-width: 767px) {
    .grid-timeline-view {
      padding: var(--weave-space-sm) var(--weave-space-sm) var(--weave-space-sm) 6px;
    }

    .timeline-status-banner {
      margin-bottom: var(--weave-space-md);
      padding: 8px 10px;
      font-size: 0.74rem;
    }

    .timeline-period-header {
      gap: 6px;
      margin-bottom: var(--weave-space-xs);
      padding-top: 4px;
      padding-bottom: 6px;
    }

    .timeline-groups {
      --timeline-time-width: 44px;
      --timeline-axis-width: 20px;
      --timeline-column-gap: 4px;
      --timeline-group-gap: var(--weave-space-lg);
      --timeline-entry-gap: var(--weave-space-sm);
    }

    .timeline-date-label {
      font-size: 0.8rem;
    }

    .timeline-year {
      font-size: 1rem;
    }

    .timeline-month {
      font-size: 0.74rem;
    }

    .timeline-date-weekday {
      font-size: 0.62rem;
    }

    .timeline-time {
      font-size: 0.76rem;
    }

    .timeline-date-badge {
      font-size: 0.62rem;
      padding: 0 6px;
    }
  }
</style>
