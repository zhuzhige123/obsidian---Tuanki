<script lang="ts">
  import { Notice } from 'obsidian';
  import type { Card } from '../../data/types';
  import { CardType } from '../../data/types';
  import { onDestroy } from 'svelte';
  import { get } from 'svelte/store';

  import { customActionsForMenu } from '../../stores/ai-config.store';
  import ChildCardMini from '../study/ChildCardMini.svelte';
  import UnifiedActionsBar from '../study/UnifiedActionsBar.svelte';

  import { AISplitService } from '../../services/ai/AISplitService';
  import { resolveDefaultAISplitInstruction, type AISelectedTextPanelHost } from '../../services/ai/ai-host';
  import { createContentWithMetadata, extractBodyContent } from '../../utils/yaml-utils';
  import { generateCardUUID } from '../../services/identifier/WeaveIDGenerator';
  import { detectTraceSourceKind, normalizeTraceDocumentKey } from '../../services/incremental-reading/IRSourceTraceStats';
  import { tr } from '../../utils/i18n';

  interface Props {
    host: AISelectedTextPanelHost;
    selectedText: string;
    actionId: string;
    sourceFilePath: string;
    sourceLink?: string;
    onClose: () => void;
  }

  let { host, selectedText, actionId, sourceFilePath, sourceLink = '', onClose }: Props = $props();

  let isGenerating = $state(false);
  let childCards = $state<Card[]>([]);
  let selectedCardIds = $state(new Set<string>());

  let availableDecks = $state<Array<{ id: string; name: string }>>([]);
  let selectedDeckId = $state<string>('');

  let sourceWeSource = $state<string>('');

  let previewHeight = $state(248);
  let resizeButtonEl: HTMLButtonElement | null = $state(null);
  let isResizeDragging = $state(false);
  let activeResizePointerId: number | null = null;

  let didInit = $state(false);

  /** 与 EPUB 阅读器插件共用键，便于两处预览高度一致 */
  const PREVIEW_HEIGHT_STORAGE_KEY = 'weave-ai-split-preview-height';
  const MIN_PREVIEW_HEIGHT = 188;
  const MAX_PREVIEW_HEIGHT = 420;
  const DEFAULT_PREVIEW_HEIGHT = 248;
  let dragStartY = 0;
  let dragStartHeight = DEFAULT_PREVIEW_HEIGHT;

  function clampPreviewHeight(value: number): number {
    return Math.min(MAX_PREVIEW_HEIGHT, Math.max(MIN_PREVIEW_HEIGHT, Math.round(value)));
  }

  function persistPreviewHeight(value: number): void {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(PREVIEW_HEIGHT_STORAGE_KEY, String(value));
    } catch {
    }
  }

  function restorePreviewHeight(): void {
    if (typeof window === 'undefined') {
      previewHeight = DEFAULT_PREVIEW_HEIGHT;
      return;
    }

    try {
      const stored = Number(window.localStorage.getItem(PREVIEW_HEIGHT_STORAGE_KEY));
      previewHeight = Number.isFinite(stored)
        ? clampPreviewHeight(stored)
        : DEFAULT_PREVIEW_HEIGHT;
    } catch {
      previewHeight = DEFAULT_PREVIEW_HEIGHT;
    }
  }

  function stopResizeDrag(): void {
    if (!isResizeDragging) {
      return;
    }
    isResizeDragging = false;
    try {
      if (activeResizePointerId !== null) {
        resizeButtonEl?.releasePointerCapture?.(activeResizePointerId);
      }
    } catch {
    }
    activeResizePointerId = null;
    window.removeEventListener('pointermove', handleResizePointerMove);
    window.removeEventListener('pointerup', handleResizePointerUp);
    window.removeEventListener('pointercancel', handleResizePointerUp);
  }

  function handleResizePointerMove(event: PointerEvent): void {
    if (!isResizeDragging) {
      return;
    }
    const deltaY = event.clientY - dragStartY;
    previewHeight = clampPreviewHeight(dragStartHeight + deltaY);
  }

  function handleResizePointerUp(): void {
    persistPreviewHeight(previewHeight);
    stopResizeDrag();
  }

  function handleResizePointerDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    dragStartY = event.clientY;
    dragStartHeight = previewHeight;
    isResizeDragging = true;
    activeResizePointerId = event.pointerId;
    resizeButtonEl?.setPointerCapture?.(event.pointerId);
    window.addEventListener('pointermove', handleResizePointerMove);
    window.addEventListener('pointerup', handleResizePointerUp);
    window.addEventListener('pointercancel', handleResizePointerUp);
  }

  let currentAction = $derived.by(() => {
    const actions = get(customActionsForMenu).split;
    return actions.find((a) => a.id === actionId) || null;
  });
  let t = $derived($tr);

  async function loadDecks() {
    try {
      const allDecks = await host.dataStorage.getDecks();
      availableDecks = allDecks
        .filter((deck) => deck.purpose !== 'test')
        .map((deck) => ({ id: deck.id, name: deck.name }));

      if (availableDecks.length > 0) {
        if (!selectedDeckId || !availableDecks.find((d) => d.id === selectedDeckId)) {
          selectedDeckId = availableDecks[0].id;
        }
      }
    } catch {
      availableDecks = [];
      selectedDeckId = '';
    }
  }

  async function ensureSourceReference(): Promise<void> {
    if (sourceWeSource) return;

    const explicitSourceLink = (sourceLink || '').trim();
    if (explicitSourceLink) {
      sourceWeSource = explicitSourceLink;
      return;
    }

    if (!sourceFilePath) {
      return;
    }

    const base = sourceFilePath.split('/').pop()?.replace(/\.md$/, '') || sourceFilePath;
    sourceWeSource = `[[${base}]]`;
  }

  function toTempPreviewCard(content: string, index: number): Card {
    const now = new Date().toISOString();

    return {
      uuid: `temp-uuid-${Date.now()}-${Math.random().toString(16).slice(2)}-${index}`,
      deckId: selectedDeckId || 'preview-deck',
      templateId: 'official-qa',
      type: CardType.Basic,
      cardPurpose: 'memory',
      content,
      tags: [],
      priority: 0,
      fsrs: {
        due: now,
        stability: 0,
        difficulty: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        reps: 0,
        lapses: 0,
        state: 0,
        retrievability: 0
      },
      reviewHistory: [],
      stats: {
        totalReviews: 0,
        totalTime: 0,
        averageTime: 0,
        memoryRate: 0
      },
      created: now,
      modified: now
    };
  }

  function normalizeGeneratedCardContent(raw: string, questionFallback?: string): string {
    const content = (raw || '').trim();
    if (!content) return content;

    const sep = '---div---';
    if (!content.includes(sep)) return content;

    const parts = content.split(sep);
    const front = (parts[0] ?? '').trim();
    const back = parts.slice(1).join(sep).trim();

    const frontIsPlaceholder = /^问题\s*$/.test(front) || /^题目\s*$/.test(front) || /^question\s*$/i.test(front);
    if (!frontIsPlaceholder) return content;

    const fallback = (questionFallback || '').trim();
    if (!fallback) return content;

    return `${fallback}\n\n${sep}\n\n${back}`;
  }

  async function generateCards(): Promise<void> {
    if (isGenerating) return;

    const action = currentAction;
    if (!action) {
      new Notice(t('aiAssistant.selectedTextPanel.missingAction'));
      return;
    }

    const trimmed = (selectedText || '').trim();
    if (!trimmed) {
      new Notice(t('aiAssistant.selectedTextPanel.emptySelection'));
      return;
    }

    try {
      isGenerating = true;

      await loadDecks();
      await ensureSourceReference();

      const splitService = new AISplitService(host);
      const effectiveTargetCount = action.splitConfig?.targetCount || 3;

      const instruction = resolveDefaultAISplitInstruction(host);

      const tempParentCard: Card = {
        uuid: `temp-parent-${Date.now()}`,
        deckId: selectedDeckId || 'preview-deck',
        templateId: 'official-qa',
        type: CardType.Basic,
        cardPurpose: 'memory',
        content: trimmed,
        tags: [],
        priority: 0,
        fsrs: {
          due: new Date().toISOString(),
          stability: 0,
          difficulty: 0,
          elapsedDays: 0,
          scheduledDays: 0,
          reps: 0,
          lapses: 0,
          state: 0,
          retrievability: 0
        },
        reviewHistory: [],
        stats: {
          totalReviews: 0,
          totalTime: 0,
          averageTime: 0,
          memoryRate: 0
        },
        created: new Date().toISOString(),
        modified: new Date().toISOString()
      };

      const result = await splitService.splitCard(
        tempParentCard,
        action,
        {
          targetCount: effectiveTargetCount,
          instruction
        }
      );

      if (!result.success || !result.splitCards || result.splitCards.length === 0) {
        throw new Error(result.error || t('aiAssistant.selectedTextPanel.splitFailed'));
      }

      const newlyGenerated = result.splitCards.map((c, idx) => {
        const normalized = normalizeGeneratedCardContent(c.content || '');
        return toTempPreviewCard(normalized, idx);
      });

      childCards = newlyGenerated;
      selectedCardIds = new Set(newlyGenerated.map((c) => c.uuid));
      new Notice(t('aiAssistant.selectedTextPanel.generatedPreviewCards', { count: newlyGenerated.length }));
    } catch (e) {
      new Notice(e instanceof Error ? e.message : t('aiAssistant.selectedTextPanel.generateFailed'));
    } finally {
      isGenerating = false;
    }
  }

  function buildFinalContentForSave(body: string, deckName: string): string {
    const cleanBody = extractBodyContent(body || '').trim() || (body || '').trim();

    return createContentWithMetadata(
      {
        we_decks: deckName ? [deckName] : undefined,
        we_source: sourceWeSource || undefined
      },
      cleanBody
    );
  }

  function buildSourceTraceMeta() {
    const sourceKind = detectTraceSourceKind(sourceFilePath);
    return {
      sourceKind,
      sourceDocumentKey: normalizeTraceDocumentKey(sourceFilePath, sourceKind) || undefined
    };
  }

  async function handleSaveSelected(): Promise<void> {
    if (isGenerating) {
      new Notice(t('aiAssistant.selectedTextPanel.generatingPleaseWait'));
      return;
    }

    const selectedIds = Array.from(selectedCardIds);
    if (selectedIds.length === 0) {
      new Notice(t('aiAssistant.selectedTextPanel.selectCardsFirst'));
      return;
    }

    if (!selectedDeckId) {
      new Notice(t('aiAssistant.selectedTextPanel.selectTargetDeckFirst'));
      return;
    }

    const deckName = availableDecks.find((d) => d.id === selectedDeckId)?.name || '';

    try {
      let savedCount = 0;
      for (const c of childCards) {
        if (!selectedIds.includes(c.uuid)) continue;

        const now = new Date().toISOString();
        const finalContent = buildFinalContentForSave(c.content, deckName);

        const cardToSave: Card = {
          ...c,
          uuid: generateCardUUID(),
          deckId: selectedDeckId,
          templateId: 'official-qa',
          type: CardType.Basic,
          cardPurpose: 'memory',
          outputKind: 'memory',
          content: finalContent,
          sourceFile: sourceFilePath || undefined,
          ...buildSourceTraceMeta(),
          created: now,
          modified: now
        };

        delete (cardToSave as any).fields;

        const res = await host.dataStorage.saveCard(cardToSave);
        if (res.success) savedCount++;
      }

      new Notice(t('aiAssistant.selectedTextPanel.importSuccess', { count: savedCount }));

      try {
        (host.app.workspace as any).trigger('Weave:card-created', {
          deckId: selectedDeckId,
          source: 'editor-ai-split'
        });
      } catch {
      }

      onClose();
    } catch (e) {
      new Notice(e instanceof Error ? e.message : t('aiAssistant.selectedTextPanel.importFailed'));
    }
  }

  $effect(() => {
    if (didInit) return;
    didInit = true;
    restorePreviewHeight();
    loadDecks();
    generateCards();
  });

  onDestroy(() => {
    stopResizeDrag();
  });

  function toggleCardSelection(cardId: string) {
    const next = new Set(selectedCardIds);
    if (next.has(cardId)) next.delete(cardId);
    else next.add(cardId);
    selectedCardIds = next;
  }
