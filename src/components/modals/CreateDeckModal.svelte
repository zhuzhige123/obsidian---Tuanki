<script lang="ts">
  import { logger } from '../../utils/logger';
  import { focusManager } from '../../utils/focus-manager';

  import type { WeavePlugin } from "../../main";
  import type { WeaveDataStorage } from "../../data/storage";
  import type { Deck } from "../../data/types";
  import { Menu, Notice } from "obsidian";
  import { saveMemoryCard, saveMemoryDeck } from "../../services/weave-domain";
  import { normalizeMemorySchedulingSettings } from "../../utils/learning-steps/memorySchedulingConfig";
  //  导入国际化
  import { tr } from '../../utils/i18n';

  interface Props {
    open: boolean;
    plugin: WeavePlugin;
    dataStorage: WeaveDataStorage;
    onClose: () => void;
    onCreated?: (deck: Deck) => void;
    onDeckCreated?: (deck: Deck) => void | Promise<void>;
    // 扩展：编辑模式
    mode?: 'create' | 'edit';
    initialDeck?: Deck | null;
    onUpdated?: (deck: Deck) => void;
    onDeckUpdated?: (deck: Deck) => void | Promise<void>;
    useObsidianModal?: boolean;
    // 父牌组功能已移除 - 不再支持父子牌组层级结构
  }

  let {
    open,
    plugin,
    dataStorage,
    onClose,
    onCreated: legacyOnCreated,
    onDeckCreated = legacyOnCreated,
    mode = 'create',
    initialDeck = null,
    onUpdated: legacyOnUpdated,
    onDeckUpdated = legacyOnUpdated,
    useObsidianModal = false
  }: Props = $props();

  //  响应式翻译函数
  let t = $derived($tr);

  let name = $state("");
  let category = $state("默认"); // Compatibility note: 保留用于兼容
  // 父牌组选择功能已移除 - 不再支持父子牌组层级结构
  let isSaving = $state(false);
  
  // 标签相关状态（单选）
  let selectedTag = $state<string>("");
  let tagInput = $state("");
  let availableTags = $state<string[]>([]);
  
  // 输入框引用（DOM引用不需要reactive）
  let nameInputRef: HTMLInputElement | null = $state(null);

  // 打开时加载可用牌组列表和初始化状态
  $effect(() => {
    if (open) {
      // 保存当前焦点
      focusManager.saveFocus();
      
      // 异步初始化
      (async () => {
        try {
          if (mode === 'edit' && initialDeck) {
            // 编辑模式：预填初始值
            name = initialDeck.name || '';
            category = initialDeck.category || '默认';
            selectedTag = (initialDeck.tags && initialDeck.tags.length > 0) ? initialDeck.tags[0] : '';
          } else if (mode === 'create') {
            // 创建模式：重置
            name = '';
            category = '默认';
            selectedTag = '';
            tagInput = '';
          }
          
          // 加载所有现有标签
          loadAvailableTags();
          
          // 延迟聚焦到输入框（等待DOM更新）
          setTimeout(() => {
            if (nameInputRef) {
              nameInputRef.focus();
              logger.debug('[CreateDeckModal] 聚焦到名称输入框');
            }
          }, 100);
        } catch (error) {
          logger.error('[CreateDeckModal] 初始化失败:', error);
          new Notice(t('modals.createDeck.initFailed'));
        }
      })();
    }
  });

  // 加载所有现有标签
  async function loadAvailableTags() {
    try {
      const allDecks = await dataStorage.getDecks();
      const allTags = new Set<string>();
      allDecks.forEach(deck => {
        if (deck.tags && Array.isArray(deck.tags)) {
          deck.tags.forEach(tag => allTags.add(tag));
        }
      });
      availableTags = Array.from(allTags).sort();
    } catch (error) {
      logger.error('Failed to load tags:', error);
      availableTags = [];
    }
  }
  
  // 选择标签（单选）
  function selectTag(tag: string) {
    const trimmedTag = tag.trim();
    if (trimmedTag) {
      selectedTag = trimmedTag;
      tagInput = '';
      
      // 如果是新标签，添加到可用标签列表
      if (!availableTags.includes(trimmedTag)) {
        availableTags = [...availableTags, trimmedTag].sort();
      }
    }
  }
  
  // 从输入框添加标签
  function handleTagInput(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (tagInput.trim()) {
        selectTag(tagInput);
      }
    } else if (e.key === 'Backspace' && tagInput === '' && selectedTag) {
      // 当输入框为空且按退格键时，清除已选标签
      e.preventDefault();
      selectedTag = '';
    }
  }
  
  // 清除标签
  function clearTag() {
    selectedTag = '';
  }

  async function notifyDeckCreated(deck: Deck) {
    if (typeof onDeckCreated === 'function') {
      await onDeckCreated(deck);
    }
  }

  async function notifyDeckUpdated(deck: Deck) {
    if (typeof onDeckUpdated === 'function') {
      await onDeckUpdated(deck);
    }
  }

  async function handleSubmit() {
    if (!name.trim() || isSaving) return;
    isSaving = true;
    try {
      const now = new Date();
      if (mode === 'edit' && initialDeck) {
        const oldName = initialDeck.name;
        const newName = name.trim();
        const updated: Deck = {
          ...initialDeck,
          name: newName,
          category: category.trim() || initialDeck.category || '默认',
          tags: selectedTag ? [selectedTag] : [],
          modified: now.toISOString(),
        } as Deck;
        const res = await saveMemoryDeck(plugin, updated, 'update');
        if (!res.success) throw new Error(res.error || 'saveDeck failed');
        const savedDeck = res.data || updated;
        
        // 牌组重命名时，批量更新所有该牌组卡片的 we_decks YAML 字段
        if (oldName !== newName) {
          try {
            const { setCardProperty } = await import('../../utils/yaml-utils');
            const allCards = await dataStorage.getCards();
            const deckCards = allCards.filter((c: any) => {
              if (c.deckId === initialDeck.id) return true;
              if (c.referencedByDecks?.includes(initialDeck.id)) return true;
              if (c.content?.includes(`we_decks:`) && c.content?.includes(oldName)) return true;
              return false;
            });
            for (const card of deckCards) {
              if (card.content) {
                const updatedContent = setCardProperty(card.content, 'we_decks', [newName]);
                if (updatedContent !== card.content) {
                  card.content = updatedContent;
                  await saveMemoryCard(plugin, card, 'update');
                }
              }
            }
            logger.debug(`[CreateDeckModal] 已更新 ${deckCards.length} 张卡片的 we_decks`);
          } catch (e) {
            logger.warn('[CreateDeckModal] 更新卡片 we_decks 失败:', e);
          }
        }
        
        await notifyDeckUpdated(savedDeck);
        closeModal();
        return;
      }

      // 创建模式：只支持创建根牌组
      const memoryScheduling = normalizeMemorySchedulingSettings(plugin.settings).settings;
      const deckSettings = {
        newCardsPerDay: 20,
        maxReviewsPerDay: 100,
        enableAutoAdvance: true,
        showAnswerTime: 0,
        fsrsParams: {
          w: plugin.settings.fsrsParams.w,
          requestRetention: plugin.settings.fsrsParams.requestRetention,
          maximumInterval: plugin.settings.fsrsParams.maximumInterval,
          enableFuzz: plugin.settings.fsrsParams.enableFuzz,
        },
        learningSteps: memoryScheduling.learningSteps,
        relearningSteps: memoryScheduling.relearningSteps,
        graduatingInterval: memoryScheduling.graduatingInterval,
        easyInterval: memoryScheduling.easyInterval,
      };
      
      const newDeck = await plugin.deckHierarchy.createDeck(
        name.trim(),
        deckSettings
      );
      
      // 更新分类和标签
      newDeck.category = category.trim() || '默认';
      newDeck.tags = selectedTag ? [selectedTag] : [];
      const res = await saveMemoryDeck(plugin, newDeck, 'update');
      if (!res.success) throw new Error(res.error || 'saveDeck failed');
      
      await notifyDeckCreated(res.data || newDeck);
      closeModal();
    } catch (error) {
      logger.error('Failed to create deck:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      new Notice(t('modals.createDeck.createFailed').replace('{error}', errorMsg));
    } finally {
      isSaving = false;
    }
  }

  function closeModal() {
    name = "";
    category = "默认";
    selectedTag = "";
    tagInput = "";
    
    // 恢复之前保存的焦点
    focusManager.restoreFocus();
    
    if (typeof onClose === 'function') {
      onClose();
    }
  }

  function handleOverlayClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      closeModal();
    }
  }

  function handleOverlayKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      closeModal();
    }
  }

  // 父牌组选择功能已移除 - 不再支持父子牌组层级结构
