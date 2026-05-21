<script lang="ts">
  /**
   * 组建牌组模态窗 (v2.0+ 平级牌组架构)
   * 
   * 功能：从选中的卡片创建新的引用式牌组
   * - 牌组只存储卡片UUID引用，不复制卡片数据
   * - 支持设置名称和标签
   * - 创建后自动更新卡片的 we_decks
   * 
   * v2.0+ 平级架构：已移除父牌组选择功能
   */
  import { logger } from '../../utils/logger';
  import { focusManager } from '../../utils/focus-manager';
  import type { WeavePlugin } from "../../main";
  import { saveMemoryDeck } from "../../services/weave-domain";
  import type { Deck } from "../../data/types";
  import { Menu, Notice } from "obsidian";
  import { get } from 'svelte/store';
  import { tr } from '../../utils/i18n';
  import { generateId } from '../../utils/helpers';
  import { PremiumFeatureGuard, PREMIUM_FEATURES } from '../../services/premium/PremiumFeatureGuard';
  import { parseChoiceQuestion } from '../../parsing/choice-question-parser';
  import { isInputClozeQuestionContent } from '../../utils/question-bank/input-cloze-utils';
  import ObsidianIcon from '../ui/ObsidianIcon.svelte';

  interface Props {
    open: boolean;
    plugin: WeavePlugin;
    /** 选中的卡片UUID数组 */
    selectedCardUUIDs: string[];
    pairedMemoryDeckId?: string | null;
    onClose: () => void;
    onCreated?: (deck: Deck) => void;
    onDeckCreated?: (deck: Deck) => void | Promise<void>;
  }

  let {
    open,
    plugin,
    selectedCardUUIDs,
    pairedMemoryDeckId,
    onClose,
    onCreated: legacyOnCreated,
    onDeckCreated = legacyOnCreated
  }: Props = $props();

  // 响应式翻译
  let t = $derived($tr);

  // 表单状态
  let name = $state("");
  let selectedTag = $state<string>("");
  let tagInput = $state("");
  let buildTarget = $state<'memory' | 'question-bank'>('memory');
  const premiumGuard = PremiumFeatureGuard.getInstance();
  let isPremium = $state(get(premiumGuard.isPremiumActive));
  let showPremiumFeaturesPreview = $state(get(premiumGuard.premiumFeaturesPreviewEnabled));
  
  // 数据状态
  let availableDecks = $state<Deck[]>([]);
  let availableTags = $state<string[]>([]);
  let isSaving = $state(false);
  let errorMessage = $state("");
  
  // DOM引用
  let nameInputRef: HTMLInputElement | null = $state(null);
  let buildTargetMenuButtonRef: HTMLButtonElement | null = $state(null);

  let questionBankEligibleUUIDs = $state<string[]>([]);

  function createMemoryDeckStats(totalCards: number) {
    return {
      totalCards,
      newCards: 0,
      learningCards: 0,
      reviewCards: 0,
      todayNew: 0,
      todayReview: 0,
      todayTime: 0,
      totalReviews: 0,
      totalTime: 0,
      memoryRate: 0,
      averageEase: 0,
      forecastDays: {}
    };
  }

  $effect(() => {
    const unsubscribePremium = premiumGuard.isPremiumActive.subscribe((value) => {
      isPremium = value;
    });
    const unsubscribePreview = premiumGuard.premiumFeaturesPreviewEnabled.subscribe((value) => {
      showPremiumFeaturesPreview = value;
    });

    return () => {
      unsubscribePremium();
      unsubscribePreview();
    };
  });

  const canShowQuestionBankBuildTarget = $derived(
    premiumGuard.shouldShowFeatureEntry(PREMIUM_FEATURES.QUESTION_BANK, {
      isPremium,
      showPremiumPreview: showPremiumFeaturesPreview
    })
  );

  const canUseQuestionBankBuildTarget = $derived(
    premiumGuard.isPremiumFeature(PREMIUM_FEATURES.QUESTION_BANK) ? isPremium : true
  );

  const questionBankSkippedCount = $derived.by(() =>
    buildTarget === 'question-bank'
      ? Math.max(0, selectedCardUUIDs.length - questionBankEligibleUUIDs.length)
      : 0
  );

  const buildTargetMenuLabel = $derived.by(() =>
    buildTarget === 'memory'
      ? t('study.questionBankUI.buildDeckModal.defaultFormat')
      : t('study.questionBankUI.buildDeckModal.examSet')
  );

  // 打开时初始化
  $effect(() => {
    if (open) {
      focusManager.saveFocus();
      
      (async () => {
        try {
          await loadAvailableDecks();
          loadAvailableTags();
          
          // 重置表单
          name = '';
          selectedTag = '';
          tagInput = '';
          errorMessage = '';
          buildTarget = 'memory';
          questionBankEligibleUUIDs = [];
          
          // 聚焦到名称输入框
          setTimeout(() => {
            if (nameInputRef) {
              nameInputRef.focus();
            }
          }, 100);
        } catch (error) {
          logger.error('[BuildDeckModal] 初始化失败:', error);
          new Notice(t('study.questionBankUI.buildDeckModal.initFailed'));
        }
      })();
    }
  });

  $effect(() => {
    if (!open || buildTarget !== 'question-bank') {
      return;
    }

    (async () => {
      try {
        const allCards = await plugin.dataStorage.getCards();
        const cardByUuid = new Map<string, (typeof allCards)[number]>();
        for (const card of allCards) {
          cardByUuid.set(card.uuid, card);
        }

        questionBankEligibleUUIDs = selectedCardUUIDs
          .map((uuid) => cardByUuid.get(uuid))
          .filter((card): card is (typeof allCards)[number] => card !== undefined)
          .filter((card) => Boolean(parseChoiceQuestion(card.content)) || isInputClozeQuestionContent(card.content))
          .map((card) => card.uuid);
      } catch (error) {
        logger.error('[BuildDeckModal] 题库题目筛选失败:', error);
        questionBankEligibleUUIDs = [];
      }
    })();
  });

  $effect(() => {
    if (buildTarget === 'question-bank' && !canShowQuestionBankBuildTarget) {
      buildTarget = 'memory';
    }
  });

  async function loadAvailableDecks() {
    try {
      availableDecks = await plugin.dataStorage.getDecks();
    } catch (error) {
      logger.error('[BuildDeckModal] 加载牌组失败:', error);
      availableDecks = [];
    }
  }

  function loadAvailableTags() {
    const allTags = new Set<string>();
    for (const deck of availableDecks) {
      if (Array.isArray(deck.tags)) {
        for (const tag of deck.tags) {
          allTags.add(tag);
        }
      }
    }
    availableTags = Array.from(allTags).sort();
  }

  function setBuildTarget(nextTarget: 'memory' | 'question-bank') {
    if (nextTarget === 'question-bank') {
      if (!canShowQuestionBankBuildTarget) {
        return;
      }

      if (!canUseQuestionBankBuildTarget) {
        new Notice(t('study.questionBankUI.buildDeckModal.qbPremiumRequired'));
        return;
      }
    }

    buildTarget = nextTarget;
  }

  function openBuildTargetMenu(event?: MouseEvent | KeyboardEvent) {
    if (!canShowQuestionBankBuildTarget) {
      return;
    }

    const menu = new Menu();
    menu.setUseNativeMenu?.(false);

    menu.addItem((item) => {
      item
        .setTitle(t('study.questionBankUI.buildDeckModal.buildDeck'))
        .setIcon('brain')
        .setChecked(buildTarget === 'memory')
        .onClick(() => {
          setBuildTarget('memory');
        });
    });

    menu.addItem((item) => {
      item
        .setTitle(canUseQuestionBankBuildTarget ? t('study.questionBankUI.buildDeckModal.buildExamSet') : t('study.questionBankUI.buildDeckModal.buildExamSetPremium'))
        .setIcon('list')
        .setChecked(buildTarget === 'question-bank')
        .onClick(() => {
          setBuildTarget('question-bank');
        });
    });

    const trigger =
      event?.currentTarget instanceof HTMLElement
        ? event.currentTarget
        : buildTargetMenuButtonRef;

    if (trigger) {
      const rect = trigger.getBoundingClientRect();
      menu.showAtPosition({
        x: Math.round(rect.left),
        y: Math.round(rect.bottom)
      });
      return;
    }

    menu.showAtPosition({
      x: Math.round(window.innerWidth / 2),
      y: Math.max(96, Math.round(window.innerHeight / 2))
    });
  }

  function handleBuildTargetMenuKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    openBuildTargetMenu(event);
  }

  function selectTag(tag: string) {
    const trimmedTag = tag.trim();
    if (!trimmedTag) {
      return;
    }

    selectedTag = trimmedTag;
    tagInput = '';
    if (!availableTags.includes(trimmedTag)) {
      availableTags = [...availableTags, trimmedTag].sort();
    }
  }

  function handleTagInput(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (tagInput.trim()) {
        selectTag(tagInput);
      }
      return;
    }

    if (event.key === 'Backspace' && tagInput === '' && selectedTag) {
      event.preventDefault();
      selectedTag = '';
    }
  }

  function clearTag() {
    selectedTag = '';
  }

  async function notifyDeckCreated(deck: Deck) {
    if (typeof onDeckCreated === 'function') {
      await onDeckCreated(deck);
    }
  }

  async function handleSubmit() {
    if (!name.trim() || isSaving || selectedCardUUIDs.length === 0) {
      return;
    }

    if (buildTarget === 'question-bank' && !canUseQuestionBankBuildTarget) {
      errorMessage = t('study.questionBankUI.buildDeckModal.qbPremiumRequired');
      new Notice(errorMessage);
      return;
    }

    if (buildTarget === 'question-bank' && questionBankEligibleUUIDs.length === 0) {
      return;
    }

    errorMessage = '';
    isSaving = true;

    try {
      if (buildTarget === 'memory') {
        if (!plugin.dataStorage) {
          throw new Error(t('study.questionBankUI.buildDeckModal.dataStorageNotReady'));
        }

        const now = new Date().toISOString();
        const newDeck: Deck = {
          id: generateId(),
          name: name.trim(),
          description: '',
          category: selectedTag || '',
          categoryIds: [],
          parentId: undefined,
          path: name.trim(),
          level: 0,
          order: availableDecks.length,
          inheritSettings: false,
          settings: plugin.dataStorage.getCurrentDefaultDeckSettings(),
          stats: createMemoryDeckStats(selectedCardUUIDs.length),
          includeSubdecks: false,
          deckType: 'mixed',
          purpose: 'memory',
          created: now,
          modified: now,
          tags: selectedTag ? [selectedTag] : [],
          metadata: {}
        };

        const saveDeckResult = await saveMemoryDeck(plugin, newDeck, 'create');
        if (!saveDeckResult.success || !saveDeckResult.data) {
          throw new Error(saveDeckResult.error || t('study.questionBankUI.buildDeckModal.createDeckFailed'));
        }

        const moveResult = await plugin.dataStorage.moveCardsToDeck(
          selectedCardUUIDs,
          saveDeckResult.data.id
        );
        if (moveResult.failed.length > 0) {
          throw new Error(t('study.questionBankUI.buildDeckModal.movePartialFailed', { count: moveResult.failed.length }));
        }

        new Notice(t('study.questionBankUI.buildDeckModal.deckCreateSuccess', { name, count: moveResult.moved.length }));
        await notifyDeckCreated(saveDeckResult.data);
        closeModal();
        return;
      }

      if (!plugin.questionBankService) {
        throw new Error(t('study.questionBankUI.buildDeckModal.qbServiceNotReady'));
      }

      const createdAt = new Date().toISOString();
      const bank: Deck = {
        id: generateId(),
        name: name.trim(),
        description: '',
        category: '',
        categoryIds: [],
        parentId: undefined,
        path: name.trim(),
        level: 0,
        order: 0,
        inheritSettings: false,
        settings: {} as any,
        stats: {} as any,
        includeSubdecks: false,
        deckType: 'question-bank',
        created: createdAt,
        modified: createdAt,
        tags: selectedTag ? [selectedTag] : [],
        metadata: {
          questionCount: 0,
          ...(pairedMemoryDeckId ? { pairedMemoryDeckId } : {})
        }
      };

      const createdBank = await plugin.questionBankService.createBank(bank);
      const uuidsToAdd = questionBankEligibleUUIDs.length > 0 ? questionBankEligibleUUIDs : [];
      if (uuidsToAdd.length === 0) {
        throw new Error(t('study.questionBankUI.buildDeckModal.noEligibleQuestions'));
      }

      await plugin.questionBankService.addQuestionRefs(createdBank.id, uuidsToAdd);
      new Notice(t('study.questionBankUI.buildDeckModal.bankCreateSuccess', { name, count: uuidsToAdd.length }));
      await notifyDeckCreated(createdBank);
      closeModal();
    } catch (error) {
      logger.error('[BuildDeckModal] 创建牌组失败:', error);
      errorMessage = error instanceof Error ? error.message : t('study.questionBankUI.buildDeckModal.createFailed');
      new Notice(errorMessage);
    } finally {
      isSaving = false;
    }
  }

  function closeModal() {
    name = '';
    selectedTag = '';
    tagInput = '';
    errorMessage = '';
    buildTarget = 'memory';
    questionBankEligibleUUIDs = [];
    focusManager.restoreFocus();

    if (typeof onClose === 'function') {
      onClose();
    }
  }
 </script>
 
 {#if open}
  <div class="modal-overlay" role="presentation" onclick={(e) => {
    if (e.target === e.currentTarget) closeModal();
  }}>
    <div class="modal" role="dialog" aria-modal="true" tabindex="0" >
      <div class="modal-header">
        <div class="header-leading">
          {#if canShowQuestionBankBuildTarget}
            <button
              bind:this={buildTargetMenuButtonRef}
              class="build-target-menu-btn"
              type="button"
              aria-label={t('study.questionBankUI.buildDeckModal.menuSwitchTarget')}
              title={t('study.questionBankUI.buildDeckModal.menuSwitchTarget')}
              onclick={(event) => openBuildTargetMenu(event)}
              onkeydown={handleBuildTargetMenuKeydown}
            >
              <span class="build-target-menu-text">{buildTargetMenuLabel}</span>
              <ObsidianIcon name="chevron-down" size={12} />
            </button>
          {:else}
            <div class="build-target-menu-label">{buildTargetMenuLabel}</div>
          {/if}
        </div>
        <button class="icon-btn header-close" aria-label={t('study.questionBankUI.buildDeckModal.close')} onclick={closeModal}>×</button>
      </div>

      <div class="modal-body">
        <!-- 牌组名称 -->
        <label>
          <span>{t('study.questionBankUI.buildDeckModal.nameLabel')}</span>
          <input 
            class="text-input" 
            placeholder={t('study.questionBankUI.buildDeckModal.namePlaceholder')} 
            bind:value={name} 
            bind:this={nameInputRef}
          />
        </label>

        <!-- 标签选择 -->
        <label>
          <span>{t('study.questionBankUI.buildDeckModal.tagLabel')}</span>
          
          <div class="tag-input-wrapper">
            {#if selectedTag}
              <div class="selected-tags">
                <span class="tag-chip">
                  <span class="tag-text">{selectedTag}</span>
                  <button 
                    type="button"
                    class="tag-chip-remove" 
                    onclick={clearTag}
                    aria-label={t('study.questionBankUI.buildDeckModal.removeTag')}
                  >
                    ×
                  </button>
                </span>
              </div>
            {/if}
            <input 
              class="tag-input" 
              placeholder={selectedTag ? "" : t('study.questionBankUI.buildDeckModal.tagPlaceholder')} 
              bind:value={tagInput}
              onkeydown={handleTagInput}
            />
          </div>
          
          {#if availableTags.length > 0}
            <div class="available-tags">
              <div class="available-tags-title">{t('study.questionBankUI.buildDeckModal.availableTags')}</div>
              <div class="available-tags-list">
                {#each availableTags as tag}
                  <button 
                    type="button"
                    class="available-tag-item {selectedTag === tag ? 'selected' : ''}"
                    onclick={() => selectTag(tag)}
                  >
                    {tag}
                  </button>
                {/each}
              </div>
            </div>
          {/if}
          
          <span class="hint">{t('study.questionBankUI.buildDeckModal.tagHint')}</span>
        </label>

        <!-- 卡片数量提示 -->
        <div class="card-count-info">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 14A6 6 0 108 2a6 6 0 000 12z" stroke="currentColor" stroke-width="1.5"/>
            <path d="M8 5v3M8 10.5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          {#if buildTarget === 'memory'}
            <span>{t('study.questionBankUI.buildDeckModal.referenceCards', { count: selectedCardUUIDs.length })}</span>
          {:else}
            <span>{t('study.questionBankUI.buildDeckModal.referenceQuestions', { count: questionBankEligibleUUIDs.length })}</span>
          {/if}
        </div>

        {#if buildTarget === 'question-bank'}
          <div class="build-target-hint">
            <div class="build-target-hint-title">{t('study.questionBankUI.buildDeckModal.inclusionRules')}</div>
            <div class="build-target-hint-text">{@html t('study.questionBankUI.buildDeckModal.includeRule1')}</div>
            <div class="build-target-hint-text">{@html t('study.questionBankUI.buildDeckModal.includeRule2')}</div>
            {#if questionBankSkippedCount > 0}
              <div class="build-target-hint-warning">{t('study.questionBankUI.buildDeckModal.skippedWarning', { count: questionBankSkippedCount })}</div>
            {/if}
          </div>
        {/if}

        <!-- 错误提示 -->
        {#if errorMessage}
          <div class="error-message">
            {errorMessage}
          </div>
        {/if}
      </div>

      <div class="modal-footer">
        <button class="btn" onclick={closeModal}>{t('study.questionBankUI.buildDeckModal.cancel')}</button>
        <button 
          class="btn primary" 
          disabled={!name.trim() || isSaving || (buildTarget === 'memory' ? selectedCardUUIDs.length === 0 : questionBankEligibleUUIDs.length === 0)} 
          onclick={handleSubmit}
        >
          {isSaving ? t('study.questionBankUI.buildDeckModal.creating') : t('study.questionBankUI.buildDeckModal.create')}
        </button>
      </div>
    </div>
  </div>
 {/if}

<style>
  .modal-overlay {
    position: fixed; 
    inset: 0; 
    background: rgba(0,0,0,0.6);
    display: flex; 
    align-items: center; 
    justify-content: center;
    z-index: var(--layer-notice);
  }
  
  .modal {
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.75rem; 
    width: 520px; 
    max-width: calc(100vw - 2rem);
    box-shadow: var(--anki-shadow-2xl);
    display: flex; 
    flex-direction: column;
    z-index: calc(var(--layer-notice) + 1);
  }

  .modal-header { 
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 1rem 1rem 0.5rem; 
  }

  .header-leading {
    display: flex;
    align-items: center;
    min-width: 0;
    flex: 1 1 auto;
  }

  .header-close {
    flex: 0 0 auto;
  }

  .build-target-menu-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    max-width: 100%;
    padding: 0.25rem 0.15rem;
    border-radius: 8px;
    border: none;
    background: transparent;
    color: var(--text-normal);
    font-size: 0.95rem;
    font-weight: 600;
    line-height: 1.2;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
    box-shadow: none;
    border-image: none;
    outline: none;
    text-decoration: none;
    transition: color 0.15s ease, opacity 0.15s ease;
  }

  .build-target-menu-btn::before,
  .build-target-menu-btn::after {
    display: none;
    content: none;
  }

  .build-target-menu-btn:hover {
    background: transparent;
    color: var(--text-accent, var(--text-normal));
  }

  .build-target-menu-btn:focus-visible {
    background: transparent;
    box-shadow: none;
    color: var(--text-accent, var(--text-normal));
    opacity: 0.9;
  }

  .build-target-menu-label {
    display: inline-flex;
    align-items: center;
    min-width: 0;
    max-width: 100%;
    padding: 0.25rem 0.15rem;
    color: var(--text-normal);
    font-size: 0.95rem;
    font-weight: 600;
    line-height: 1.2;
  }

  .build-target-menu-text {
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .icon-btn { 
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    padding: 0.2rem 0.15rem;
    background: transparent; 
    border: none; 
    border-radius: 8px;
    color: var(--text-muted); 
    font-size: 1.25rem; 
    line-height: 1;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
    box-shadow: none;
    border-image: none;
    outline: none;
    text-decoration: none;
    transition: color 0.15s ease, opacity 0.15s ease;
  }

  .icon-btn::before,
  .icon-btn::after {
    display: none;
    content: none;
  }
  
  .icon-btn:hover { 
    background: transparent;
    color: var(--text-normal); 
  }

  .icon-btn:focus-visible {
    background: transparent;
    box-shadow: none;
    color: var(--text-normal);
    opacity: 0.9;
  }
  
  .modal-body { 
    display: flex; 
    flex-direction: column; 
    gap: 0.75rem; 
    padding: 0.5rem 1rem 1rem; 
  }
  
  label { 
    display: flex; 
    flex-direction: column; 
    gap: 0.375rem; 
  }
  
  label span { 
    font-size: 0.875rem; 
    color: var(--text-muted); 
  }
  
  .text-input {
    padding: 0.625rem 0.75rem; 
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.5rem; 
    background: var(--background-secondary); 
    color: var(--text-normal);
    font-size: 0.9rem;
  }
  
  .text-input:focus { 
    outline: none; 
    border-color: var(--interactive-accent); 
  }
  
  .hint {
    font-size: 0.8rem;
    color: var(--text-muted);
    font-style: italic;
    margin-top: 4px;
  }
  
  /* 卡片数量提示 */
  .card-count-info {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    background: color-mix(in srgb, var(--interactive-accent) 10%, var(--background-secondary));
    border: 1px solid color-mix(in srgb, var(--interactive-accent) 30%, transparent);
    border-radius: 8px;
    color: var(--text-normal);
    font-size: 0.9rem;
  }
  
  .card-count-info svg {
    color: var(--interactive-accent);
    flex-shrink: 0;
  }
  
  .build-target-hint {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px 14px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--background-secondary) 88%, var(--interactive-accent) 12%);
    border: 1px solid color-mix(in srgb, var(--interactive-accent) 18%, var(--background-modifier-border));
  }

  .build-target-hint-title {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--text-normal);
  }

  .build-target-hint-text,
  .build-target-hint-warning {
    font-size: 0.82rem;
    line-height: 1.5;
    color: var(--text-muted);
  }

  .build-target-hint-warning {
    color: var(--text-warning);
  }

  :global(.build-target-hint code) {
    font-family: var(--font-monospace);
    font-size: 0.8rem;
  }
  
  /* 错误提示 */
  .error-message {
    padding: 10px 14px;
    background: color-mix(in srgb, var(--text-error) 10%, var(--background-secondary));
    border: 1px solid color-mix(in srgb, var(--text-error) 30%, transparent);
    border-radius: 6px;
    color: var(--text-error);
    font-size: 0.85rem;
  }
  
  /* 标签相关样式 */
  .tag-input-wrapper {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    padding: 6px 8px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.5rem;
    background: var(--background-secondary);
    min-height: 38px;
    transition: all 0.2s ease;
  }
  
  .tag-input-wrapper:focus-within {
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.1);
  }
  
  .selected-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  
  .tag-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-radius: 10px;
    font-size: 0.75rem;
    font-weight: 500;
  }
  
  .tag-chip-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    padding: 0;
    background: rgba(255, 255, 255, 0.2);
    border: none;
    border-radius: 50%;
    color: var(--text-on-accent);
    font-size: 12px;
    cursor: pointer;
  }
  
  .tag-chip-remove:hover {
    background: rgba(255, 255, 255, 0.35);
  }
  
  .tag-input {
    flex: 1;
    min-width: 120px;
    padding: 4px;
    border: none;
    background: transparent;
    color: var(--text-normal);
    font-size: 0.9rem;
    outline: none;
  }
  
  .available-tags {
    margin-top: 8px;
    padding: 8px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
  }
  
  .available-tags-title {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-bottom: 6px;
    font-weight: 500;
  }
  
  .available-tags-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  
  .available-tag-item {
    padding: 4px 10px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 12px;
    color: var(--text-normal);
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .available-tag-item:hover {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
  }
  
  .available-tag-item.selected {
    background: color-mix(in srgb, var(--interactive-accent) 15%, var(--background-secondary));
    border-color: var(--interactive-accent);
    color: var(--interactive-accent);
    font-weight: 600;
  }
  
  .modal-footer { 
    display: flex; 
    justify-content: flex-end; 
    gap: 0.5rem; 
    padding: 0 1rem 1rem; 
  }
  
  .btn { 
    padding: 0.5rem 0.9rem; 
    border-radius: 0.5rem; 
    border: 1px solid var(--background-modifier-border); 
    background: var(--background-secondary); 
    color: var(--text-normal); 
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .btn:hover {
    background: var(--background-modifier-hover);
  }
  
  .btn.primary { 
    background: var(--interactive-accent);
    color: var(--text-on-accent); 
    border: none;
    font-weight: 600;
  }
  
  .btn.primary:hover {
    background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
  }
  
  .btn:disabled { 
    opacity: 0.6; 
    cursor: not-allowed; 
  }

</style>
