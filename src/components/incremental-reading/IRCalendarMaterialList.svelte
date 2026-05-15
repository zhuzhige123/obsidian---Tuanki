<script lang="ts">
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';
  import type { IRCalendarMaterialListProps } from './ir-calendar-sidebar-types';

  let {
    displayedMaterials,
    hasActiveSearch,
    displayedMaterialDateKeys,
    continuousReadingEnabled,
    expandedMaterialIds,
    loadingSiblings,
    siblingCache,
    processedChunkIds,
    timerBusyBlockId,
    t,
    getDisplayedMaterialDateLabel,
    getScheduleItemDeckName,
    getMaterialExpandButtonLabel,
    handleMaterialClick,
    openMaterial,
    toggleMaterialExpand,
    handleMaterialContextMenu,
    handleLongPressStart,
    handleLongPressMove,
    handleLongPressEnd,
    openSchedulingMenu,
    hasVisibleAssociatedNote,
    getAssociatedNoteActionLabel,
    getAssociatedNoteActionTooltip,
    handleAssociatedNoteClick,
    isTimerRunningForBlock,
    getDisplayedTimerSeconds,
    getReadingTimerButtonTitle,
    toggleReadingTimer,
    formatCompactTimerDuration,
    formatTimerDuration,
    formatSiblingDueDate
  }: IRCalendarMaterialListProps = $props();

  function isAutoSubscribedNew(material: { autoSubscribedAt?: string; autoSubscribedBadgeUntil?: string }): boolean {
    const badgeUntil = Date.parse(String(material.autoSubscribedBadgeUntil || ''));
    if (Number.isFinite(badgeUntil)) {
      return badgeUntil > Date.now();
    }
    const autoSubscribedAt = Date.parse(String(material.autoSubscribedAt || ''));
    if (!Number.isFinite(autoSubscribedAt)) {
      return false;
    }
    return Date.now() - autoSubscribedAt <= 3 * 24 * 60 * 60 * 1000;
  }
</script>

