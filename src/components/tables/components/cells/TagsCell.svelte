<script lang="ts">
  import EnhancedIcon from "../../../ui/EnhancedIcon.svelte";
  import { tr } from "../../../../utils/i18n";
  import {
    formatTagSuggestionLabel,
    normalizeTagSuggestionOptions,
    TagInputSuggest,
    type TagSuggestionItem,
  } from "../../../../utils/tag-suggest";
  import type { TagsCellProps } from "../../types/table-types";

  let { app, card, onTagsUpdate, availableTags = [] }: TagsCellProps = $props();
  let t = $derived($tr);

  const colorPalette = [
    'var(--color-cyan, var(--interactive-accent))',
    'var(--color-green, var(--interactive-accent))',
    'var(--color-purple, var(--interactive-accent))',
    'var(--color-orange, var(--interactive-accent))',
    'var(--color-pink, var(--interactive-accent))',
    'var(--color-blue, var(--interactive-accent))',
    'var(--color-red, var(--interactive-accent))',
    'var(--color-yellow, var(--interactive-accent))'
  ];

  let isEditing = $state(false);
  let draftTags = $state<string[]>([]);
  let inputValue = $state('');
  let containerEl: HTMLDivElement | null = $state(null);
  let inputEl: HTMLInputElement | null = $state(null);
  let tagSuggest: TagInputSuggest | null = $state(null);
  let optimisticTags = $state<string[] | null>(null);
  let lastSeenPropTagSignature = $state<string | null>(null);

  function getCardTags(): string[] {
    return Array.isArray(card.tags)
      ? card.tags.filter((tag): tag is string => typeof tag === 'string' && !!tag.trim())
      : [];
  }

  function getTagSignature(tags: string[]): string {
    return tags
      .map((tag) => normalizeTagName(tag).toLowerCase())
      .filter(Boolean)
      .join('\u0000');
  }

  let propTags = $derived.by(() => getCardTags());
  let propTagSignature = $derived.by(() => getTagSignature(propTags));
  let displayTags = $derived.by(() => optimisticTags ?? propTags);
  let activeTags = $derived(isEditing ? draftTags : displayTags);
  let visibleDisplayTags = $derived(displayTags.slice(0, 3));
  let hiddenDisplayTagCount = $derived(Math.max(0, displayTags.length - visibleDisplayTags.length));

  function normalizeTagName(tag: string): string {
    return tag.trim().replace(/^#/, '');
  }

  let normalizedAvailableTags = $derived.by(() => {
    return normalizeTagSuggestionOptions(availableTags || []);
  });

  let availableSuggestionRows = $derived.by(() => {
    const selectedKeys = new Set(
      draftTags.map((tag) => normalizeTagName(tag).toLowerCase()).filter(Boolean)
    );

    return normalizedAvailableTags
      .filter((suggestion) => !selectedKeys.has(suggestion.key));
  });

  function getTagColorIndex(tag: string): number {
    let hash = 0;
    for (let i = 0; i < tag.length; i += 1) {
      hash = ((hash << 5) - hash) + tag.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) % colorPalette.length;
  }

  function getTagStyle(tag: string): string {
    const tone = colorPalette[getTagColorIndex(tag)];
    const background = `color-mix(in srgb, ${tone} 18%, var(--weave-table-page-bg, var(--background-primary)))`;
    const color = `color-mix(in srgb, ${tone} 72%, var(--text-normal))`;
    const border = `color-mix(in srgb, ${tone} 36%, var(--background-modifier-border))`;
    return `background:${background};color:${color};border-color:${border};`;
  }

  function focusInput(shouldRefreshSuggestions = false) {
    requestAnimationFrame(() => {
      inputEl?.focus();
      if (shouldRefreshSuggestions) {
        requestAnimationFrame(() => {
          inputEl?.dispatchEvent(new Event('input', { bubbles: true }));
        });
      }
    });
  }

  function isolateCellInteraction(event?: Event) {
    if (!event) return;
    event.cancelBubble = true;
  }

  function beginEditing(event?: MouseEvent | KeyboardEvent) {
    isolateCellInteraction(event);
    if (!onTagsUpdate) return;

    draftTags = [...displayTags];
    inputValue = '';
    isEditing = true;
    focusInput(true);
  }

  function finishEditing() {
    tagSuggest?.close();
    isEditing = false;
    inputValue = '';
  }

  function syncTags(newTags: string[]) {
    const nextTags = [...newTags];
    draftTags = nextTags;
    optimisticTags = nextTags;
    onTagsUpdate?.(card.uuid, nextTags);
  }

  function addTag(tag: string, refocus = true) {
    const normalized = normalizeTagName(tag);
    if (!normalized) return;

    const exists = draftTags.some(
      (item) => normalizeTagName(item).toLowerCase() === normalized.toLowerCase()
    );
    if (exists) {
      inputValue = '';
      return;
    }

    syncTags([...draftTags, normalized]);
    inputValue = '';
    if (refocus) {
      focusInput(true);
    }
  }

  function removeTag(tag: string) {
    const normalized = normalizeTagName(tag).toLowerCase();
    syncTags(draftTags.filter((item) => normalizeTagName(item).toLowerCase() !== normalized));
    focusInput(true);
  }

  function buildCreateSuggestion(query: string): TagSuggestionItem | null {
    const normalized = normalizeTagName(query);
    if (!normalized) {
      return null;
    }

    const key = normalized.toLowerCase();
    const existsInDraft = draftTags.some((tag) => normalizeTagName(tag).toLowerCase() === key);
    const existsInAvailable = normalizedAvailableTags.some((item) => item.key === key);

    if (existsInDraft || existsInAvailable) {
      return null;
    }

    return {
      key,
      tag: normalized,
      label: `${t('cardManagement.table.tags.create')} ${formatTagSuggestionLabel(normalized)}`,
      count: 0,
      keywords: [normalized, formatTagSuggestionLabel(normalized), t('cardManagement.table.tags.create')],
      searchText: [normalized, formatTagSuggestionLabel(normalized), t('cardManagement.table.tags.create')]
        .map((value) => value.toLowerCase())
        .join(' '),
      isCreateSuggestion: true,
    };
  }

  function isEventInsideTagSuggest(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    return Boolean(target.closest('.suggestion-container'));
  }

  function handleKeydown(event: KeyboardEvent) {
    isolateCellInteraction(event);

    if (event.key === 'Enter') {
      event.preventDefault();
      const normalized = normalizeTagName(inputValue);
      if (normalized) {
        addTag(normalized);
        return;
      }
      finishEditing();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      finishEditing();
      return;
    }

    if (event.key === 'Backspace' && !inputValue && draftTags.length > 0) {
      event.preventDefault();
      syncTags(draftTags.slice(0, -1));
      focusInput(true);
    }
  }

  $effect(() => {
    const currentSignature = propTagSignature;

    if (lastSeenPropTagSignature === null) {
      lastSeenPropTagSignature = currentSignature;
      return;
    }

    if (currentSignature !== lastSeenPropTagSignature) {
      lastSeenPropTagSignature = currentSignature;
      optimisticTags = null;
    }
  });

  $effect(() => {
    if (!app || !inputEl || !isEditing) {
      tagSuggest?.destroy();
      tagSuggest = null;
      return;
    }

    const suggest = new TagInputSuggest(app, inputEl, {
      getItems: () => availableSuggestionRows,
      getQuery: () => inputValue,
      isActive: () => isEditing,
      onSelectTag: (tag) => addTag(tag),
      createSuggestion: (query) => buildCreateSuggestion(query),
      limit: 40,
    });

    tagSuggest = suggest;

    return () => {
      suggest.destroy();
      if (tagSuggest === suggest) {
        tagSuggest = null;
      }
    };
  });

  $effect(() => {
    if (!isEditing || !containerEl) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (isEventInsideTagSuggest(event.target)) {
        return;
      }
      if (containerEl && !containerEl.contains(event.target as Node)) {
        finishEditing();
      }
    };

    setTimeout(() => {
      activeDocument.addEventListener('mousedown', handlePointerDown);
    }, 0);

    return () => {
      activeDocument.removeEventListener('mousedown', handlePointerDown);
    };
  });
