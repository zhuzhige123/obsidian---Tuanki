<!--
  编辑卡片模态窗组件
  职责：提供独立的编辑卡片界面，支持透明遮罩、窗口拖拽、外部交互
  ✅ 重构后架构：接受预加载数据，无需异步加载，稳定可靠
  ✅ 完全对齐 CreateCardModal 的设计，确保一致的用户体验
-->
<script lang="ts">
  import { logger } from '../../utils/logger';
  import { MEMORY_DECK_UI_TEXT } from '../../constants/memory-deck-ui-text';

  import { onDestroy, onMount, untrack } from 'svelte';
  import type { WeavePlugin } from '../../main';
  import type { Card } from '../../data/types';
  import type { EmbeddableEditorManager } from '../../services/editor/EmbeddableEditorManager';
  import ResizableModal from '../ui/ResizableModal.svelte';
  import InlineCardEditor from '../editor/InlineCardEditor.svelte';
  import { Menu, Notice, Platform } from 'obsidian';
  import { getCardMetadata } from '../../utils/yaml-utils';
  import { tr } from '../../utils/i18n';
  import {
    closeEditableFormalCreateDeckModal,
    openEditableFormalCreateDeckModal
  } from '../../utils/editable-formal-create-deck-modal';
  import { populateEditableFormalDeckMenu } from '../../utils/editable-formal-deck-menu';

  interface Props {
    /** 是否显示模态窗 */
    open: boolean;

    /** 关闭回调 - 用于销毁组件和清理DOM */
    onModalClose: () => void;

    /** 卡片数据 */
    card: Card;

    /** 插件实例 */
    plugin: WeavePlugin;

    /** 嵌入式编辑器管理器 (v3) */
    editorPoolManager: EmbeddableEditorManager;

    /**  预加载的牌组数据 */
    decks: any[];

    /** 保存成功回调 */
    onSave?: (card: Card) => void;

    /** 取消回调 */
    onCancel?: () => void;
  }

  let {
    open = $bindable(),
    onModalClose,
    card,
    plugin,
    editorPoolManager,
    decks: preloadedDecks,
    onSave,
    onCancel
  }: Props = $props();

  //  使用预加载的数据（无需异步加载，数据已准备就绪）
  let decks = $state<any[]>(untrack(() => preloadedDecks));
  let t = $derived($tr);
  
  // 当前选择的牌组
  let selectedDeckId = $state(untrack(() => card.deckId));

  let selectedDeckNames = $state<string[]>([]);

  function computeInitialSelectedDeckNames(): string[] {
    const names: string[] = [];
    try {
      const metadata = getCardMetadata(card.content || '');
      const raw = Array.isArray((metadata as any).we_decks) ? (metadata as any).we_decks : [];
      for (const value of raw) {
        if (typeof value !== 'string') continue;
        if (value.startsWith('deck_')) {
          const matched = decks.find(d => d.id === value);
          if (matched?.name) names.push(matched.name);
        } else {
          const matched = decks.find(d => d.name === value);
          if (matched?.name) names.push(matched.name);
        }
      }
    } catch (e) {
    }

    if (names.length === 0 && selectedDeckId) {
      const matched = decks.find(d => d.id === selectedDeckId);
      if (matched?.name) names.push(matched.name);
    }

    return names.length > 0 ? [names[0]] : [];
  }
  
  // 移动端禁用透明遮罩，避免事件穿透导致需要点击两次
  let shouldEnableTransparentMask = $derived(!Platform.isMobile);
  
  //  数据已预加载，无需异步等待
  onMount(() => {
    logger.debug('[EditCardModal] 组件挂载，数据已预加载:', { 
      decksCount: decks.length,
      cardId: card.uuid
    });

    selectedDeckNames = computeInitialSelectedDeckNames();
  });

  // 处理关闭
  function handleClose() {
    logger.debug('[EditCardModal] 关闭');
    
    //  显式类型检查，避免 Svelte 5 编译问题
    if (typeof onCancel === 'function') {
      onCancel();
    }
    if (typeof onModalClose === 'function') {
      onModalClose();
    }
  }

  // 处理保存
  async function handleSave(updatedCard: Card) {
    logger.debug('[EditCardModal] 🔍 保存卡片回调触发', {
      uuid: updatedCard.uuid,
      deckId: updatedCard.deckId,
      templateId: updatedCard.templateId,
      contentLength: updatedCard.content?.length || 0
    });
    
    try {
      //  Content-Only 架构：只检查 content 字段
      const hasContent = updatedCard.content && updatedCard.content.trim().length > 0;

      if (!hasContent) {
        logger.warn('[EditCardModal] ❌ 卡片内容为空，拒绝保存');
        new Notice('卡片内容不能为空', 4000);
        return;
      }
      
      logger.debug('[EditCardModal] ✅ 内容验证通过（content 长度:', updatedCard.content.length, '）');

      // 调用用户提供的保存回调
      if (typeof onSave === 'function') {
        onSave(updatedCard);
      }
      
      //  普通模式：保存后关闭模态窗（由 main.ts 的 onSave 回调处理）
      logger.debug('[EditCardModal] 保存完成，等待 main.ts 关闭模态窗');
      
    } catch (error) {
      logger.error('[EditCardModal] 保存卡片失败:', error);
      new Notice('保存卡片失败');
    }
  }

  function handleDecksChange(names: string[]) {
    const nextNames = names.length > 0 ? [names[0]] : [];
    selectedDeckNames = nextNames;
    const primaryName = nextNames[0];
    const primaryDeck = decks.find(d => d.name === primaryName);
    selectedDeckId = primaryDeck?.id || '';
    logger.debug('[EditCardModal] 牌组变更:', { selectedDeckNames, selectedDeckId });
  }

  onDestroy(() => {
    closeEditableFormalCreateDeckModal();
  });

  async function refreshDecks(): Promise<void> {
    if (!plugin.dataStorage) return;
    try {
      decks = await plugin.dataStorage.getAllDecks();
    } catch (error) {
      logger.error('[EditCardModal] 刷新牌组列表失败:', error);
    }
  }

  function openCreateDeckModal(): void {
    openEditableFormalCreateDeckModal({
      plugin,
      onDeckCreated: async (newDeck) => {
        await refreshDecks();
        handleDecksChange([newDeck.name]);
        new Notice(t('cards.createModal.deckCreated', { name: newDeck.name }));
        plugin.app.workspace.trigger('Weave:data-changed');
        if (lastMenuPosition) {
          queueMicrotask(() => openDeckMenuAtPosition(lastMenuPosition!));
        }
      }
    });
  }

  let deckButtonRef = $state<HTMLButtonElement | undefined>(undefined);
  let lastMenuPosition: { x: number; y: number } | null = null;

  function getDeckSelectorText(): string {
    if (!selectedDeckNames || selectedDeckNames.length === 0) return MEMORY_DECK_UI_TEXT.unassigned;
    return selectedDeckNames.join('、');
  }

  function openDeckMenuAtPosition(pos: { x: number; y: number }) {
    if (!plugin.dataStorage) return;

    const menu = new Menu();

    populateEditableFormalDeckMenu({
      menu,
      decks: decks ?? [],
      selectedDeckNames,
      createDeckLabel: t('cards.createModal.createDeckMenu'),
      onDeckNamesChange: handleDecksChange,
      onCreateDeck: openCreateDeckModal,
      onAfterDeckToggle: () => {
        if (lastMenuPosition) {
          queueMicrotask(() => openDeckMenuAtPosition(lastMenuPosition!));
        }
      }
    });

    menu.showAtPosition(pos);
  }

  function showDeckMenu(event: MouseEvent | KeyboardEvent) {
    const rect = deckButtonRef?.getBoundingClientRect();
    if (rect) {
      lastMenuPosition = { x: rect.left, y: rect.bottom };
      openDeckMenuAtPosition(lastMenuPosition);
    }
  }
