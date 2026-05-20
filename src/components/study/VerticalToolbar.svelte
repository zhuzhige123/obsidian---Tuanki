<script lang="ts">
  import { logger } from '../../utils/logger';
  // 静态导入 parseSourceInfo，确保响应式追踪正常
  import { parseEpubSourceInfo, parseSourceInfo, getCardDeckIds, getCardDeckNames } from '../../utils/yaml-utils';
  // 使用 CardMetadataService 获取卡片元数据
  import { getCardMetadataService } from '../../services/CardMetadataService';

  import EnhancedIcon from "../ui/EnhancedIcon.svelte";
  import FloatingMenu from "../ui/FloatingMenu.svelte";
  import ObsidianDropdown from "../ui/ObsidianDropdown.svelte";
  import ObsidianIcon from "../ui/ObsidianIcon.svelte";
  import {
    getRatingLabelStyleOptions,
    normalizeRatingLabelStyle,
    type RatingLabelStyle
  } from "./rating-label-style";
  import type { ChoiceOptionOrder } from '../../utils/study/choiceOptionOrder';
  import type { Card, Deck } from "../../data/types";
  import type { WeavePlugin } from "../../main";
  //  导入国际化
  import { currentLanguage, tr } from '../../utils/i18n';
  import { MarkdownRenderer, Component, Notice } from "obsidian";
  import { FeatureUsageHintModal } from '../../modals/FeatureUsageHintModal';
  import {
    GLOBAL_TUTORIAL_HINT_IDS,
    markTutorialHintDismissed,
    shouldShowTutorialHint,
    type GlobalTutorialHintId
  } from '../../services/tutorial/GlobalTutorialHints';
  import { onDestroy, untrack } from 'svelte';
  // 导入卡片关系工具函数
  import { getDerivationMethodName } from '../../utils/card-relation-helpers';
  import { openLinkWithExistingLeaf } from '../../utils/workspace-navigation';
  import { getSourceLocateOverlayService } from '../../services/ui/SourceLocateOverlayService';
  import { SourceNavigationService } from '../../services/ui/SourceNavigationService';
  import { getCanvasLocateSupportFromCardContent, normalizeCanvasNodeId } from '../../services/ui/canvas-source-locate';
  import { writeSystemClipboardText } from '../../utils/system-clipboard';
  // 导入 AI 助手菜单构建器
  import { AIAssistantMenuBuilder } from '../../services/menu/AIAssistantMenuBuilder';

  interface Props {
    card: Card;
    currentCardTime: number;
    averageTime: number;
    plugin?: WeavePlugin;
    decks?: Deck[];
    isEditing?: boolean;
    tempFileUnavailable?: boolean;
    compactMode?: boolean;
    compactModeSetting?: 'auto' | 'fixed';
    onCompactModeSettingChange?: (setting: 'auto' | 'fixed') => void;
    onToggleEdit?: () => void;
    onDelete?: (skipConfirm?: boolean) => void;
    onSetReminder?: () => void;
    onChangePriority?: () => void;
    onReminderAnchorChange?: (element: HTMLElement | null) => void;
    onPriorityAnchorChange?: (element: HTMLElement | null) => void;
    onChangeDeck?: (deckId: string) => void | Promise<void>;
    onOpenPlainEditor?: () => void;
    onSplitCard?: (actionId: string) => void; // AI 拆分
    onManageFormatActions?: () => void;
    onOpenDetailedView?: () => void; // 打开详细信息模态窗
    onRecycleCard?: () => void; // 回收卡片
    autoPlayMedia?: boolean;
    playMediaMode?: 'first' | 'all';
    playMediaTiming?: 'cardChange' | 'showAnswer';
    playbackInterval?: number;
    onMediaAutoPlayChange?: (setting: 'enabled' | 'mode' | 'timing' | 'interval', value: boolean | 'first' | 'all' | 'cardChange' | 'showAnswer' | number) => void;
    enableDirectDelete?: boolean;
    onDirectDeleteToggle?: (enabled: boolean) => void;
    showClozeModeSwitchButton?: boolean;
    onClozeModeSwitchButtonToggle?: (enabled: boolean) => void;
    // 卡片学习顺序
    cardOrder?: 'sequential' | 'random';
    onCardOrderChange?: (order: 'sequential' | 'random') => void;
    choiceOptionOrder?: ChoiceOptionOrder;
    onChoiceOptionOrderChange?: (order: ChoiceOptionOrder) => void;
    ratingLabelStyle?: RatingLabelStyle;
    onRatingLabelStyleChange?: (style: RatingLabelStyle) => void;
    showRatingIntervalOnButtons?: boolean;
    onRatingIntervalButtonsToggle?: (enabled: boolean) => void;
    // 图谱联动
    isGraphLinked?: boolean;
    onGraphLinkToggle?: (enabled: boolean) => void;
    onGraphLeafChange?: (leaf: any) => void; //  传递graphSyncLeaf引用
    //  高级功能控制 - 插件未激活时隐藏AI助手和原文功能
    isPremium?: boolean;
    timerAutoPauseSeconds?: number;
    onTimerAutoPauseChange?: (seconds: number) => void;
    hintMaxUses?: number;
    onHintMaxUsesChange?: (value: number) => void;
    onPanelOpen?: () => void;
  }

  // 来源信息接口
  interface SourceInfo {
    sourceFile?: string;
    sourceBlock?: string;
  }

  let {
    card,
    currentCardTime,
    averageTime,
    plugin,
    decks = [],
    isEditing = false,
    tempFileUnavailable = false,
    compactMode = false,
    compactModeSetting = 'fixed',
    onCompactModeSettingChange,
    onToggleEdit,
    onDelete,
    onSetReminder,
    onChangePriority,
    onReminderAnchorChange,
    onPriorityAnchorChange,
    onChangeDeck,
    onOpenPlainEditor,
    onSplitCard, // AI 拆分
    onManageFormatActions,
    onOpenDetailedView, // 打开详细信息
    onRecycleCard, // 回收卡片
    autoPlayMedia = false,
    playMediaMode = 'first',
    playMediaTiming = 'cardChange',
    playbackInterval = 2000,
    onMediaAutoPlayChange,
    enableDirectDelete = false,
    onDirectDeleteToggle,
    showClozeModeSwitchButton = true,
    onClozeModeSwitchButtonToggle,
    // 卡片学习顺序
    cardOrder = 'sequential',
    onCardOrderChange,
    choiceOptionOrder = 'sequential',
    onChoiceOptionOrderChange,
    ratingLabelStyle = 'classic',
    onRatingLabelStyleChange,
    showRatingIntervalOnButtons = false,
    onRatingIntervalButtonsToggle,
    // 图谱联动
    isGraphLinked = false,
    onGraphLinkToggle,
    onGraphLeafChange,
    //  高级功能控制
    isPremium = false,
    timerAutoPauseSeconds = 60,
    onTimerAutoPauseChange,
    hintMaxUses = 5,
    onHintMaxUsesChange,
    onPanelOpen,
  }: Props = $props();

  //  响应式翻译函数
  let t = $derived($tr);
  let ratingLabelStyleOptions = $derived(getRatingLabelStyleOptions(t));
  let normalizedRatingLabelStyle = $derived(normalizeRatingLabelStyle(ratingLabelStyle));
	let currentLocale = $derived($currentLanguage === 'zh-CN' ? 'zh-CN' : 'en-US');

  function getLocalizedDerivationMethodName(method: string): string {
    return getDerivationMethodName(method, (key) => t(key));
  }

  // 格式化学习时间
  function formatTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  // 格式化提示次数
  function formatHintMaxUsesLabel(value: number): string {
    return t('study.menu.settings.hintMaxUses.value', { count: value });
  }

  // 格式化播放间隔
  function formatPlaybackIntervalValue(interval: number): string {
    return t('studyInterface.intervals.seconds', { n: (interval / 1000).toFixed(1) });
  }

  // 格式化计时器自动暂停时间
  function formatTimerAutoPauseValue(seconds: number): string {
    if (seconds >= 60) {
      return t('studyInterface.intervals.minutes', { n: seconds / 60 });
    }

    return t('studyInterface.intervals.seconds', { n: seconds });
  }

  // 获取优先级颜色
  function getPriorityColor(priority: number): string {
    switch (priority) {
      case 1: return "#fbbf24"; // 低优先级 - 黄色
      case 2: return "#60a5fa"; // 中优先级 - 蓝色
      case 3: return "#f97316"; // 高优先级 - 橙色
      case 4: return "#ef4444"; // 紧急 - 红色
      default: return "#60a5fa";
    }
  }

  // 获取优先级星级
  function getPriorityStars(priority: number): number {
    return Math.min(Math.max(priority, 1), 4);
  }

  let reminderButtonElement: HTMLElement | null = $state(null);
  let priorityButtonElement: HTMLElement | null = $state(null);

  $effect(() => {
    onReminderAnchorChange?.(reminderButtonElement);
  });

  $effect(() => {
    onPriorityAnchorChange?.(priorityButtonElement);
  });

  // 牌组切换功能
  let showDeckMenu = $state(false);
  let deckButtonElement: HTMLElement | null = $state(null);

  // 多功能信息键（合并查看与来源）
  let showMultiInfoMenu = $state(false);
  let multiInfoButtonElement: HTMLElement | null = $state(null);

  // 源块文本浮窗
  let showSourceBlockMenu = $state(false);
  let sourceBlockButtonElement: HTMLElement | null = $state(null);
  let sourceBlockContent = $state<string>('');
  let sourceBlockContext = $state<{ before: string[]; after: string[]; targetLine: number }>({ before: [], after: [], targetLine: -1 });
  let isLoadingSourceBlock = $state(false);
  let sourceBlockError = $state<string | null>(null);
  // Obsidian 渲染相关
  let sourceBlockRenderContainer = $state<HTMLElement | null>(null);
  let contextBeforeRenderContainer = $state<HTMLElement | null>(null);
  let contextAfterRenderContainer = $state<HTMLElement | null>(null);
  let sourceBlockRenderComponent: Component | null = null;
  let contextBeforeRenderComponent: Component | null = null;
  let contextAfterRenderComponent: Component | null = null;

  // 更多设置菜单
  let showMoreSettingsMenu = $state(false);
  let moreSettingsButtonElement: HTMLElement | null = $state(null);

  // AI 助手菜单构建器
  let aiAssistantMenuBuilder: AIAssistantMenuBuilder | null = $state(null);

  // 图谱联动状态
  let graphSyncLeaf: any = $state(null); // 用于图谱同步的leaf引用
  
  // 响应式来源信息，使用统一的 parseSourceInfo 工具函数
  // 静态导入可确保响应式追踪正常工作
  let sourceInfo = $derived.by(() => {
    // 显式访问 card.content 建立响应式依赖
    const content = card?.content;
    if (!content) return { sourceFile: card?.sourceFile, sourceBlock: card?.sourceBlock };
    
    const parsed = parseSourceInfo(content);
    const epubSource = parseEpubSourceInfo(content);
    // 回退到派生字段（如果解析失败）
    return {
      sourceFile: epubSource.sourceFile || parsed.sourceFile || card?.sourceFile,
      sourceBlock: parsed.sourceBlock || card?.sourceBlock,
      epubCfi: epubSource.cfi,
      epubText: epubSource.text,
      epubChapter: epubSource.chapter
    };
  });
  
  // 检测卡片是否有来源文档（用于图谱联动指示器）
  let hasSourceFile = $derived(!!sourceInfo.sourceFile);
  const sourceLocateOverlay = getSourceLocateOverlayService();
  const sourceNavigationService = untrack(() => (plugin ? new SourceNavigationService(plugin.app) : null));

  function showMarkdownSourceOverlay(openedLeaf: any, candidates: string[], fallbackEl?: HTMLElement | null) {
    if (!plugin || !sourceNavigationService) return;
    sourceNavigationService.locateOpenedMarkdownLeaf(openedLeaf, candidates, {
      fallbackEl,
      label: t('toolbar.locateSourcePosition'),
      icon: 'map-pinned',
      delayMs: 220
    });
  }

  function resolveSourceFile(sourceFilePath: string): any | null {
    if (!plugin || !sourceFilePath) return null;

    const directFile = plugin.app.vault.getAbstractFileByPath(sourceFilePath);
    if (directFile) return directFile;

    const contextPath = plugin.app.workspace.getActiveFile()?.path ?? '';
    const linkText = sourceFilePath.replace(/\.md$/, '');
    return plugin.app.metadataCache.getFirstLinkpathDest(linkText, contextPath);
  }

  async function openCanvasSourceTarget(filePath: string, blockId?: string): Promise<void> {
    if (!plugin || !sourceNavigationService) return;

    const normalizedBlockId = normalizeCanvasNodeId(blockId);
    const { nodeRect: targetRect, textCandidates, rawWeSource } = getCanvasLocateSupportFromCardContent(card?.content || '');

    logger.info('[VerticalToolbar] Canvas source locate start', {
      filePath,
      blockId,
      normalizedBlockId,
      cardUuid: card?.uuid,
      rawWeSource,
      targetRect,
      textCandidates
    });

    const openedLeaf = await sourceNavigationService.openCanvasAndLocate(
      filePath,
      textCandidates,
      normalizedBlockId,
      {
        label: t('toolbar.locateSourcePosition'),
        icon: 'map-pinned',
        focus: true,
        openInNewTab: true,
        delayMs: 500,
        fallbackEl: sourceBlockButtonElement ?? multiInfoButtonElement ?? undefined,
        nodeRect: targetRect ?? undefined
      }
    );

    if (!openedLeaf) {
      new Notice(t('toolbar.sourceNotExist'));
    }
  }

  //  初始化 AI助手菜单构建器
  $effect(() => {
    if (card && onManageFormatActions && onSplitCard) {
      aiAssistantMenuBuilder = new AIAssistantMenuBuilder(
        card,
        onSplitCard,
        onManageFormatActions
      );
    } else {
      aiAssistantMenuBuilder = null;
    }
  });

  function toggleDeckMenu() {
    if (!decks || decks.length === 0) {
      new Notice(t('toolbar.noDecksAvailable'));
      return;
    }

    const next = !showDeckMenu;
    closeAllPanels();
    showDeckMenu = next;
  }
  
  function handleChangeDeck(deckId: string) {
    if (!onChangeDeck) {
      showDeckMenu = false;
      return;
    }

    void Promise.resolve(onChangeDeck(deckId)).finally(() => {
      showDeckMenu = false;
    });
  }

  // 使用 CardMetadataService 获取当前卡片所在牌组的名称
  function getCurrentDeckName(): string {
    const fallback = t('toolbar.unknownDeck');
    if (!card) return fallback;
    const service = getCardMetadataService();
    const names = service.getCardDeckNames(card);
    return names.length > 0 ? names[0] : fallback;
  }
  
  // 获取当前卡片的主牌组 ID
  function getCurrentDeckId(): string | undefined {
    if (!card) return undefined;
    const service = getCardMetadataService();
    return service.getCardDeckIds(card)[0];
  }

  // 多功能信息键相关函数
  function toggleMultiInfoMenu() {
    const next = !showMultiInfoMenu; closeAllPanels(); showMultiInfoMenu = next;
  }

  async function maybeShowToolbarHint(
    hintId: GlobalTutorialHintId,
    options: {
      title: string;
      intro: string;
      listItems: string[];
      note: string;
    }
  ): Promise<void> {
    if (!plugin?.app) return;
    if (!shouldShowTutorialHint(plugin.settings, hintId)) return;

    const modal = new FeatureUsageHintModal(plugin.app, {
      ...options,
      onConfirm: async (dismissPermanently: boolean) => {
        if (!dismissPermanently) return;
        try {
          markTutorialHintDismissed(plugin.settings, hintId);
          await plugin.saveSettings();
        } catch (error) {
          logger.error('[VerticalToolbar] 保存教程提示设置失败:', error);
          new Notice(t('toolbar.saveHintSettingsFailed'));
        }
      }
    });
    modal.open();
  }

  function maybeShowSourceBlockHint(): void {
    void maybeShowToolbarHint(GLOBAL_TUTORIAL_HINT_IDS.SOURCE_BLOCK_BUTTON, {
      title: t('toolbar.sourceBlockHint.title'),
      intro: t('toolbar.sourceBlockHint.intro'),
      listItems: [
        t('toolbar.sourceBlockHint.item1'),
        t('toolbar.sourceBlockHint.item2'),
        t('toolbar.sourceBlockHint.item3')
      ],
      note: t('toolbar.sourceBlockHint.note')
    });
  }

  function maybeShowRecycleCardHint(): void {
    void maybeShowToolbarHint(GLOBAL_TUTORIAL_HINT_IDS.RECYCLE_CARD_BUTTON, {
      title: t('toolbar.recycleHint.title'),
      intro: t('toolbar.recycleHint.intro'),
      listItems: [
        t('toolbar.recycleHint.item1'),
        t('toolbar.recycleHint.item2'),
        t('toolbar.recycleHint.item3')
      ],
      note: t('toolbar.recycleHint.note')
    });
  }

  // 源块文本浮窗相关函数
  function toggleSourceBlockMenu() {
    if (!showSourceBlockMenu) {
      // 打开时加载源块内容
      loadSourceBlockContent();
    }
    const next = !showSourceBlockMenu; closeAllPanels(); showSourceBlockMenu = next;
    if (next) {
      maybeShowSourceBlockHint();
    }
  }

  /**
   * 加载源块文本内容
   * 读取源文档中的块内容及上下文
   */
  async function loadSourceBlockContent() {
    // 使用响应式 sourceInfo 从 content YAML 获取来源
    if (!sourceInfo.sourceFile || !plugin) {
      sourceBlockError = t('toolbar.noSourceDoc');
      return;
    }

    isLoadingSourceBlock = true;
    sourceBlockError = null;
    sourceBlockContent = '';
    sourceBlockContext = { before: [], after: [], targetLine: -1 };

    try {
      const contextPath = plugin.app.workspace.getActiveFile()?.path ?? '';
      // 使用 metadataCache 查找文件，支持仅文件名格式
      const linkText = sourceInfo.sourceFile.replace(/\.md$/, '');
      const file = plugin.app.metadataCache.getFirstLinkpathDest(linkText, contextPath);
      if (!file) {
        sourceBlockError = t('toolbar.sourceDocDeleted');
        isLoadingSourceBlock = false;
        return;
      }

      const content = await plugin.app.vault.read(file as any);
      const lines = content.split('\n');
      const blockId = sourceInfo.sourceBlock?.replace(/^\^/, ''); // 移除^前缀

      if (!blockId) {
        // 没有块ID，显示文档开头部分
        sourceBlockContent = lines.slice(0, 20).join('\n');
        sourceBlockContext = { before: [], after: lines.slice(20, 30), targetLine: 0 };
        isLoadingSourceBlock = false;
        return;
      }

      // 查找包含blockId的行
      let targetLine = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(`^${blockId}`)) {
          targetLine = i;
          break;
        }
      }

      if (targetLine === -1) {
        sourceBlockError = t('toolbar.blockRefNotFound', { blockId });
        isLoadingSourceBlock = false;
        return;
      }

      // 获取源块内容（移除末尾的块ID标记）
      const targetLineContent = lines[targetLine];
      const cleanContent = targetLineContent.replace(/\s*\^[\w-]+$/, '').trim();
      sourceBlockContent = cleanContent;

      // 获取上下文（前后各10行）
      const contextLines = 10;
      const beforeStart = Math.max(0, targetLine - contextLines);
      const afterEnd = Math.min(lines.length, targetLine + contextLines + 1);

      sourceBlockContext = {
        before: lines.slice(beforeStart, targetLine).map(line => line.replace(/\s*\^[\w-]+$/, '')),
        after: lines.slice(targetLine + 1, afterEnd).map(line => line.replace(/\s*\^[\w-]+$/, '')),
        targetLine: targetLine
      };

      isLoadingSourceBlock = false;
      
      // 触发 Obsidian 渲染
      renderSourceBlockContents();
    } catch (error) {
      logger.error('[VerticalToolbar] 加载源块内容失败:', error);
      sourceBlockError = t('toolbar.readSourceFailed');
      isLoadingSourceBlock = false;
    }
  }

  /**
   * 复制源块内容到剪贴板
   */
  async function copySourceBlockContent() {
    if (sourceBlockContent) {
      const copied = await writeSystemClipboardText(sourceBlockContent);
      new Notice(copied ? t('toolbar.copiedSourceBlock') : '复制失败');
    }
  }

  /**
   * 跳转到源文档并高亮源块
   */
  function jumpToSourceBlock() {
    handleOpenBlockLink();
    showSourceBlockMenu = false;
  }

  /**
   * 使用Obsidian渲染引擎渲染Markdown内容
   */
  async function renderMarkdownContent(
    element: HTMLElement | null, 
    content: string, 
    existingComponent: Component | null
  ): Promise<Component | null> {
    if (!element || !content || !plugin?.app) return null;
    
    element.replaceChildren();
    
    try {
      // 清理旧的组件实例
      if (existingComponent) {
        existingComponent.unload();
      }
      
      // 创建新的组件实例
      const newComponent = new Component();
      
      // 使用Obsidian渲染API
      await MarkdownRenderer.render(
        plugin.app,
        content,
        element,
        card?.sourceFile || '',
        newComponent
      );
      
      newComponent.load();
      return newComponent;
    } catch (error) {
      logger.error('[VerticalToolbar] Markdown渲染失败:', error);
      element.textContent = content;
      return null;
    }
  }

  /**
   * 渲染所有源块内容
   */
  async function renderSourceBlockContents() {
    if (!plugin?.app) return;
    
    // 等待DOM更新
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // 渲染上文
    if (contextBeforeRenderContainer && sourceBlockContext.before.length > 0) {
      const beforeContent = sourceBlockContext.before.join('\n');
      contextBeforeRenderComponent = await renderMarkdownContent(
        contextBeforeRenderContainer, 
        beforeContent, 
        contextBeforeRenderComponent
      );
    }
    
    // 渲染源块内容
    if (sourceBlockRenderContainer && sourceBlockContent) {
      sourceBlockRenderComponent = await renderMarkdownContent(
        sourceBlockRenderContainer, 
        sourceBlockContent, 
        sourceBlockRenderComponent
      );
    }
    
    // 渲染下文
    if (contextAfterRenderContainer && sourceBlockContext.after.length > 0) {
      const afterContent = sourceBlockContext.after.join('\n');
      contextAfterRenderComponent = await renderMarkdownContent(
        contextAfterRenderContainer, 
        afterContent, 
        contextAfterRenderComponent
      );
    }
    
    // 渲染完成后自动滚动到源块高亮区域
    scrollToSourceBlockHighlight();
  }

  /**
   * 滚动到源块高亮区域
   */
  function scrollToSourceBlockHighlight() {
    // 延迟执行确保DOM完全渲染
    setTimeout(() => {
      if (sourceBlockRenderContainer) {
        // 找到高亮区域的父元素
        const highlightElement = sourceBlockRenderContainer.closest('.source-block-highlight');
        if (highlightElement) {
          highlightElement.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
          });
        }
      }
    }, 100);
  }

  // 清理渲染组件
  onDestroy(() => {
    sourceBlockRenderComponent?.unload();
    contextBeforeRenderComponent?.unload();
    contextAfterRenderComponent?.unload();
  });

  // 更多设置相关函数
  function closeAllPanels() { showMultiInfoMenu = false; showSourceBlockMenu = false; showMoreSettingsMenu = false; showDeckMenu = false; onPanelOpen?.(); }

  function toggleMoreSettingsMenu() {
    const next = !showMoreSettingsMenu; closeAllPanels(); showMoreSettingsMenu = next;
  }

  //  AI助手按钮点击处理（Store自动保持最新数据）
  function handleAIAssistantClick(evt: MouseEvent) {
    if (aiAssistantMenuBuilder) {
      aiAssistantMenuBuilder.showMainMenu(evt);
    }
  }

  // getSourceInfo 已替换为响应式 sourceInfo ($derived)

  // 处理文件路径点击 - 打开源文档（从 content YAML 获取）
  // 使用 openLinkText 处理 wikilink 格式，无需完整路径
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
    const file = resolveSourceFile(sourceInfo.sourceFile);
    if (!file) {
      new Notice(t('toolbar.sourceNotExist'));
      return;
    }

    if (file.path.toLowerCase().endsWith('.canvas')) {
      await openCanvasSourceTarget(file.path, sourceInfo.sourceBlock?.replace(/^\^/, ''));
      showMultiInfoMenu = false;
      return;
    }

    // EPUB文件：拦截到插件内置阅读器
    if (file.path.toLowerCase().endsWith('.epub')) {
      const { EpubLinkService } = await import('../../services/epub-integration/EpubLinkService');
      const linkService = new EpubLinkService(plugin.app);
      await linkService.navigateToEpubLocation(file.path, sourceInfo.epubCfi || '', sourceInfo.epubText || '');
      new Notice(t('toolbar.openedEpub'));
      showMultiInfoMenu = false;
      return;
    }
    
    await openLinkWithExistingLeaf(plugin.app, linkText, contextPath, { openInNewTab: true, focus: true });
    showMultiInfoMenu = false;
  }

  // 处理块链接点击 - 跳转到块（从 content YAML 获取）
  // 使用 Obsidian 原生 wikilink 格式跳转，支持块引用
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
      const blockId = sourceInfo.sourceBlock?.replace(/^\^/, ''); // 移除^前缀
      
      // 验证文件是否存在
      const file = resolveSourceFile(sourceInfo.sourceFile);
      if (!file) {
        new Notice(t('toolbar.sourceNotExist'));
        return;
      }
      
      if (file.path.toLowerCase().endsWith('.canvas')) {
        await openCanvasSourceTarget(file.path, blockId);
        showMultiInfoMenu = false;
        return;
      }

      // 构建 wikilink 格式：文档名#^blockId
      const linkText = blockId ? `${docName}#^${blockId}` : docName;
      
      // EPUB文件：拦截到插件内置阅读器
      if (file.path.toLowerCase().endsWith('.epub')) {
        const { EpubLinkService } = await import('../../services/epub-integration/EpubLinkService');
        const linkService = new EpubLinkService(plugin.app);
        await linkService.navigateToEpubLocation(file.path, sourceInfo.epubCfi || '', sourceInfo.epubText || '');
        if (sourceBlockButtonElement) {
          sourceLocateOverlay.showAtRect(sourceBlockButtonElement.getBoundingClientRect(), {
            label: t('toolbar.locateEpubSourcePosition'),
            icon: 'map-pinned'
          });
        }
        new Notice(t('toolbar.openedEpub'));
        showMultiInfoMenu = false;
        return;
      }
      
      // 使用 Obsidian 原生 API 跳转，自动处理文件查找和块定位
      const openedLeaf = await openLinkWithExistingLeaf(plugin.app, linkText, contextPath, { openInNewTab: true, focus: true });
      showMarkdownSourceOverlay(
        openedLeaf,
        [linkText, blockId, `^${blockId}`, docName, file.path, file.basename].filter(Boolean) as string[],
        sourceBlockButtonElement
      );
      showMultiInfoMenu = false;
      return;
    } catch (error) {
      logger.error('跳转到块引用失败:', error);
      new Notice(t('toolbar.blockJumpFailed'));
    }
  }

  function formatDateTime(dateStr: string | undefined): string {
    if (!dateStr) return t('toolbar.unknown');
    try {
      const date = new Date(dateStr);
      return date.toLocaleString(currentLocale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return t('toolbar.formatError');
    }
  }

  // 格式化时间间隔（天数）
  function formatInterval(days: number | undefined): string {
    if (days === undefined || days === null) return t('toolbar.unknown');
    if (days < 1) return t('toolbar.lessThanOneDay');
    if (days === 1) return t('toolbar.daysUnit', { n: 1 });
    if (days < 30) return t('toolbar.daysUnit', { n: Math.round(days) });
    if (days < 365) return t('toolbar.monthsUnit', { n: Math.round(days / 30) });
    return t('toolbar.yearsUnit', { n: Math.round(days / 365) });
  }

  // 获取卡片状态文本
  function getCardStateText(state: number): string {
    const stateMap: Record<number, string> = {
      0: t('toolbar.stateNew'),
      1: t('toolbar.stateLearning'),
      2: t('toolbar.stateReview'),
      3: t('toolbar.stateRelearning')
    };
    return stateMap[state] || t('toolbar.stateUnknown');
  }

  // 获取当前牌组名称 - 优先从 content YAML 获取
  // 使用统一的工具函数
  function getDeckName(): string {
    if (!card || !decks) return t('toolbar.unknownDeck');
    
    // 使用新的工具函数获取牌组名称列表
    const names = getCardDeckNames(card, decks, t('toolbar.unknownDeck'));
    return names.join(', ');
  }

  //  删除功能 - 根据设置决定是否直接删除
  function handleDeleteClick() {
    if (onDelete) {
      // 根据设置决定是否跳过确认弹窗
      onDelete(enableDirectDelete);
    }
  }

  // 图谱联动功能
  async function toggleGraphLink() {
    const newState = !isGraphLinked;
    
    if (newState) {
      // 开启联动
      const success = await initializeGraphSync();
      if (success) {
        onGraphLinkToggle?.(true);
        //  传递graphSyncLeaf引用给父组件
        onGraphLeafChange?.(graphSyncLeaf);
        new Notice(t('toolbar.graphLinkSuccess'), 8000);
      }
    } else {
      // 关闭联动
      //  先分离图谱leaf，清理关联关系
      if (graphSyncLeaf) {
        try {
          graphSyncLeaf.detach();
          logger.debug('[图谱联动] 已分离图谱leaf');
        } catch (error) {
          logger.warn('[图谱联动] 分离图谱leaf失败:', error);
        }
      }
      graphSyncLeaf = null;
      onGraphLinkToggle?.(false);
      //  通知父组件清除引用
      onGraphLeafChange?.(null);
      new Notice(t('toolbar.graphLinkClosed'));
    }
  }

  async function initializeGraphSync(): Promise<boolean> {
    // 使用响应式 sourceInfo 从 content YAML 获取来源
    if (!sourceInfo.sourceFile || !plugin) {
      new Notice(t('toolbar.noSourceFile'));
      return false;
    }
    
    try {
      // 使用 metadataCache 查找文件，支持仅文件名格式
      const linkText = sourceInfo.sourceFile.replace(/\.md$/, '');
      const file = plugin.app.metadataCache.getFirstLinkpathDest(linkText, '');
      if (!file) {
        new Notice(t('toolbar.sourceFileNotExist'));
        return false;
      }
      
      // 获取完整路径用于图谱视图
      const fullPath = file.path;
      
      // 获取当前 StudyView 的 leaf 引用
      const currentLeaf = plugin.app.workspace.getMostRecentLeaf?.() ?? null;
      if (!currentLeaf) {
        logger.error('[图谱联动] 未找到当前StudyView的leaf');
        new Notice(t('toolbar.studyViewNotFound'));
        return false;
      }
      
      //  在右侧创建局部图谱leaf
      graphSyncLeaf = plugin.app.workspace.getLeaf('split', 'vertical');
      
      //  关键：将图谱leaf与StudyView leaf建立关联关系
      // 这会"锁定"图谱，使其不受其他文档切换影响
      if (typeof (graphSyncLeaf as any).setGroupMember === 'function') {
        (graphSyncLeaf as any).setGroupMember(currentLeaf);
        logger.debug('[图谱联动] 已建立图谱leaf与StudyView的关联');
      } else {
        logger.warn('[图谱联动] setGroupMember方法不可用，使用普通模式');
      }
      
      // 设置图谱视图状态 - 使用完整路径
      await graphSyncLeaf.setViewState({ 
        type: 'localgraph', 
        state: { file: fullPath } 
      });
      
      //  增强：初始化后强制刷新图谱视图
      const view = graphSyncLeaf.view;
      if (view) {
        // 尝试调用内部刷新方法
        if (typeof (view as any).update === 'function') {
          (view as any).update();
        }
        if (typeof (view as any).render === 'function') {
          (view as any).render();
        }
        if (typeof view.onResize === 'function') {
          view.onResize();
        }
      }
      
      // 触发布局变化事件
      plugin.app.workspace.trigger('layout-change');
      
      //  延迟后再次刷新，确保图谱完全加载
      setTimeout(async () => {
        if (graphSyncLeaf && !graphSyncLeaf.detached) {
          try {
            await graphSyncLeaf.setViewState({ 
              type: 'localgraph', 
              state: { file: fullPath } 
            });
            logger.debug('[图谱联动] 延迟刷新完成');
          } catch (e) {
            // 忽略延迟刷新的错误
          }
        }
      }, 200);
      
      logger.debug('[图谱联动] 已打开局部图谱:', fullPath);
      return true;
    } catch (error) {
      logger.error('初始化图谱同步失败:', error);
      new Notice(t('toolbar.graphLinkInitFailed'));
      return false;
    }
  }


</script>

<div class="weave-vertical-toolbar vertical-toolbar" class:compact={compactMode}>
  <!-- 计时器区域（始终显示） -->
  <div class="toolbar-section timer-section">
    <!-- 当前卡片计时 -->
    <div class="timer-display card-timer">
      <span class="timer-text">{formatTime(currentCardTime)}</span>
      <div class="timer-label" title={t('toolbar.currentCard')}>{t('toolbar.currentCard')}</div>
    </div>

    <!-- 平均用时 -->
    <div class="timer-display avg-timer">
      <span class="timer-text">{formatTime(averageTime)}</span>
      <div class="timer-label" title={t('toolbar.avgTime')}>{t('toolbar.avgTime')}</div>
    </div>
  </div>

  <!-- 功能按钮组 -->
  <div class="toolbar-actions-scroll">
    <div class="toolbar-section actions-section">
      <!-- 编辑/预览切换按钮 -->
      <button
        class="toolbar-btn clickable-icon edit-btn"
        onclick={onToggleEdit}
        title={isEditing ? t('toolbar.saveAndPreview') : t('toolbar.editCard')}
      >
        <EnhancedIcon name={isEditing ? "eye" : "edit"} size="18" />
        <span class="btn-label">{isEditing ? t('toolbar.preview') : t('toolbar.edit')}</span>
      </button>

      <!-- 普通文本编辑器按钮 - 仅临时文件失败时显示 -->
      {#if tempFileUnavailable}
        <button
          class="toolbar-btn clickable-icon plain-editor-btn"
          onclick={onOpenPlainEditor}
          title={t('toolbar.plainTextEditor')}
        >
          <EnhancedIcon name="fileText" size="18" />
          <span class="btn-label">{t('toolbar.textEdit')}</span>
        </button>
      {/if}

      <!-- 删除 -->
      <button
        class="toolbar-btn clickable-icon delete-btn"
        onclick={handleDeleteClick}
        title={enableDirectDelete ? t('toolbar.directDeleteCard') : t('toolbar.deleteCard')}
      >
        <EnhancedIcon name="delete" size="18" />
        <span class="btn-label">{t('toolbar.delete')}</span>
      </button>

      <!-- 提醒 -->
      <button
        bind:this={reminderButtonElement}
        class="toolbar-btn clickable-icon reminder-btn"
        onclick={() => { closeAllPanels(); onSetReminder?.(); }}
        title={t('toolbar.setReminder')}
      >
        <EnhancedIcon name="bell" size="18" />
        <span class="btn-label">{t('toolbar.reminder')}</span>
      </button>

      <!-- 优先级 -->
      <button
        bind:this={priorityButtonElement}
        class="toolbar-btn clickable-icon priority-btn"
        onclick={() => { closeAllPanels(); onChangePriority?.(); }}
        title={t('toolbar.setPriority')}
        style="color: {getPriorityColor(card.priority || 2)}"
      >
        <div class="priority-indicator">
          {'!'.repeat(Math.min(card.priority || 2, 3))}
        </div>
        <span class="btn-label">{t('toolbar.priority')}</span>
      </button>

      {#if isPremium && aiAssistantMenuBuilder}
        <button
          class="toolbar-btn clickable-icon ai-assistant-btn"
          onclick={handleAIAssistantClick}
          title={t('study.menu.aiSplit')}
        >
          <EnhancedIcon name="git-branch" size="18" />
          <span class="btn-label">{t('study.menu.aiSplit')}</span>
        </button>
      {/if}

      <button
        class="toolbar-btn clickable-icon graph-link-btn"
        class:active={isGraphLinked}
        class:has-source={hasSourceFile}
        onclick={toggleGraphLink}
        title={isGraphLinked 
          ? t('toolbar.graphLinkEnabled')
          : hasSourceFile 
            ? t('toolbar.graphLinkDisabled') + ' (' + t('toolbar.hasSourceDoc') + ')'
            : t('toolbar.graphLinkDisabled') + ' (' + t('toolbar.noSourceDocShort') + ')'}
      >
        <div class="btn-icon-wrapper">
          <EnhancedIcon name="link" size="18" />
          {#if hasSourceFile}
            <span class="source-indicator" title={t('toolbar.sourceIndicatorTip')}></span>
          {/if}
        </div>
        <span class="btn-label">{t('toolbar.graphLink')}</span>
      </button>

      <!-- 牌组切换 -->
      <div class="deck-switcher-container">
        <button
          bind:this={deckButtonElement}
          class="toolbar-btn clickable-icon deck-btn"
          class:active={showDeckMenu}
          onclick={toggleDeckMenu}
          title={t('toolbar.deckAssignment')}
        >
          <EnhancedIcon name="folder" size="18" />
          <span class="btn-label">{t('toolbar.deck')}</span>
        </button>

        <FloatingMenu
          bind:show={showDeckMenu}
          anchor={deckButtonElement}
          placement="left-start"
          onClose={() => showDeckMenu = false}
          class="deck-menu-container"
        >
          {#snippet children()}
            <div class="multi-info-menu-header">
              <span>{t('toolbar.deckAssignment')}</span>
              <button class="close-btn" onclick={() => showDeckMenu = false}>
                <EnhancedIcon name="times" size="12" />
              </button>
            </div>

            <div class="deck-menu-content">
              {#if !decks || decks.length === 0}
                <div class="deck-menu-empty">{t('toolbar.noDecksAvailable')}</div>
              {:else}
                {@const selectedDeckIds = new Set(getCardDeckIds(card, decks).deckIds)}
                {#each decks as deck}
                  {@const indentLevel = deck.level || 0}
                  {@const isSelected = selectedDeckIds.has(deck.id)}
                  <button
                    type="button"
                    class="deck-menu-item"
                    class:selected={isSelected}
                    onclick={() => handleChangeDeck(deck.id)}
                    title={deck.name}
                  >
                    <span class="deck-menu-item-main">
                      <span
                        class="deck-menu-indent"
                        style={`padding-left: ${indentLevel * 16}px;`}
                      >
                        {#if indentLevel > 0}└ {/if}{deck.name}
                      </span>
                    </span>
                    <span class="deck-menu-check">
                      {#if isSelected}
                        <EnhancedIcon name="check-square" size="14" />
                      {:else}
                        <EnhancedIcon name="square" size="14" />
                      {/if}
                    </span>
                  </button>
                {/each}
              {/if}
            </div>
          {/snippet}
        </FloatingMenu>
      </div>

      <!-- 多功能信息键（查看+来源） -->
      <div class="multi-info-container">
        <button
          bind:this={multiInfoButtonElement}
          class="toolbar-btn clickable-icon multi-info-btn"
          class:active={showMultiInfoMenu}
          onclick={toggleMultiInfoMenu}
          title={t('toolbar.viewCardInfo')}
          aria-label={t('toolbar.openInfoMenu')}
        >
          <EnhancedIcon name="eye" size="18" />
          <span class="btn-label">{t('toolbar.view')}</span>
        </button>

        <FloatingMenu
          bind:show={showMultiInfoMenu}
          anchor={multiInfoButtonElement}
          placement="left-start"
          onClose={() => showMultiInfoMenu = false}
          class="multi-info-menu-container"
        >
          {#snippet children()}
            <div class="multi-info-menu-header">
              <span>{t('toolbar.cardInfoAndSource')}</span>
              <button class="close-btn" onclick={() => showMultiInfoMenu = false}>
                <EnhancedIcon name="times" size="12" />
              </button>
            </div>

            <div class="multi-info-menu-content">
              <!-- 基础信息 -->
              <div class="info-section">
                <div class="info-section-title">{t('toolbar.basicInfo')}</div>
                <div class="info-item">
                  <span class="info-label">{t('toolbar.cardId')}</span>
                  <span class="info-value">{card.uuid.slice(0, 8)}...</span>
                </div>
                <div class="info-item">
                  <span class="info-label">{t('toolbar.belongToDeck')}</span>
                  <span class="info-value">{getDeckName()}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">{t('toolbar.cardState')}</span>
                  <span class="info-value">{card.fsrs ? getCardStateText(card.fsrs.state) : t('toolbar.unknown')}</span>
                </div>
                <!-- 卡片关系 -->
                <div class="info-item">
                  <span class="info-label">{t('toolbar.cardRelation')}</span>
                  <span class="info-value">
                    {#if card.parentCardId}
                      <span class="relation-badge-compact child">{t('toolbar.childCard')}</span>
                      {#if card.relationMetadata?.derivationMetadata?.method}
                        <span class="relation-note">({getLocalizedDerivationMethodName(card.relationMetadata.derivationMetadata.method)})</span>
                      {/if}
                    {:else if card.relationMetadata?.isParent || (card.relationMetadata?.childCardIds && card.relationMetadata.childCardIds.length > 0)}
                      <span class="relation-badge-compact parent">{t('toolbar.parentCard')}</span>
                      {#if card.relationMetadata?.childCardIds}
                        <span class="relation-note">({t('toolbar.containCards', { n: card.relationMetadata.childCardIds.length })})</span>
                      {/if}
                    {:else}
                      <span class="relation-badge-compact normal">{t('toolbar.independentCard')}</span>
                    {/if}
                  </span>
                </div>
              </div>

              <!-- 学习数据 -->
              <div class="info-section">
                <div class="info-section-title">{t('toolbar.studyData')}</div>
                <div class="info-item">
                  <span class="info-label">{t('toolbar.stability')}</span>
                  <span class="info-value">{card.fsrs ? card.fsrs.stability.toFixed(2) : t('toolbar.unknown')}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">{t('toolbar.difficulty')}</span>
                  <span class="info-value">{card.fsrs ? card.fsrs.difficulty.toFixed(2) : t('toolbar.unknown')}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">{t('toolbar.interval')}</span>
                  <span class="info-value">{card.fsrs ? formatInterval(card.fsrs.scheduledDays) : t('toolbar.unknown')}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">{t('toolbar.totalReviews')}</span>
                  <span class="info-value">{t('toolbar.timesUnit', { n: card.stats?.totalReviews || 0 })}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">{t('toolbar.avgTime')}</span>
                  <span class="info-value">{card.stats?.averageTime ? t('toolbar.secondsUnit', { n: Math.round(card.stats.averageTime) }) : t('toolbar.unknown')}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">{t('toolbar.memoryRate')}</span>
                  <span class="info-value">{card.stats?.memoryRate ? Math.round(card.stats.memoryRate * 100) + '%' : t('toolbar.unknown')}</span>
                </div>
              </div>

              <!-- 时间信息 -->
              <div class="info-section">
                <div class="info-section-title">{t('toolbar.timeInfo')}</div>
                <div class="info-item">
                  <span class="info-label">{t('toolbar.createdTime')}</span>
                  <span class="info-value">{formatDateTime(card.created)}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">{t('toolbar.modifiedTime')}</span>
                  <span class="info-value">{formatDateTime(card.modified)}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">{t('toolbar.nextReview')}</span>
                  <span class="info-value">{card.fsrs ? formatDateTime(card.fsrs.due) : t('toolbar.unknown')}</span>
                </div>
              </div>

              <!-- 来源信息 - 使用响应式 sourceInfo ($derived) -->
              {#if sourceInfo.sourceFile || sourceInfo.sourceBlock}
                <div class="info-section">
                  <div class="info-section-title">{t('toolbar.sourceInfo')}</div>
                  <!-- 源文档 -->
                  {#if sourceInfo.sourceFile}
                    <div 
                      class="info-item clickable" 
                      onclick={handleOpenSourceFile}
                      onkeydown={(e) => e.key === 'Enter' && handleOpenSourceFile()}
                      role="button"
                      tabindex="0"
                    >
                      <span class="info-label">
                        <EnhancedIcon name="file" size="12" />
                        {t('toolbar.sourceDoc')}
                      </span>
                      <span class="info-value link-value" title={sourceInfo.sourceFile}>
                        {sourceInfo.sourceFile.split('/').pop() || sourceInfo.sourceFile}
                      </span>
                    </div>
                  {/if}

                  <!-- 块引用 -->
                  {#if sourceInfo.sourceBlock}
                    <div 
                      class="info-item clickable" 
                      onclick={handleOpenBlockLink}
                      onkeydown={(e) => e.key === 'Enter' && handleOpenBlockLink()}
                      role="button"
                      tabindex="0"
                    >
                      <span class="info-label">
                        <EnhancedIcon name="hash" size="12" />
                        {t('toolbar.blockReference')}
                      </span>
                      <span class="info-value link-value">
                        {sourceInfo.sourceBlock}
                      </span>
                    </div>
                  {/if}
                </div>
              {/if}

              {#if onOpenDetailedView}
                <div class="info-section card-action-section">
                  <div class="card-action-list">
                    {#if onOpenDetailedView}
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
                          <span>{t('toolbar.viewDetails')}</span>
                        </span>
                        <span class="card-action-arrow">
                          <ObsidianIcon name="chevron-right" size={14} />
                        </span>
                      </button>
                    {/if}
                  </div>
                </div>
              {/if}
            </div>
          {/snippet}
        </FloatingMenu>
      </div>

      <!-- 源块文本按钮 - 高级功能 -->
      {#if isPremium}
        <div class="source-block-container">
          <button
            bind:this={sourceBlockButtonElement}
            class="toolbar-btn clickable-icon source-block-btn"
            class:active={showSourceBlockMenu}
            class:has-source={hasSourceFile}
            onclick={toggleSourceBlockMenu}
            title={hasSourceFile ? t('toolbar.sourceBlockViewTitle') : t('toolbar.noSourceLinked')}
            aria-label={t('toolbar.sourceBlockAria')}
          >
            <EnhancedIcon name="file-text" size="18" />
            <span class="btn-label">{t('toolbar.sourceBlock')}</span>
          </button>

          <FloatingMenu
            bind:show={showSourceBlockMenu}
            anchor={sourceBlockButtonElement}
            placement="left-start"
            onClose={() => showSourceBlockMenu = false}
            class="source-block-menu-container"
          >
            {#snippet children()}
              <div class="source-block-menu-header">
                <span>{t('toolbar.sourceBlock')}</span>
                <button class="close-btn" onclick={() => showSourceBlockMenu = false}>
                  <EnhancedIcon name="times" size="12" />
                </button>
              </div>

              <div class="source-block-menu-content">
                {#if isLoadingSourceBlock}
                  <!-- 加载中 -->
                  <div class="source-block-loading">
                    <EnhancedIcon name="loader" size="20" />
                    <span>{t('toolbar.sourceBlockLoading')}</span>
                  </div>
                {:else if sourceBlockError}
                  <!-- 错误提示 -->
                  <div class="source-block-error">
                    <EnhancedIcon name="alert-circle" size="16" />
                    <span>{sourceBlockError}</span>
                  </div>
                {:else}
                  <!-- 源文档信息 -->
                  <div class="source-file-info">
                    <EnhancedIcon name="file" size="14" />
                    <span class="source-file-name" title={sourceInfo.sourceFile}>
                      {sourceInfo.sourceFile?.split('/').pop() || t('toolbar.unknownFile')}
                    </span>
                    {#if sourceInfo.sourceBlock}
                      <span class="source-block-id">#{sourceInfo.sourceBlock.replace(/^\^/, '')}</span>
                    {/if}
                  </div>

                  <!-- 源块内容区域（可滚动） -->
                  <div class="source-block-scroll-area">
                    <!-- 上文 (Obsidian渲染) -->
                    {#if sourceBlockContext.before.length > 0}
                      <div class="context-section context-before">
                        <div class="markdown-rendered" bind:this={contextBeforeRenderContainer}></div>
                      </div>
                    {/if}

                    <!-- 源块内容（高亮，Obsidian渲染） -->
                    <div class="source-block-highlight">
                      <div class="highlight-marker">{t('toolbar.highlightSourceBlock')}</div>
                      <div class="highlight-content markdown-rendered" bind:this={sourceBlockRenderContainer}>
                        {#if !sourceBlockContent}
                          <span class="empty-content">{t('toolbar.emptyContent')}</span>
                        {/if}
                      </div>
                    </div>

                    <!-- 下文 (Obsidian渲染) -->
                    {#if sourceBlockContext.after.length > 0}
                      <div class="context-section context-after">
                        <div class="markdown-rendered" bind:this={contextAfterRenderContainer}></div>
                      </div>
                    {/if}
                  </div>

                  <!-- 操作按钮 -->
                  <div class="source-block-actions">
                    <button 
                      class="source-action-btn"
                      onclick={jumpToSourceBlock}
                      title={t('toolbar.viewSourceDocumentTitle')}
                    >
                      <EnhancedIcon name="external-link" size="14" />
                      <span>{t('toolbar.viewSourceDocument')}</span>
                    </button>
                    <button 
                      class="source-action-btn"
                      onclick={copySourceBlockContent}
                      title={t('toolbar.copySourceContentTitle')}
                    >
                      <EnhancedIcon name="copy" size="14" />
                      <span>{t('toolbar.copySourceContent')}</span>
                    </button>
                  </div>
                {/if}
              </div>
            {/snippet}
          </FloatingMenu>
        </div>
      {/if}
    </div>
  </div>

  <div class="toolbar-bottom-section">
    <div class="more-settings-container">
      <button
        bind:this={moreSettingsButtonElement}
        class="toolbar-btn clickable-icon more-settings-btn"
        class:active={showMoreSettingsMenu}
        onclick={toggleMoreSettingsMenu}
        title={t('toolbar.moreSettings')}
        aria-label={t('toolbar.moreSettings')}
      >
        <EnhancedIcon name="settings" size="18" />
        <span class="btn-label">{t('toolbar.more')}</span>
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
            <span>{t('toolbar.moreSettings')}</span>
            <button class="close-btn" onclick={() => showMoreSettingsMenu = false}>
              <EnhancedIcon name="times" size="12" />
            </button>
          </div>

          <div class="more-settings-menu-content">
            <!-- 自动播放媒体设置 -->
            <div class="setting-section">
              <div class="setting-item toggle-item">
                <div class="setting-label">
                  <span>{t('study.menu.settings.autoPlayMedia')}</span>
                </div>
                <label class="toggle-switch">
                  <input
                    type="checkbox"
                    checked={autoPlayMedia}
                    onchange={(e) => onMediaAutoPlayChange?.('enabled', (e.target as HTMLInputElement).checked)}
                  />
                  <span class="slider"></span>
                </label>
              </div>

              {#if autoPlayMedia}
                <div class="setting-item">
                  <div class="setting-label">{t('study.menu.settings.playMediaMode.label')}</div>
                  <ObsidianDropdown
                    className="setting-select"
                    options={[
                      { id: 'first', label: t('toolbar.playFirstOnly') },
                      { id: 'all', label: t('toolbar.playAll') }
                    ]}
                    value={playMediaMode}
                    onchange={(value) => onMediaAutoPlayChange?.('mode', value as 'first' | 'all')}
                  />
                </div>

                <div class="setting-item">
                  <div class="setting-label">{t('study.menu.settings.playMediaTiming.label')}</div>
                  <ObsidianDropdown
                    className="setting-select"
                    options={[
                      { id: 'cardChange', label: t('toolbar.playOnCardChange') },
                      { id: 'showAnswer', label: t('toolbar.playOnShowAnswer') }
                    ]}
                    value={playMediaTiming}
                    onchange={(value) => onMediaAutoPlayChange?.('timing', value as 'cardChange' | 'showAnswer')}
                  />
                </div>

                {#if playMediaMode === 'all'}
                  <div class="setting-item interval-item">
                    <div class="setting-label">
                      {t('study.menu.settings.playbackInterval.label')}
                      <span class="interval-value">{formatPlaybackIntervalValue(playbackInterval)}</span>
                    </div>
                    <input
                      type="range"
                      class="setting-slider"
                      min="500"
                      max="5000"
                      step="500"
                      value={playbackInterval}
                      oninput={(e) => onMediaAutoPlayChange?.('interval', parseInt((e.target as HTMLInputElement).value))}
                    />
                  </div>
                {/if}
              {/if}
            </div>

            <div class="setting-section">
              <div class="setting-item">
                <div class="setting-label">{t('study.menu.settings.cardOrder.label')}</div>
                <ObsidianDropdown
                  className="setting-select"
                  options={[
                    { id: 'sequential', label: t('toolbar.sequentialOrderStudy') },
                    { id: 'random', label: t('toolbar.randomOrderStudy') }
                  ]}
                  value={cardOrder}
                  onchange={(value) => onCardOrderChange?.(value as 'sequential' | 'random')}
                />
              </div>
            </div>

            <div class="setting-section">
              <div class="setting-item">
                <div class="setting-label">{t('study.menu.settings.choiceOptionOrder.label')}</div>
                <ObsidianDropdown
                  className="setting-select"
                  options={[
                    { id: 'sequential', label: t('study.menu.settings.choiceOptionOrder.sequential') },
                    { id: 'random', label: t('study.menu.settings.choiceOptionOrder.random') }
                  ]}
                  value={choiceOptionOrder}
                  onchange={(value) => onChoiceOptionOrderChange?.(value as ChoiceOptionOrder)}
                />
              </div>
            </div>

              <div class="setting-section">
                <div class="setting-item">
                  <div class="setting-label">{t('studyInterface.ratingLabelStyle.label')}</div>
                  <ObsidianDropdown
                    className="setting-select"
                  options={ratingLabelStyleOptions}
                  value={normalizedRatingLabelStyle}
                  onchange={(value) => onRatingLabelStyleChange?.(normalizeRatingLabelStyle(value))}
                  />
                </div>
              </div>

              <div class="setting-section">
                <div class="setting-item toggle-item">
                  <div class="setting-label">
                    <span>{t('study.menu.settings.showRatingIntervalOnButtons')}</span>
                  </div>
                  <label class="toggle-switch">
                    <input
                      type="checkbox"
                      checked={showRatingIntervalOnButtons}
                      onchange={(e) => onRatingIntervalButtonsToggle?.((e.target as HTMLInputElement).checked)}
                    />
                    <span class="slider"></span>
                  </label>
                </div>
              </div>

              <div class="setting-section">
                <div class="setting-item interval-item">
                <div class="setting-label">
                  {t('study.menu.settings.timerAutoPause.label')}
                  <span class="interval-value">{formatTimerAutoPauseValue(timerAutoPauseSeconds)}</span>
                </div>
                <input
                  type="range"
                  class="setting-slider"
                  min="30"
                  max="300"
                  step="30"
                  value={timerAutoPauseSeconds}
                  oninput={(e) => onTimerAutoPauseChange?.(parseInt((e.target as HTMLInputElement).value))}
                />
              </div>
            </div>

            <div class="setting-section">
              <div class="setting-item interval-item">
                <div class="setting-label">
                  {t('study.menu.settings.hintMaxUses.label')}
                  <span class="interval-value">{hintMaxUses}</span>
                </div>
                <input
                  type="range"
                  class="setting-slider"
                  min="1"
                  max="20"
                  step="1"
                  value={hintMaxUses}
                  oninput={(e) => onHintMaxUsesChange?.(parseInt((e.target as HTMLInputElement).value))}
                />
              </div>
            </div>

            <div class="setting-section">
              <div class="setting-item toggle-item">
                <div class="setting-label">
                  <span>{t('study.menu.settings.directDeleteEnabled')}</span>
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

            <div class="setting-section">
              <div class="setting-item toggle-item">
                <div class="setting-label">
                  <span>{t('study.menu.settings.showClozeModeSwitchButton')}</span>
                </div>
                <label class="toggle-switch">
                  <input
                    type="checkbox"
                    checked={showClozeModeSwitchButton}
                    onchange={(e) => onClozeModeSwitchButtonToggle?.((e.target as HTMLInputElement).checked)}
                  />
                  <span class="slider"></span>
                </label>
              </div>
            </div>

            {#if onRecycleCard}
              <div class="setting-section">
                <div class="setting-item suspend-item">
                  <div class="suspend-label">
                    <span>{t('toolbar.recycleCardTag')}</span>
                  </div>
                  <button
                    class="suspend-apply-btn"
                    onclick={() => {
                      showMoreSettingsMenu = false;
                      onRecycleCard?.();
                      maybeShowRecycleCardHint();
                    }}
                    title={t('toolbar.recycleCardTitle')}
                  >
                    {t('toolbar.applyRecycle')}
                  </button>
                </div>
              </div>
            {/if}
          </div>
        {/snippet}
      </FloatingMenu>
    </div>
  </div>
</div>

<style>
  .vertical-toolbar {
    width: 70px;
    flex: 1 1 auto;
    min-height: 0;
    box-sizing: border-box;
    background: var(--background-secondary);
    border-left: 1px solid var(--background-modifier-border);
    display: flex;
    flex-direction: column;
    padding: 1rem 0 0;
    gap: 1.5rem;
    overflow: hidden;
  }

  .toolbar-actions-scroll {
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .toolbar-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  /* 计时器区域 */
  .timer-section {
    width: 100%;
    box-sizing: border-box;
    padding-inline: 0.28rem;
    border-bottom: 1px solid var(--background-modifier-border);
    padding-bottom: 1rem;
    gap: 0.75rem;
  }

  .timer-display {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding: 0.5rem 0.35rem;
    background: var(--background-primary);
    border-radius: 8px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
    border: 1px solid var(--background-modifier-border);
    position: relative;
  }

  .timer-text {
    font-size: 0.79rem;
    font-weight: 600;
    color: var(--text-accent);
    font-family: var(--font-monospace);
    letter-spacing: 0.12px;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }

  .timer-label {
    font-size: 0.55rem;
    color: var(--text-muted);
    font-weight: 500;
    letter-spacing: 0.18px;
    text-align: center;
    line-height: 1.15;
    white-space: nowrap;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* 单卡计时器样式 */
  .card-timer {
    border-color: var(--color-accent);
    background: color-mix(in srgb, var(--color-accent) 5%, var(--background-primary));
  }

  .card-timer .timer-text {
    color: var(--color-accent);
  }

  /* 平均用时样式 */
  .avg-timer {
    border-color: var(--text-success);
    background: color-mix(in srgb, var(--text-success) 5%, var(--background-primary));
  }

  .avg-timer .timer-text {
    color: var(--text-success);
  }


  /* 功能按钮 */
  .actions-section {
    width: 100%;
    gap: 0.875rem;
    padding-bottom: 0.75rem;
  }

  .toolbar-bottom-section {
    flex-shrink: 0;
    display: flex;
    justify-content: center;
    padding: 0.75rem 0 1rem;
    background: var(--background-secondary);
    border-top: 1px solid color-mix(in srgb, var(--background-modifier-border) 55%, transparent);
  }

  .toolbar-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    padding: 0.5rem 0.25rem;
    border-radius: 0.75rem;
    color: var(--text-muted);
    min-height: 50px;
    width: 50px;
    position: relative;
    overflow: hidden;
  }

  .toolbar-btn:hover {
    background: var(--background-modifier-hover);
    border-color: var(--text-accent);
    color: var(--text-normal);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  }

  .toolbar-btn:active {
    transform: translateY(-1px);
    transition: transform 0.1s ease;
  }
  

  .btn-label {
    display: block;
    font-size: 0.7rem;
    font-weight: 600;
    text-align: center;
    line-height: 1.1;
    letter-spacing: 0.25px;
    transition: opacity 0.2s ease, max-height 0.2s ease;
    opacity: 0;
    max-height: 0;
    overflow: hidden;
    margin: 0;
    padding: 0;
  }

  .toolbar-btn:hover .btn-label,
  .toolbar-btn:focus-visible .btn-label {
    opacity: 1;
    max-height: 20px;
    margin-top: 0.25rem;
  }

  /*  紧凑模式样式（有滚动条时） */
  .vertical-toolbar.compact {
    width: 70px; /* 缩小宽度 */
    padding: 1rem 0 0;
    gap: 1.5rem;
  }

  .vertical-toolbar.compact .toolbar-btn {
    width: 50px;
    min-height: 50px;
    padding: 0.5rem 0.25rem;
    gap: 0;
  }

  .vertical-toolbar.compact .btn-label {
    opacity: 0;
    max-height: 0;
    overflow: hidden;
    margin: 0;
    padding: 0;
  }

  /* 紧凑模式下悬停显示文字标签 */
  .vertical-toolbar.compact .toolbar-btn:hover .btn-label {
    opacity: 1;
    max-height: 20px;
    margin-top: 0.25rem;
  }

  .vertical-toolbar.compact .toolbar-btn:focus-visible .btn-label {
    opacity: 1;
    max-height: 20px;
    margin-top: 0.25rem;
  }

  /* 紧凑模式下计时器也缩小 */
  .vertical-toolbar.compact .timer-display {
    width: 100%;
    min-width: 0;
    padding: 0.42rem 0.2rem;
    border-radius: 7px;
  }

  .vertical-toolbar.compact .timer-text {
    font-size: 0.74rem;
    letter-spacing: 0;
  }

  .vertical-toolbar.compact .timer-label {
    font-size: 0.5rem;
    letter-spacing: 0.1px;
  }

  @media (max-width: 1360px) {
    .timer-section {
      padding-inline: 0.2rem;
      gap: 0.55rem;
    }

    .timer-display {
      padding: 0.44rem 0.24rem;
      border-radius: 7px;
    }

    .timer-text {
      font-size: 0.74rem;
    }

    .timer-label {
      font-size: 0.5rem;
      letter-spacing: 0.1px;
    }
  }

  /* 特定按钮样式 */

  .edit-btn:hover {
    color: var(--weave-info);
  }

  .delete-btn:hover {
    color: var(--weave-error);
  }

  /* 删除按钮样式 */
  .delete-btn {
    transition: color 0.2s ease;
  }

  .reminder-btn:hover {
    color: var(--weave-warning);
  }

  .priority-btn:hover {
    background: var(--background-modifier-hover);
  }




  .plain-editor-btn:hover {
    color: var(--weave-warning);
  }

  .priority-indicator {
    font-size: 18px;
    font-weight: bold;
    letter-spacing: -2px;
    line-height: 1;
    color: inherit;
  }

  /* 桌面端不进行布局重排，工具栏始终保持垂直方向 */
  /* 移动端布局由 :global(body.is-phone) 控制 */

  /* 微妙的动画效果 */
  .timer-display {
    animation: subtle-pulse 3s ease-in-out infinite;
  }

  @keyframes subtle-pulse {
    0%, 100% {
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }
    50% {
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
  }

  /*  计时器淡出动画 */
  @keyframes fadeOutTimer {
    from {
      opacity: 1;
      transform: translateY(0);
    }
    to {
      opacity: 0;
      transform: translateY(-4px);
    }
  }

  /* FloatingMenu 容器样式 */
  :global(.deck-menu-container),
  :global(.multi-info-menu-container),
  :global(.relation-menu-popup) {
    min-width: 180px;
    max-width: 400px;
  }

  /* 多功能信息键容器 */
  .multi-info-container {
    position: relative;
  }

  .deck-menu-content {
    min-width: 240px;
    max-height: 320px;
    overflow-y: auto;
    padding: 8px;
  }

  .deck-menu-empty {
    padding: 12px 8px;
    color: var(--text-muted);
    font-size: 0.8rem;
  }

  .deck-menu-item {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--text-normal);
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
    margin-bottom: 4px;
  }

  .deck-menu-item:last-child {
    margin-bottom: 0;
  }

  .deck-menu-item:hover {
    background: var(--background-modifier-hover);
    border-color: color-mix(in srgb, var(--interactive-accent) 30%, transparent);
  }

  .deck-menu-item.selected {
    background: color-mix(in srgb, var(--interactive-accent) 12%, transparent);
    border-color: color-mix(in srgb, var(--interactive-accent) 35%, transparent);
  }

  .deck-menu-item-main {
    min-width: 0;
    flex: 1;
  }

  .deck-menu-indent {
    display: block;
    font-size: 0.82rem;
    line-height: 1.4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .deck-menu-check {
    flex-shrink: 0;
    color: var(--text-muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .deck-menu-item.selected .deck-menu-check {
    color: var(--interactive-accent);
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 2px;
    border-radius: 4px;
    transition: all 0.2s ease;
  }

  .close-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  /* 牌组切换功能样式 */
  .deck-switcher-container {
    position: relative;
  }


  /* 统一菜单头部样式 */
  .multi-info-menu-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid var(--background-modifier-border);
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-normal);
    background: var(--background-secondary);
    border-radius: 8px 8px 0 0;
  }

  /* 统一菜单内容样式 */
  .multi-info-menu-content {
    padding: 8px;
    max-height: 400px;
    overflow-y: auto;
  }

  /* 多功能信息键菜单内容特定样式 */
  .multi-info-menu-content {
    min-width: 320px;
  }

  .priority-indicator {
    font-size: 16px;
    font-weight: bold;
    letter-spacing: -2px;
    line-height: 1;
  }

  .toolbar-btn.priority-btn {
    color: var(--text-muted);
  }

  .toolbar-btn.priority-btn:hover {
    color: var(--text-accent);
  }

  @keyframes slideInRight {
    from {
      opacity: 0;
      transform: translateX(10px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* AI 助手按钮样式 */
  .ai-assistant-btn:hover {
    color: var(--color-purple);
  }

  /* 图谱联动按钮 - 来源文档指示器 */
  .graph-link-btn .btn-icon-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .graph-link-btn .source-indicator {
    position: absolute;
    top: -2px;
    right: -4px;
    width: 8px;
    height: 8px;
    background: var(--color-green);
    border-radius: 50%;
    border: 2px solid var(--background-primary);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    animation: pulse-indicator 2s ease-in-out infinite;
  }

  @keyframes pulse-indicator {
    0%, 100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.7;
      transform: scale(1.1);
    }
  }

  /* 有来源文档时的按钮样式增强 */
  .graph-link-btn.has-source:not(.active) {
    color: var(--text-muted);
  }

  .graph-link-btn.has-source:not(.active):hover {
    color: var(--color-green);
  }

  /* 激活状态时指示器样式调整（保持显示，但颜色更柔和） */
  .graph-link-btn.active .source-indicator {
    background: var(--color-green);
    opacity: 0.8;
  }

  /* 信息分组区域 */
  .info-section {
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .info-section:last-child {
    margin-bottom: 0;
    padding-bottom: 0;
    border-bottom: none;
  }

  /* 信息分组标题 */
  .info-section-title {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
    padding: 0 4px;
  }

  /* 信息项 */
  .info-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 8px;
    border-radius: 4px;
    transition: background-color 0.2s ease;
    margin-bottom: 2px;
  }

  .info-item:hover {
    background: var(--background-modifier-hover);
  }

  .info-item:last-child {
    margin-bottom: 0;
  }

  /* 信息标签 */
  .info-label {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-weight: 500;
    flex-shrink: 0;
    margin-right: 12px;
  }

  /* 信息值 */
  .info-value {
    font-size: 0.75rem;
    color: var(--text-normal);
    font-weight: 500;
    text-align: right;
    word-break: break-all;
    max-width: 60%;
  }

  /* 多功能信息键样式 */
  .multi-info-btn {
    position: relative;
  }

  .multi-info-btn:hover {
    color: var(--color-blue);
  }

  /* 可点击的信息项样式 */
  .info-item.clickable {
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .info-item.clickable:hover {
    background: var(--background-modifier-hover);
  }

  .info-item.clickable .info-label {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  /*  移除 !important：链接样式的值使用更具体的选择器 */
  .vertical-toolbar .link-value {
    color: var(--text-accent);
    text-decoration: underline;
    text-decoration-style: dotted;
    cursor: pointer;
  }

  .vertical-toolbar .info-item.clickable:hover .link-value {
    color: var(--text-accent-hover);
    text-decoration-style: solid;
  }

  .card-action-section {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--background-modifier-border);
    border-bottom: none;
  }

  .card-action-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .card-action-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
    padding: 8px 6px;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: var(--text-muted);
    cursor: pointer;
    text-align: left;
    transition: background-color 0.15s ease, color 0.15s ease;
  }

  .card-action-item:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .card-action-item:focus-visible {
    outline: 2px solid var(--interactive-accent);
    outline-offset: 2px;
  }

  .card-action-item:active {
    background: color-mix(in srgb, var(--background-modifier-hover) 82%, transparent);
  }

  .card-action-main {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font-size: 0.82rem;
    font-weight: 500;
    line-height: 1.35;
  }

  .card-action-main :global(.obsidian-icon) {
    color: currentColor;
    opacity: 0.88;
  }

  .card-action-arrow {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: currentColor;
    opacity: 0.55;
    transition: transform 0.15s ease, opacity 0.15s ease;
  }

  .card-action-item:hover .card-action-arrow,
  .card-action-item:focus-visible .card-action-arrow {
    opacity: 0.82;
    transform: translateX(1px);
  }

  /* 更多设置容器 */
  .more-settings-container {
    position: relative;
  }

  .more-settings-btn:hover {
    color: var(--color-green);
  }

  /* 更多设置菜单内容 */
  .more-settings-menu-content {
    min-width: 300px;
    padding: 8px 12px;
  }

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

  .setting-item:hover {
    background: var(--background-modifier-hover);
    border-color: color-mix(in srgb, var(--interactive-accent) 40%, var(--background-modifier-border));
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
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
    flex-shrink: 0;
  }

  /* 搁置项特殊样式 - 保持与其他setting-item一致 */
  .suspend-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 9px 12px;
    border-radius: 6px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }
  
  .suspend-item:hover {
    background: var(--background-modifier-hover);
    border-color: color-mix(in srgb, var(--interactive-accent) 40%, var(--background-modifier-border));
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  }

  /* 搁置说明文字样式 */
  .suspend-label {
    display: flex;
    align-items: center;
    flex: 1;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-normal);
  }
  
  .suspend-label span {
    font-family: var(--font-interface);
  }

  /* 点击应用按钮样式 */
  .suspend-apply-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 4px 12px;
    border-radius: 4px;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    font-size: 0.8rem;
    font-weight: 500;
    border: none;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    white-space: nowrap;
  }

  .suspend-apply-btn:hover {
    background: color-mix(in srgb, var(--interactive-accent) 85%, black);
    transform: translateY(-1px);
    box-shadow: 0 2px 6px color-mix(in srgb, var(--interactive-accent) 30%, transparent);
  }

  .suspend-apply-btn:active {
    transform: translateY(0);
    box-shadow: 0 1px 3px color-mix(in srgb, var(--interactive-accent) 20%, transparent);
  }

  .suspend-apply-btn:disabled {
    background: var(--background-modifier-border);
    color: var(--text-muted);
    cursor: not-allowed;
    opacity: 0.7;
    transform: none;
    box-shadow: none;
  }

  .suspend-apply-btn:disabled:hover {
    background: var(--background-modifier-border);
    transform: none;
    box-shadow: none;
  }

  :global(.obsidian-dropdown-trigger.setting-select) {
    padding: 6px 10px;
    border-radius: 6px;
    border: 1.5px solid var(--background-modifier-border);
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.8125rem;
    cursor: pointer;
    min-height: 0;
    min-width: 120px;
    margin-left: auto;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  :global(.obsidian-dropdown-trigger.setting-select:hover:not(.disabled)) {
    border-color: var(--interactive-accent);
    background: var(--background-modifier-hover);
  }

  :global(.obsidian-dropdown-trigger.setting-select:focus-visible) {
    outline: none;
    border-color: var(--interactive-accent);
    box-shadow: none;
  }

  /* Toggle开关样式 */
  .toggle-switch {
    position: relative;
    display: inline-block;
    width: 48px;
    height: 26px;
    flex-shrink: 0;
  }

  .toggle-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-switch .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, var(--background-modifier-border) 0%, color-mix(in srgb, var(--background-modifier-border) 80%, black) 100%);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    border-radius: 26px;
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  .toggle-switch .slider:before {
    position: absolute;
    content: "";
    height: 20px;
    width: 20px;
    left: 3px;
    bottom: 3px;
    background: linear-gradient(135deg, white 0%, #f5f5f5 100%);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    border-radius: 50%;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  }

  .toggle-switch input:checked + .slider {
    background: linear-gradient(135deg, var(--interactive-accent) 0%, color-mix(in srgb, var(--interactive-accent) 85%, black) 100%);
    box-shadow: 0 0 12px color-mix(in srgb, var(--interactive-accent) 40%, transparent);
  }

  .toggle-switch input:focus + .slider {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--interactive-accent) 20%, transparent);
  }

  .toggle-switch input:checked + .slider:before {
    transform: translateX(22px);
  }

  .toggle-switch:hover .slider:before {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  /* 播放间隔设置样式 */
  .setting-item.interval-item {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .setting-item.interval-item .setting-label {
    justify-content: space-between;
    width: 100%;
  }

  .interval-value {
    font-weight: 600;
    color: var(--interactive-accent);
    font-size: 0.8rem;
  }

  .setting-slider {
    width: 100%;
    height: 8px;
    border-radius: 8px;
    background: linear-gradient(to right, 
      var(--background-modifier-border) 0%, 
      var(--background-modifier-border) var(--slider-progress, 50%), 
      color-mix(in srgb, var(--background-modifier-border) 40%, transparent) var(--slider-progress, 50%)
    );
    outline: none;
    -webkit-appearance: none;
    appearance: none;
    cursor: pointer;
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .setting-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--interactive-accent) 0%, color-mix(in srgb, var(--interactive-accent) 85%, black) 100%);
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
    border: 2px solid white;
  }

  .setting-slider::-webkit-slider-thumb:hover {
    transform: scale(1.2);
    box-shadow: 
      0 0 0 4px color-mix(in srgb, var(--interactive-accent) 20%, transparent),
      0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .setting-slider::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--interactive-accent) 0%, color-mix(in srgb, var(--interactive-accent) 85%, black) 100%);
    cursor: pointer;
    border: 2px solid white;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  }

  .setting-slider::-moz-range-thumb:hover {
    transform: scale(1.2);
    box-shadow: 
      0 0 0 4px color-mix(in srgb, var(--interactive-accent) 20%, transparent),
      0 4px 12px rgba(0, 0, 0, 0.3);
  }

  /* FloatingMenu容器 - 更多设置 */
  :global(.more-settings-menu-container) {
    min-width: 300px;
    max-width: 340px;
  }

  .more-settings-menu-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 16px;
    border-bottom: 1px solid color-mix(in srgb, var(--background-modifier-border) 50%, transparent);
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-normal);
    background: linear-gradient(135deg, var(--background-secondary) 0%, var(--background-primary) 100%);
    border-radius: 10px 10px 0 0;
    letter-spacing: 0.3px;
  }

  .more-settings-menu-header .close-btn {
    padding: 4px;
    border-radius: 6px;
    transition: all 0.2s ease;
  }

  .more-settings-menu-header .close-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-error);
  }

  /* 紧凑版卡片关系徽章（侧边栏专用） */
  .relation-badge-compact {
    display: inline-block;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 0.7rem;
    font-weight: 600;
  }

  .relation-badge-compact.child {
    background: #e0f2fe;
    color: #0369a1;
  }

  .relation-badge-compact.parent {
    background: #fef3c7;
    color: #92400e;
  }

  .relation-badge-compact.normal {
    background: var(--background-modifier-form-field);
    color: var(--text-muted);
  }

  .relation-note {
    margin-left: 4px;
    font-size: 0.65rem;
    color: var(--text-muted);
    font-weight: 500;
  }

  /* ==================== 源块文本浮窗样式 ==================== */
  
  .source-block-container {
    position: relative;
  }

  .toolbar-btn.source-block-btn {
    transition: all 0.2s ease;
  }

  .toolbar-btn.source-block-btn.has-source {
    color: var(--text-muted);
  }

  .toolbar-btn.source-block-btn.has-source:hover {
    color: var(--interactive-accent);
    background: color-mix(in srgb, var(--interactive-accent) 10%, transparent);
  }

  .toolbar-btn.source-block-btn:not(.has-source) {
    opacity: 0.5;
  }

  /*  移除 !important：覆盖FloatingMenu的限制使用更具体的选择器 */
  :global(.weave-app .source-block-menu-container.floating-menu) {
    max-width: 420px;
    width: 380px;
  }

  .source-block-menu-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
  }

  .source-block-menu-header span {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .source-block-menu-header .close-btn {
    padding: 4px;
    border-radius: 4px;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  }

  .source-block-menu-header .close-btn:hover {
    background: color-mix(in srgb, var(--text-error) 15%, transparent);
    color: var(--text-error);
  }

  .source-block-menu-content {
    padding: 12px 16px;
  }

  /* 加载状态 */
  .source-block-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 24px;
    color: var(--text-muted);
    font-size: 0.85rem;
  }

  .source-block-loading :global(svg) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* 错误状态 */
  .source-block-error {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 16px;
    background: color-mix(in srgb, var(--text-error) 10%, transparent);
    border-radius: 6px;
    color: var(--text-error);
    font-size: 0.85rem;
  }

  /* 源文件信息 */
  .source-file-info {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: color-mix(in srgb, var(--background-secondary) 50%, transparent);
    border-radius: 6px;
    margin-bottom: 12px;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .source-file-name {
    color: var(--text-normal);
    font-weight: 500;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .source-block-id {
    color: var(--interactive-accent);
    font-family: var(--font-monospace);
    font-size: 0.75rem;
    background: color-mix(in srgb, var(--interactive-accent) 15%, transparent);
    padding: 2px 6px;
    border-radius: 4px;
  }

  /* 滚动区域 */
  .source-block-scroll-area {
    max-height: 300px;
    overflow-y: auto;
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    background: var(--background-primary);
  }

  .source-block-scroll-area::-webkit-scrollbar {
    width: 6px;
  }

  .source-block-scroll-area::-webkit-scrollbar-track {
    background: transparent;
  }

  .source-block-scroll-area::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--background-modifier-border) 70%, transparent);
    border-radius: 3px;
  }

  .source-block-scroll-area::-webkit-scrollbar-thumb:hover {
    background: var(--background-modifier-border);
  }

  /* 上下文内容 */
  .context-section {
    padding: 8px 12px;
    font-size: 0.82rem;
    line-height: 1.6;
    color: var(--text-muted);
    border-bottom: 1px dashed color-mix(in srgb, var(--background-modifier-border) 50%, transparent);
  }

  .context-section.context-after {
    border-bottom: none;
    border-top: 1px dashed color-mix(in srgb, var(--background-modifier-border) 50%, transparent);
  }

  /* 源块高亮 */
  .source-block-highlight {
    position: relative;
    padding: 12px;
    background: color-mix(in srgb, var(--interactive-accent) 8%, transparent);
    border-left: 3px solid var(--interactive-accent);
  }

  .highlight-marker {
    position: absolute;
    top: 4px;
    right: 8px;
    font-size: 0.65rem;
    font-weight: 600;
    color: var(--interactive-accent);
    background: color-mix(in srgb, var(--interactive-accent) 15%, transparent);
    padding: 2px 6px;
    border-radius: 3px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .highlight-content {
    font-size: 0.9rem;
    line-height: 1.7;
    color: var(--text-normal);
    word-break: break-word;
    user-select: text;
    padding-right: 40px; /* 为标记留空间 */
  }

  /* Obsidian Markdown渲染样式 */
  .markdown-rendered {
    font-size: 0.85rem;
    line-height: 1.6;
    color: var(--text-normal);
  }

  .markdown-rendered :global(p) {
    margin: 0.5em 0;
  }

  .markdown-rendered :global(p:first-child) {
    margin-top: 0;
  }

  .markdown-rendered :global(p:last-child) {
    margin-bottom: 0;
  }

  .markdown-rendered :global(img) {
    max-width: 100%;
    height: auto;
    border-radius: 4px;
    margin: 0.5em 0;
  }

  .markdown-rendered :global(a) {
    color: var(--interactive-accent);
    text-decoration: none;
  }

  .markdown-rendered :global(a:hover) {
    text-decoration: underline;
  }

  .markdown-rendered :global(code) {
    background: color-mix(in srgb, var(--background-secondary) 50%, transparent);
    padding: 0.1em 0.3em;
    border-radius: 3px;
    font-family: var(--font-monospace);
    font-size: 0.9em;
  }

  .markdown-rendered :global(pre) {
    background: color-mix(in srgb, var(--background-secondary) 50%, transparent);
    padding: 0.5em;
    border-radius: 4px;
    overflow-x: auto;
  }

  .markdown-rendered :global(blockquote) {
    border-left: 3px solid var(--interactive-accent);
    padding-left: 0.8em;
    margin: 0.5em 0;
    color: var(--text-muted);
  }

  .markdown-rendered :global(ul),
  .markdown-rendered :global(ol) {
    padding-left: 1.5em;
    margin: 0.5em 0;
  }

  .markdown-rendered :global(li) {
    margin: 0.25em 0;
  }

  .markdown-rendered :global(h1),
  .markdown-rendered :global(h2),
  .markdown-rendered :global(h3),
  .markdown-rendered :global(h4),
  .markdown-rendered :global(h5),
  .markdown-rendered :global(h6) {
    margin: 0.5em 0;
    font-weight: 600;
    line-height: 1.3;
  }

  .empty-content {
    color: var(--text-muted);
    font-style: italic;
  }

  /* 操作按钮 */
  .source-block-actions {
    display: flex;
    gap: 8px;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--background-modifier-border);
  }

  .source-action-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    background: var(--background-primary);
    color: var(--text-muted);
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .source-action-btn:hover {
    background: color-mix(in srgb, var(--interactive-accent) 10%, transparent);
    border-color: var(--interactive-accent);
    color: var(--interactive-accent);
  }

  .source-action-btn:active {
    transform: scale(0.98);
  }

  /* ==================== Obsidian 移动端适配 ==================== */
  
  /*  保留 !important：手机端响应式隐藏，需要强制覆盖 */
  /* 参考：.augment/rules/core/04-anti-force-methods.md */
  :global(body.is-phone) .vertical-toolbar {
    display: none !important;
  }

  :global(body.is-tablet) .vertical-toolbar {
    width: auto;
  }
</style>
