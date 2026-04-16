<script lang="ts">
  import { Notice } from 'obsidian';
  import type { WeavePlugin } from '../../main';
  import type { Card } from '../../data/types';
  import { CardType } from '../../data/types';
  import { get } from 'svelte/store';

  import { customActionsForMenu } from '../../stores/ai-config.store';
  import ChildCardMini from '../study/ChildCardMini.svelte';
  import UnifiedActionsBar from '../study/UnifiedActionsBar.svelte';

  import { AISplitService } from '../../services/ai/AISplitService';
  import { createContentWithMetadata, extractBodyContent } from '../../utils/yaml-utils';
  import { generateCardUUID } from '../../services/identifier/WeaveIDGenerator';
  import { detectTraceSourceKind, normalizeTraceDocumentKey } from '../../services/incremental-reading/IRSourceTraceStats';

  interface Props {
    plugin: WeavePlugin;
    selectedText: string;
    actionId: string;
    sourceFilePath: string;
    onClose: () => void;
  }

  let { plugin, selectedText, actionId, sourceFilePath, onClose }: Props = $props();

  let isGenerating = $state(false);
  let childCards = $state<Card[]>([]);
  let selectedCardIds = $state(new Set<string>());

  let availableDecks = $state<Array<{ id: string; name: string }>>([]);
  let selectedDeckId = $state<string>('');

  let sourceWeSource = $state<string>('');

  let didInit = $state(false);

  let currentAction = $derived.by(() => {
    const actions = get(customActionsForMenu);
    return actions.split.find((a) => a.id === actionId) || null;
  });

  async function loadDecks() {
    try {
      const allDecks = await plugin.dataStorage.getDecks();
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
      new Notice('未找到指定的AI拆分功能');
      return;
    }

    const trimmed = (selectedText || '').trim();
    if (!trimmed) {
      new Notice('请先选中要制卡的文本');
      return;
    }

    try {
      isGenerating = true;

      await loadDecks();
      await ensureSourceReference();

      const splitService = new AISplitService(plugin);
      const effectiveTargetCount = action.splitConfig?.targetCount || 3;

      const baseInstruction = (plugin.settings as any).aiConfig?.cardSplitting?.defaultInstruction || undefined;
      const instruction = baseInstruction ? String(baseInstruction) : undefined;

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
        throw new Error(result.error || '拆分失败');
      }

      const newlyGenerated = result.splitCards.map((c, idx) => {
        const normalized = normalizeGeneratedCardContent(c.content || '');
        return toTempPreviewCard(normalized, idx);
      });

      childCards = newlyGenerated;
      selectedCardIds = new Set(newlyGenerated.map((c) => c.uuid));
      new Notice(`已生成 ${newlyGenerated.length} 张预览卡片`);
    } catch (e) {
      new Notice(e instanceof Error ? e.message : '生成失败');
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
      new Notice('正在生成，请稍候');
      return;
    }

    const selectedIds = Array.from(selectedCardIds);
    if (selectedIds.length === 0) {
      new Notice('请先选择要导入的卡片');
      return;
    }

    if (!selectedDeckId) {
      new Notice('请先选择目标牌组');
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

        const res = await plugin.dataStorage.saveCard(cardToSave);
        if (res.success) savedCount++;
      }

      new Notice(`成功导入 ${savedCount} 张卡片`);

      try {
        (plugin.app.workspace as any).trigger('Weave:card-created', {
          deckId: selectedDeckId,
          source: 'editor-ai-split'
        });
      } catch {
      }

      onClose();
    } catch (e) {
      new Notice(e instanceof Error ? e.message : '导入失败');
    }
  }

  $effect(() => {
    if (didInit) return;
    didInit = true;
    loadDecks();
    generateCards();
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
    <div class="title">AI预览卡片分布</div>
    <div class="header-actions">
      <button class="close" type="button" onclick={onClose}>关闭</button>
    </div>
  </div>

  <div class="content">
    {#if isGenerating}
      <div class="generating-overlay" aria-busy="true">
        <div class="spinner"></div>
        <div class="generating-text">正在生成...</div>
      </div>
    {/if}

    {#if childCards.length === 0}
      <div class="loading">暂无预览卡片</div>
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

  .close {
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    color: var(--text-normal);
    padding: 0.25rem 0.5rem;
    border-radius: 0.375rem;
    cursor: pointer;
    font-size: 12px;
  }

  .content {
    position: relative;
    min-height: 160px;
  }

  .cards-strip {
    display: flex;
    gap: 1rem;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 0.5rem 0 1rem;
    align-items: center;
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
