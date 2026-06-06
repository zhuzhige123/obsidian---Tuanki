<script lang="ts">
  import EnhancedIcon from "../ui/EnhancedIcon.svelte";
  import EnhancedButton from "../ui/EnhancedButton.svelte";
  import { Platform } from "obsidian";
  import { ChildCardsMenuBuilder } from "../../services/menu/ChildCardsMenuBuilder";
  import ObsidianDropdown from "../ui/ObsidianDropdown.svelte";
  
  //  导入国际化
  import { tr } from "../../utils/i18n";

  interface Props {
    showChildOverlay: boolean;
    selectedCount: number;
    onReturn?: () => void;
    onRegenerate: () => void;
    onSave: () => void;
    canUndo?: boolean;
    onUndo?: () => void;
    isRegenerating?: boolean; // 是否正在重新生成
    /** 学习界面子卡片叠层：显示返回；AI 拆分预览等场景可关闭（顶部已有关闭） */
    showReturnButton?: boolean;
    /** study：牌组靠左；split-preview：模型/牌组与主操作靠右 */
    toolbarVariant?: 'study' | 'split-preview';
    modelSelectorLabel?: string;
    onModelSelectorClick?: (event: MouseEvent) => void;
    modelSelectorAriaLabel?: string;
    // 牌组选择相关
    showDeckSelector?: boolean; // 是否显示牌组选择器（AI拆分模式）
    availableDecks?: Array<{ id: string; name: string }>; // 可选牌组列表
    selectedDeckId?: string; // 当前选中的牌组ID
    onDeckChange?: (deckId: string) => void; // 牌组选择回调
  }

  let { 
    showChildOverlay, 
    selectedCount, 
    onReturn = () => {},
    onRegenerate, 
    onSave,
    canUndo = false,
    onUndo,
    isRegenerating = false,
    showReturnButton = true,
    toolbarVariant = 'study',
    modelSelectorLabel = '',
    onModelSelectorClick,
    modelSelectorAriaLabel = '',
    // 牌组选择相关
    showDeckSelector = false,
    availableDecks = [],
    selectedDeckId = '',
    onDeckChange
  }: Props = $props();

  const alignSelectorsRight = $derived(toolbarVariant === 'split-preview');
  const showModelSelector = $derived(
    alignSelectorsRight && Boolean(modelSelectorLabel) && Boolean(onModelSelectorClick)
  );
  
  //  响应式翻译函数
  let t = $derived($tr);
  
  const isCompactMobile =
    Platform.isMobile
    || (typeof document !== 'undefined'
      && (document.body.classList.contains('is-mobile')
        || document.body.classList.contains('is-phone')));
  
  //  移动端：使用 Obsidian Menu API 显示牌组选择菜单
  function handleDeckSelectorClick(event: MouseEvent) {
    if (!isCompactMobile || !onDeckChange) return;
    
    const menuBuilder = new ChildCardsMenuBuilder(
      {
        selectedCount,
        isRegenerating,
        showDeckSelector,
        availableDecks,
        selectedDeckId
      },
      {
        onReturn,
        onRegenerate,
        onSave,
        onDeckChange
      }
    );
    
    menuBuilder.showDeckSelectMenu(event);
  }
  
  // 获取当前选中的牌组名称
  let selectedDeckName = $derived(
    availableDecks.find(d => d.id === selectedDeckId)?.name || t('study.unifiedActions.selectDeck')
  );
</script>

<div
  class="unified-actions-bar"
  class:mobile={isCompactMobile}
  class:split-preview={alignSelectorsRight}