</script>

<td class="weave-tags-column">
  <div
    class="weave-tags-cell"
    class:is-editing={isEditing}
    bind:this={containerEl}
    onclick={(event) => {
      isolateCellInteraction(event);
      if (!isEditing) {
        beginEditing(event);
        return;
      }
      focusInput(true);
    }}
    onkeydown={(event) => {
      if ((event.key === 'Enter' || event.key === ' ') && !isEditing) {
        event.preventDefault();
        beginEditing(event);
      }
    }}
    role="button"
    tabindex="0"
    aria-label={t('cardManagement.table.tags.edit')}
  >
    <div class="weave-tags-flow">
      {#if displayTags.length > 0}
        {#each isEditing ? activeTags : visibleDisplayTags as tag (tag)}
          <span class="weave-tag-pill" style={getTagStyle(tag)}>
            <span class="weave-tag-label" title={tag}>{tag}</span>
            {#if isEditing}
              <button
                type="button"
                class="weave-tag-remove"
                aria-label={`${t('cardManagement.table.tags.remove')} ${tag}`}
                onclick={(event) => {
                  isolateCellInteraction(event);
                  removeTag(tag);
                }}
              >
                <EnhancedIcon name="x" size={10} />
              </button>
            {/if}
          </span>
        {/each}
        {#if !isEditing && hiddenDisplayTagCount > 0}
          <span class="weave-tag-summary">+{hiddenDisplayTagCount}</span>
        {/if}
      {/if}

      {#if isEditing}
        <input
          bind:this={inputEl}
          class="weave-tag-input"
          placeholder={activeTags.length > 0 ? t('cardManagement.table.tags.inputPlaceholder') : t('cardManagement.table.tags.inputPlaceholderFirst')}
          bind:value={inputValue}
          oninput={(event) => {
            isolateCellInteraction(event);
          }}
          onkeydown={handleKeydown}
          onfocus={(event) => {
            isolateCellInteraction(event);
          }}
          onclick={(event) => {
            isolateCellInteraction(event);
          }}
          autocomplete="off"
          spellcheck="false"
        />
      {:else if displayTags.length === 0}
        <span class="weave-tags-placeholder">{t('cardManagement.table.tags.addPlaceholder')}</span>
      {/if}
    </div>

    {#if !isEditing}
      <div class="weave-tags-edit-hint">
        <EnhancedIcon name="plus" size={12} />
      </div>
    {/if}
  </div>
</td>

<style>
  .weave-tags-column {
    position: relative;
    min-width: 180px;
    max-width: 260px;
    overflow: visible;
    padding: var(--weave-table-cell-padding-y, 6px) var(--weave-table-cell-padding-x, 16px);
    border-right: 1px solid var(--weave-table-grid-border-color, var(--background-modifier-border));
    border-bottom: 1px solid var(--weave-table-grid-border-color, var(--background-modifier-border));
    vertical-align: middle;
    box-sizing: border-box;
  }

  .weave-tags-cell {
    position: relative;
    display: flex;
    align-items: flex-start;
    min-height: 22px;
    width: 100%;
    padding: 1px 4px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    cursor: text;
    transition: background-color 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
    outline: none;
  }

  .weave-tags-cell:hover {
    background: color-mix(in srgb, var(--background-modifier-hover) 75%, transparent);
  }

  .weave-tags-cell:focus-visible,
  .weave-tags-cell.is-editing {
    background: var(--weave-table-page-bg, var(--background-primary));
    border-color: color-mix(in srgb, var(--interactive-accent) 42%, var(--background-modifier-border));
    box-shadow: var(--shadow-s, 0 6px 18px color-mix(in srgb, var(--background-modifier-border) 46%, transparent));
  }

  .weave-tags-flow {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    width: 100%;
    min-height: 16px;
    padding-right: 18px;
  }

  .weave-tag-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 100%;
    min-height: var(--weave-table-pill-height, 22px);
    padding: 0 var(--weave-table-pill-padding-x, 8px);
    border: 1px solid transparent;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  .weave-tags-cell:not(.is-editing) .weave-tag-pill:hover {
    transform: translateY(-1px);
    box-shadow: var(--shadow-xs, 0 2px 8px color-mix(in srgb, var(--background-modifier-border) 44%, transparent));
  }

  .weave-tag-summary {
    display: inline-flex;
    align-items: center;
    min-height: var(--weave-table-pill-height, 22px);
    padding: 0 var(--weave-table-pill-padding-x, 8px);
    border-radius: 999px;
    background: color-mix(in srgb, var(--weave-table-surface-bg, var(--background-secondary)) 78%, var(--weave-table-page-bg, var(--background-primary)) 22%);
    border: 1px solid color-mix(in srgb, var(--background-modifier-border) 72%, transparent);
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.01em;
  }

  .weave-tag-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 92px;
  }

  @media (max-width: 768px) {
    .weave-tags-column {
      min-width: 164px;
      max-width: 196px;
    }

    .weave-tag-label {
      max-width: 80px;
    }
  }

  .weave-tag-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: currentColor;
    cursor: pointer;
    opacity: 0;
    transform: scale(0.85);
    transition: opacity 0.14s ease, transform 0.14s ease, background-color 0.14s ease;
  }

  .weave-tag-pill:hover .weave-tag-remove,
  .weave-tag-remove:focus-visible {
    opacity: 1;
    transform: scale(1);
  }

  .weave-tag-remove:hover {
    background: color-mix(in srgb, currentColor 18%, transparent);
  }

  .weave-tag-input {
    min-width: 86px;
    flex: 1 1 90px;
    height: 18px;
    padding: 0 2px;
    border: none;
    background: transparent;
    color: var(--text-normal);
    font-size: 12px;
    outline: none;
  }

  .weave-tag-input::placeholder {
    color: var(--text-faint);
  }

  .weave-tags-placeholder {
    display: inline-flex;
    align-items: center;
    min-height: 16px;
    color: var(--text-faint);
    font-size: 11px;
  }

  .weave-tags-edit-hint {
    position: absolute;
    top: 50%;
    right: 6px;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-faint);
    opacity: 0;
    transition: opacity 0.16s ease;
    pointer-events: none;
  }

  .weave-tags-cell:hover .weave-tags-edit-hint {
    opacity: 1;
  }
</style>
