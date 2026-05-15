<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';

  export interface IRContinueReadingSuggestionModalItem {
    id: string;
    title: string;
    metaText: string;
    contextLabel?: string;
    priorityLabel?: string;
    kind: 'scheduled' | 'suspended';
  }

  type ContinueReadingTab = 'suggested' | 'suspended';

  interface Props {
    suggestions?: IRContinueReadingSuggestionModalItem[];
    suspendedItems?: IRContinueReadingSuggestionModalItem[];
    isChineseUi?: boolean;
    anchorElement?: HTMLElement | null;
    onOpenSuggestion?: (id: string) => void | Promise<void>;
    onAddSuggestion?: (id: string) => void | Promise<void>;
    onClose?: () => void;
  }

  let {
    suggestions = [],
    suspendedItems = [],
    isChineseUi = true,
    anchorElement = null,
    onOpenSuggestion,
    onAddSuggestion,
    onClose
  }: Props = $props();

  let activeTab = $state<ContinueReadingTab>(untrack(() => suggestions.length > 0 ? 'suggested' : 'suspended'));
  let busySuggestionId = $state('');
  let modalEl: HTMLDivElement | null = $state(null);
  let left = $state(-9999);
  let top = $state(-9999);
  let maxHeightPx = $state(560);

  const visibleItems = $derived(activeTab === 'suggested' ? suggestions : suspendedItems);
  const suggestedCount = $derived(suggestions.length);
  const suspendedCount = $derived(suspendedItems.length);

  function uiText(zh: string, en: string): string {
    return isChineseUi ? zh : en;
  }

  function isBusy(id: string): boolean {
    return busySuggestionId === id;
  }

  function handleClose(): void {
    onClose?.();
  }

  function isTabDisabled(tab: ContinueReadingTab): boolean {
    return tab === 'suggested' ? suggestions.length === 0 : suspendedItems.length === 0;
  }

  function getCurrentCopy(): string {
    if (activeTab === 'suspended') {
      return uiText(
        '这些阅读点当前处于搁置状态。点击右侧加号后，会恢复到今天并自动清理搁置标记。',
        'These reading points are suspended right now. Press + to restore them to today and clear suspended markers.'
      );
    }

    return uiText(
      '今天的计划已经完成。如果你还想继续读，可以从下面这些最合适的阅读点继续推进。',
      'Today is complete. If you want to keep going, these are the best next reading points.'
    );
  }

  function getAddButtonLabel(item: IRContinueReadingSuggestionModalItem): string {
    return item.kind === 'suspended'
      ? uiText(`恢复 ${item.title} 到今天`, `Restore ${item.title} to today`)
      : uiText(`把 ${item.title} 加到今天`, `Add ${item.title} to today`);
  }

  async function handleOpenSuggestion(id: string): Promise<void> {
    await onOpenSuggestion?.(id);
  }

  async function handleAddSuggestion(id: string): Promise<void> {
    if (!onAddSuggestion || busySuggestionId) {
      return;
    }

    busySuggestionId = id;
    try {
      await onAddSuggestion(id);
    } finally {
      if (busySuggestionId === id) {
        busySuggestionId = '';
      }
    }
  }

  async function updatePosition(): Promise<void> {
    await tick();
    if (!modalEl) {
      return;
    }

    const rect = modalEl.getBoundingClientRect();
    const margin = 12;
    const anchorGap = 10;
    const anchorRect = anchorElement?.isConnected
      ? anchorElement.getBoundingClientRect()
      : null;

    if (anchorElement && !anchorRect) {
      handleClose();
      return;
    }

    let desiredLeft = (window.innerWidth - rect.width) / 2;
    let desiredTop = Math.max(56, window.innerHeight * 0.14);

    if (anchorRect) {
      const alignToButton = anchorRect.width <= 120;
      desiredLeft = alignToButton
        ? anchorRect.right - rect.width
        : anchorRect.left + 12;

      const belowTop = anchorRect.bottom + anchorGap;
      const aboveTop = anchorRect.top - rect.height - anchorGap;
      const hasRoomBelow = belowTop + rect.height <= window.innerHeight - margin;
      const hasRoomAbove = aboveTop >= margin;

      if (hasRoomBelow || !hasRoomAbove) {
        desiredTop = belowTop;
      } else {
        desiredTop = aboveTop;
      }
    }

    left = Math.max(margin, Math.min(desiredLeft, window.innerWidth - rect.width - margin));
    top = Math.max(margin, Math.min(desiredTop, window.innerHeight - rect.height - margin));
    maxHeightPx = Math.max(320, window.innerHeight - top - margin);
  }

  $effect(() => {
    if (activeTab === 'suggested' && suggestions.length === 0 && suspendedItems.length > 0) {
      activeTab = 'suspended';
    } else if (activeTab === 'suspended' && suspendedItems.length === 0 && suggestions.length > 0) {
      activeTab = 'suggested';
    }
  });

  $effect(() => {
    suggestions.length;
    suspendedItems.length;
    anchorElement;
    void updatePosition();
  });

  onMount(() => {
    void updatePosition();

    const onPointerDown = (event: PointerEvent) => {
      if (!modalEl) {
        return;
      }
      if (!modalEl.contains(event.target as Node)) {
        handleClose();
      }
    };

    const onWindowMove = () => {
      void updatePosition();
    };

    let resizeObserver: ResizeObserver | null = null;
    if (anchorElement && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        void updatePosition();
      });
      resizeObserver.observe(anchorElement);
    }

    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('resize', onWindowMove);
    window.addEventListener('scroll', onWindowMove, true);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', onWindowMove);
      window.removeEventListener('scroll', onWindowMove, true);
      resizeObserver?.disconnect();
    };
  });
