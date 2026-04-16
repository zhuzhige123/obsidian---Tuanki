<script lang="ts">
  import { logger } from '../../utils/logger';
  import { focusManager } from '../../utils/focus-manager';

  import type { WeavePlugin } from "../../main";
  import type { WeaveDataStorage } from "../../data/storage";
  import type { Deck } from "../../data/types";
  import { Menu, Notice } from "obsidian";
  import { normalizeMemorySchedulingSettings } from "../../utils/learning-steps/memorySchedulingConfig";
  //  导入国际化
  import { tr } from '../../utils/i18n';

  interface Props {
    open: boolean;
    plugin: WeavePlugin;
    dataStorage: WeaveDataStorage;
    onClose: () => void;
    onCreated?: (deck: Deck) => void;
    // 扩展：编辑模式
    mode?: 'create' | 'edit';
    initialDeck?: Deck | null;
    onUpdated?: (deck: Deck) => void;
    useObsidianModal?: boolean;
    // 父牌组功能已移除 - 不再支持父子牌组层级结构
  }

  let { open, plugin, dataStorage, onClose, onCreated, mode = 'create', initialDeck = null, onUpdated, useObsidianModal = false }: Props = $props();

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
        const res = await dataStorage.saveDeck(updated);
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
                  await dataStorage.saveCard(card);
                }
              }
            }
            logger.debug(`[CreateDeckModal] 已更新 ${deckCards.length} 张卡片的 we_decks`);
          } catch (e) {
            logger.warn('[CreateDeckModal] 更新卡片 we_decks 失败:', e);
          }
        }
        
        onUpdated?.(savedDeck);
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
      const res = await dataStorage.saveDeck(newDeck);
      if (!res.success) throw new Error(res.error || 'saveDeck failed');
      
      onCreated?.(res.data || newDeck);
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
  <div class="modal-header">
    <h3>{mode === 'edit' ? t('modals.createDeck.titleEdit') : t('modals.createDeck.titleCreate')}</h3>
    {#if !useObsidianModal}
      <button class="icon-btn" aria-label={t('modals.createDeck.close')} onclick={closeModal}>×</button>
    {/if}
  </div>

  <div class="modal-body">
    <!-- 父牌组选择器已移除 - 不再支持父子牌组层级结构 -->

    <label>
      <span>{t('modals.createDeck.name')}</span>
      <input 
        class="text-input" 
        placeholder={t('modals.createDeck.namePlaceholder')} 
        bind:value={name} 
        bind:this={nameInputRef}
      />
    </label>

    <label>
      <span>{t('modals.createDeck.tagLabel')}</span>
      
      <!-- 标签输入框（内含已选标签） -->
      <div class="tag-input-wrapper">
        {#if selectedTag}
          <div class="selected-tags">
            <span class="tag-chip">
              <span class="tag-text">{selectedTag}</span>
              <button 
                type="button"
                class="tag-chip-remove" 
                onclick={clearTag}
                aria-label={t('modals.createDeck.removeTag')}
              >
                ×
              </button>
            </span>
          </div>
        {/if}
        <input 
          class="tag-input" 
          placeholder={selectedTag ? "" : t('modals.createDeck.tagPlaceholder')} 
          bind:value={tagInput}
          onkeydown={handleTagInput}
        />
      </div>
      
      <!-- 可选标签列表 -->
      {#if availableTags.length > 0}
        <div class="available-tags">
          <div class="available-tags-title">{t('modals.createDeck.availableTags')}</div>
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
      
      <span class="hint">{t('modals.createDeck.tagHint')}</span>
    </label>
  </div>

  <div class="modal-footer">
    <button class="btn" onclick={closeModal}>{t('modals.createDeck.cancel')}</button>
    <button class="btn primary" disabled={!name.trim() || isSaving} onclick={handleSubmit}>{mode === 'edit' ? t('modals.createDeck.save') : t('modals.createDeck.create')}</button>
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
    color: var(--text-accent);
    font-style: italic;
    margin-top: 4px;
  }
  
  /* 标签相关样式 */
  
  /* 标签输入框容器 */
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
  
  /* 输入框内的已选标签容器 */
  .selected-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  
  /* 输入框内的标签胶囊 */
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
    transition: all 0.15s ease;
  }
  
  .tag-chip:hover {
    background: color-mix(in srgb, var(--interactive-accent) 85%, black);
  }
  
  .tag-chip .tag-text {
    line-height: 1.2;
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
    line-height: 1;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  
  .tag-chip-remove:hover {
    background: rgba(255, 255, 255, 0.35);
    transform: scale(1.15);
  }
  
  /* 实际的输入框 */
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
  
  .tag-input::placeholder {
    color: var(--text-faint);
  }
  
  /* 可选标签区域 */
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
    transform: translateY(-1px);
  }
  
  .available-tag-item.selected {
    background: color-mix(in srgb, var(--interactive-accent) 15%, var(--background-secondary));
    border-color: var(--interactive-accent);
    color: var(--interactive-accent);
    font-weight: 600;
  }
  
  .available-tag-item.selected:hover {
    background: color-mix(in srgb, var(--interactive-accent) 20%, var(--background-secondary));
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
  
  /* 浅色/深色模式自适应的主按钮 */
  .btn.primary { 
    background: var(--interactive-accent);
    color: var(--text-on-accent); 
    border: none;
    font-weight: 600;
  }
  
  /* 浅色模式优化 */
  :global(body:not(.theme-dark)) .btn.primary {
    background: var(--interactive-accent);
    box-shadow: 0 2px 8px color-mix(in srgb, var(--interactive-accent) 25%, transparent);
  }
  
  :global(body:not(.theme-dark)) .btn.primary:hover {
    background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
    box-shadow: 0 4px 12px rgba(139, 92, 246, 0.35);
  }
  
  /* 深色模式 */
  :global(body.theme-dark) .btn.primary {
    background: var(--interactive-accent);
  }
  
  :global(body.theme-dark) .btn.primary:hover {
    background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
  }
  
  .btn:disabled { 
    opacity: 0.6; 
    cursor: not-allowed; 
  }
</style>