{#each displayedMaterials as material, index}
  {@const priority = material.priority || 0}
  {@const priorityClass = priority >= 8 ? 'high' : priority >= 4 ? 'medium' : 'low'}
  {@const isExpanded = expandedMaterialIds.has(material.id)}
  {@const isLoadingSibling = loadingSiblings.has(material.id)}
  {@const siblings = siblingCache.get(material.id) || []}
  {@const searchDateLabel = hasActiveSearch ? getDisplayedMaterialDateLabel(material.id, displayedMaterialDateKeys) : ''}
  {@const searchDeckLabel = hasActiveSearch ? getScheduleItemDeckName(material) : ''}
  <div class="reading-item-wrapper">
    <div class="reading-item">
      {#if continuousReadingEnabled}
        <button
          class="expand-btn"
          class:expanded={isExpanded}
          class:loading={isLoadingSibling}
          aria-label={getMaterialExpandButtonLabel(isExpanded)}
          onclick={() => void toggleMaterialExpand(material)}
        >
          {#if isLoadingSibling}
            <ObsidianIcon name="loader" size={12} />
          {:else}
            <ObsidianIcon name="chevron-right" size={12} />
          {/if}
        </button>
      {/if}
      <div class="reading-item-content">
        <button
          class="reading-item-main"
          onclick={() => handleMaterialClick(material)}
          oncontextmenu={(event) => handleMaterialContextMenu(event, event.currentTarget as unknown as HTMLElement, material)}
          onpointerdown={(event) => handleLongPressStart(event, event.currentTarget as unknown as HTMLElement, material)}
          onpointermove={handleLongPressMove}
          onpointerup={handleLongPressEnd}
          onpointercancel={handleLongPressEnd}
        >
          <span class="item-rank" class:top={index < 3}>{index + 1}</span>
          <span class="item-text">
            <span class="item-text-content">
              <span class="item-title-row">
                <span class="item-title" class:processed={processedChunkIds.has(material.id)}>{material.displayName || material.title || t('irSidebar.controls.untitled')}</span>
                {#if isAutoSubscribedNew(material)}
                  <span class="item-new-badge">{t('irSidebar.controls.newBadge')}</span>
                {/if}
              </span>
              {#if hasActiveSearch && (searchDateLabel || searchDeckLabel)}
                <span class="item-search-meta">
                  {#if searchDateLabel}
                    <span class="item-search-meta-chip">{searchDateLabel}</span>
                  {/if}
                  {#if searchDeckLabel}
                    <span class="item-search-meta-chip">{searchDeckLabel}</span>
                  {/if}
                </span>
              {/if}
            </span>
          </span>
        </button>
      </div>
      <div class="reading-item-controls">
        <button
          class="schedule-checkbox"
          aria-label={t('irSidebar.controls.schedule')}
          onclick={(event) => openSchedulingMenu(event, material)}
        >
          <span class="checkbox-box" class:checked={processedChunkIds.has(material.id)} aria-hidden="true"></span>
        </button>
        {#if hasVisibleAssociatedNote(material)}
          <button
            type="button"
            class="associated-note-link"
            aria-label={getAssociatedNoteActionLabel(material)}
            title={getAssociatedNoteActionTooltip(material)}
            oncontextmenu={(event) => handleMaterialContextMenu(event, event.currentTarget as HTMLElement, material)}
            onclick={(event) => handleAssociatedNoteClick(event, material)}
          >
            <span>{t('irSidebar.associatedNote.badge')}</span>
          </button>
        {/if}
        <button
          class="reading-timer-btn"
          class:active={isTimerRunningForBlock(material.id)}
          class:tracked={!isTimerRunningForBlock(material.id) && getDisplayedTimerSeconds(material.id) > 0}
          aria-label={isTimerRunningForBlock(material.id) ? t('irSidebar.controls.pauseReadingTimer') : t('irSidebar.controls.startTimer')}
          title={getReadingTimerButtonTitle(material.id)}
          disabled={timerBusyBlockId === material.id}
          onclick={() => {
            void toggleReadingTimer(material);
          }}
        >
          <ObsidianIcon name={isTimerRunningForBlock(material.id) ? 'pause' : 'timer'} size={12} />
        </button>
        {#if getDisplayedTimerSeconds(material.id) > 0}
          <span
            class="reading-timer-chip"
            class:active={isTimerRunningForBlock(material.id)}
            class:tracked={!isTimerRunningForBlock(material.id)}
            title={t('irSidebar.controls.recordedDuration', { duration: formatTimerDuration(getDisplayedTimerSeconds(material.id)) })}
          >
            {formatCompactTimerDuration(getDisplayedTimerSeconds(material.id))}
          </span>
        {/if}
        <span class="priority-badge {priorityClass}">P{priority}</span>
      </div>
    </div>
    {#if continuousReadingEnabled && isExpanded && siblings.length > 0}
      <div class="sibling-list">
        {#each siblings as sibling}
          {@const siblingPriority = sibling.priority || 0}
          {@const siblingPriorityClass = siblingPriority >= 8 ? 'high' : siblingPriority >= 4 ? 'medium' : 'low'}
          {@const dueText = sibling.nextRepDate > 0 ? formatSiblingDueDate(sibling.nextRepDate) : t('irSidebar.controls.unscheduled')}
          <div class="sibling-item">
            <div class="sibling-item-content">
              <button
                class="sibling-item-main"
                onclick={() => {
                  void openMaterial(sibling);
                }}
                oncontextmenu={(event) => handleMaterialContextMenu(event, event.currentTarget as unknown as HTMLElement, sibling)}
                onpointerdown={(event) => handleLongPressStart(event, event.currentTarget as unknown as HTMLElement, sibling)}
                onpointermove={handleLongPressMove}
                onpointerup={handleLongPressEnd}
                onpointercancel={handleLongPressEnd}
                title={sibling.title || sibling.id}
              >
                <span class="sibling-title-row">
                  <span class="sibling-title">{sibling.displayName || sibling.title || sibling.id}</span>
                  {#if isAutoSubscribedNew(sibling)}
                    <span class="item-new-badge">{t('irSidebar.controls.newBadge')}</span>
                  {/if}
                </span>
                <span class="sibling-due">{dueText}</span>
              </button>
            </div>
            <div class="reading-item-controls">
              <button
                class="schedule-checkbox"
                aria-label={t('irSidebar.controls.schedule')}
                onclick={(event) => openSchedulingMenu(event, sibling)}
              >
                <span class="checkbox-box" class:checked={processedChunkIds.has(sibling.id)} aria-hidden="true"></span>
              </button>
              {#if hasVisibleAssociatedNote(sibling)}
                <button
                  type="button"
                  class="associated-note-link sibling-associated-note-link"
                  aria-label={getAssociatedNoteActionLabel(sibling)}
                  title={getAssociatedNoteActionTooltip(sibling)}
                  oncontextmenu={(event) => handleMaterialContextMenu(event, event.currentTarget as HTMLElement, sibling)}
                  onclick={(event) => handleAssociatedNoteClick(event, sibling)}
                >
                  <span>{t('irSidebar.associatedNote.badge')}</span>
                </button>
              {/if}
              <button
                class="reading-timer-btn"
                class:active={isTimerRunningForBlock(sibling.id)}
                class:tracked={!isTimerRunningForBlock(sibling.id) && getDisplayedTimerSeconds(sibling.id) > 0}
                aria-label={isTimerRunningForBlock(sibling.id) ? t('irSidebar.controls.pauseReadingTimer') : t('irSidebar.controls.startTimer')}
                title={getReadingTimerButtonTitle(sibling.id)}
                disabled={timerBusyBlockId === sibling.id}
                onclick={() => {
                  void toggleReadingTimer(sibling);
                }}
              >
                <ObsidianIcon name={isTimerRunningForBlock(sibling.id) ? 'pause' : 'timer'} size={12} />
              </button>
              {#if getDisplayedTimerSeconds(sibling.id) > 0}
                <span
                  class="reading-timer-chip"
                  class:active={isTimerRunningForBlock(sibling.id)}
                  class:tracked={!isTimerRunningForBlock(sibling.id)}
                  title={t('irSidebar.controls.recordedDuration', { duration: formatTimerDuration(getDisplayedTimerSeconds(sibling.id)) })}
                >
                  {formatCompactTimerDuration(getDisplayedTimerSeconds(sibling.id))}
                </span>
              {/if}
              <span class="priority-badge {siblingPriorityClass}">P{siblingPriority}</span>
            </div>
          </div>
        {/each}
      </div>
    {:else if continuousReadingEnabled && isExpanded && siblings.length === 0}
      <div class="sibling-list">
        <div class="sibling-empty">{t('irSidebar.controls.siblingNone')}</div>
      </div>
    {/if}
  </div>
{/each}

<style>
  .reading-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 4px;
    background: none;
    border: none;
    border-radius: 0;
    box-shadow: none;
    outline: none;
    text-align: left;
    width: 100%;
  }

  .reading-item:hover {
    background: var(--background-modifier-hover);
  }

  .reading-item-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .reading-item-main {
    display: flex;
    align-items: center;
    gap: 8px;
    border: none;
    background: none;
    box-shadow: none;
    outline: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
    width: 100%;
    min-width: 0;
  }

  .reading-item-main:focus-visible {
    outline: 2px solid var(--interactive-accent);
    outline-offset: 2px;
    border-radius: 6px;
  }

  .item-text {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
  }

  .item-text-content {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    width: 100%;
  }

  .item-title-row,
  .sibling-title-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .item-search-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    min-width: 0;
  }

  .item-search-meta-chip {
    display: inline-flex;
    align-items: center;
    padding: 1px 6px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--background-modifier-border) 48%, transparent);
    color: var(--text-muted);
    font-size: 10px;
    line-height: 1.4;
    white-space: nowrap;
  }

  .reading-item-controls {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    flex-shrink: 0;
  }

  .associated-note-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 34px;
    height: 18px;
    padding: 0 6px;
    border: 1px solid color-mix(in srgb, var(--interactive-accent) 38%, var(--background-modifier-border));
    border-radius: 6px;
    background: color-mix(in srgb, var(--interactive-accent) 12%, var(--weave-ir-sidebar-surface-background));
    box-shadow: none;
    color: var(--interactive-accent);
    cursor: pointer;
    font-size: 10px;
    line-height: 1;
    flex-shrink: 0;
  }

  .associated-note-link:hover {
    color: var(--interactive-accent);
    border-color: var(--interactive-accent);
    background: color-mix(in srgb, var(--interactive-accent) 18%, var(--weave-ir-sidebar-surface-background));
  }

  .associated-note-link:focus-visible {
    outline: 2px solid var(--interactive-accent);
    outline-offset: 2px;
    border-radius: 4px;
  }

  .associated-note-link span {
    display: block;
    white-space: nowrap;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .schedule-checkbox {
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .schedule-checkbox:hover .checkbox-box {
    border-color: color-mix(in srgb, var(--interactive-accent) 50%, var(--background-modifier-border));
  }

  .schedule-checkbox:focus-visible {
    outline: 2px solid var(--interactive-accent);
    outline-offset: 2px;
    border-radius: 4px;
  }

  .checkbox-box {
    width: 14px;
    height: 14px;
    border-radius: 3px;
    border: 1px solid var(--background-modifier-border);
    background: transparent;
    position: relative;
  }

  .checkbox-box.checked {
    border-color: var(--interactive-accent);
    background: color-mix(in srgb, var(--interactive-accent) 25%, var(--weave-ir-sidebar-elevated-background));
  }

  .checkbox-box.checked::after {
    content: '';
    position: absolute;
    left: 4px;
    top: 1px;
    width: 4px;
    height: 8px;
    border-right: 2px solid var(--interactive-accent);
    border-bottom: 2px solid var(--interactive-accent);
    transform: rotate(45deg);
  }

  .reading-timer-btn {
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--text-faint);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.15s ease;
  }

  .reading-timer-btn:hover:not(:disabled) {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
  }

  .reading-timer-btn.tracked {
    color: var(--interactive-accent);
  }

  .reading-timer-btn.active {
    color: var(--color-red);
    background: color-mix(in srgb, var(--color-red) 14%, transparent);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-red) 20%, transparent);
  }

  .reading-timer-btn:disabled {
    opacity: 0.55;
    cursor: wait;
  }

  .reading-timer-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 42px;
    padding: 1px 6px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--background-modifier-border) 85%, transparent);
    background: color-mix(in srgb, var(--weave-ir-sidebar-elevated-background) 92%, transparent);
    color: var(--text-muted);
    font-size: 10px;
    font-weight: 600;
    line-height: 1.4;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  .reading-timer-chip.tracked {
    color: var(--interactive-accent);
    border-color: color-mix(in srgb, var(--interactive-accent) 32%, var(--background-modifier-border));
    background: color-mix(in srgb, var(--interactive-accent) 9%, var(--weave-ir-sidebar-surface-background));
  }

  .reading-timer-chip.active {
    color: var(--color-red);
    border-color: color-mix(in srgb, var(--color-red) 35%, var(--background-modifier-border));
    background: color-mix(in srgb, var(--color-red) 10%, var(--weave-ir-sidebar-surface-background));
  }

  .item-rank {
    width: 18px;
    height: 18px;
    font-size: 10px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--background-modifier-border);
    border-radius: 4px;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .item-rank.top {
    background: var(--color-orange);
    color: white;
  }

  .item-title {
    flex: 1;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-normal);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .item-title.processed {
    text-decoration: line-through;
    color: var(--text-muted);
  }

  .item-new-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    height: 16px;
    padding: 0 6px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--interactive-accent) 14%, var(--background-secondary));
    color: var(--interactive-accent);
    font-size: 10px;
    font-weight: 600;
    line-height: 1;
    flex-shrink: 0;
  }

  .priority-badge {
    padding: 2px 6px;
    font-size: 10px;
    font-weight: 600;
    border-radius: 8px;
    flex-shrink: 0;
  }

  .priority-badge.high {
    background: rgba(var(--color-red-rgb), 0.15);
    color: var(--color-red);
  }

  .priority-badge.medium {
    background: rgba(var(--color-yellow-rgb), 0.15);
    color: var(--color-yellow);
  }

  .priority-badge.low {
    background: rgba(var(--color-green-rgb), 0.15);
    color: var(--color-green);
  }

  .expand-btn {
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border-radius: 3px;
    transition: transform 0.15s ease, color 0.15s ease;
  }

  .expand-btn:hover {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
  }

  .expand-btn.expanded {
    transform: rotate(90deg);
  }

  .expand-btn.loading {
    transform: none;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .reading-item-wrapper {
    display: flex;
    flex-direction: column;
    background: none;
    border: none;
    box-shadow: none;
    outline: none;
  }

  .sibling-list {
    margin-left: 26px;
    padding-left: 10px;
    border-left: 1px solid var(--background-modifier-border);
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 2px;
    margin-bottom: 4px;
  }

  .sibling-item {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 6px;
    border: none;
    border-radius: 0;
    box-shadow: none;
    outline: none;
    background: none;
  }

  .sibling-item:hover {
    background: var(--background-modifier-hover);
  }

  .sibling-item-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .sibling-item-main {
    display: flex;
    align-items: center;
    gap: 6px;
    border: none;
    background: none;
    box-shadow: none;
    outline: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
    flex: 1;
    min-width: 0;
  }

  .sibling-associated-note-link {
    min-width: 34px;
  }

  .sibling-title {
    flex: 1;
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .sibling-due {
    font-size: 10px;
    color: var(--text-faint);
    flex-shrink: 0;
    margin-left: 4px;
  }

  .sibling-empty {
    font-size: 11px;
    color: var(--text-faint);
    padding: 4px 0;
  }
</style>
