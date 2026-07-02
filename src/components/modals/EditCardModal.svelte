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
  import PreviewContainer from '../preview/PreviewContainer.svelte';
  import EnhancedIcon from '../ui/EnhancedIcon.svelte';
  import { Menu, Notice, Platform } from 'obsidian';
  import { getCardMetadata } from '../../utils/yaml-utils';
  import { tr } from '../../utils/i18n';
  import {
    closeEditableFormalCreateDeckModal,
    openEditableFormalCreateDeckModal
  } from '../../utils/editable-formal-create-deck-modal';
  import { populateEditableFormalDeckMenu } from '../../utils/editable-formal-deck-menu';
  import {
    applyWeDecksNamesToCardContent,
    isSameDeckSelectorState,
    resolveDeckSelectorFromCardContent
  } from '../../utils/card-editor-we-decks-sync';

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

  let inlineCardEditorInstance = $state<{
    readLiveContent?: () => Promise<string>;
    updateEditorContent?: (content: string) => Promise<void>;
  } | undefined>(undefined);
  let showPreview = $state(false);
  let liveContent = $state(untrack(() => card.content || ''));
  let previewRefreshTrigger = $state(0);
  let showPreviewAnswer = $state(false);

  function togglePreviewAnswerVisibility(): void {
    showPreviewAnswer = !showPreviewAnswer;
    previewRefreshTrigger += 1;
  }

  const previewCard = $derived.by((): Card => ({
    ...card,
    content: liveContent,
    deckId: selectedDeckId || card.deckId
  }));

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

  async function readCurrentEditorContent(): Promise<string> {
    if (inlineCardEditorInstance?.readLiveContent) {
      return await inlineCardEditorInstance.readLiveContent();
    }
    return liveContent || card.content || '';
  }

  async function syncWeDecksToEditor(deckNames: string[]): Promise<void> {
    if (!inlineCardEditorInstance?.updateEditorContent) {
      return;
    }

    try {
      const currentContent = await readCurrentEditorContent();
      const updatedContent = applyWeDecksNamesToCardContent(currentContent, deckNames);
      await inlineCardEditorInstance.updateEditorContent(updatedContent);
      liveContent = updatedContent;
      logger.debug('[EditCardModal] YAML we_decks 已同步更新为:', deckNames);
    } catch (error) {
      logger.error('[EditCardModal] 同步 YAML we_decks 失败:', error);
    }
  }

  function syncDeckSelectorFromContent(content: string): void {
    const memoryDecks = (decks || []).filter((deck) => deck.purpose !== 'test');
    const nextState = resolveDeckSelectorFromCardContent(content, memoryDecks);
    const currentState = {
      deckId: selectedDeckId,
      deckNames: selectedDeckNames
    };

    if (isSameDeckSelectorState(currentState, nextState)) {
      return;
    }

    selectedDeckId = nextState.deckId;
    selectedDeckNames = nextState.deckNames;
    logger.debug('[EditCardModal] 从 YAML 同步牌组选择器:', nextState);
  }

  async function handleDecksChange(names: string[]) {
    const nextNames = names.length > 0 ? [names[0]] : [];
    selectedDeckNames = nextNames;
    const primaryName = nextNames[0];
    const primaryDeck = decks.find(d => d.name === primaryName);
    selectedDeckId = primaryDeck?.id || '';
    logger.debug('[EditCardModal] 牌组变更:', { selectedDeckNames, selectedDeckId });

    await syncWeDecksToEditor(selectedDeckNames);
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
        await handleDecksChange([newDeck.name]);
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

  function handleLiveContentChange(content: string): void {
    liveContent = content;
    syncDeckSelectorFromContent(content);
    if (showPreview) {
      previewRefreshTrigger += 1;
    }
  }

  async function handleTogglePreview(): Promise<void> {
    if (!showPreview) {
      const editor = inlineCardEditorInstance;
      if (editor?.readLiveContent) {
        liveContent = await editor.readLiveContent();
      }
      previewRefreshTrigger += 1;
      showPreview = true;
      return;
    }

    showPreview = false;
  }

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
      onDeckNamesChange: (names) => {
        void handleDecksChange(names);
      },
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
    <button
      class="clickable-icon weave-toolbar-tab preview-toggle-btn"
      class:is-preview={showPreview}
      type="button"
      title={showPreview ? t('toolbar.edit') : t('toolbar.preview')}
      aria-label={showPreview ? t('toolbar.edit') : t('toolbar.preview')}
      aria-pressed={showPreview}
      onclick={(e) => {
        e.preventDefault();
        void handleTogglePreview();
      }}
      onkeydown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          void handleTogglePreview();
        }
      }}
    >
      <EnhancedIcon
        name={showPreview ? 'edit' : 'eye'}
        size={16}
        variant={showPreview ? 'primary' : 'muted'}
        ariaLabel={showPreview ? t('toolbar.edit') : t('toolbar.preview')}
      />
      <span class="preview-toggle-label">{showPreview ? t('toolbar.edit') : t('toolbar.preview')}</span>
    </button>

    <!-- 牌组选择器（无牌组时仍可通过菜单新建） -->
    {#if plugin.dataStorage}
      <button
        bind:this={deckButtonRef}
        class="clickable-icon weave-toolbar-tab deck-selector-btn"
        type="button"
        title={MEMORY_DECK_UI_TEXT.selectEditableFormalAssignment}
        aria-label={MEMORY_DECK_UI_TEXT.selectEditableFormalAssignment}
        onclick={(e) => {
          e.preventDefault();
          showDeckMenu(e);
        }}
        onkeydown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            showDeckMenu(e);
          }
        }}
      >
        <span class="deck-name">{getDeckSelectorText()}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
    {/if}
  {/snippet}

  {#snippet children()}
    <InlineCardEditor
      bind:this={inlineCardEditorInstance}
      {card}
      {plugin}
      {editorPoolManager}
      mode="edit"
      isNew={false}
      displayMode="inline"
      showHeader={false}
      showFooter={true}
      showEditorContent={!showPreview}
      previewOverlay={showPreview ? editCardPreviewOverlay : undefined}
      footerCenter={showPreview ? editCardPreviewFooterCenter : undefined}
      decks={decks}
      bind:selectedDeckId={selectedDeckId}
      selectedDeckNames={selectedDeckNames}
      onSave={handleSave}
      onCancel={handleClose}
      onClose={handleClose}
      onContentChange={handleLiveContentChange}
      sourcePath={plugin.app.workspace.getActiveFile()?.path}
    />
  {/snippet}
</ResizableModal>

{#snippet editCardPreviewOverlay()}
  <PreviewContainer
    card={previewCard}
    bind:showAnswer={showPreviewAnswer}
    refreshTrigger={previewRefreshTrigger}
    {plugin}
    enableAnimations={true}
    enableAnswerControls={true}
    themeMode="auto"
    renderingMode="quality"
  />
{/snippet}

{#snippet editCardPreviewFooterCenter()}
  <button
    type="button"
    class="clickable-icon weave-toolbar-tab preview-back-toggle-btn"
    class:is-showing-back={showPreviewAnswer}
    onclick={(e) => {
      e.preventDefault();
      togglePreviewAnswerVisibility();
    }}
    title={showPreviewAnswer ? t('cards.editorModal.hideBackTitle') : t('cards.editorModal.showBackTitle')}
    aria-label={showPreviewAnswer ? t('cards.editorModal.hideBack') : t('cards.editorModal.showBack')}
    aria-pressed={showPreviewAnswer}
  >
    <EnhancedIcon
      name={showPreviewAnswer ? 'chevron-up' : 'eye'}
      size={16}
      variant={showPreviewAnswer ? 'primary' : 'muted'}
      ariaLabel={showPreviewAnswer ? t('cards.editorModal.hideBack') : t('cards.editorModal.showBack')}
    />
    <span>{showPreviewAnswer ? t('cards.editorModal.hideBack') : t('cards.editorModal.showBack')}</span>
  </button>
{/snippet}

<style>
  .preview-back-toggle-btn {
    font-weight: 500;
    color: var(--text-normal);
  }

  .preview-back-toggle-btn.is-showing-back {
    color: var(--text-accent, var(--interactive-accent));
  }

  .deck-selector-btn .deck-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    max-width: min(36vw, 200px);
  }
</style>
