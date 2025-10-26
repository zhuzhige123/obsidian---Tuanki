<script lang="ts">
  import type AnkiPlugin from "../../main";
  import type { AnkiDataStorage } from "../../data/storage";
  import type { Deck, DeckType, DeckCategory } from "../../data/types";
  import { generateId } from "../../utils/helpers";
  import { Menu, Notice } from "obsidian";
  import { getCategoryStorage } from "../../data/CategoryStorage";

  interface Props {
    open: boolean;
    plugin: AnkiPlugin;
    dataStorage: AnkiDataStorage;
    onClose: () => void;
    onCreated?: (deck: Deck) => void;
    // 扩展：编辑模式
    mode?: 'create' | 'edit';
    initialDeck?: Deck | null;
    onUpdated?: (deck: Deck) => void;
    // 新增：父牌组ID（用于创建子牌组）
    parentDeckId?: string | null;
  }

  let { open, plugin, dataStorage, onClose, onCreated, mode = 'create', initialDeck = null, onUpdated, parentDeckId = null }: Props = $props();

  let name = $state("");
  let description = $state("");
  let category = $state("默认"); // @deprecated 保留用于兼容
  let deckType = $state<DeckType>('mixed');
  let selectedParentId = $state<string | null>(null);
  let availableDecks = $state<Deck[]>([]);
  let isSaving = $state(false);
  
  // 🆕 分类系统
  let categories = $state<DeckCategory[]>([]);
  let selectedCategoryIds = $state<string[]>([]);
  const categoryStorage = getCategoryStorage();

  // 打开时加载可用牌组列表和初始化状态
  $effect(() => {
    if (open) {
      // 异步初始化
      (async () => {
        try {
          // 加载牌组列表和分类
          await Promise.all([
            loadAvailableDecks(),
            loadCategories()
          ]);
          
          if (mode === 'edit' && initialDeck) {
            // 编辑模式：预填初始值
            name = initialDeck.name || '';
            description = initialDeck.description || '';
            category = initialDeck.category || '默认';
            deckType = initialDeck.deckType || 'mixed';
            selectedParentId = initialDeck.parentId || null;
            
            // 🆕 恢复分类选择
            if (initialDeck.categoryIds && initialDeck.categoryIds.length > 0) {
              selectedCategoryIds = [...initialDeck.categoryIds];
            } else if (categories.length > 0) {
              selectedCategoryIds = [categories[0].id];
            } else {
              selectedCategoryIds = [];
            }
          } else if (mode === 'create') {
            // 创建模式：重置并设置父牌组
            name = '';
            description = '';
            category = '默认';
            deckType = 'mixed';
            selectedParentId = parentDeckId || null;
            
            // 🆕 默认选中第一个分类
            if (categories.length > 0) {
              selectedCategoryIds = [categories[0].id];
            } else {
              selectedCategoryIds = [];
            }
          }
        } catch (error) {
          console.error('[CreateDeckModal] 初始化失败:', error);
          new Notice('初始化失败，请重试');
        }
      })();
    }
  });

  // 加载可用牌组列表
  async function loadAvailableDecks() {
    try {
      const result = await dataStorage.getDecks();
      availableDecks = result;
    } catch (error) {
      console.error('Failed to load decks:', error);
      availableDecks = [];
    }
  }
  
  // 🆕 加载分类列表
  async function loadCategories() {
    try {
      await categoryStorage.initialize();
      categories = await categoryStorage.getCategories();
    } catch (error) {
      console.error('[CreateDeckModal] 加载分类失败:', error);
      categories = [];
    }
  }
  
  // 🆕 切换分类选择（多选）
  function toggleCategory(categoryId: string) {
    if (selectedCategoryIds.includes(categoryId)) {
      selectedCategoryIds = selectedCategoryIds.filter(id => id !== categoryId);
    } else {
      selectedCategoryIds = [...selectedCategoryIds, categoryId];
    }
  }

  async function handleSubmit() {
    if (!name.trim() || isSaving) return;
    isSaving = true;
    try {
      const now = new Date();
      if (mode === 'edit' && initialDeck) {
        const updated: Deck = {
          ...initialDeck,
          name: name.trim(),
          description: description.trim(),
          category: category.trim() || initialDeck.category || '默认',
          categoryIds: selectedCategoryIds.length > 0 ? selectedCategoryIds : undefined, // 🆕
          deckType: deckType,
          modified: now.toISOString(),
        } as Deck;
        const res = await dataStorage.saveDeck(updated);
        if (!res.success) throw new Error(res.error || 'saveDeck failed');
        onUpdated?.(updated);
        closeModal();
        return;
      }

      // 创建模式：使用 DeckHierarchyService
      let newDeck: Deck;
      
      if (selectedParentId) {
        // 创建子牌组
        newDeck = await plugin.deckHierarchy.createSubdeck(
          selectedParentId,
          name.trim()
        );
        
        // 更新描述、分类和牌组类型
        newDeck.description = description.trim();
        newDeck.category = category.trim() || '默认';
        // 🆕 子牌组不保存分类，设为空数组
        newDeck.categoryIds = [];
        newDeck.deckType = deckType;
        await dataStorage.saveDeck(newDeck);
      } else {
        // 创建根牌组
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
          learningSteps: plugin.settings.learningSteps,
          relearningSteps: [10],
          graduatingInterval: plugin.settings.graduatingInterval,
          easyInterval: 4,
        };
        
        newDeck = await plugin.deckHierarchy.createRootDeck(
          name.trim(),
          deckSettings
        );
        
        // 更新描述、分类和牌组类型
        newDeck.description = description.trim();
        newDeck.category = category.trim() || '默认';
        // 🆕 父牌组保存选中的分类
        newDeck.categoryIds = selectedCategoryIds.length > 0 ? selectedCategoryIds : [categories[0]?.id].filter(Boolean);
        newDeck.deckType = deckType;
        await dataStorage.saveDeck(newDeck);
      }
      
      onCreated?.(newDeck);
      closeModal();
    } catch (error) {
      console.error('Failed to create deck:', error);
      alert(`创建牌组失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      isSaving = false;
    }
  }

  function closeModal() {
    name = "";
    description = "";
    category = "默认";
    deckType = "mixed";
    selectedParentId = null;
    onClose();
  }

  // 获取父牌组的显示名称
  function getParentDeckDisplayName(deckId: string): string {
    const deck = availableDecks.find(d => d.id === deckId);
    return deck?.path || deck?.name || deckId;
  }

  // 显示父牌组选择菜单
  function showParentDeckMenu(event: MouseEvent) {
    const menu = new Menu();
    
    // 添加"无父牌组"选项
    menu.addItem((item) => {
      item
        .setTitle("无（创建根牌组）")
        .setChecked(selectedParentId === null)
        .onClick(() => {
          selectedParentId = null;
        });
    });
    
    menu.addSeparator();
    
    // 添加所有可用牌组
    availableDecks.forEach((deck) => {
      menu.addItem((item) => {
        item
          .setTitle(deck.path || deck.name)
          .setChecked(selectedParentId === deck.id)
          .onClick(() => {
            selectedParentId = deck.id;
          });
      });
    });
    
    menu.showAtMouseEvent(event);
  }
</script>

{#if open}
  <div class="modal-overlay" role="presentation" onclick={closeModal} ondrop={(e) => e.stopPropagation()} ondragover={(e) => e.stopPropagation()} ondragleave={(e) => e.stopPropagation()}>
    <div class="modal" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => { if (e.key === 'Escape') closeModal(); }}>
      <div class="modal-header">
        <h3>{mode === 'edit' ? '编辑牌组' : (selectedParentId ? '新建子牌组' : '新建牌组')}</h3>
        <button class="icon-btn" aria-label="关闭" onclick={closeModal}>×</button>
      </div>

      <div class="modal-body">
        {#if mode === 'create'}
          <label>
            <span>父牌组（可选）</span>
            <button 
              type="button"
              class="deck-selector-btn"
              onclick={showParentDeckMenu}
            >
              <span class="deck-selector-text">
                {selectedParentId ? getParentDeckDisplayName(selectedParentId) : '无（创建根牌组）'}
              </span>
              <svg class="deck-selector-icon" width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            {#if selectedParentId}
              <span class="hint">将创建为「{getParentDeckDisplayName(selectedParentId)}」的子牌组</span>
            {/if}
          </label>
        {/if}

        <label>
          <span>名称</span>
          <input class="text-input" placeholder="例如：计算机科学" bind:value={name} />
        </label>

        <label>
          <span>描述</span>
          <textarea class="text-area" rows="3" placeholder="可选" bind:value={description}></textarea>
        </label>

        <!-- 🆕 分类选择器（仅父牌组可用） -->
        {#if !selectedParentId}
          <label>
            <span>分类（可多选）</span>
            <div class="category-selector">
              {#if categories.length === 0}
                <span class="hint">加载分类中...</span>
              {:else}
                {#each categories as cat (cat.id)}
                  <button
                    type="button"
                    class="category-chip"
                    class:selected={selectedCategoryIds.includes(cat.id)}
                    style="background: linear-gradient(135deg, {cat.colorStart}, {cat.colorEnd})"
                    onclick={() => toggleCategory(cat.id)}
                    title={cat.name}
                  >
                    <span class="category-chip-text">{cat.name}</span>
                    {#if selectedCategoryIds.includes(cat.id)}
                      <span class="category-chip-check">✓</span>
                    {/if}
                  </button>
                {/each}
              {/if}
            </div>
            {#if selectedCategoryIds.length > 0}
              <span class="hint">已选择 {selectedCategoryIds.length} 个分类</span>
            {/if}
          </label>
        {:else}
          <div class="category-disabled-hint">
            <span class="hint-icon">ℹ️</span>
            <span>子牌组不支持分类，跟随父牌组的分类</span>
          </div>
        {/if}

        <label>
          <span>牌组类型</span>
          <div class="deck-type-selector">
            <div 
              class="deck-type-option {deckType === 'mixed' ? 'selected' : ''}"
              role="radio"
              aria-checked={deckType === 'mixed'}
              tabindex="0"
              onclick={(e) => {
                e.stopPropagation();
                deckType = 'mixed';
              }}
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  deckType = 'mixed';
                }
              }}
            >
              <input 
                type="radio" 
                name="deckType" 
                value="mixed" 
                checked={deckType === 'mixed'}
                readonly
              />
              <div class="deck-type-info">
                <div class="deck-type-label">混合题型</div>
                <div class="deck-type-desc">可以添加所有类型的卡片</div>
              </div>
            </div>
            
            <div 
              class="deck-type-option {deckType === 'choice-only' ? 'selected' : ''}"
              role="radio"
              aria-checked={deckType === 'choice-only'}
              tabindex="0"
              onclick={(e) => {
                e.stopPropagation();
                deckType = 'choice-only';
              }}
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  deckType = 'choice-only';
                }
              }}
            >
              <input 
                type="radio" 
                name="deckType" 
                value="choice-only" 
                checked={deckType === 'choice-only'}
                readonly
              />
              <div class="deck-type-info">
                <div class="deck-type-label">选择题专用</div>
                <div class="deck-type-desc">只能添加选择题类型的卡片</div>
              </div>
            </div>
          </div>
          {#if deckType === 'choice-only'}
            <div class="deck-type-hint">
              <span class="hint-icon">ℹ️</span>
              <span>此牌组只能添加选择题类型的卡片</span>
            </div>
          {/if}
        </label>
      </div>

      <div class="modal-footer">
        <button class="btn" onclick={closeModal}>取消</button>
        <button class="btn primary" disabled={!name.trim() || isSaving} onclick={handleSubmit}>创建</button>
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
    z-index: 10000; /* 提高z-index，确保在所有内容之上 */
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
    z-index: 10001; /* 确保模态窗内容在遮罩之上 */
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
  
  .text-input, .text-area {
    padding: 0.625rem 0.75rem; 
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.5rem; 
    background: var(--background-secondary); 
    color: var(--text-normal);
    font-size: 0.9rem;
  }
  
  .text-input:focus, .text-area:focus { 
    outline: none; 
    border-color: var(--interactive-accent); 
  }
  
  .hint {
    font-size: 0.8rem;
    color: var(--text-accent);
    font-style: italic;
    margin-top: 4px;
  }
  
  /* 🆕 分类选择器样式 */
  .category-selector {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px 0;
  }
  
  .category-chip {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border: 2px solid transparent;
    border-radius: 20px;
    color: white;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    opacity: 0.6;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
  
  .category-chip:hover {
    opacity: 0.85;
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
  }
  
  .category-chip.selected {
    opacity: 1;
    border-color: white;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    transform: scale(1.05);
  }
  
  .category-chip-text {
    flex: 1;
  }
  
  .category-chip-check {
    font-size: 14px;
    font-weight: bold;
  }
  
  /* 牌组类型选择器样式 */
  .deck-type-selector {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  
  .deck-type-option {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px;
    border: 2px solid var(--background-modifier-border);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
    background: var(--background-secondary);
  }
  
  .deck-type-option:hover {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
  }
  
  .deck-type-option.selected {
    background: color-mix(in srgb, var(--interactive-accent) 10%, var(--background-secondary));
    border-color: var(--interactive-accent);
    border-width: 2px;
  }
  
  .deck-type-option input[type="radio"] {
    margin-top: 2px;
    flex-shrink: 0;
    cursor: pointer;
  }
  
  .deck-type-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  
  .deck-type-label {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-normal);
  }
  
  .deck-type-desc {
    font-size: 12px;
    color: var(--text-muted);
  }
  
  .deck-type-hint {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    padding: 8px 12px;
    background: color-mix(in srgb, var(--interactive-accent) 8%, var(--background-secondary));
    border-radius: 6px;
    font-size: 12px;
    color: var(--text-muted);
  }
  
  .hint-icon {
    font-size: 14px;
    flex-shrink: 0;
  }
  
  /* 🆕 分类禁用提示 */
  .category-disabled-hint {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: var(--background-secondary);
    border: 1px dashed var(--background-modifier-border);
    border-radius: 6px;
    font-size: 12px;
    color: var(--text-muted);
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

  /* 牌组选择器按钮样式 */
  .deck-selector-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.625rem 0.75rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.5rem;
    background: var(--background-secondary);
    color: var(--text-normal);
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
  }

  .deck-selector-btn:hover {
    border-color: var(--background-modifier-border-hover);
    background: var(--background-modifier-hover);
  }

  .deck-selector-btn:focus {
    outline: none;
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.1);
  }

  .deck-selector-text {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .deck-selector-icon {
    flex-shrink: 0;
    margin-left: 0.5rem;
    opacity: 0.6;
    transition: transform 0.2s ease;
  }

  .deck-selector-btn:hover .deck-selector-icon {
    opacity: 1;
  }
</style>
