<script lang="ts">
  import type { WeaveTimerHandle } from "../../types/timer-handle.js";
  import { logger } from '../../utils/logger';
  // 静态导入 parseSourceInfo，确保响应式追踪正常
  import { parseEpubSourceInfo, parseSourceInfo } from '../../utils/yaml-utils';

  import EnhancedIcon from "../ui/EnhancedIcon.svelte";
  import FloatingMenu from "../ui/FloatingMenu.svelte";
  import ObsidianDropdown from "../ui/ObsidianDropdown.svelte";
  import ObsidianIcon from "../ui/ObsidianIcon.svelte";
  import type { Card } from "../../data/types";
  import type { WeavePlugin } from "../../main";
  import type { ChoiceOptionOrder } from '../../utils/study/choiceOptionOrder';
  import { tr } from '../../utils/i18n';
  import { Notice } from "obsidian";
  import { untrack } from 'svelte';
  import { openLinkWithExistingLeaf } from '../../utils/workspace-navigation';
  import { getSourceLocateOverlayService } from '../../services/ui/SourceLocateOverlayService';
  import { SourceNavigationService } from '../../services/ui/SourceNavigationService';
  import { applyStyleProps } from '../../utils/style-props';

  interface Props {
    card: Card;
    currentCardTime: number;
    averageTime: number;
    plugin?: WeavePlugin;
    isEditing?: boolean;
    tempFileUnavailable?: boolean;
    compactMode?: boolean;
    compactModeSetting?: 'auto' | 'fixed';
    onCompactModeSettingChange?: (setting: 'auto' | 'fixed') => void;
    onToggleEdit?: () => void;
    onRemove?: (skipConfirm?: boolean) => void;
    onDelete?: (skipConfirm?: boolean) => void;
    onToggleFavorite?: () => void;
    onChangePriority?: () => void;
    onPriorityAnchorChange?: (element: HTMLElement | null) => void;
    onOpenPlainEditor?: () => void;
    onOpenDetailedView?: () => void;
    enableDirectDelete?: boolean;
    onDirectDeleteToggle?: (enabled: boolean) => void;
    questionOrder?: 'sequential' | 'random';
    onQuestionOrderChange?: (order: 'sequential' | 'random') => void;
    choiceOptionOrder?: ChoiceOptionOrder;
    onChoiceOptionOrderChange?: (order: ChoiceOptionOrder) => void;
    navColumnMode?: 1 | 3;
    onNavColumnModeChange?: (mode: 1 | 3) => void;
  }

  let {
    card,
    currentCardTime,
    averageTime,
    plugin,
    isEditing = false,
    tempFileUnavailable = false,
    compactMode = false,
    compactModeSetting = 'fixed',
    onCompactModeSettingChange,
    onToggleEdit,
    onRemove,
    onDelete,
    onToggleFavorite,
    onChangePriority,
    onPriorityAnchorChange,
    onOpenPlainEditor,
    onOpenDetailedView,
    enableDirectDelete = false,
    onDirectDeleteToggle,
    questionOrder = 'sequential',
    onQuestionOrderChange,
    choiceOptionOrder = 'sequential',
    onChoiceOptionOrderChange,
    navColumnMode = 3,
    onNavColumnModeChange
  }: Props = $props();

  let t = $derived($tr);

  // v4.0: 侧边栏功能键长按拖拽排序
  let isDraggingButton = $state(false);
  let draggedButtonElement = $state<HTMLElement | null>(null);
  let dragStartY = $state(0);
  let dragCurrentY = $state(0);
  let longPressTimer = $state<WeaveTimerHandle | null>(null);
  const LONG_PRESS_DURATION = 500;
  
  function handleButtonLongPressStart(e: MouseEvent | TouchEvent, element: HTMLElement) {
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragStartY = clientY;
    
    longPressTimer = window.setTimeout(() => {
      isDraggingButton = true;
      draggedButtonElement = element;
      element.classList.add('dragging');
      if (navigator.vibrate) navigator.vibrate(50);
    }, LONG_PRESS_DURATION);
  }
  
  function handleButtonDragMove(e: MouseEvent | TouchEvent) {
    if (!isDraggingButton || !draggedButtonElement) return;
    
    e.preventDefault();
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragCurrentY = clientY;
    
    const deltaY = dragCurrentY - dragStartY;
    applyStyleProps(draggedButtonElement, {
      transform: `translateY(${deltaY}px)`,
      zIndex: '100'
    });
    
    const parent = draggedButtonElement.parentElement;
    if (!parent) return;
    
    const buttons = Array.from(parent.querySelectorAll('.toolbar-btn:not(.dragging)')) as HTMLElement[];
    const draggedRect = draggedButtonElement.getBoundingClientRect();
    const draggedCenter = draggedRect.top + draggedRect.height / 2;
    
    for (const btn of buttons) {
      const btnRect = btn.getBoundingClientRect();
      const btnCenter = btnRect.top + btnRect.height / 2;
      
      if (deltaY > 0 && draggedCenter > btnCenter && btn.compareDocumentPosition(draggedButtonElement) & Node.DOCUMENT_POSITION_PRECEDING) {
        parent.insertBefore(btn, draggedButtonElement);
        dragStartY = dragCurrentY;
        applyStyleProps(draggedButtonElement, { transform: null });
        break;
      } else if (deltaY < 0 && draggedCenter < btnCenter && btn.compareDocumentPosition(draggedButtonElement) & Node.DOCUMENT_POSITION_FOLLOWING) {
        parent.insertBefore(draggedButtonElement, btn);
        dragStartY = dragCurrentY;
        applyStyleProps(draggedButtonElement, { transform: null });
        break;
      }
    }
  }
  
  function handleButtonDragEnd() {
    if (longPressTimer) {
      window.clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    
    if (isDraggingButton && draggedButtonElement) {
      draggedButtonElement.classList.remove('dragging');
      applyStyleProps(draggedButtonElement, {
        transform: null,
        zIndex: null
      });
    }
    
    isDraggingButton = false;
    draggedButtonElement = null;
  }

  // 响应式来源信息，使用统一的 parseSourceInfo 工具函数
  // 静态导入可确保响应式追踪正常工作
  let sourceInfo = $derived.by(() => {
    const content = card?.content;
    if (!content) return { sourceFile: card?.sourceFile, sourceBlock: card?.sourceBlock };
    
    const parsed = parseSourceInfo(content);
    const epubSource = parseEpubSourceInfo(content);
    return {
      sourceFile: epubSource.sourceFile || parsed.sourceFile || card?.sourceFile,
      sourceBlock: parsed.sourceBlock || card?.sourceBlock,
      epubCfi: epubSource.cfi,
      epubText: epubSource.text,
      epubChapter: epubSource.chapter
    };
  });

  // 格式化学习时间
  function formatTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  // 获取重要程度颜色
  function getPriorityColor(priority: number): string {
    switch (priority) {
      case 1: return "#fbbf24";
      case 2: return "#60a5fa";
      case 3: return "#f97316";
      case 4: return "#ef4444";
      default: return "#60a5fa";
    }
  }

  // 获取重要程度星级
  function getPriorityStars(priority: number): number {
    return Math.min(Math.max(priority, 1), 4);
  }

  let priorityButtonElement: HTMLElement | null = $state(null);

  $effect(() => {
    onPriorityAnchorChange?.(priorityButtonElement);
  });

  // 多功能信息键
  let showMultiInfoMenu = $state(false);
  const sourceLocateOverlay = getSourceLocateOverlayService();
  const sourceNavigationService = untrack(() => (plugin ? new SourceNavigationService(plugin.app) : null));
  let multiInfoButtonElement: HTMLElement | null = $state(null);

  function showMarkdownSourceOverlay(openedLeaf: any, candidates: string[], fallbackEl?: HTMLElement | null) {
    if (!plugin || !sourceNavigationService) return;
    sourceNavigationService.locateOpenedMarkdownLeaf(openedLeaf, candidates, {
      fallbackEl,
      label: t('study.questionBankUI.verticalToolbar.locateSource'),
      icon: 'map-pinned',
      delayMs: 220
    });
  }

  //  新增：源卡片信息
  let sourceCard = $state<Card | null>(null);
  let isLoadingSourceCard = $state(false);

  // 更多设置菜单
  let showMoreSettingsMenu = $state(false);
  let moreSettingsButtonElement: HTMLElement | null = $state(null);

  function closeAllPanels() {
    showMultiInfoMenu = false;
    showMoreSettingsMenu = false;
  }

  function toggleMultiInfoMenu() {
    const next = !showMultiInfoMenu;
    closeAllPanels();
    showMultiInfoMenu = next;
  }

  function toggleMoreSettingsMenu() {
    const next = !showMoreSettingsMenu;
    closeAllPanels();
    showMoreSettingsMenu = next;
  }

  // 获取来源信息
  function getSourceInfo() {
    return {
      sourceFile: sourceInfo.sourceFile,
      sourceBlock: sourceInfo.sourceBlock,
      sourceCardId: card?.metadata?.sourceCardId as string | undefined  //  新增：源记忆卡片ID
    };
  }

  //  新增：查询源卡片内容
  async function loadSourceCard() {
    const sourceCardId = card?.metadata?.sourceCardId as string | undefined;
    if (!sourceCardId || !plugin) {
      return;
    }

    isLoadingSourceCard = true;
    try {
      // 通过UUID查询源卡片
      sourceCard = await plugin.dataStorage.getCardByUUID(sourceCardId);
      if (!sourceCard) {
        logger.warn('[源卡片查询] 未找到源记忆卡片');
      }
    } catch (error) {
      logger.error('[源卡片查询] 错误:', error);
    } finally {
      isLoadingSourceCard = false;
    }
  }

  //  自动加载源卡片
  $effect(() => {
    if (showMultiInfoMenu && card?.metadata?.sourceCardId && !sourceCard && !isLoadingSourceCard) {
      loadSourceCard();
    }
  });

  // 处理文件路径点击，使用 openLinkText 处理 wikilink 格式
  // 添加文件存在性检查，防止创建新文档
  async function handleOpenSourceFile() {
    if (!sourceInfo.sourceFile || !plugin) {
      new Notice(t('toolbar.sourceNotFound'));
      return;
    }

    const contextPath = plugin.app.workspace.getActiveFile()?.path ?? '';

    // 移除 .md 后缀，使用 wikilink 格式让 Obsidian 自动解析
    const linkText = sourceInfo.sourceFile.replace(/\.md$/, '');
    
    // 验证文件是否存在
    const file = plugin.app.metadataCache.getFirstLinkpathDest(linkText, contextPath);
    if (!file) {
      new Notice(t('toolbar.sourceNotExist'));
      return;
    }
    
    // EPUB文件：拦截到插件内置阅读器
    if (file.path.toLowerCase().endsWith('.epub')) {
      const { EpubLinkService } = await import('../../services/epub-integration/EpubLinkService');
      const linkService = new EpubLinkService(plugin.app);
      await linkService.navigateToEpubLocation(file.path, sourceInfo.epubCfi || '', sourceInfo.epubText || '');
      if (multiInfoButtonElement) {
        sourceLocateOverlay.showAtRect(multiInfoButtonElement.getBoundingClientRect(), {
          label: t('study.questionBankUI.verticalToolbar.locateEpubSource'),
          icon: 'map-pinned'
        });
      }
      new Notice(t('toolbar.openedEpub'));
      showMultiInfoMenu = false;
      return;
    }
    
    const openedLeaf = await openLinkWithExistingLeaf(plugin.app, linkText, contextPath, { openInNewTab: true, focus: true });
    showMarkdownSourceOverlay(
      openedLeaf,
      [linkText, sourceInfo.sourceFile, file.path, file.basename].filter(Boolean) as string[],
      multiInfoButtonElement
    );
    showMultiInfoMenu = false;
    return;
  }

  // 处理块链接点击，使用 Obsidian 原生 wikilink 格式跳转
  // 添加文件存在性检查，防止创建新文档
  async function handleOpenBlockLink() {
    if (!sourceInfo.sourceFile || !plugin) {
      new Notice(t('toolbar.blockNotFound'));
      return;
    }

    try {
      const contextPath = plugin.app.workspace.getActiveFile()?.path ?? '';
      // 移除 .md 后缀
      const docName = sourceInfo.sourceFile.replace(/\.md$/, '');
      const blockId = sourceInfo.sourceBlock?.replace(/^\^/, '');
      
      // 验证文件是否存在
      const file = plugin.app.metadataCache.getFirstLinkpathDest(docName, contextPath);
      if (!file) {
        new Notice(t('toolbar.sourceNotExist'));
        return;
      }
      
      // 构建 wikilink 格式：文档名#^blockId
      const linkText = blockId ? `${docName}#^${blockId}` : docName;
      
      // EPUB文件：拦截到插件内置阅读器
      if (file.path.toLowerCase().endsWith('.epub')) {
        const { EpubLinkService } = await import('../../services/epub-integration/EpubLinkService');
        const linkService = new EpubLinkService(plugin.app);
        await linkService.navigateToEpubLocation(file.path, sourceInfo.epubCfi || '', sourceInfo.epubText || '');
        if (multiInfoButtonElement) {
          sourceLocateOverlay.showAtRect(multiInfoButtonElement.getBoundingClientRect(), {
            label: t('study.questionBankUI.verticalToolbar.locateEpubSource'),
            icon: 'map-pinned'
          });
        }
        new Notice(t('toolbar.openedEpub'));
        showMultiInfoMenu = false;
        return;
      }
      
      // 使用 Obsidian 原生 API 跳转
      const openedLeaf = await openLinkWithExistingLeaf(plugin.app, linkText, contextPath, { openInNewTab: true, focus: true });
      showMarkdownSourceOverlay(
        openedLeaf,
        [linkText, blockId, `^${blockId}`, docName, file.path, file.basename].filter(Boolean) as string[],
        multiInfoButtonElement
      );
      showMultiInfoMenu = false;
      return;
    } catch (error) {
      new Notice(t('toolbar.blockJumpFailed'));
    }
  }

  // 格式化日期时间
  function formatDateTime(dateStr: string | undefined): string {
    if (!dateStr) return t('study.questionBankUI.cardInfoTab.unknown');
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return t('study.questionBankUI.cardInfoTab.unknown');
    }
  }

  // 获取卡片状态文本
  function getCardStateText(state: number): string {
    const stateMap: Record<number, string> = {
      0: t('ui.newCard'),
      1: t('study.questionBankUI.verticalToolbar.stateLearning'),
      2: t('study.questionBankUI.verticalToolbar.stateReviewing'),
      3: t('study.questionBankUI.verticalToolbar.stateRelearning')
    };
    return stateMap[state] || t('study.questionBankUI.cardInfoTab.unknown');
  }

  function handleRemoveClick() {
    if (onRemove) {
      onRemove(enableDirectDelete);
    }
  }

  // 删除功能
  function handleDeleteClick() {
    if (onDelete) {
      onDelete(enableDirectDelete);
    }
  }
