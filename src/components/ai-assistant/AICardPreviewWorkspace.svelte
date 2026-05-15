<script lang="ts">
  import { untrack } from 'svelte';
  import { logger } from '../../utils/logger';

  import type { WeavePlugin } from '../../main';
  import type {
    AICardPreviewItem,
    AIPreviewImportOptions,
    AIPreviewImportResult,
    GenerationConfig,
    GenerationProgress
  } from '../../types/ai-types';
  import type { Card } from '../../data/types';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';
  import ObsidianDropdown from '../ui/ObsidianDropdown.svelte';
  import PreviewContainer from '../preview/PreviewContainer.svelte';
  import { CardConverter } from '../../services/ai/CardConverter';
  import { Notice } from 'obsidian';
  import { tr } from '../../utils/i18n';

  interface Props {
    plugin: WeavePlugin;
    items: AICardPreviewItem[];
    config: GenerationConfig;
    isGenerating?: boolean;
    progress?: GenerationProgress | null;
    totalCards?: number;
    mode?: 'test' | 'split';
    variant?: 'generate' | 'parse';
    emptyTitle?: string;
    emptyDescription?: string;
    busyTitle?: string;
    busyDescription?: string;
    showImportControls?: boolean;
    enableSelection?: boolean;
    previewTitle?: string;
    previewSubtitle?: string;
    showCurrentIndexLabel?: boolean;
    navigationHint?: string;
    onImport?: (selectedItems: AICardPreviewItem[], options: AIPreviewImportOptions) => Promise<AIPreviewImportResult>;
  }

  let {
    plugin,
    items,
    config,
    isGenerating = false,
    progress = null,
    totalCards = 0,
    mode = 'split',
    variant = 'generate',
    emptyTitle,
    emptyDescription,
    busyTitle,
    busyDescription,
    showImportControls = variant === 'generate',
    enableSelection = variant === 'generate',
    previewTitle = '',
    previewSubtitle = '',
    showCurrentIndexLabel = false,
    navigationHint,
    onImport
  }: Props = $props();

  let t = $derived($tr);

  let currentIndex = $state(0);
  let selectedCardIds = $state<Set<string>>(new Set());
  let isImporting = $state(false);
  let availableDecks = $state<Array<{ id: string; name: string }>>([]);
  let selectedDeckId = $state('');
  let committedImportTags = $state<string[]>([]);
  let importAutoTagsText = $state('');
  let previewCard = $state<Card | null>(null);
  let showPreviewAnswer = $state(true);
  let lastImportSummary = $state<AIPreviewImportResult | null>(null);

  let previousCardIds = new Set<string>();
  let previousCardSignature = '';
  let thumbnailLongPressTimer: number | null = null;
  let suppressThumbnailClick = false;
  let pressedThumbnailId = $state<string | null>(null);

  let currentCard = $derived(items[currentIndex]?.generatedCard ?? null);
  let selectedCount = $derived(selectedCardIds.size);
  let isAllSelected = $derived(selectedCount === items.length && items.length > 0);
  let hasCards = $derived(items.length > 0);
  let generatedCount = $derived(items.length);
  let progressPercent = $derived(
    progress?.progress ?? (totalCards > 0 ? Math.min(100, Math.round((generatedCount / totalCards) * 100)) : 0)
  );
  let showGenerationProgressPanel = $derived(variant === 'generate' && isGenerating);
  let resolvedBusyTitle = $derived(
    busyTitle ?? (variant === 'parse' ? '正在解析预览' : '正在生成卡片')
  );
  let resolvedEmptyTitle = $derived(
    emptyTitle ?? (variant === 'parse' ? '解析预览区' : 'AI 制卡预览区')
  );
  let resolvedBusyDescription = $derived(
    busyDescription ?? (
      variant === 'parse'
        ? '当前解析模板正在整理内容，新的解析结果会直接显示在这里。'
        : '卡片会随着生成进度逐张出现在这里。'
    )
  );
  let resolvedEmptyDescription = $derived(
    emptyDescription ?? (
      variant === 'parse'
        ? '先在顶部功能栏选择文件、解析模板并发起解析，这里会直接显示解析结果预览。'
        : '先在顶部功能栏选择文件、提示词并发起生成，这里会直接显示可导入的卡片预览。'
    )
  );
  let resolvedNavigationHint = $derived(
    navigationHint ?? (enableSelection ? '点按切换卡片，长按序号可选中或取消选中' : '点按切换卡片')
  );
  let importAutoTags = $derived.by(() => normalizeTagList(committedImportTags));
  let importSummaryText = $derived.by(() => {
    if (!lastImportSummary || lastImportSummary.importedCount <= 0) return '';
    const deckName = lastImportSummary.targetDeckName || '目标牌组';
    const failedPart = lastImportSummary.failedCount > 0
      ? `，另有 ${lastImportSummary.failedCount} 张未成功导入`
      : '';
    return `刚刚已成功导入 ${lastImportSummary.importedCount} 张卡片到“${deckName}”${failedPart}`;
  });

  function normalizeTagList(tags: string[] | undefined): string[] {
    return Array.from(new Set((tags ?? []).map((tag) => String(tag || '').trim().replace(/^#+/, '')).filter(Boolean)));
  }

  function normalizeTagListFromText(value: string): string[] {
    return normalizeTagList(value.split(/[\n,，]/).map((item) => item.trim()));
  }

  async function persistImportAutoTags(nextTags: string[]): Promise<void> {
    await plugin.saveAIAssistantPreferences({
      ...plugin.getAIAssistantPreferences(),
      importAutoTags: nextTags
    });
  }

  async function setCommittedImportTags(nextTags: string[]): Promise<void> {
    const normalized = normalizeTagList(nextTags);
    committedImportTags = normalized;
    await persistImportAutoTags(normalized);
  }

  async function commitDraftImportTags(): Promise<string[]> {
    const draftTags = normalizeTagListFromText(importAutoTagsText);
    const nextTags = normalizeTagList([...(committedImportTags ?? []), ...draftTags]);

    if (draftTags.length > 0 || nextTags.length !== committedImportTags.length) {
      await setCommittedImportTags(nextTags);
    }

    importAutoTagsText = '';
    return nextTags;
  }

  async function removeCommittedImportTag(tagToRemove: string): Promise<void> {
    await setCommittedImportTags(committedImportTags.filter((tag) => tag !== tagToRemove));
  }

  async function handleImportTagKeydown(event: KeyboardEvent): Promise<void> {
    if (event.key === 'Enter') {
      event.preventDefault();
      await commitDraftImportTags();
      return;
    }

    if (event.key === 'Backspace' && !importAutoTagsText.trim() && committedImportTags.length > 0) {
      event.preventDefault();
      await removeCommittedImportTag(committedImportTags[committedImportTags.length - 1]);
    }
  }

  function dispatchSelectionState() {
    if (typeof window === 'undefined') return;
    const hasSelectableCards = enableSelection && items.length > 0;
    window.dispatchEvent(new CustomEvent('Weave:ai-selection-state-change', {
      detail: {
        selectedCount: enableSelection ? selectedCount : 0,
        totalCount: hasSelectableCards ? items.length : 0,
        isAllSelected: enableSelection ? isAllSelected : false,
        hasCards: hasSelectableCards
      }
    }));
  }

  $effect(() => {
    if (currentCard) {
      try {
        previewCard = CardConverter.convertForPreview(currentCard);
      } catch (error) {
        logger.error('[AICardPreviewWorkspace] 卡片转换失败:', error);
        previewCard = null;
      }
    } else {
      previewCard = null;
    }
  });

  $effect(() => {
    const cardSignature = items.map((item) => item.id).join('|');
    if (cardSignature === previousCardSignature) {
      return;
    }

    previousCardSignature = cardSignature;
    const currentIds = new Set(items.map((item) => item.id));
    const currentSelected = untrack(() => selectedCardIds);
    const currentIndexSnapshot = untrack(() => currentIndex);

    if (items.length === 0) {
      currentIndex = 0;
      selectedCardIds = new Set();
      previousCardIds = new Set();
      return;
    }

    if (!enableSelection) {
      selectedCardIds = new Set();
      previousCardIds = currentIds;
      currentIndex = Math.min(currentIndexSnapshot, Math.max(items.length - 1, 0));
      return;
    }

    const nextSelected = new Set(
      Array.from(currentSelected).filter((id) => currentIds.has(id))
    );

    for (const item of items) {
      if (!previousCardIds.has(item.id)) {
        nextSelected.add(item.id);
      }
    }

    selectedCardIds = nextSelected;
    previousCardIds = currentIds;
    currentIndex = Math.min(currentIndexSnapshot, Math.max(items.length - 1, 0));
  });

  $effect(() => {
    if (!showImportControls || !onImport) {
      availableDecks = [];
      selectedDeckId = '';
      return;
    }

    mode;
    config.targetDeck;
    void loadDecks();
  });

  $effect(() => {
    if (!showImportControls || !onImport) {
      committedImportTags = [];
      importAutoTagsText = '';
      return;
    }

    const savedTags = plugin.getAIAssistantPreferences().importAutoTags;
    committedImportTags = normalizeTagList(savedTags);
    importAutoTagsText = '';
  });

  $effect(() => {
    enableSelection;
    selectedCount;
    isAllSelected;
    items.length;
    dispatchSelectionState();
  });

  $effect(() => {
    if (typeof window === 'undefined' || !enableSelection) return;

    const handleSelectionAction = (event: Event) => {
      const action = (event as CustomEvent<{ action?: 'select-all' | 'deselect-all' }>).detail?.action;
      if (!action) return;

      if (action === 'select-all') {
        selectAll();
        return;
      }

      deselectAll();
    };

    window.addEventListener('Weave:ai-selection-action', handleSelectionAction as EventListener);
    return () => {
      window.removeEventListener('Weave:ai-selection-action', handleSelectionAction as EventListener);
    };
  });

  function truncateDeckName(name: string, maxLength: number = 30): string {
    if (name.length <= maxLength) return name;
    return `${name.substring(0, maxLength - 3)}...`;
  }

  function goToCard(index: number) {
    if (index < 0 || index >= items.length) return;
    currentIndex = index;
  }

  function toggleCardSelection(cardId: string) {
    const next = new Set(selectedCardIds);
    if (next.has(cardId)) {
      next.delete(cardId);
    } else {
      next.add(cardId);
    }
    selectedCardIds = next;
  }

  function clearThumbnailLongPressTimer() {
    if (thumbnailLongPressTimer !== null) {
      window.clearTimeout(thumbnailLongPressTimer);
      thumbnailLongPressTimer = null;
    }
    pressedThumbnailId = null;
  }

  function handleThumbnailPointerDown(cardId: string) {
    if (!enableSelection) return;
    clearThumbnailLongPressTimer();
    suppressThumbnailClick = false;
    pressedThumbnailId = cardId;
    thumbnailLongPressTimer = window.setTimeout(() => {
      toggleCardSelection(cardId);
      suppressThumbnailClick = true;
      pressedThumbnailId = null;
      thumbnailLongPressTimer = null;
    }, 420);
  }

  function handleThumbnailPointerUp() {
    clearThumbnailLongPressTimer();
  }

  function handleThumbnailClick(event: MouseEvent, index: number) {
    if (suppressThumbnailClick) {
      suppressThumbnailClick = false;
      event.preventDefault();
      return;
    }
    goToCard(index);
  }

  function handleThumbnailContextMenu(event: MouseEvent, cardId: string) {
    if (!enableSelection) return;
    event.preventDefault();
    clearThumbnailLongPressTimer();
    suppressThumbnailClick = true;
    toggleCardSelection(cardId);
  }

  function selectAll() {
    selectedCardIds = new Set(items.map((item) => item.id));
  }

  function deselectAll() {
    selectedCardIds = new Set();
  }

  async function loadDecks() {
    try {
      const allDecks = await plugin.dataStorage.getDecks();

      availableDecks = (mode === 'split'
        ? allDecks.filter((deck) => deck.purpose !== 'test')
        : allDecks.filter((deck) => deck.purpose === 'test')
      ).map((deck) => ({ id: deck.id, name: deck.name }));

      if (availableDecks.length === 0) {
        availableDecks = allDecks.map((deck) => ({ id: deck.id, name: deck.name }));
      }

      if (availableDecks.length === 0) {
        selectedDeckId = '';
        return;
      }

      const defaultTargetDeck = config.targetDeck;
      if (defaultTargetDeck) {
        const matchedDeck = availableDecks.find(
          (deck) => deck.id === defaultTargetDeck || deck.name === defaultTargetDeck
        );
        selectedDeckId = matchedDeck?.id || availableDecks[0].id;
      } else if (!availableDecks.some((deck) => deck.id === selectedDeckId)) {
        selectedDeckId = availableDecks[0].id;
      }
    } catch (error) {
      logger.error('[AICardPreviewWorkspace] 加载牌组失败:', error);
      availableDecks = [];
      selectedDeckId = '';
    }
  }

  async function handleImportCards() {
    if (!showImportControls || !onImport) return;

    if (selectedCount === 0) {
      new Notice('请至少选择一张卡片');
      return;
    }

    if (!selectedDeckId) {
      new Notice('请选择目标牌组');
      return;
    }

    try {
      isImporting = true;
      const selectedItems = items.filter((item) => selectedCardIds.has(item.id));
      const finalAutoTags = importAutoTagsText.trim()
        ? await commitDraftImportTags()
        : [...committedImportTags];
      const result = await onImport(
        selectedItems,
        {
          targetDeckId: selectedDeckId,
          autoTags: finalAutoTags
        }
      );

      lastImportSummary = result;

      const importedItemIds = new Set(result.importedItemIds || selectedItems.map((item) => item.id));
      const nextSelected = new Set(selectedCardIds);
      for (const itemId of importedItemIds) {
        nextSelected.delete(itemId);
      }
      selectedCardIds = nextSelected;

      if (result.importedCount > 0) {
        const deckName = result.targetDeckName || '目标牌组';
        const failedPart = result.failedCount > 0 ? `，${result.failedCount} 张未成功导入` : '';
        new Notice(`已成功导入 ${result.importedCount} 张卡片到“${deckName}”${failedPart}`);
      }
    } catch (error) {
      logger.error('[AICardPreviewWorkspace] 导入失败:', error);
      new Notice(error instanceof Error ? error.message : '导入失败');
    } finally {
      isImporting = false;
    }
  }
</script>

<div class="card-preview-workspace">
  <div class="preview-body">
    <div class="preview-main-content">
      {#if currentCard}
        <div class="card-display">
          {#if previewTitle || previewSubtitle || showCurrentIndexLabel}
            <div class="preview-context-header">
              <div class="preview-context-copy">
                {#if previewTitle}
                  <div class="preview-context-title">{previewTitle}</div>
                {/if}
                {#if previewSubtitle}
                  <div class="preview-context-subtitle">{previewSubtitle}</div>
                {/if}
              </div>
              {#if showCurrentIndexLabel}
                <div class="preview-context-index">第 {currentIndex + 1} 张</div>
              {/if}
            </div>
          {/if}

          <div class="card-meta">
            <div class="card-meta-left">
              {#if currentCard.metadata.difficulty}
                <span class="difficulty-badge">{currentCard.metadata.difficulty}</span>
              {/if}
            </div>
          </div>

          {#if previewCard}
            <div class="card-preview-wrapper">
              <PreviewContainer
                card={previewCard}
                bind:showAnswer={showPreviewAnswer}
                {plugin}
                enableAnimations={true}
                enableAnswerControls={true}
              />
            </div>
          {:else}
            <div class="no-preview-warning">卡片预览加载失败</div>
          {/if}
        </div>
      {:else}
        <div class="preview-empty-state" class:with-progress-panel={showGenerationProgressPanel}>
          <div class="empty-icon">
            <ObsidianIcon name={isGenerating ? 'loader' : 'sparkles'} size={26} />
          </div>
          {#if showGenerationProgressPanel}
            <div class="generation-progress-panel">
              <div class="generation-progress-heading">
                <strong>正在生成卡片</strong>
                <span>{generatedCount} / {totalCards || 0} 张</span>
              </div>
              <div class="generation-progress-meta">
                <span class="generation-progress-label">生成进度</span>
                <span class="generation-progress-count">{generatedCount} / {totalCards || 0} 张</span>
              </div>
              <div class="generation-progress-track" aria-hidden="true">
                <div class="generation-progress-fill" style={`width: ${progressPercent}%`}></div>
              </div>
              <p class="generation-progress-hint">AI 正在逐张生成卡片，新的结果会实时追加到这里。</p>
            </div>
          {/if}
          <h3>{isGenerating ? resolvedBusyTitle : resolvedEmptyTitle}</h3>
          <p>{isGenerating ? resolvedBusyDescription : resolvedEmptyDescription}</p>
        </div>
      {/if}
    </div>
  </div>

  {#if hasCards}
    <div class="preview-footer" class:navigation-only={!showImportControls}>
      <div class="card-navigation">
        <div class="thumbnail-strip">
          {#each items as item, index}
            <div
              class="thumbnail"
              class:active={index === currentIndex}
              class:selected={enableSelection && selectedCardIds.has(item.id)}
              class:pressing={enableSelection && pressedThumbnailId === item.id}
              class:new={item.isNew}
              onclick={(event) => handleThumbnailClick(event, index)}
              onkeydown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  goToCard(index);
                }
              }}
              onpointerdown={() => handleThumbnailPointerDown(item.id)}
              onpointerup={handleThumbnailPointerUp}
              onpointercancel={handleThumbnailPointerUp}
              onpointerleave={handleThumbnailPointerUp}
              oncontextmenu={(event) => handleThumbnailContextMenu(event, item.id)}
              role="button"
              tabindex="0"
              title={`${t('modals.cardPreview.title')} ${index + 1}${enableSelection ? ' · 长按可选中' : ''}`}
            >
              <div class="thumbnail-number">{index + 1}</div>
              {#if enableSelection && selectedCardIds.has(item.id)}
                <div class="thumbnail-check">
                  <ObsidianIcon name="check" size={12} />
                </div>
              {/if}
            </div>
          {/each}

          {#if isGenerating && totalCards > items.length}
            {#each Array(totalCards - items.length) as _, index}
              <div class="thumbnail skeleton" title={`${t('modals.cardPreview.generating')} ${items.length + index + 1}`}>
                <div class="skeleton-loader"></div>
              </div>
            {/each}
          {/if}
        </div>
        <div class="thumbnail-hint">{resolvedNavigationHint}</div>
      </div>

      {#if showImportControls}
        <div class="preview-actions">
          {#if importSummaryText}
            <div class="import-feedback-banner">
              <ObsidianIcon name="check-circle-2" size={14} />
              <span>{importSummaryText}</span>
            </div>
          {/if}
          <div class="preview-actions-row">
            <div class="import-config-fields">
              <div class="deck-selector compact">
                <ObsidianDropdown
                  className="target-deck-select"
                  value={selectedDeckId}
                  disabled={isImporting}
                  iconPosition="left"
                  options={availableDecks.map((deck) => ({
                    id: deck.id,
                    label: truncateDeckName(deck.name),
                    description: deck.id === selectedDeckId ? deck.name : undefined
                  }))}
                  onchange={(value) => {
                    selectedDeckId = value;
                  }}
                />
              </div>

              <label class="import-tags-field">
                <div class="import-tags-editor" class:is-empty={committedImportTags.length === 0 && !importAutoTagsText.trim()}>
                  {#each committedImportTags as tag (tag)}
                    <span class="import-tag-chip">
                      <span class="import-tag-chip-text">{tag}</span>
                      <button
                        type="button"
                        class="import-tag-chip-remove"
                        aria-label={`移除标签 ${tag}`}
                        disabled={isImporting}
                        onclick={() => {
                          void removeCommittedImportTag(tag);
                        }}
                      >
                        <ObsidianIcon name="x" size={12} />
                      </button>
                    </span>
                  {/each}

                  <input
                    type="text"
                    class="import-tags-input"
                    value={importAutoTagsText}
                    placeholder={committedImportTags.length > 0 ? '继续输入后按回车' : '输入标签后按回车'}
                    aria-label="自动标签"
                    disabled={isImporting}
                    oninput={(event) => {
                      importAutoTagsText = (event.currentTarget as HTMLInputElement).value;
                    }}
                    onkeydown={(event) => {
                      void handleImportTagKeydown(event);
                    }}
                    onblur={() => {
                      if (importAutoTagsText.trim()) {
                        void commitDraftImportTags();
                      }
                    }}
                  />
                </div>
              </label>
            </div>

            <button
              class="import-btn compact"
              onclick={handleImportCards}
              disabled={selectedCount === 0 || isImporting || !selectedDeckId || !onImport}
            >
              <ObsidianIcon name="download" size={16} />
              <span>{isImporting ? '导入中' : `导入 ${selectedCount}`}</span>
            </button>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .card-preview-workspace {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--weave-ai-surface-bg, var(--background-primary));
    overflow: hidden;
  }

  .preview-body {
    flex: 1;
    overflow-y: auto;
    padding: 0 20px 20px;
    min-height: 0;
  }

  .preview-main-content {
    width: 100%;
  }

  .card-display {
    background: transparent;
    border-radius: 0;
    padding: 0;
    margin-bottom: 16px;
  }

  .preview-context-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }

  .preview-context-copy {
    min-width: 0;
  }

  .preview-context-title {
    font-size: 20px;
    font-weight: 700;
    line-height: 1.2;
    color: var(--text-normal);
  }

  .preview-context-subtitle,
  .preview-context-index {
    margin-top: 4px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-muted);
  }

  .preview-context-index {
    margin-top: 0;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .card-meta {
    display: flex;
    align-items: center;
    margin-bottom: 12px;
    gap: 12px;
  }

  .card-meta-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .difficulty-badge {
    display: inline-flex;
    align-items: center;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
    background: rgba(255, 166, 77, 0.1);
    color: #ff922b;
  }

  .card-preview-wrapper {
    width: 100%;
    min-height: 200px;
  }

  .no-preview-warning,
  .preview-empty-state {
    padding: 32px 24px;
    text-align: center;
    color: var(--text-muted);
    background: var(--weave-ai-card-bg, var(--background-secondary));
    border-radius: 16px;
    border: 1px dashed color-mix(in srgb, var(--background-modifier-border) 78%, transparent);
  }

  .preview-empty-state {
    min-height: 280px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    background:
      radial-gradient(circle at top, color-mix(in srgb, var(--interactive-accent) 14%, transparent) 0%, transparent 55%),
      var(--weave-ai-card-bg, var(--background-secondary));
  }

  .preview-empty-state h3 {
    margin: 0;
    font-size: 18px;
    color: var(--text-normal);
  }

  .preview-empty-state p { 
    margin: 0; 
    max-width: 420px; 
    line-height: 1.6; 
  } 

  .preview-empty-state.with-progress-panel > h3,
  .preview-empty-state.with-progress-panel > p {
    display: none;
  }

  .generation-progress-panel {
    width: min(420px, 100%);
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 16px;
    border-radius: 14px;
    background: color-mix(
      in srgb,
      var(--weave-ai-card-bg, var(--background-secondary)) 88%,
      var(--weave-ai-page-bg, var(--background-primary))
    );
    border: 1px solid color-mix(in srgb, var(--background-modifier-border) 82%, transparent);
  }

  .generation-progress-meta {
    display: none;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 13px;
    color: var(--text-muted);
  }

  .generation-progress-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    color: var(--text-normal);
  }

  .generation-progress-heading strong {
    font-size: 16px;
    font-weight: 700;
  }

  .generation-progress-heading span {
    font-size: 13px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .generation-progress-label {
    font-weight: 600;
    color: var(--text-normal);
  }

  .generation-progress-count {
    font-variant-numeric: tabular-nums;
  }

  .generation-progress-track {
    position: relative;
    width: 100%;
    height: 10px;
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in srgb, var(--background-modifier-border) 78%, transparent);
  }

  .generation-progress-fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--interactive-accent), color-mix(in srgb, var(--interactive-accent) 58%, white));
    transition: width 0.25s ease;
  }

  .empty-icon { 
    width: 52px;
    height: 52px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 16px;
    background: color-mix(in srgb, var(--interactive-accent) 16%, transparent);
    color: var(--text-accent);
  }

  .preview-footer {
    background: var(--weave-ai-surface-bg, var(--background-primary));
    padding: 0 20px 20px;
    flex-shrink: 0;
  }

  .preview-footer.navigation-only {
    padding-bottom: 14px;
  }

  .card-navigation {
    display: flex;
    align-items: stretch;
    margin-bottom: 16px;
  }

  .preview-footer.navigation-only .card-navigation {
    margin-bottom: 0;
  }

  .thumbnail-strip {
    flex: 1 1 auto;
    display: flex;
    gap: 8px;
    overflow-x: auto;
    overflow-y: visible;
    padding: 10px 2px 8px;
    scroll-padding-left: 2px;
  }

  .thumbnail-strip::-webkit-scrollbar {
    height: 4px;
  }

  .thumbnail-strip::-webkit-scrollbar-thumb {
    background: var(--background-modifier-border);
    border-radius: 2px;
  }

  .thumbnail {
    position: relative;
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    background: var(--weave-ai-card-bg, var(--background-secondary));
    border: 2px solid var(--background-modifier-border);
    transition: all 0.2s;
    cursor: pointer;
  }

  .thumbnail.pressing {
    transform: scale(0.94);
    border-color: color-mix(in srgb, var(--interactive-accent) 72%, var(--background-modifier-border));
    background: color-mix(
      in srgb,
      var(--interactive-accent) 12%,
      var(--weave-ai-card-bg, var(--background-secondary))
    );
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--interactive-accent) 14%, transparent);
  }

  .thumbnail:hover {
    border-color: var(--text-accent);
  }

  .thumbnail.active {
    border-color: var(--text-accent);
    background: var(--color-accent-bg);
  }

  .thumbnail.selected {
    background: rgba(134, 239, 172, 0.1);
    border-color: #10b981;
  }

  .thumbnail-number {
    font-size: 13px;
    font-weight: 600;
    line-height: 1;
    color: var(--text-muted);
  }

  .thumbnail.active .thumbnail-number {
    color: var(--text-accent);
  }

  .thumbnail-check {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #10b981;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .thumbnail-hint {
    margin-top: 2px;
    font-size: 12px;
    line-height: 1.45;
    color: var(--text-faint);
    text-align: center;
  }

  .preview-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .import-feedback-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--color-green, #22c55e) 14%, var(--weave-ai-card-bg, var(--background-secondary)));
    border: 1px solid color-mix(in srgb, var(--color-green, #22c55e) 24%, var(--background-modifier-border));
    color: var(--text-normal);
    font-size: 12px;
    line-height: 1.45;
  }

  .import-feedback-banner :global(svg) {
    color: var(--color-green, #22c55e);
    flex-shrink: 0;
  }

  .preview-actions-row {
    display: flex;
    align-items: stretch;
    gap: 10px;
    min-width: 0;
    flex-wrap: nowrap;
  }

  .import-config-fields {
    flex: 0 1 auto;
    display: flex;
    align-items: stretch;
    gap: 10px;
  }

  .deck-selector {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .deck-selector.compact {
    flex: 0 0 220px;
    width: 220px;
    min-width: 220px;
  }

  :global(.deck-selector .obsidian-dropdown-trigger.target-deck-select) {
    padding: 0 12px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--background-primary) 92%, var(--background-secondary));
    border: 1px solid var(--background-modifier-border);
    color: var(--text-normal);
    font-size: 13px;
    cursor: pointer;
    min-height: 36px;
    box-shadow: none;
  }

  :global(.deck-selector.compact .obsidian-dropdown-trigger.target-deck-select) {
    width: 100%;
    min-height: 36px;
    border-radius: 8px;
  }

  :global(.deck-selector.compact .obsidian-dropdown-trigger.target-deck-select .dropdown-icon.is-leading) {
    color: var(--text-muted);
  }

  :global(.deck-selector .obsidian-dropdown-trigger.target-deck-select:hover:not(.disabled)) {
    border-color: var(--background-modifier-border);
    background: color-mix(in srgb, var(--background-primary) 92%, var(--background-secondary));
  }

  :global(.deck-selector .obsidian-dropdown-trigger.target-deck-select:focus-visible) {
    outline: none;
    border-color: var(--interactive-accent);
    box-shadow: none;
  }

  :global(.deck-selector .obsidian-dropdown-trigger.target-deck-select.disabled) {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .import-tags-field {
    flex: 0 0 180px;
    width: 180px;
    min-width: 180px;
    display: flex;
    align-items: stretch;
  }

  .import-tags-editor {
    width: 100%;
    min-height: 36px;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    padding: 4px 8px;
    border-radius: 8px;
    border: 1px solid var(--background-modifier-border);
    background: color-mix(in srgb, var(--background-primary) 92%, var(--background-secondary));
    box-shadow: none;
  }

  .import-tags-editor:focus-within {
    border-color: var(--interactive-accent);
  }

  .import-tag-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 100%;
    min-height: 22px;
    padding: 0 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--interactive-accent) 14%, var(--background-secondary));
    color: var(--text-normal);
    font-size: 12px;
    line-height: 1;
  }

  .import-tag-chip-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .import-tag-chip-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: 999px;
  }

  .import-tag-chip-remove:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .import-tags-input {
    flex: 1 1 72px;
    width: auto;
    min-width: 72px;
    min-height: 22px;
    padding: 0;
    border-radius: 0;
    border: none;
    background: transparent;
    color: var(--text-normal);
    font-size: 12px;
    box-shadow: none;
  }

  .import-tags-input:focus {
    outline: none;
    box-shadow: none;
  }

  .import-tags-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .import-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    min-height: 36px;
    padding: 0 18px;
    border-radius: 8px;
    background: var(--interactive-accent);
    color: white;
    font-weight: 600;
    border: 1px solid color-mix(in srgb, var(--interactive-accent) 82%, transparent);
    transition: none;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    box-shadow: none;
  }

  .import-btn.compact {
    width: auto;
    min-width: 92px;
    flex: 0 0 auto;
  }

  .import-btn:hover:not(:disabled) {
    background: var(--interactive-accent);
    border-color: color-mix(in srgb, var(--interactive-accent) 82%, transparent);
  }

  .import-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .thumbnail.skeleton {
    position: relative;
    background: var(--background-modifier-border);
    cursor: not-allowed;
    animation: pulse 1.5s ease-in-out infinite;
  }

  .skeleton-loader {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.05),
      transparent
    );
    animation: shimmer 1.5s infinite;
  }

  .thumbnail.new {
    animation: flashNew 0.6s ease-out;
    border-color: #10b981 !important;
  }

  @keyframes shimmer {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(100%);
    }
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.6;
    }
    50% {
      opacity: 1;
    }
  }

  @keyframes flashNew {
    0% {
      box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
      transform: scale(1);
    }
    50% {
      box-shadow: 0 0 0 8px rgba(16, 185, 129, 0);
      transform: scale(1.1);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
      transform: scale(1);
    }
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 768px) {
    .preview-body,
    .preview-footer {
      padding-left: 12px;
      padding-right: 12px;
    }

    .preview-footer {
      position: sticky;
      bottom: 0;
      z-index: 12;
      padding-top: 10px;
      padding-bottom: calc(92px + env(safe-area-inset-bottom, 0px));
      background:
        linear-gradient(
          180deg,
          color-mix(in srgb, var(--weave-ai-surface-bg, var(--background-primary)) 0%, transparent) 0%,
          color-mix(in srgb, var(--weave-ai-surface-bg, var(--background-primary)) 84%, transparent) 14%,
          var(--weave-ai-surface-bg, var(--background-primary)) 100%
        );
    }

    .card-preview-workspace {
      min-height: 0;
    }

    .card-navigation {
      margin-bottom: 10px;
    }

    .thumbnail-strip {
      gap: 10px;
      padding: 14px 4px 10px;
      scroll-padding-left: 4px;
    }

    .thumbnail {
      width: 44px;
      height: 44px;
      border-radius: 12px;
    }

    .thumbnail-hint {
      margin-top: 4px;
      font-size: 11px;
    }

    .preview-actions {
      padding: 10px;
      border-radius: 18px;
      border: none;
      background: color-mix(in srgb, var(--background-primary) 88%, transparent);
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.1);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }

    .preview-actions-row {
      align-items: stretch;
      gap: 10px;
      flex-wrap: wrap;
    }

    .import-config-fields {
      width: 100%;
      flex-direction: column;
      flex: 1 1 100%;
    }

    .import-tags-field {
      width: 100%;
      min-width: 0;
    }

    .import-tags-editor {
      min-height: 44px;
      padding: 6px 10px;
      border-radius: 14px;
    }

    .import-tags-input {
      min-height: 24px;
      font-size: 13px;
    }

    .card-display {
      margin-bottom: 8px;
    }

    .preview-context-header {
      margin-bottom: 10px;
      flex-direction: column;
      align-items: flex-start;
    }

    .preview-context-title {
      font-size: 18px;
    }

    .card-meta {
      margin-bottom: 8px;
    }

    .difficulty-badge {
      padding: 5px 11px;
      font-size: 11px;
    }

    .deck-selector.compact {
      width: 100%;
      min-width: 0;
      flex: 1 1 auto;
    }

    :global(.deck-selector.compact .obsidian-dropdown-trigger.target-deck-select) {
      min-height: 44px;
      padding: 0 14px;
      border-radius: 14px;
      box-shadow: none;
      font-size: 13px;
    }

    .import-btn.compact {
      min-width: 104px;
      width: auto;
      flex: 0 0 auto;
      min-height: 44px;
      padding: 0 16px;
      border-radius: 14px;
      box-shadow: none;
    }
  }
</style>