</script>

<div
  class="weave-ir-continue-reading-modal-shell"
  role="dialog"
  aria-modal="false"
  aria-label={uiText('继续阅读建议', 'Continue reading suggestions')}
  bind:this={modalEl}
  style={`left: ${left}px; top: ${top}px; max-height: ${maxHeightPx}px;`}
>
  <div class="weave-ir-continue-reading-modal__header">
    <div class="weave-ir-continue-reading-modal__header-copy">
      <span class="weave-ir-continue-reading-modal__kicker">
        {uiText('继续阅读建议', 'Continue Reading')}
      </span>
      <p class="weave-ir-continue-reading-modal__copy">
        {getCurrentCopy()}
      </p>
    </div>

    <button
      type="button"
      class="weave-ir-continue-reading-modal__close"
      aria-label={uiText('关闭继续阅读建议', 'Close continue reading suggestions')}
      title={uiText('关闭', 'Close')}
      onclick={handleClose}
    >
      <ObsidianIcon name="x" size={16} />
    </button>
  </div>

  <div class="weave-ir-continue-reading-modal__tabs" role="tablist">
    <button
      type="button"
      class="weave-ir-continue-reading-modal__tab"
      class:is-active={activeTab === 'suggested'}
      role="tab"
      aria-selected={activeTab === 'suggested'}
      disabled={isTabDisabled('suggested')}
      onclick={() => { activeTab = 'suggested'; }}
    >
      <span>{uiText('继续阅读', 'Suggested')}</span>
      <span class="weave-ir-continue-reading-modal__tab-count">{suggestedCount}</span>
    </button>

    <button
      type="button"
      class="weave-ir-continue-reading-modal__tab"
      class:is-active={activeTab === 'suspended'}
      role="tab"
      aria-selected={activeTab === 'suspended'}
      disabled={isTabDisabled('suspended')}
      onclick={() => { activeTab = 'suspended'; }}
    >
      <span>{uiText('已搁置', 'Suspended')}</span>
      <span class="weave-ir-continue-reading-modal__tab-count">{suspendedCount}</span>
    </button>
  </div>

  {#if visibleItems.length > 0}
    <div class="weave-ir-continue-reading-modal__list">
      {#each visibleItems as suggestion}
        <div class="weave-ir-continue-reading-modal__item">
          <div class="weave-ir-continue-reading-modal__row">
            <button
              type="button"
              class="weave-ir-continue-reading-modal__main"
              onclick={() => void handleOpenSuggestion(suggestion.id)}
              title={suggestion.title}
            >
              <span class="weave-ir-continue-reading-modal__title">
                {suggestion.title}
              </span>
            </button>

            <div class="weave-ir-continue-reading-modal__actions">
              {#if suggestion.contextLabel}
                <span class="weave-ir-continue-reading-modal__context">
                  {suggestion.contextLabel}
                </span>
              {/if}

              {#if suggestion.priorityLabel}
                <span class="weave-ir-continue-reading-modal__priority">
                  {suggestion.priorityLabel}
                </span>
              {/if}

              <button
                type="button"
                class="weave-ir-continue-reading-modal__add"
                aria-label={getAddButtonLabel(suggestion)}
                title={getAddButtonLabel(suggestion)}
                disabled={isBusy(suggestion.id)}
                onclick={() => void handleAddSuggestion(suggestion.id)}
              >
                {#if isBusy(suggestion.id)}
                  <ObsidianIcon name="loader" size={14} />
                {:else}
                  <span aria-hidden="true">+</span>
                {/if}
              </button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="weave-ir-continue-reading-modal__empty">
      <ObsidianIcon name="inbox" size={18} />
      <span>
        {activeTab === 'suspended'
          ? uiText('当前没有可恢复的搁置阅读点。', 'No suspended reading points to restore right now.')
          : uiText('当前没有可推荐的继续阅读项。', 'No follow-up suggestions right now.')}
      </span>
    </div>
  {/if}
</div>

<style>
  .weave-ir-continue-reading-modal-shell {
    position: fixed;
    z-index: var(--weave-z-modal, 2200);
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: min(640px, calc(100vw - 24px));
    min-width: min(460px, calc(100vw - 24px));
    max-width: calc(100vw - 24px);
    padding: 18px;
    border: 1px solid color-mix(in srgb, var(--interactive-accent) 16%, var(--background-modifier-border));
    border-radius: 18px;
    background: color-mix(in srgb, var(--background-primary) 94%, var(--background-secondary));
    box-shadow:
      0 18px 54px color-mix(in srgb, var(--background-primary) 48%, transparent),
      0 2px 10px color-mix(in srgb, var(--background-primary) 22%, transparent);
    backdrop-filter: blur(10px);
    overflow: hidden;
  }

  .weave-ir-continue-reading-modal__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .weave-ir-continue-reading-modal__header-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .weave-ir-continue-reading-modal__kicker {
    font-size: 12px;
    font-weight: 700;
    line-height: 1.3;
    color: var(--interactive-accent);
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .weave-ir-continue-reading-modal__copy {
    margin: 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--text-muted);
  }

  .weave-ir-continue-reading-modal__close {
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border: 1px solid var(--background-modifier-border);
    border-radius: 999px;
    background: var(--background-secondary);
    color: var(--text-muted);
    cursor: pointer;
    box-shadow: none;
  }

  .weave-ir-continue-reading-modal__row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
  }

  .weave-ir-continue-reading-modal__tabs {
    display: inline-flex;
    gap: 6px;
    padding: 4px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--background-secondary) 92%, var(--background-modifier-border));
  }

  .weave-ir-continue-reading-modal__tab {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 9px 14px;
    border: none;
    border-radius: 999px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
    box-shadow: none;
  }

  .weave-ir-continue-reading-modal__tab.is-active {
    background: var(--background-primary);
    color: var(--text-normal);
    box-shadow: var(--shadow-xs);
  }

  .weave-ir-continue-reading-modal__tab:disabled {
    opacity: 0.56;
    cursor: default;
  }

  .weave-ir-continue-reading-modal__tab-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--interactive-accent) 12%, var(--background-secondary));
    color: inherit;
    font-size: 11px;
    font-weight: 700;
  }

  .weave-ir-continue-reading-modal__list {
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-right: 2px;
  }

  .weave-ir-continue-reading-modal__item {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    padding: 14px 15px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 16px;
    background: color-mix(in srgb, var(--background-secondary) 82%, var(--background-primary));
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      transform 0.15s ease;
  }

  .weave-ir-continue-reading-modal__item:hover,
  .weave-ir-continue-reading-modal__item:focus-within {
    border-color: color-mix(in srgb, var(--interactive-accent) 28%, var(--background-modifier-border));
    background: color-mix(in srgb, var(--interactive-accent) 6%, var(--background-secondary));
  }

  .weave-ir-continue-reading-modal__main {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    padding: 0;
    border: none;
    border-radius: 0;
    background: transparent;
    color: var(--text-normal);
    text-align: left;
    cursor: pointer;
    box-shadow: none;
  }

  .weave-ir-continue-reading-modal__main:hover {
    background: transparent;
  }

  .weave-ir-continue-reading-modal__main:focus-visible,
  .weave-ir-continue-reading-modal__add:focus-visible,
  .weave-ir-continue-reading-modal__tab:focus-visible,
  .weave-ir-continue-reading-modal__close:focus-visible {
    outline: 2px solid var(--interactive-accent);
    outline-offset: 2px;
  }

  .weave-ir-continue-reading-modal__title {
    display: -webkit-box;
    width: 100%;
    overflow: hidden;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    font-size: 14px;
    font-weight: 650;
    line-height: 1.5;
    color: var(--text-normal);
    white-space: normal;
    word-break: break-word;
  }

  .weave-ir-continue-reading-modal__actions {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .weave-ir-continue-reading-modal__context {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    height: 22px;
    padding: 0 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--background-secondary) 92%, var(--background-modifier-border));
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
  }

  .weave-ir-continue-reading-modal__priority {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 34px;
    height: 22px;
    padding: 0 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--interactive-accent) 10%, var(--background-secondary));
    color: var(--interactive-accent);
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
  }

  .weave-ir-continue-reading-modal__add {
    width: 36px;
    height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid color-mix(in srgb, var(--interactive-accent) 38%, var(--background-modifier-border));
    border-radius: 999px;
    background: color-mix(in srgb, var(--interactive-accent) 10%, var(--background-primary));
    color: var(--interactive-accent);
    cursor: pointer;
    box-shadow: none;
    font-size: 18px;
    font-weight: 700;
    line-height: 1;
  }

  .weave-ir-continue-reading-modal__add:hover:not(:disabled) {
    border-color: var(--interactive-accent);
    background: color-mix(in srgb, var(--interactive-accent) 18%, var(--background-primary));
  }

  .weave-ir-continue-reading-modal__add:disabled {
    cursor: wait;
    opacity: 0.72;
  }

  .weave-ir-continue-reading-modal__empty {
    min-height: 220px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--text-muted);
    font-size: 12px;
    text-align: center;
  }

  @media (max-width: 720px) {
    .weave-ir-continue-reading-modal-shell {
      min-width: calc(100vw - 24px);
      padding: 16px;
    }

    .weave-ir-continue-reading-modal__row {
      flex-direction: column;
      align-items: stretch;
    }

    .weave-ir-continue-reading-modal__actions {
      justify-content: space-between;
    }

    .weave-ir-continue-reading-modal__priority {
      order: 1;
    }
  }
</style>