>
  {#if showChildOverlay}
    {#if alignSelectorsRight}
      <div class="flex-spacer" aria-hidden="true"></div>
    {/if}

    {#if showModelSelector}
      <button
        type="button"
        class="clickable-icon weave-toolbar-tab split-model-tab"
        onclick={onModelSelectorClick}
        title={modelSelectorLabel}
        aria-label={modelSelectorAriaLabel || modelSelectorLabel}
      >
        <span class="split-model-label">{modelSelectorLabel}</span>
        <span class="split-model-chevron" aria-hidden="true">▾</span>
      </button>
    {/if}

    <!-- 牌组选择器（AI 拆分等） -->
    {#if showDeckSelector && availableDecks.length > 0}
      {#if isCompactMobile}
        <button 
          class="clickable-icon weave-toolbar-tab action-btn deck-selector-btn" 
          onclick={handleDeckSelectorClick}
          type="button"
        >
          <EnhancedIcon name="folder" size="18" />
          <span class="deck-name">{selectedDeckName}</span>
          <EnhancedIcon name="chevron-down" size="14" />
        </button>
      {:else}
        <div class="deck-selector">
          <label for="deck-select">{t('study.unifiedActions.importToDeck')}</label>
          <ObsidianDropdown
            className="deck-select"
            options={[
              { id: '', label: t('study.unifiedActions.selectDeck') },
              ...availableDecks.map((deck) => ({ id: deck.id, label: deck.name }))
            ]}
            value={selectedDeckId}
            onchange={(value) => {
              onDeckChange?.(value);
            }}
          />
        </div>
      {/if}
    {/if}

    {#if !alignSelectorsRight}
      <div class="flex-spacer" aria-hidden="true"></div>
    {/if}
    
    {#if showReturnButton}
      <button class="clickable-icon weave-toolbar-tab action-btn secondary" onclick={onReturn} type="button">
        {#if isCompactMobile}
          <EnhancedIcon name="arrow-left" size="18" />
        {/if}
        {#if !isCompactMobile}
          <span>{t('studyInterface.actions.return')}</span>
        {/if}
      </button>
    {/if}
    
    <!-- 重新生成按钮 -->
    <button 
      class="clickable-icon weave-toolbar-tab action-btn primary" 
      onclick={onRegenerate} 
      disabled={isRegenerating}
      type="button"
      title={isRegenerating ? t('study.unifiedActions.regeneratingWait') : ''}
    >
      {#if isCompactMobile}
        <EnhancedIcon name="refresh-cw" size="18" />
      {/if}
      {#if !isCompactMobile}
        <span>{t('studyInterface.actions.regenerate')}</span>
      {/if}
    </button>
    
    <!-- 4. 收入按钮 -->
    <button 
      class="clickable-icon weave-toolbar-tab action-btn primary" 
      onclick={onSave} 
      disabled={selectedCount === 0 || isRegenerating || (showDeckSelector && !selectedDeckId)}
      type="button"
      title={isRegenerating ? t('study.unifiedActions.regeneratingWait') : (showDeckSelector && !selectedDeckId) ? t('study.unifiedActions.selectTargetDeck') : ''}
    >
      {#if isCompactMobile}
        <EnhancedIcon name="save" size="18" />
      {/if}
      {#if isCompactMobile}
        <span>{selectedCount}</span>
      {:else}
        <span>{t('studyInterface.actions.collect').replace('{n}', String(selectedCount))}</span>
      {/if}
    </button>
  {/if}
</div>

<style>
  .unified-actions-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem 1.5rem;
    background: var(--background-primary);
    border-top: none; /* 移除分割线 */
    position: relative;
    z-index: 90;
  }
  
  /*  移动端样式 */
  .unified-actions-bar.mobile {
    padding: 0.5rem 0.75rem;
    gap: 0.5rem;
  }

  .flex-spacer {
    flex: 1;
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    width: auto;
    height: auto;
    min-height: var(--clickable-icon-size, 28px);
    padding: 0.35rem 0.65rem;
    border: none;
    box-shadow: none;
    background: transparent;
    border-radius: var(--clickable-icon-radius, var(--radius-s));
    color: var(--text-muted);
    font-size: var(--font-ui-small, 0.875rem);
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.15s ease, color 0.15s ease;
    outline: none;
  }
  
  /*  移动端按钮样式 */
  .mobile .action-btn {
    padding: 0.35rem 0.55rem;
    gap: 0.25rem;
  }

  .action-btn.secondary:hover:not(:disabled) {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
    transform: none;
  }

  .action-btn.primary {
    color: var(--text-normal);
    font-weight: 600;
  }

  .action-btn.primary:hover:not(:disabled) {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
    transform: none;
    box-shadow: none;
  }

  .action-btn:active:not(:disabled) {
    background: var(--background-modifier-active-hover);
    transform: none;
  }

  .action-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    pointer-events: none;
  }

  /* 牌组选择器样式 */
  .deck-selector {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    /* 移除margin-left: auto，让flexbox自然排列 */
  }

  .deck-selector label {
    font-size: 0.875rem;
    color: var(--text-muted);
    white-space: nowrap;
  }

  :global(.obsidian-dropdown-trigger.deck-select) {
    min-width: 160px;
    padding: 0.375rem 0.75rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.375rem;
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.875rem;
    cursor: pointer;
    min-height: 0;
  }

  :global(.obsidian-dropdown-trigger.deck-select:hover:not(.disabled)) {
    border-color: var(--interactive-accent);
  }

  :global(.obsidian-dropdown-trigger.deck-select:focus-visible) {
    outline: none;
    border-color: var(--interactive-accent);
    box-shadow: none;
  }
  
  /*  移动端牌组选择器按钮样式 */
  .deck-selector-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.35rem 0.65rem;
    border-radius: var(--clickable-icon-radius, var(--radius-s));
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.15s ease, color 0.15s ease;
    border: none;
    box-shadow: none;
    background: transparent;
    color: var(--text-muted);
    max-width: 140px;
  }
  
  .deck-selector-btn .deck-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }
  
  .deck-selector-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }
  
  .deck-selector-btn:active {
    background: var(--background-modifier-active-hover);
  }

  /* AI 拆分预览：模型 + 牌组与主操作同排靠右 */
  .unified-actions-bar.split-preview {
    justify-content: flex-end;
    flex-wrap: wrap;
    row-gap: 0.35rem;
  }

  .unified-actions-bar.split-preview .flex-spacer {
    flex: 1 1 auto;
    min-width: 0.5rem;
  }

  .split-model-tab {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    max-width: min(36vw, 200px);
    min-height: var(--weave-touch-sm, 36px);
    padding: 0.25rem 0.35rem;
    margin: 0;
    border: none !important;
    border-radius: 0;
    background: transparent !important;
    box-shadow: none !important;
    color: var(--text-muted);
    font-size: 0.8125rem;
    cursor: pointer;
    flex-shrink: 0;
    touch-action: manipulation;
  }

  .split-model-tab:hover {
    color: var(--text-normal);
    background: var(--background-modifier-hover) !important;
  }

  .split-model-tab:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--interactive-accent) 55%, transparent);
    outline-offset: 2px;
  }

  .split-model-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .split-model-chevron {
    flex-shrink: 0;
    opacity: 0.65;
    font-size: 0.7rem;
  }

  .unified-actions-bar.split-preview .deck-selector-btn {
    border: none;
    background: transparent;
    max-width: min(32vw, 180px);
  }

  .unified-actions-bar.split-preview .deck-selector-btn:hover {
    background: var(--background-modifier-hover);
  }

  .unified-actions-bar.split-preview :global(.obsidian-dropdown-trigger.deck-select) {
    border: none;
    background: transparent;
    min-width: 120px;
    padding: 0.25rem 0.5rem;
  }

  .unified-actions-bar.split-preview :global(.obsidian-dropdown-trigger.deck-select:hover:not(.disabled)) {
    background: var(--background-modifier-hover);
    border: none;
  }
</style>