</script>

{#snippet modalContent()}
  {#if !useObsidianModal}
    <div class="modal-header">
      <h3>{mode === 'edit' ? t('modals.createDeck.titleEdit') : t('modals.createDeck.titleCreate')}</h3>
      <button class="icon-btn" aria-label={t('modals.createDeck.close')} onclick={closeModal}>×</button>
    </div>
  {/if}

  <div class="weave-deck-edit-form">
    <!-- 父牌组选择器已移除 - 不再支持父子牌组层级结构 -->

    <label class="weave-deck-edit-field">
      <span class="weave-deck-edit-field-label">{t('modals.createDeck.name')}</span>
      <input 
        class="weave-deck-edit-input" 
        placeholder={t('modals.createDeck.namePlaceholder')} 
        bind:value={name} 
        bind:this={nameInputRef}
      />
    </label>

    <label class="weave-deck-edit-field">
      <span class="weave-deck-edit-field-label">{t('modals.createDeck.tagLabel')}</span>
      
      <!-- 标签输入框（内含已选标签） -->
      <div class="weave-deck-edit-tag-input-wrapper">
        {#if selectedTag}
          <div class="weave-deck-edit-selected-tags">
            <span class="weave-deck-edit-tag-chip">
              <span>{selectedTag}</span>
              <button 
                type="button"
                class="weave-deck-edit-tag-chip-remove" 
                onclick={clearTag}
                aria-label={t('modals.createDeck.removeTag')}
              >
                ×
              </button>
            </span>
          </div>
        {/if}
        <input 
          class="weave-deck-edit-tag-input" 
          placeholder={selectedTag ? "" : t('modals.createDeck.tagPlaceholder')} 
          bind:value={tagInput}
          onkeydown={handleTagInput}
        />
      </div>
      
      <!-- 可选标签列表 -->
      {#if availableTags.length > 0}
        <div class="weave-deck-edit-available-tags">
          <div class="weave-deck-edit-available-tags-title">{t('modals.createDeck.availableTags')}</div>
          <div class="weave-deck-edit-available-tags-list">
            {#each availableTags as tag}
              <button 
                type="button"
                class="weave-deck-edit-available-tag-item {selectedTag === tag ? 'selected' : ''}"
                onclick={() => selectTag(tag)}
              >
                {tag}
              </button>
            {/each}
          </div>
        </div>
      {/if}
      
      <span class="weave-deck-edit-hint">{t('modals.createDeck.tagHint')}</span>
    </label>
  </div>

  <div class="weave-deck-edit-footer">
    <button class="weave-deck-edit-btn" onclick={closeModal}>{t('modals.createDeck.cancel')}</button>
    <button class="weave-deck-edit-btn weave-deck-edit-btn-primary" disabled={!name.trim() || isSaving} onclick={handleSubmit}>{mode === 'edit' ? t('modals.createDeck.save') : t('modals.createDeck.create')}</button>
  </div>
{/snippet}

{#if open}
  {#if useObsidianModal}
    <div class="modal modal-native" role="dialog" aria-modal="true" tabindex="0">
      {@render modalContent()}
    </div>
  {:else}
    <div class="modal-overlay" role="presentation" onclick={handleOverlayClick} onkeydown={handleOverlayKeydown} tabindex="-1">
      <div class="modal" role="dialog" aria-modal="true" tabindex="0">
        {@render modalContent()}
      </div>
    </div>
  {/if}
{/if}

<style>
  .modal-overlay {
    position: fixed; 
    inset: 0; 
    background: rgba(0,0,0,0.6);
    display: flex; 
    align-items: center; 
    justify-content: center;
    z-index: var(--weave-z-top); /* 提高z-index，确保在所有内容之上 */
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
    z-index: calc(var(--weave-z-top) + 1);
  }

  .modal-native {
    width: 100%;
    max-width: 100%;
    border: none;
    border-radius: 0;
    box-shadow: none;
    background: transparent;
  }
  
  .modal-header { 
    display: flex; 
    align-items: center; 
    justify-content: space-between; 
    padding: 1rem 1rem 0.5rem; 
  }
  
  .modal-header h3 { 
    margin: 0; 
    font-size: 1.125rem; 
    font-weight: 700; 
  }
  
  .icon-btn { 
    background: transparent; 
    border: none; 
    color: var(--text-muted); 
    font-size: 1.25rem; 
    cursor: pointer; 
  }
  
  .icon-btn:hover { 
    color: var(--text-normal); 
  }
</style>