</script>

<div class="weave-ai-card-panel">
  <div class="header">
    <div class="title">{t('aiAssistant.selectedTextPanel.title')}</div>
    <div class="header-actions">
      <button
        bind:this={resizeButtonEl}
        class="resize-control"
        class:dragging={isResizeDragging}
        type="button"
        title={t('aiAssistant.selectedTextPanel.previewResizeTitle')}
        aria-label={t('aiAssistant.selectedTextPanel.previewResizeAriaLabel')}
        onpointerdown={handleResizePointerDown}
      >
        ↕
      </button>
      <button class="close" type="button" onclick={onClose}>{t('aiAssistant.selectedTextPanel.close')}</button>
    </div>
  </div>

  <div
    class="content"
    style={`height: ${previewHeight}px; --weave-ai-preview-card-height: ${Math.max(156, previewHeight - 28)}px;`}
  >
    {#if isGenerating}
      <div class="generating-overlay" aria-busy="true">
        <div class="spinner"></div>
        <div class="generating-text">{t('aiAssistant.selectedTextPanel.generating')}</div>
      </div>
    {/if}

    {#if childCards.length === 0}
      <div class="loading">{t('aiAssistant.selectedTextPanel.emptyPreview')}</div>
    {:else}
      <div class="cards-strip">
        {#each childCards as card, i}
          <ChildCardMini
            {card}
            index={i}
            selected={selectedCardIds.has(card.uuid)}
            regenerating={false}
            disabled={false}
            onclick={() => toggleCardSelection(card.uuid)}
          />
        {/each}
      </div>
    {/if}
  </div>

  <div class="actions">
    <UnifiedActionsBar
      showChildOverlay={true}
      selectedCount={selectedCardIds.size}
      onReturn={onClose}
      onRegenerate={generateCards}
      onSave={handleSaveSelected}
      isRegenerating={isGenerating}
      showDeckSelector={true}
      {availableDecks}
      selectedDeckId={selectedDeckId}
      onDeckChange={(deckId) => {
        selectedDeckId = deckId;
      }}
    />
  </div>
</div>

<style>
  .weave-ai-card-panel {
    border-top: 1px solid var(--background-modifier-border);
    background: transparent;
    padding: 0.5rem 0.75rem 0;
    font-size: 12px;
    position: relative;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 0.5rem;
  }

  .title {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .resize-control,
  .close {
    appearance: none;
    -webkit-appearance: none;
    margin: 0;
    border: none !important;
    border-radius: 0;
    background: none !important;
    background-color: transparent !important;
    box-shadow: none !important;
    color: var(--text-normal);
    padding: 4px 2px;
    cursor: pointer;
    font-size: 12px;
    line-height: 1.35;
  }

  .resize-control {
    min-width: 18px;
    text-align: center;
    touch-action: none;
    user-select: none;
    font-size: 14px;
    font-weight: 600;
  }

  .resize-control.dragging {
    color: var(--interactive-accent);
  }

  .resize-control:hover,
  .close:hover {
    color: var(--interactive-accent);
    border: none !important;
    box-shadow: none !important;
    background: none !important;
    background-color: transparent !important;
  }

  .resize-control:focus-visible,
  .close:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--interactive-accent) 55%, transparent);
    outline-offset: 2px;
    border: none !important;
    box-shadow: none !important;
    background: none !important;
    background-color: transparent !important;
  }

  .content {
    position: relative;
    min-height: 160px;
    max-height: 420px;
    transition: height 0.14s ease;
  }

  .cards-strip {
    display: flex;
    gap: 1rem;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 0.5rem 0 1rem;
    align-items: stretch;
    height: 100%;
    box-sizing: border-box;
  }

  .generating-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    border-radius: 0.5rem;
    background: color-mix(in srgb, var(--background-primary) 72%, transparent);
    z-index: 1;
    pointer-events: none;
  }

  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--background-modifier-border);
    border-top-color: var(--text-muted);
    border-radius: 999px;
    animation: weave-spin 0.9s linear infinite;
  }

  .generating-text {
    color: var(--text-muted);
    font-size: 12px;
  }

  @keyframes weave-spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .loading {
    padding: 0.75rem 0;
    color: var(--text-muted);
  }

  .actions {
    padding: 0.5rem 0 0;
  }

  :global(.weave-ai-card-panel-container) {
    position: sticky;
    bottom: 0;
    z-index: 20;
    width: 100%;
    pointer-events: none;
    background: transparent;
  }

  .weave-ai-card-panel {
    pointer-events: auto;
  }
</style>