</script>

<div class="weave-vertical-toolbar" class:compact={compactMode}>
  <!-- 计时器区域 -->
  <div class="toolbar-section timer-section">
    <div class="timer-display card-timer">
      <span class="timer-text">{formatTime(currentCardTime)}</span>
      <div class="timer-label">{t('toolbar.currentCard')}</div>
    </div>

    <div class="timer-display avg-timer">
      <span class="timer-text">{formatTime(averageTime)}</span>
      <div class="timer-label">{t('study.questionBankUI.verticalToolbar.averageTime')}</div>
    </div>
  </div>

  <!-- 功能按钮组（v4.0: 支持长按拖拽排序） -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div 
    class="toolbar-section actions-section"
    class:is-dragging={isDraggingButton}
    onmousemove={handleButtonDragMove}
    onmouseup={handleButtonDragEnd}
    onmouseleave={handleButtonDragEnd}
    ontouchmove={handleButtonDragMove}
    ontouchend={handleButtonDragEnd}
    ontouchcancel={handleButtonDragEnd}
  >
    <!-- 编辑/预览切换按钮 -->
    <button
      class="clickable-icon toolbar-btn edit-btn"
      onclick={onToggleEdit}
      onmousedown={(e) => handleButtonLongPressStart(e, e.currentTarget)}
      onmouseup={handleButtonDragEnd}
      ontouchstart={(e) => handleButtonLongPressStart(e, e.currentTarget)}
      title={isEditing ? t('toolbar.saveAndPreview') : t('toolbar.editCard')}
    >
      <EnhancedIcon name={isEditing ? "eye" : "edit"} size="18" />
      <span class="btn-label">{isEditing ? t('toolbar.preview') : t('toolbar.edit')}</span>
    </button>

    <!-- 普通文本编辑器按钮 -->
    {#if tempFileUnavailable && onOpenPlainEditor}
      <button
        class="clickable-icon toolbar-btn plain-editor-btn"
        onclick={onOpenPlainEditor}
        onmousedown={(e) => handleButtonLongPressStart(e, e.currentTarget)}
        onmouseup={handleButtonDragEnd}
        ontouchstart={(e) => handleButtonLongPressStart(e, e.currentTarget)}
        title={t('study.questionBankUI.verticalToolbar.plainTextEditor')}
      >
        <EnhancedIcon name="fileText" size="18" />
        <span class="btn-label">{t('study.questionBankUI.verticalToolbar.textShort')}</span>
      </button>
    {/if}

    <!-- 移除（仅从考试题组解除，保留记忆牌组卡片） -->
    <button
      class="clickable-icon toolbar-btn remove-btn"
      onclick={handleRemoveClick}
      onmousedown={(e) => handleButtonLongPressStart(e, e.currentTarget)}
      onmouseup={handleButtonDragEnd}
      ontouchstart={(e) => handleButtonLongPressStart(e, e.currentTarget)}
      title={enableDirectDelete ? t('study.questionBankUI.verticalToolbar.directRemoveCard') : t('study.questionBankUI.verticalToolbar.removeCard')}
    >
      <EnhancedIcon name="unlink" size="18" />
      <span class="btn-label">{t('study.questionBankUI.verticalToolbar.remove')}</span>
    </button>

    <!-- 删除（从记忆牌组与考试题组中彻底删除） -->
    <button
      class="clickable-icon toolbar-btn delete-btn"
      onclick={handleDeleteClick}
      onmousedown={(e) => handleButtonLongPressStart(e, e.currentTarget)}
      onmouseup={handleButtonDragEnd}
      ontouchstart={(e) => handleButtonLongPressStart(e, e.currentTarget)}
      title={enableDirectDelete ? t('toolbar.directDeleteCard') : t('toolbar.deleteCard')}
    >
      <EnhancedIcon name="delete" size="18" />
      <span class="btn-label">{t('toolbar.delete')}</span>
    </button>

    <!-- 收藏 -->
    <button
      class="clickable-icon toolbar-btn favorite-btn"
      class:favorited={card.tags?.includes('#收藏')}
      onclick={onToggleFavorite}
      onmousedown={(e) => handleButtonLongPressStart(e, e.currentTarget)}
      onmouseup={handleButtonDragEnd}
      ontouchstart={(e) => handleButtonLongPressStart(e, e.currentTarget)}
      title={card.tags?.includes('#收藏') ? t('study.questionBankUI.verticalToolbar.unfavorite') : t('study.questionBankUI.verticalToolbar.favoriteCard')}
    >
      <EnhancedIcon name={card.tags?.includes('#收藏') ? "starFilled" : "star"} size="18" />
      <span class="btn-label">{t('study.questionBankUI.verticalToolbar.favorite')}</span>
    </button>

    <!-- 重要程度 -->
    <button
      bind:this={priorityButtonElement}
      class="clickable-icon toolbar-btn priority-btn"
      onclick={() => onChangePriority?.()}
      onmousedown={(e) => handleButtonLongPressStart(e, e.currentTarget)}
      onmouseup={handleButtonDragEnd}
      ontouchstart={(e) => handleButtonLongPressStart(e, e.currentTarget)}
      title={t('study.questionBankUI.verticalToolbar.setPriority')}
      style="color: {getPriorityColor(card.priority || 2)}"
    >
      <div class="priority-indicator">
        {'!'.repeat(Math.min(card.priority || 2, 3))}
      </div>
      <span class="btn-label">{t('study.questionBankUI.verticalToolbar.priorityShort')}</span>
    </button>

    <!-- 多功能信息键 -->
    <div class="multi-info-container">
      <button
        bind:this={multiInfoButtonElement}
        class="clickable-icon toolbar-btn multi-info-btn"
        class:active={showMultiInfoMenu}
        onclick={toggleMultiInfoMenu}
        onmousedown={(e) => handleButtonLongPressStart(e, e.currentTarget)}
        onmouseup={handleButtonDragEnd}
        ontouchstart={(e) => handleButtonLongPressStart(e, e.currentTarget)}
        title={t('study.questionBankUI.verticalToolbar.viewCardInfo')}
      >
        <EnhancedIcon name="eye" size="18" />
        <span class="btn-label">{t('study.questionBankUI.verticalToolbar.viewShort')}</span>
      </button>

      <FloatingMenu
        bind:show={showMultiInfoMenu}
        anchor={multiInfoButtonElement}
        placement="left-start"
        onClose={() => showMultiInfoMenu = false}
        class="multi-info-menu-container"
      >
        {#snippet children()}
          {@const sourceInfo = getSourceInfo()}
          <div class="multi-info-menu-header">
            <span>{t('study.questionBankUI.verticalToolbar.cardInfoAndSource')}</span>
            <button class="close-btn" onclick={() => showMultiInfoMenu = false}>
              <EnhancedIcon name="times" size="12" />
            </button>
          </div>

          <div class="multi-info-menu-content">
            <!-- 基础信息 -->
            <div class="info-section">
              <div class="info-section-title">{t('study.questionBankUI.verticalToolbar.basicInfo')}</div>
              <div class="info-item">
                <span class="info-label">{t('study.questionBankUI.verticalToolbar.cardId')}</span>
                <span class="info-value">{card.uuid.slice(0, 8)}...</span>
              </div>
              <div class="info-item">
                <span class="info-label">{t('study.questionBankUI.verticalToolbar.cardState')}</span>
                <span class="info-value">{card.fsrs ? getCardStateText(card.fsrs.state) : t('study.questionBankUI.cardInfoTab.unknown')}</span>
              </div>
            </div>

            <!-- 来源信息 -->
            <div class="info-section">
              <div class="info-section-title">{t('study.questionBankUI.cardInfoTab.sourceInfo')}</div>
              {#if !sourceInfo.sourceFile && !sourceInfo.sourceBlock && !sourceInfo.sourceCardId}
                <div class="info-item no-source">
                  <span class="info-label no-source-label">
                    {t('study.questionBankUI.verticalToolbar.noSourceShort')}
                  </span>
                  <span class="info-value text-muted">{t('toolbar.noSourceLinked')}</span>
                </div>
              {:else}
                {#if sourceInfo.sourceFile}
                  <div 
                    class="info-item clickable" 
                    onclick={handleOpenSourceFile}
                    onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleOpenSourceFile()}
                    role="button"
                    tabindex="0"
                  >
                    <span class="info-label">
                      {t('toolbar.sourceDoc')}
                    </span>
                    <span class="info-value link-value" title={sourceInfo.sourceFile}>
                      {sourceInfo.sourceFile.split('/').pop() || sourceInfo.sourceFile}
                    </span>
                  </div>
                {/if}

                {#if sourceInfo.sourceBlock}
                  <div 
                    class="info-item clickable" 
                    onclick={handleOpenBlockLink}
                    onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleOpenBlockLink()}
                    role="button"
                    tabindex="0"
                  >
                    <span class="info-label">
                      {t('study.questionBankUI.verticalToolbar.blockReference')}
                    </span>
                    <span class="info-value link-value">
                      {sourceInfo.sourceBlock}
                    </span>
                  </div>
                {/if}

                <!--  新增：源记忆卡片信息 -->
                {#if sourceInfo.sourceCardId}
                  <div class="info-item source-card-item">
                    <span class="info-label">
                      {t('study.questionBankUI.verticalToolbar.sourceMemoryCard')}
                    </span>
                    <span class="info-value" title={sourceInfo.sourceCardId}>
                      {(sourceInfo.sourceCardId as string).slice(0, 12)}...
                    </span>
                  </div>
                  
                  <!-- 源卡片内容展示（直接显示）-->
                  {#if isLoadingSourceCard}
                    <div class="source-card-loading">
                      <EnhancedIcon name="loader" size="14" />
                      <span>{t('study.questionBankUI.verticalToolbar.loadingSourceCard')}</span>
                    </div>
                  {:else if sourceCard}
                    <div class="source-card-content">
                      <div class="source-card-header">
                        <span>{t('study.questionBankUI.verticalToolbar.sourceMemoryCardContent')}</span>
                      </div>
                      <div class="source-card-body">
                        <!-- /skip {@html} renders Markdown card content from trusted internal data source -->{@html sourceCard.content || t('study.questionBankUI.verticalToolbar.emptyContent')}
                      </div>
                    </div>
                  {/if}
                {/if}
              {/if}
            </div>

            {#if onOpenDetailedView}
              <div class="info-section card-action-section">
                <div class="card-action-list">
                  <button
                    class="card-action-item"
                    onclick={() => {
                      showMultiInfoMenu = false;
                      onOpenDetailedView?.();
                    }}
                    type="button"
                  >
                    <span class="card-action-main">
                      <ObsidianIcon name="maximize-2" size={15} />
                      <span>{t('study.menu.cardDetails')}</span>
                    </span>
                    <span class="card-action-arrow">
                      <ObsidianIcon name="chevron-right" size={14} />
                    </span>
                  </button>
                </div>
              </div>
            {/if}
          </div>
        {/snippet}
      </FloatingMenu>
    </div>

    <!-- 更多设置按钮 -->
    <div class="more-settings-container">
      <button
        bind:this={moreSettingsButtonElement}
        class="clickable-icon toolbar-btn more-settings-btn"
        class:active={showMoreSettingsMenu}
        onclick={toggleMoreSettingsMenu}
        onmousedown={(e) => handleButtonLongPressStart(e, e.currentTarget)}
        onmouseup={handleButtonDragEnd}
        ontouchstart={(e) => handleButtonLongPressStart(e, e.currentTarget)}
        title={t('study.questionBankUI.verticalToolbar.moreSettings')}
      >
        <EnhancedIcon name="settings" size="18" />
        <span class="btn-label">{t('study.questionBankUI.verticalToolbar.moreShort')}</span>
      </button>

      <FloatingMenu
        bind:show={showMoreSettingsMenu}
        anchor={moreSettingsButtonElement}
        placement="left-start"
        onClose={() => showMoreSettingsMenu = false}
        class="more-settings-menu-container"
      >
        {#snippet children()}
          <div class="more-settings-menu-header">
            <span>{t('study.questionBankUI.verticalToolbar.moreSettings')}</span>
            <button class="close-btn" onclick={() => showMoreSettingsMenu = false}>
              <EnhancedIcon name="times" size="12" />
            </button>
          </div>

          <div class="more-settings-menu-content">
            <!-- 题目导航设置 -->
            <div class="setting-section">
              <div class="setting-item">
                <div class="setting-label">{t('study.questionBankUI.verticalToolbar.showColumns')}</div>
                <ObsidianDropdown
                  className="setting-select"
                  options={[
                    { id: '1', label: t('study.questionBankUI.verticalToolbar.singleColumn') },
                    { id: '3', label: t('study.questionBankUI.verticalToolbar.threeColumns') }
                  ]}
                  value={String(navColumnMode)}
                  onchange={(value) => onNavColumnModeChange?.(parseInt(value, 10) as 1 | 3)}
                />
              </div>
            </div>

            <!-- 学习顺序设置 -->
            <div class="setting-section">
              <div class="setting-item">
                <div class="setting-label">{t('study.questionBankUI.verticalToolbar.questionOrder')}</div>
                <ObsidianDropdown
                  className="setting-select"
                  options={[
                    { id: 'sequential', label: t('study.questionBankUI.verticalToolbar.sequentialStudy') },
                    { id: 'random', label: t('study.questionBankUI.verticalToolbar.randomStudy') }
                  ]}
                  value={questionOrder}
                  onchange={(value) => onQuestionOrderChange?.(value as 'sequential' | 'random')}
                />
              </div>
            </div>

            <div class="setting-section">
              <div class="setting-item">
                <div class="setting-label">{t('study.questionBankUI.verticalToolbar.optionOrder')}</div>
                <ObsidianDropdown
                  className="setting-select"
                  options={[
                    { id: 'sequential', label: t('study.questionBankUI.verticalToolbar.sequentialShort') },
                    { id: 'random', label: t('study.questionBankUI.verticalToolbar.randomShort') }
                  ]}
                  value={choiceOptionOrder}
                  onchange={(value) => onChoiceOptionOrderChange?.(value as ChoiceOptionOrder)}
                />
              </div>
            </div>

            <!-- 删除设置 -->
            <div class="setting-section">
              <div class="setting-item toggle-item">
                <div class="setting-label">
                  <span>{t('study.questionBankUI.verticalToolbar.enableDirectDelete')}</span>
                </div>
                <label class="toggle-switch">
                  <input
                    type="checkbox"
                    checked={enableDirectDelete}
                    onchange={(e) => onDirectDeleteToggle?.((e.target as HTMLInputElement).checked)}
                  />
                  <span class="slider"></span>
                </label>
              </div>
            </div>
          </div>
        {/snippet}
      </FloatingMenu>
    </div>

  </div>
</div>

<style>
  /* 侧边栏工具栏基础样式已移至全局 vertical-toolbar.css */
  
  /* 下拉菜单容器 */
  .multi-info-container,
  .more-settings-container {
    position: relative;
  }

  /* 菜单头部样式 - 优化为清爽设计，确保不超出下方 */
  .multi-info-menu-header,
  .more-settings-menu-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px 14px 13px;
    border-bottom: 1px solid color-mix(in srgb, var(--background-modifier-border) 40%, transparent);
    background: var(--background-primary);
    margin-bottom: 14px;
  }

  .multi-info-menu-header span,
  .more-settings-menu-header span {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-normal);
    letter-spacing: 0.2px;
  }

  .multi-info-menu-header .close-btn,
  .more-settings-menu-header .close-btn {
    padding: 5px;
    border-radius: 6px;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .multi-info-menu-header .close-btn:hover,
  .more-settings-menu-header .close-btn:hover {
    background: color-mix(in srgb, var(--text-error) 10%, var(--background-primary));
    color: var(--text-error);
    transform: rotate(90deg);
  }

  /* 菜单内容样式 - 增加呼吸感 */
  .multi-info-menu-content {
    min-width: 340px;
    padding: 4px 8px 8px;
  }

  .more-settings-menu-content {
    min-width: 320px;
    max-width: 380px;
    padding: 10px 14px 12px;
  }

  /* 信息分组样式 - 优化间距和分隔 */
  .info-section {
    margin-bottom: 16px;
    padding: 8px 6px 12px;
    background: color-mix(in srgb, var(--background-secondary) 30%, transparent);
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--background-modifier-border) 30%, transparent);
  }

  .info-section:last-child {
    margin-bottom: 0;
  }

  .info-section-title {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.6px;
    margin-bottom: 10px;
    padding: 0 6px;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .info-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 10px;
    border-radius: 6px;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    margin-bottom: 4px;
    background: var(--background-primary);
    border: 1px solid transparent;
  }

  .info-item:hover {
    background: var(--background-modifier-hover);
    border-color: color-mix(in srgb, var(--text-accent) 20%, transparent);
    transform: translateX(2px);
  }

  .info-item:last-child {
    margin-bottom: 0;
  }

  .info-label {
    font-size: 0.78rem;
    color: var(--text-muted);
    font-weight: 500;
    flex-shrink: 0;
    margin-right: 16px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .info-value {
    font-size: 0.78rem;
    color: var(--text-normal);
    font-weight: 500;
    text-align: right;
    word-break: break-all;
    max-width: 65%;
    line-height: 1.4;
  }

  /* 可点击的信息项 */
  .info-item.clickable {
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .info-item.clickable:hover {
    background: var(--background-modifier-hover);
  }

  .link-value {
    color: var(--text-accent) !important;
    text-decoration: underline;
    text-decoration-style: dotted;
    cursor: pointer;
  }

  .info-item.clickable:hover .link-value {
    color: var(--text-accent-hover) !important;
    text-decoration-style: solid;
  }

  .info-item.no-source {
    background: color-mix(in srgb, var(--background-modifier-border) 15%, var(--background-primary));
    border: 1px dashed color-mix(in srgb, var(--text-muted) 30%, transparent);
    border-radius: 6px;
  }

  .info-item.no-source:hover {
    background: color-mix(in srgb, var(--background-modifier-border) 25%, var(--background-primary));
    border-color: color-mix(in srgb, var(--text-muted) 40%, transparent);
    transform: none;
  }

  /*  新增：源卡片信息样式 */
  .info-item.source-card-item {
    background: color-mix(in srgb, var(--interactive-accent) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--interactive-accent) 20%, transparent);
  }

  .info-item.source-card-item:hover {
    background: color-mix(in srgb, var(--interactive-accent) 12%, transparent);
    border-color: color-mix(in srgb, var(--interactive-accent) 30%, transparent);
  }

  .source-card-loading {
    margin-top: 12px;
    padding: 12px;
    background: var(--background-modifier-form-field);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--text-muted);
    font-size: 0.8rem;
  }

  .source-card-content {
    margin-top: 12px;
    padding: 12px;
    background: color-mix(in srgb, var(--background-secondary) 80%, transparent);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    max-height: 300px;
    overflow-y: auto;
  }

  .source-card-header {
    display: flex;
    align-items: center;
    margin-bottom: 12px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--background-modifier-border);
    color: var(--text-muted);
    font-size: 0.85rem;
    font-weight: 600;
    letter-spacing: 0.3px;
  }

  .source-card-body {
    color: var(--text-normal);
    font-size: 0.88rem;
    line-height: 1.7;
    word-wrap: break-word;
    word-break: break-word;
    white-space: pre-wrap;
  }

  .source-card-body :global(p) {
    margin: 0.8em 0;
  }

  .source-card-body :global(p:first-child) {
    margin-top: 0;
  }

  .source-card-body :global(p:last-child) {
    margin-bottom: 0;
  }

  .source-card-body :global(h1),
  .source-card-body :global(h2),
  .source-card-body :global(h3) {
    margin: 1em 0 0.5em 0;
    line-height: 1.4;
  }

  .source-card-body :global(ul),
  .source-card-body :global(ol) {
    margin: 0.8em 0;
    padding-left: 1.5em;
  }

  .source-card-body :global(li) {
    margin: 0.3em 0;
  }

  .text-muted {
    color: var(--text-muted) !important;
    font-style: italic;
    font-size: 0.75rem;
  }

  .card-action-section {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid color-mix(in srgb, var(--background-modifier-border) 40%, transparent);
  }

  .card-action-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .card-action-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    padding: 10px 12px;
    background: var(--background-secondary);
    border: 1px solid color-mix(in srgb, var(--background-modifier-border) 82%, transparent);
    border-radius: 8px;
    color: var(--text-normal);
    cursor: pointer;
    transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }

  .card-action-item:hover {
    background: var(--background-modifier-hover);
    border-color: color-mix(in srgb, var(--interactive-accent) 28%, var(--background-modifier-border));
    color: var(--text-normal);
  }

  .card-action-item:focus-visible {
    outline: 2px solid var(--interactive-accent);
    outline-offset: 2px;
  }

  .card-action-item:active {
    background: color-mix(in srgb, var(--background-modifier-hover) 65%, var(--background-secondary));
  }

  .card-action-main {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    font-size: 0.84rem;
    font-weight: 600;
  }

  .card-action-main :global(.obsidian-icon) {
    color: var(--icon-color);
  }

  .card-action-arrow {
    color: var(--text-faint);
  }

  /* 设置分组样式 */
  .setting-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 0;
    border-bottom: 1px solid color-mix(in srgb, var(--background-modifier-border) 30%, transparent);
  }

  .setting-section:first-child {
    padding-top: 4px;
  }

  .setting-section:last-child {
    border-bottom: none;
    padding-bottom: 4px;
  }

  .more-settings-menu-content .setting-item {
    border-style: dashed;
    border-color: color-mix(in srgb, var(--background-modifier-border) 70%, transparent);
    background: color-mix(in srgb, var(--background-secondary) 40%, var(--background-primary));
  }

  .setting-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 9px 12px;
    border-radius: 6px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .more-settings-menu-content .setting-item:hover {
    background: var(--background-modifier-hover);
    border-color: color-mix(in srgb, var(--interactive-accent) 40%, var(--background-modifier-border));
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  }

  .setting-item:hover {
    background: var(--background-modifier-hover);
    border-color: color-mix(in srgb, var(--interactive-accent) 40%, var(--background-modifier-border));
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  }

  .more-settings-menu-content :global(.obsidian-dropdown-trigger.setting-select) {
    border-style: dashed;
    border-color: color-mix(in srgb, var(--background-modifier-border) 70%, transparent);
    background: color-mix(in srgb, var(--background-secondary) 25%, var(--background-modifier-form-field));
  }

  .setting-item.toggle-item {
    padding: 10px 12px;
  }

  .setting-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-normal);
  }

  :global(.obsidian-dropdown-trigger.setting-select) {
    padding: 8px 12px;
    background: var(--background-primary);
    border: 1px solid color-mix(in srgb, var(--background-modifier-border) 60%, transparent);
    border-radius: 6px;
    font-size: 0.82rem;
    font-weight: 500;
    color: var(--text-normal);
    cursor: pointer;
    min-height: 0;
  }

  :global(.obsidian-dropdown-trigger.setting-select:hover:not(.disabled)) {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
  }

  :global(.obsidian-dropdown-trigger.setting-select:focus-visible) {
    outline: none;
    border-color: var(--interactive-accent);
    box-shadow: none;
  }

  .toggle-switch {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 24px;
  }

  .toggle-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: var(--background-modifier-border);
    transition: .3s;
    border-radius: 24px;
  }

  .slider:before {
    position: absolute;
    content: "";
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: .3s;
    border-radius: 50%;
  }

  input:checked + .slider {
    background-color: var(--interactive-accent);
  }

  input:checked + .slider:before {
    transform: translateX(20px);
  }

</style>