</script>

<ResizableModal
  bind:open
  {plugin}
  title="编辑卡片"
  closable={false}
  maskClosable={false}
  keyboard={true}
  enableTransparentMask={shouldEnableTransparentMask}
  enableWindowDrag={true}
  onClose={handleClose}
>
  {#snippet headerActions()}
    <!-- 牌组选择器（无牌组时仍可通过菜单新建） -->
    {#if plugin.dataStorage}
      <button
        bind:this={deckButtonRef}
        class="deck-multi-selector"
        type="button"
        onclick={(e) => showDeckMenu(e)}
        onkeydown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            showDeckMenu(e);
          }
        }}
      >
        <span class="deck-multi-selector-label">{MEMORY_DECK_UI_TEXT.editableFormalAssignment}:</span>
        <span class="deck-multi-selector-value">{getDeckSelectorText()}</span>
      </button>
    {/if}
  {/snippet}

  {#snippet children()}
    <InlineCardEditor
      {card}
      {plugin}
      {editorPoolManager}
      mode="edit"
      isNew={false}
      displayMode="inline"
      showHeader={false}
      showFooter={true}
      decks={decks}
      selectedDeckId={selectedDeckId}
      selectedDeckNames={selectedDeckNames}
      onSave={handleSave}
      onCancel={handleClose}
      onClose={handleClose}
      sourcePath={plugin.app.workspace.getActiveFile()?.path}
    />
  {/snippet}
</ResizableModal>

<style>
  /* CustomDropdown 组件已内置样式，无需额外 CSS */

  .deck-multi-selector {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    max-width: 320px;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: var(--input-radius);
    background: var(--background-modifier-form-field);
    color: var(--text-normal);
    cursor: pointer;
  }

  .deck-multi-selector-value {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

</style>
