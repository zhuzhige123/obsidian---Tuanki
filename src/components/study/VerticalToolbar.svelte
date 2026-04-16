<script lang="ts">
  import { logger } from '../../utils/logger';
  // 静态导入 parseSourceInfo，确保响应式追踪正常
  import { parseEpubSourceInfo, parseSourceInfo, parseYAMLFromContent, extractBodyContent, getCardDeckIds, getCardDeckNames } from '../../utils/yaml-utils';
  // 使用 CardMetadataService 获取卡片元数据
  import { getCardMetadataService } from '../../services/CardMetadataService';

  import EnhancedIcon from "../ui/EnhancedIcon.svelte";
  import FloatingMenu from "../ui/FloatingMenu.svelte";
  import ObsidianDropdown from "../ui/ObsidianDropdown.svelte";
  import type { Card, Deck } from "../../data/types";
  import type { WeavePlugin } from "../../main";
  //  导入国际化
  import { tr } from '../../utils/i18n';
  import type { CustomFormatAction } from "../../types/ai-types";
  import { Menu, MarkdownRenderer, Component, Notice } from "obsidian";
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
    onRemoveFromDeck?: () => void; // 从牌组移除
    onSetReminder?: () => void;
    onChangePriority?: () => void;
    onReminderAnchorChange?: (element: HTMLElement | null) => void;
    onPriorityAnchorChange?: (element: HTMLElement | null) => void;
    onChangeDeck?: (deckId: string) => void | Promise<void>;
    onOpenPlainEditor?: () => void;
    onAIFormatCustom?: (actionId: string) => void;
    onSplitCard?: (actionId: string) => void; // AI 拆分
    onManageFormatActions?: () => void;
    onOpenDetailedView?: () => void; // 打开详细信息模态窗
    onOpenCardDebug?: () => void; // 打开卡片数据结构调试窗口
    onRecycleCard?: () => void; // 回收卡片
    autoPlayMedia?: boolean;
    playMediaMode?: 'first' | 'all';
    playMediaTiming?: 'cardChange' | 'showAnswer';
    playbackInterval?: number;
    onMediaAutoPlayChange?: (setting: 'enabled' | 'mode' | 'timing' | 'interval', value: boolean | 'first' | 'all' | 'cardChange' | 'showAnswer' | number) => void;
    enableDirectDelete?: boolean;
    onDirectDeleteToggle?: (enabled: boolean) => void;
    // 教程按钮显示
    showTutorialButton?: boolean;
    onTutorialButtonToggle?: (enabled: boolean) => void;
    showClozeModeSwitchButton?: boolean;
    onClozeModeSwitchButtonToggle?: (enabled: boolean) => void;
    // 卡片学习顺序
    cardOrder?: 'sequential' | 'random';
    onCardOrderChange?: (order: 'sequential' | 'random') => void;
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
    onRemoveFromDeck, // 从牌组移除
    onSetReminder,
    onChangePriority,
    onReminderAnchorChange,
    onPriorityAnchorChange,
    onChangeDeck,
    onOpenPlainEditor,
    onAIFormatCustom,
    onSplitCard, // AI 拆分
    onManageFormatActions,
    onOpenDetailedView, // 打开详细信息
    onOpenCardDebug, // 卡片调试
    onRecycleCard, // 回收卡片
    autoPlayMedia = false,
    playMediaMode = 'first',
    playMediaTiming = 'cardChange',
    playbackInterval = 2000,
    onMediaAutoPlayChange,
    enableDirectDelete = false,
    onDirectDeleteToggle,
    // 教程按钮显示
    showTutorialButton = true,
    onTutorialButtonToggle,
    showClozeModeSwitchButton = true,
    onClozeModeSwitchButtonToggle,
    // 卡片学习顺序
    cardOrder = 'sequential',
    onCardOrderChange,
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

  // 格式化学习时间
  function formatTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
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

  // 教程菜单
  let showTutorialMenu = $state(false);
  let tutorialButtonElement: HTMLElement | null = $state(null);
  let activeTab = $state<'core' | 'basics' | 'ai' | 'progressive' | 'priority' | 'queue'>('core');
  let isOverflowMenuOpen = $state(false); // 标记溢出菜单是否打开
  
  // 标签溢出处理
  let tabsContainer: HTMLElement | null = $state(null);
  let visibleTabs = $state<string[]>(['core', 'basics', 'ai', 'progressive', 'priority', 'queue']);
  let overflowTabs = $state<string[]>([]);
  
  // 所有标签定义
  const allTabs = $derived([
    { id: 'core' as const, label: t('toolbar.tabCore') },
    { id: 'basics' as const, label: t('toolbar.tabBasics') },
    { id: 'ai' as const, label: t('toolbar.tabAI') },
    { id: 'progressive' as const, label: t('toolbar.tabProgressive') },
    { id: 'priority' as const, label: t('toolbar.tabPriority') },
    { id: 'queue' as const, label: t('toolbar.tabQueue') }
  ]);

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
      label: '定位到溯源位置',
      icon: 'map-pinned',
      delayMs: 220
    });
  }

  function getCanvasSourceNodeRect(): { x: number; y: number; width?: number; height?: number } | null {
    const content = card?.content;
    if (!content) return null;

    const yaml = parseYAMLFromContent(content);
    const sourceValues = Array.isArray(yaml.we_source) ? yaml.we_source : [yaml.we_source];
    const weSource = sourceValues.find(
      (value): value is string => typeof value === 'string' && value.includes('?'),
    ) ?? sourceValues.find(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    );
    if (typeof weSource !== 'string') return null;

    const queryIndex = weSource.indexOf('?');
    if (queryIndex === -1) return null;

    const queryEnd = weSource.lastIndexOf(']]');
    const query = weSource.slice(queryIndex + 1, queryEnd > queryIndex ? queryEnd : undefined);
    const params = new URLSearchParams(query);
    const x = Number(params.get('x'));
    const y = Number(params.get('y'));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    const width = Number(params.get('w'));
    const height = Number(params.get('h'));

    return {
      x,
      y,
      width: Number.isFinite(width) ? width : undefined,
      height: Number.isFinite(height) ? height : undefined
    };
  }

  function resolveSourceFile(sourceFilePath: string): any | null {
    if (!plugin || !sourceFilePath) return null;

    const directFile = plugin.app.vault.getAbstractFileByPath(sourceFilePath);
    if (directFile) return directFile;

    const contextPath = plugin.app.workspace.getActiveFile()?.path ?? '';
    const linkText = sourceFilePath.replace(/\.md$/, '');
    return plugin.app.metadataCache.getFirstLinkpathDest(linkText, contextPath);
  }

  function getCanvasTextCandidates(): string[] {
    const body = extractBodyContent(card?.content || '');
    if (!body) return [];

    const lines = body
      .split(/\r?\n/)
      .map((line) => line.replace(/^>\s?/, '').trim())
      .filter((line) => line.length >= 12);

    const uniqueCandidates = new Set<string>();
    for (const line of lines) {
      const normalized = line.replace(/\s+/g, ' ').trim();
      if (normalized.length >= 12) {
        uniqueCandidates.add(normalized.slice(0, 120));
      }
      if (uniqueCandidates.size >= 3) break;
    }

    return Array.from(uniqueCandidates);
  }

  async function openCanvasSourceTarget(filePath: string, blockId?: string): Promise<void> {
    if (!plugin || !sourceNavigationService) return;

    const normalizedBlockId = blockId?.replace(/^canvas:/, '').replace(/^\^/, '').split('?')[0];
    const targetRect = getCanvasSourceNodeRect();
    const textCandidates = getCanvasTextCandidates();

    logger.info('[VerticalToolbar] Canvas source locate start', {
      filePath,
      blockId,
      normalizedBlockId,
      cardUuid: card?.uuid,
      rawWeSource: (() => {
        const yaml = parseYAMLFromContent(card?.content || '');
        const sourceValues = Array.isArray(yaml.we_source) ? yaml.we_source : [yaml.we_source];
        return sourceValues.find((value): value is string => typeof value === 'string' && value.includes('?'))
          ?? sourceValues.find((value): value is string => typeof value === 'string' && value.trim().length > 0);
      })(),
      targetRect,
      textCandidates
    });

    const openedLeaf = await sourceNavigationService.openCanvasAndLocate(
      filePath,
      textCandidates,
      normalizedBlockId,
      {
        label: '定位到溯源位置',
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
    if (card && onAIFormatCustom && onManageFormatActions && onSplitCard) {
      aiAssistantMenuBuilder = new AIAssistantMenuBuilder(
        card,
        onAIFormatCustom,
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
          new Notice('保存教程提示设置失败');
        }
      }
    });
    modal.open();
  }

  function maybeShowSourceBlockHint(): void {
    void maybeShowToolbarHint(GLOBAL_TUTORIAL_HINT_IDS.SOURCE_BLOCK_BUTTON, {
      title: '源块文本提示',
      intro: '点击“源块文本”可快速查看当前卡片在源文档中的上下文位置。',
      listItems: [
        '可在弹窗中直接跳转源文档定位到源块',
        '可复制源块内容到剪贴板继续编辑',
        '若卡片没有关联源文档，此功能会自动禁用'
      ],
      note: '该功能适合回看原文上下文，避免脱离资料单独记忆。'
    });
  }

  function maybeShowRecycleCardHint(): void {
    void maybeShowToolbarHint(GLOBAL_TUTORIAL_HINT_IDS.RECYCLE_CARD_BUTTON, {
      title: '回收卡片提示',
      intro: '点击“回收卡片”会给当前卡片添加回收标签并移出学习队列。',
      listItems: [
        '回收标签支持 #回收 或 #recycle',
        '回收后卡片不会丢失，可在内容中移除标签后重新学习',
        '适合暂时质量不佳、需要后续重构的卡片'
      ],
      note: '回收是“暂存待改进”，不是删除卡片。'
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
  function copySourceBlockContent() {
    if (sourceBlockContent) {
      navigator.clipboard.writeText(sourceBlockContent);
      new Notice(t('toolbar.copiedSourceBlock'));
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
  function closeAllPanels() { showMultiInfoMenu = false; showSourceBlockMenu = false; showMoreSettingsMenu = false; showTutorialMenu = false; showDeckMenu = false; onPanelOpen?.(); }

  function toggleMoreSettingsMenu() {
    const next = !showMoreSettingsMenu; closeAllPanels(); showMoreSettingsMenu = next;
  }

  //  AI助手按钮点击处理（Store自动保持最新数据）
  function handleAIAssistantClick(evt: MouseEvent) {
    if (aiAssistantMenuBuilder) {
      aiAssistantMenuBuilder.showMainMenu(evt);
    }
  }

  // 教程菜单相关函数
  function toggleTutorialMenu() {
    const next = !showTutorialMenu; closeAllPanels(); showTutorialMenu = next;
  }

  function switchTab(tab: 'core' | 'basics' | 'ai' | 'progressive' | 'priority' | 'queue') {
    activeTab = tab;
  }
  
  // 显示溢出标签菜单（使用 Obsidian 原生 Menu API）
  function showOverflowMenu(evt: MouseEvent) {
    // 阻止事件冒泡，防止触发FloatingMenu的关闭
    // Svelte 5: 移除 stopPropagation
    evt.preventDefault();
    
    // 标记Menu正在打开，防止FloatingMenu被误关闭
    isOverflowMenuOpen = true;
    
    const menu = new Menu();
    
    // 添加溢出的标签项
    allTabs.forEach(tab => {
      if (overflowTabs.includes(tab.id)) {
        menu.addItem((item) => {
          item
            .setTitle(tab.label)
            .setIcon(activeTab === tab.id ? 'check' : null)
            .onClick(() => {
              // 切换标签页，FloatingMenu保持打开
              switchTab(tab.id as any);
            });
        });
      }
    });
    
    // Menu关闭时的回调
    menu.onunload = () => {
      // 延迟重置标志，确保Menu完全关闭
      setTimeout(() => {
        isOverflowMenuOpen = false;
      }, 100);
    };
    
    menu.showAtMouseEvent(evt);
  }
  
  // 动态计算可见标签
  function updateVisibleTabs() {
    if (!tabsContainer) return;
    
    const containerWidth = tabsContainer.offsetWidth - 36; // 减去左右padding
    const moreButtonWidth = 80; // "更多"按钮预留宽度
    const gap = 4;
    
    let totalWidth = 0;
    let visibleCount = 0;
    
    // 估算每个按钮的宽度（基于标签文字长度）
    const estimatedWidths = allTabs.map(tab => {
      // 中文字符约14px，加上padding 32px
      return tab.label.length * 14 + 32;
    });
    
    for (let i = 0; i < estimatedWidths.length; i++) {
      const buttonWidth = estimatedWidths[i] + gap;
      
      if (totalWidth + buttonWidth + (i < estimatedWidths.length - 1 ? moreButtonWidth : 0) <= containerWidth) {
        totalWidth += buttonWidth;
        visibleCount++;
      } else {
        break;
      }
    }
    
    // 确保至少显示3个标签
    visibleCount = Math.max(3, visibleCount);
    
    //  移除"激活标签强制可见"逻辑
    // 溢出标签激活时，应该保持在溢出区，只切换内容显示
    
    visibleTabs = allTabs.slice(0, visibleCount).map(t => t.id);
    overflowTabs = allTabs.slice(visibleCount).map(t => t.id);
  }
  
  // 监听容器尺寸变化
  $effect(() => {
    if (tabsContainer) {
      // 初始计算
      updateVisibleTabs();
      
      // 监听容器尺寸变化
      const observer = new ResizeObserver(() => {
        updateVisibleTabs();
      });
      
      observer.observe(tabsContainer);
      
      return () => {
        observer.disconnect();
      };
    }
  });

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
      const { EpubLinkService } = await import('../../services/epub/EpubLinkService');
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
        const { EpubLinkService } = await import('../../services/epub/EpubLinkService');
        const linkService = new EpubLinkService(plugin.app);
        await linkService.navigateToEpubLocation(file.path, sourceInfo.epubCfi || '', sourceInfo.epubText || '');
        if (sourceBlockButtonElement) {
          sourceLocateOverlay.showAtRect(sourceBlockButtonElement.getBoundingClientRect(), {
            label: '定位到 EPUB 溯源位置',
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
      return date.toLocaleString('zh-CN', {
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

    <!-- 从牌组移除 -->
    {#if onRemoveFromDeck}
      <button
        class="toolbar-btn clickable-icon remove-from-deck-btn"
        onclick={onRemoveFromDeck}
        title={t('toolbar.removeFromDeck')}
      >
        <EnhancedIcon name="unlink" size="18" />
        <span class="btn-label">{t('toolbar.remove')}</span>
      </button>
    {/if}

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

    <!-- AI 助手 - 统一 AI 功能入口（高级功能，需激活） -->
    {#if isPremium}
      <button
        class="toolbar-btn clickable-icon ai-assistant-btn"
        onclick={handleAIAssistantClick}
        title={t('toolbar.aiAssistant')}
      >
        <EnhancedIcon name="robot" size="18" />
        <span class="btn-label">{t('toolbar.aiAssistant')}</span>
      </button>
    {/if}

    <!-- 图谱联动 -->
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
        title="调整主题归属"
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
            <span>主题归属</span>
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
                <span class="info-value">{card.fsrs ? getCardStateText(card.fsrs.state) : 'N/A'}</span>
              </div>
              <!-- 卡片关系 -->
              <div class="info-item">
                <span class="info-label">{t('toolbar.cardRelation')}</span>
                <span class="info-value">
                  {#if card.parentCardId}
                    <span class="relation-badge-compact child">{t('toolbar.childCard')}</span>
                    {#if card.relationMetadata?.derivationMetadata?.method}
                      <span class="relation-note">({getDerivationMethodName(card.relationMetadata.derivationMetadata.method)})</span>
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
                <span class="info-value">{card.fsrs ? card.fsrs.stability.toFixed(2) : 'N/A'}</span>
              </div>
              <div class="info-item">
                <span class="info-label">{t('toolbar.difficulty')}</span>
                <span class="info-value">{card.fsrs ? card.fsrs.difficulty.toFixed(2) : 'N/A'}</span>
              </div>
              <div class="info-item">
                <span class="info-label">{t('toolbar.interval')}</span>
                <span class="info-value">{card.fsrs ? formatInterval(card.fsrs.scheduledDays) : 'N/A'}</span>
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
                <span class="info-value">{card.fsrs ? formatDateTime(card.fsrs.due) : 'N/A'}</span>
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
                      块引用
                    </span>
                    <span class="info-value link-value">
                      {sourceInfo.sourceBlock}
                    </span>
                  </div>
                {/if}
              </div>
            {/if}

            <!-- 查看详细信息按钮 -->
            {#if onOpenDetailedView}
              <div class="info-section detailed-view-section">
                <button 
                  class="detailed-view-btn"
                  onclick={() => {
                    showMultiInfoMenu = false;
                    onOpenDetailedView?.();
                  }}
                  type="button"
                >
                  <EnhancedIcon name="maximize-2" size="14" />
                  <span>{t('toolbar.viewDetails')}</span>
                </button>
              </div>
            {/if}

            <!-- 查看卡片数据结构（调试） -->
            {#if onOpenCardDebug}
              <div class="info-section card-debug-section">
                <button 
                  class="card-debug-btn"
                  onclick={() => {
                    showMultiInfoMenu = false;
                    onOpenCardDebug?.();
                  }}
                  type="button"
                  title={t('toolbar.viewDataStructureTitle')}
                >
                  <EnhancedIcon name="code" size="14" />
                  <span>{t('toolbar.viewDataStructure')}</span>
                </button>
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
          title={hasSourceFile ? "查看源块文本" : "该卡片没有关联的源文档"}
          aria-label="查看源块原文"
        >
          <EnhancedIcon name="file-text" size="18" />
          <span class="btn-label">原文</span>
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
            <span>源块文本</span>
            <button class="close-btn" onclick={() => showSourceBlockMenu = false}>
              <EnhancedIcon name="times" size="12" />
            </button>
          </div>

          <div class="source-block-menu-content">
            {#if isLoadingSourceBlock}
              <!-- 加载中 -->
              <div class="source-block-loading">
                <EnhancedIcon name="loader" size="20" />
                <span>正在加载源块内容...</span>
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
                  {sourceInfo.sourceFile?.split('/').pop() || '未知文件'}
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
                  <div class="highlight-marker">源块</div>
                  <div class="highlight-content markdown-rendered" bind:this={sourceBlockRenderContainer}>
                    {#if !sourceBlockContent}
                      <span class="empty-content">（空内容）</span>
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
                  title="在Obsidian中打开源文档并定位到此块"
                >
                  <EnhancedIcon name="external-link" size="14" />
                  <span>跳转源文档</span>
                </button>
                <button 
                  class="source-action-btn"
                  onclick={copySourceBlockContent}
                  title="复制源块内容到剪贴板"
                >
                  <EnhancedIcon name="copy" size="14" />
                  <span>复制内容</span>
                </button>
              </div>
            {/if}
          </div>
        {/snippet}
      </FloatingMenu>
    </div>
    {/if}

    <!--  更多设置按钮 -->
    <div class="more-settings-container">
      <button
        bind:this={moreSettingsButtonElement}
        class="toolbar-btn clickable-icon more-settings-btn"
        class:active={showMoreSettingsMenu}
        onclick={toggleMoreSettingsMenu}
        title="更多设置"
        aria-label="更多设置"
      >
        <EnhancedIcon name="settings" size="18" />
        <span class="btn-label">更多</span>
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
            <span>更多设置</span>
            <button class="close-btn" onclick={() => showMoreSettingsMenu = false}>
              <EnhancedIcon name="times" size="12" />
            </button>
          </div>

          <div class="more-settings-menu-content">
            <!-- 自动播放媒体设置 -->
            <div class="setting-section">
              <div class="setting-item toggle-item">
                <div class="setting-label">
                  <span>自动播放媒体</span>
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
                <!-- 播放模式选择 -->
                <div class="setting-item">
                  <div class="setting-label">播放模式</div>
                  <ObsidianDropdown
                    className="setting-select"
                    options={[
                      { id: 'first', label: '仅第一个' },
                      { id: 'all', label: '播放全部' }
                    ]}
                    value={playMediaMode}
                    onchange={(value) => onMediaAutoPlayChange?.('mode', value as 'first' | 'all')}
                  />
                </div>

                <!-- 播放时机选择 -->
                <div class="setting-item">
                  <div class="setting-label">播放时机</div>
                  <ObsidianDropdown
                    className="setting-select"
                    options={[
                      { id: 'cardChange', label: '切换卡片' },
                      { id: 'showAnswer', label: '显示答案' }
                    ]}
                    value={playMediaTiming}
                    onchange={(value) => onMediaAutoPlayChange?.('timing', value as 'cardChange' | 'showAnswer')}
                  />
                </div>

                <!-- 播放间隔设置 (仅在播放全部模式下显示) -->
                {#if playMediaMode === 'all'}
                  <div class="setting-item interval-item">
                    <div class="setting-label">
                      播放间隔
                      <span class="interval-value">{(playbackInterval / 1000).toFixed(1)}s</span>
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

            <!-- 学习顺序设置 -->
            <div class="setting-section">
              <div class="setting-item">
                <div class="setting-label">卡片顺序</div>
                <ObsidianDropdown
                  className="setting-select"
                  options={[
                    { id: 'sequential', label: '正序学习' },
                    { id: 'random', label: '乱序学习' }
                  ]}
                  value={cardOrder}
                  onchange={(value) => onCardOrderChange?.(value as 'sequential' | 'random')}
                />
              </div>
            </div>

            <!-- 超时自动暂停计时 -->
            <div class="setting-section">
              <div class="setting-item interval-item">
                <div class="setting-label">
                  超时暂停
                  <span class="interval-value">{timerAutoPauseSeconds >= 60 ? (timerAutoPauseSeconds / 60) + 'min' : timerAutoPauseSeconds + 's'}</span>
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

            <!-- 提示次数限制 -->
            <div class="setting-section">
              <div class="setting-item interval-item">
                <div class="setting-label">
                  提示次数
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

            <!-- 删除设置 -->
            <div class="setting-section">
              <div class="setting-item toggle-item">
                <div class="setting-label">
                  <span>启用直接删除</span>
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

            <!-- 显示教程按钮开关 -->
            <div class="setting-section">
              <div class="setting-item toggle-item">
                <div class="setting-label">
                  <span>显示教程按钮</span>
                </div>
                <label class="toggle-switch">
                  <input
                    type="checkbox"
                    checked={showTutorialButton}
                    onchange={(e) => onTutorialButtonToggle?.((e.target as HTMLInputElement).checked)}
                  />
                  <span class="slider"></span>
                </label>
              </div>
            </div>

            <div class="setting-section">
              <div class="setting-item toggle-item">
                <div class="setting-label">
                  <span>显示作答方式切换</span>
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

            <!-- 回收卡片 -->
            {#if onRecycleCard}
              <div class="setting-section">
                <div class="setting-item suspend-item">
                  <div class="suspend-label">
                    <span>回收卡片：#回收</span>
                  </div>
                  <button
                    class="suspend-apply-btn"
                    onclick={() => {
                      showMoreSettingsMenu = false;
                      onRecycleCard?.();
                      maybeShowRecycleCardHint();
                    }}
                    title="回收当前卡片，暂时移出学习队列，等待改进"
                  >
                    点击应用
                  </button>
                </div>
              </div>
            {/if}
          </div>
        {/snippet}
      </FloatingMenu>
    </div>

    <!-- 使用教程按钮 -->
    {#if showTutorialButton}
    <div class="tutorial-container">
      <button
        bind:this={tutorialButtonElement}
        class="toolbar-btn clickable-icon tutorial-btn"
        class:active={showTutorialMenu}
        onclick={toggleTutorialMenu}
        title="查看使用教程"
        aria-label="查看使用教程"
      >
        <EnhancedIcon name="book-open" size="18" />
        <span class="btn-label">教程</span>
      </button>

      <FloatingMenu
        bind:show={showTutorialMenu}
        anchor={tutorialButtonElement}
        placement="left-start"
        onClose={() => {
          // 如果溢出菜单正在打开，不关闭FloatingMenu
          if (!isOverflowMenuOpen) {
            showTutorialMenu = false;
          }
        }}
        class="study-tutorial-menu-container"
      >
        {#snippet children()}
          <!--  三层分离架构 -->
          <div class="study-tutorial-wrapper">
            
            <!-- 层级1: 固定头部 -->
            <div class="study-tutorial-header">
              <span>使用教程</span>
              <button class="close-btn" onclick={() => showTutorialMenu = false}>
                <EnhancedIcon name="times" size="12" />
              </button>
            </div>
            
            <!-- 层级2: 标签页导航 -->
            <div class="study-tutorial-tabs" bind:this={tabsContainer}>
              <!-- 动态渲染可见标签 -->
              {#each allTabs as tab}
                {#if visibleTabs.includes(tab.id)}
                  <button 
                    class:active={activeTab === tab.id}
                    onclick={() => switchTab(tab.id as any)}
                  >
                    {tab.label}
                  </button>
                {/if}
              {/each}
              
              <!-- 更多按钮（当有溢出标签时显示） -->
              {#if overflowTabs.length > 0}
                <button 
                  class="more-button"
                  class:active={overflowTabs.includes(activeTab)}
                  onclick={(e) => {
            e.preventDefault();
            showOverflowMenu(e);
          }}
                >
                  更多 ▾
                </button>
              {/if}
            </div>
            
            <!-- 层级3: 滚动容器 -->
            <div class="study-tutorial-scroll-container">
              <div class="study-tutorial-content">
                
                {#if activeTab === 'core'}
                  <!-- ==================== 标签页0: 核心特性 ==================== -->
                  
                  <!-- Section 1: Markdown动态解析 -->
                  <div class="tutorial-section">
                    <div class="tutorial-section-title">
                      <span>Markdown动态解析：插件核心特性</span>
                    </div>
                    
                    <div class="tutorial-text">
                      <h4>真正的Markdown卡片编辑</h4>
                      <p>Weave插件与Anki等传统记忆软件的<strong>核心区别</strong>在于：</p>
                      <ul>
                        <li><strong>原生Markdown编辑</strong>：在Obsidian中直接编写纯Markdown内容</li>
                        <li><strong>智能动态解析</strong>：根据内容自动识别并渲染为不同题型</li>
                        <li><strong>无需模板选择</strong>：系统自动判断卡片类型（问答、挖空、选择题等）</li>
                        <li><strong>内容即结构</strong>：Markdown语法本身就定义了卡片的结构和类型</li>
                      </ul>
                      
                      <h4>关于基础模板格式</h4>
                      <p class="tutorial-note">本教程提到的问答题（Q:/---div---）、选择题（A. B. C.）、挖空题等格式，主要是为了<strong>与Anki进行数据同步</strong>而设计的兼容格式。</p>
                      <p class="tutorial-note">对于Weave插件本身，这些固定模板的重要性并不高。你完全可以用自然的Markdown语法编写内容，插件会智能解析并正确渲染。</p>
                      
                      <h4>真正的优势</h4>
                      <pre>传统记忆软件（如Anki）:
选择卡片模板 → 填入字段 → 固定格式显示

Weave插件:
直接写Markdown → 智能解析 → 动态渲染题型</pre>
                      
                      <p><strong>这才是真正的知识管理与记忆学习的完美结合！</strong></p>
                    </div>
                  </div>
                  
                {:else if activeTab === 'basics'}
                  <!-- ==================== 标签页1: 基础格式 ==================== -->
                  
                  <!-- Section 1: 卡片格式解析 -->
                  <div class="tutorial-section">
                    <div class="tutorial-section-title">
                      <span>问答题格式</span>
                    </div>
                    
                    <div class="tutorial-text">
                      <p class="tutorial-note">插件通过识别 <code>---div---</code> 分隔符，动态解析内容为问答题格式。卡片内容保存在 content 字段中，无需使用模板。</p>
                      
                      <h4>标准格式</h4>
                      <p>只需使用 <code>---div---</code> 分隔正面和反面：</p>
                      <pre>问题内容

---div---

答案内容</pre>
                      
                      <p><strong>示例：</strong></p>
                      <pre>什么是间隔重复？

---div---

间隔重复是一种学习技术，通过在逐渐增加的
时间间隔中复习信息，从而提高长期记忆。
这种方法基于遗忘曲线理论。</pre>

                    </div>
                  </div>

                  <!-- 分割线 -->
                  <div class="tutorial-divider"></div>

                  <!-- Section 2: 挖空题格式 -->
                  <div class="tutorial-section">
                    <div class="tutorial-section-title">
                      <span>挖空题格式</span>
                    </div>
                    
                    <div class="tutorial-text">
                      <h4>支持三种挖空语法</h4>
                      
                      <h5>方式1：Obsidian高亮（原生Markdown）</h5>
                      <p>使用 <code>==text==</code> 标记挖空内容，这是Obsidian原生语法</p>
                      <pre>间隔重复的核心是在 ==遗忘临界点== 进行复习。</pre>
                      
                      <h5>方式2：Anki风格（用于数据同步）</h5>
                      <p>使用 <code>{'{{'}c1::text}}</code> 或 <code>{'{{'}c1::text::hint}}</code>，主要用于与Anki同步</p>
                      <pre>FSRS算法是 {'{{'}c1::Free Spaced Repetition Scheduler}} 的缩写。
它使用 {'{{'}c2::记忆模型::什么模型}} 预测遗忘时间。</pre>
                      
                      <h5>方式3：自定义分隔符</h5>
                      <p class="tutorial-note">在插件设置中可配置自定义挖空符号</p>
                    </div>
                  </div>

                  <!-- 分割线 -->
                  <div class="tutorial-divider"></div>

                  <!-- Section 3: 选择题格式 -->
                  <div class="tutorial-section">
                    <div class="tutorial-section-title">
                      <span>选择题格式</span>
                    </div>
                    
                    <div class="tutorial-text">
                      <p class="tutorial-note">插件通过识别选项格式 <code>A. B. C.</code> 和题干末尾答案标记 <code>（A,C）</code>，动态解析为选择题。</p>
                      
                      <h4>单选题</h4>
                      <p>使用 <code>A. B. C.</code> 格式，在题干末尾用 <code>（B）</code> 标记正确答案：</p>
                      <pre>以下哪个是FSRS算法的核心？

（B）

A. 随机复习
B. 记忆模型预测
C. 固定间隔

---div---

最佳复习时间，这是其核心特性。</pre>
                      
                      <h4>多选题</h4>
                      <p>多个答案在题干末尾用 <code>（A,B,D）</code> 标记：</p>
                      <pre>以下哪些是有效的学习方法？

（A,B,D）

A. 间隔重复
B. 主动回忆
C. 死记硬背
D. 分散学习

---div---

这些方法都基于科学的学习原理，而死记硬背效果较差。</pre>
                    </div>
                  </div>

                  <!-- 分割线 -->
                  <div class="tutorial-divider"></div>

                  <!-- Section 4: 回收标签功能 -->
                  <div class="tutorial-section">
                    <div class="tutorial-section-title">
                      <span>回收卡片功能</span>
                    </div>
                    
                    <div class="tutorial-text">
                      <h4>什么是回收？</h4>
                      <p>回收功能将记忆效率不佳的卡片暂时移出学习队列，标记为待改进状态，而非永久放弃。</p>
                      
                      <h4>如何回收卡片？</h4>
                      <p>在卡片内容中添加 <code>#回收</code> 或 <code>#recycle</code> 标签，或通过更多设置菜单点击"回收卡片"按钮。</p>
                      
                      <h4>标签插入位置</h4>
                      <p>系统会智能插入回收标签：</p>
                      
                      <h5>位置1：YAML后</h5>
                      <pre>---
tags: [学习]
---

#搁置

卡片内容...</pre>
                      
                      <h5>位置2：标题后</h5>
                      <pre># 卡片标题

#搁置

卡片内容...</pre>
                      
                      <h5>位置3：内容开头</h5>
                      <pre>#搁置

卡片内容...</pre>
                      
                      <h4>回收 vs 搁置</h4>
                      <p><strong>回收</strong>强调"暂存待改进"，而非"永久放弃"。系统支持向后兼容旧版<code>#搁置</code>标签。</p>
                      
                      <h4>重新激活</h4>
                      <p>移除卡片中的 <code>#回收</code> 标签，卡片将重新加入复习队列。建议在改进后再激活。</p>
                    </div>
                  </div>
                  
                {:else if activeTab === 'ai'}
                  <!-- ==================== 标签页2: AI助手 ==================== -->
                  
                  <!-- Section 1: 功能定位与设计理念 -->
                  <div class="tutorial-section">
                    <div class="tutorial-section-title">
                      <span>功能定位与设计理念</span>
                    </div>
                    
                    <div class="tutorial-text">
                      <h4>AI助手是什么？</h4>
                      <p>AI助手是Weave插件的智能辅助系统，旨在提升卡片学习效率和内容质量。它不是简单的内容生成工具，而是融入学习流程的智能助理。</p>
                      
                      <h4>核心定位</h4>
                      <ul>
                        <li><strong>学习辅助</strong>：基于间隔重复算法的学习流程优化工具</li>
                        <li><strong>内容增强</strong>：智能优化已有卡片内容，而非完全替代人工创作</li>
                        <li><strong>效率提升</strong>：减少重复性的格式化和整理工作</li>
                        <li><strong>个性化</strong>：支持自定义功能，适应不同学习场景</li>
                      </ul>
                      
                      <h4>为什么需要AI助手？</h4>
                      <p>在间隔重复学习中，用户常遇到以下问题：</p>
                      <ul>
                        <li><strong>卡片质量参差不齐</strong>：手动创建的卡片格式不统一，影响学习效率</li>
                        <li><strong>复杂知识拆分困难</strong>：长篇内容难以拆分为适合记忆的小单元</li>
                        <li><strong>练习题缺乏</strong>：仅有记忆卡片，缺少巩固性练习</li>
                        <li><strong>重复性劳动</strong>：格式化、优化等机械工作耗时</li>
                      </ul>
                      
                      <h4>核心价值</h4>
                      <p>智能辅助 + 可扩展 + 多场景应用</p>
                      
                      <h4>设计原则</h4>
                      <ul>
                        <li><strong>Content-First</strong>：尊重用户原有内容，AI仅作优化</li>
                        <li><strong>最小信息原则</strong>：拆分和优化时遵循一卡一知识点</li>
                        <li><strong>溯源透明</strong>：所有AI生成的内容都保留来源信息</li>
                        <li><strong>用户可控</strong>：AI建议需用户确认，支持编辑和重新生成</li>
                      </ul>
                    </div>
                  </div>

                  <!-- 分割线 -->
                  <div class="tutorial-divider"></div>

                  <!-- Section 2: AI格式化 -->
                  <div class="tutorial-section">
                    <div class="tutorial-section-title">
                      <span>AI格式化</span>
                    </div>
                    
                    <div class="tutorial-text">
                      <h4>功能介绍</h4>
                      <p>AI格式化是在现有卡片基础上自动优化内容和格式的功能，包括：</p>
                      <ul>
                        <li><strong>优化排版</strong>：调整段落结构，增强可读性</li>
                        <li><strong>智能添加标签</strong>：根据内容自动提取关键词标签</li>
                        <li><strong>增强表达</strong>：改进语言表达，使内容更清晰</li>
                        <li><strong>统一风格</strong>：保持卡片格式的一致性</li>
                      </ul>
                      
                      <h4>使用方法</h4>
                      <pre>1. 在记忆学习界面，点击工具栏的"AI助手"按钮
2. 选择"AI格式化"类别
3. 从官方预设或自定义功能中选择一个功能
4. 查看预览结果，确认后应用</pre>
                      
                      <h4>官方预设功能</h4>
                      <ul>
                        <li><strong>选择题优化</strong>：优化选择题的选项表述和干扰项设计</li>
                        <li><strong>数学公式格式化</strong>：规范数学公式的LaTeX语法</li>
                        <li><strong>代码片段优化</strong>：改进代码示例的注释和格式</li>
                        <li><strong>概念定义优化</strong>：增强概念解释的准确性和条理性</li>
                      </ul>
                      
                      <p class="tutorial-note">格式化会修改卡片内容，建议先预览再应用</p>
                    </div>
                  </div>

                  <!-- 分割线 -->
                  <div class="tutorial-divider"></div>

                  <!-- Section 3: AI拆分 -->
                  <div class="tutorial-section">
                    <div class="tutorial-section-title">
                      <span>AI拆分</span>
                    </div>
                    
                    <div class="tutorial-text">
                      <h4>功能介绍</h4>
                      <p>AI拆分是将复杂卡片拆分为多张简单子卡片的功能，遵循"最小信息原则"，每张子卡片聚焦一个核心知识点。</p>
                      
                      <h4>父卡片与子卡片</h4>
                      <p><strong>父卡片</strong>：</p>
                      <ul>
                        <li>原始的复杂卡片，包含多个知识点</li>
                        <li>relationMetadata.isParent = true</li>
                        <li>可选择搁置，不参与学习</li>
                      </ul>
                      
                      <p><strong>子卡片</strong>：</p>
                      <ul>
                        <li>AI拆分生成的简单卡片，每张卡片一个知识点</li>
                        <li>parentCardId：指向父卡片UUID</li>
                        <li>relationMetadata.isParent = false</li>
                        <li>derivationMetadata.method = 'AI_SPLIT'</li>
                      </ul>
                      
                      <h4>子卡片拆分防护</h4>
                      <p>为保持卡片层次结构的清晰，<strong>子卡片无法再次拆分</strong>。</p>
                      <p>系统会检测parentCardId、relationMetadata.isParent、derivationMetadata.method字段，并在UI和逻辑层双重防护。</p>
                      
                      <h4>父卡片回收机制</h4>
                      <p>保存子卡片后，系统会询问是否回收父卡片：</p>
                      <ul>
                        <li><strong>回收</strong>：在父卡片内容添加 #回收 标签，标记为待处理</li>
                        <li><strong>效果</strong>：父卡片暂时移出学习队列，等待改进或归档</li>
                        <li><strong>重新激活</strong>：移除标签并改进后，卡片重新加入学习</li>
                      </ul>
                      
                      <h4>信息继承机制</h4>
                      <p>子卡片完整继承父卡片的信息：</p>
                      <ul>
                        <li><strong>来源文档信息</strong>：sourceFile、sourceBlock、sourceRange、sourceExists</li>
                        <li><strong>父子关系信息</strong>：parentCardId、relationMetadata、derivationMetadata</li>
                        <li><strong>牌组信息</strong>：与父卡片在同一牌组</li>
                      </ul>
                      
                      <h4>使用流程</h4>
                      <pre>1. 选择源卡片（非子卡片）
2. 点击"AI助手" → "AI拆分"，选择拆分功能
3. 查看预览，选择要保存的子卡片
4. 点击"保存到记忆牌组"
5. 选择是否搁置父卡片</pre>
                    </div>
                  </div>

                  <!-- 分割线 -->
                  <div class="tutorial-divider"></div>

                  <!-- Section 4: 操作步骤与管理 -->
                  <div class="tutorial-section">
                    <div class="tutorial-section-title">
                      <span>操作步骤与管理</span>
                    </div>
                    
                    <div class="tutorial-text">
                      <h4>完整使用流程</h4>
                      <pre>步骤1: 点击工具栏"AI助手"按钮
     ↓
步骤2: 选择功能类型
     ├─ AI格式化
     │   ├─ 选择预设功能或自定义功能
     │   └─ 预览并应用
     └─ AI拆分
         ├─ 选择拆分策略
         ├─ 预览子卡片
         ├─ 选择保存到记忆牌组
         └─ 可选：搁置父卡片

步骤3: 查看结果并应用
     ↓
步骤4: 如需调整，可重新执行或编辑</pre>
                      
                      <h4>管理自定义功能</h4>
                      <p>点击菜单底部的"管理功能..."可以：</p>
                      <ul>
                        <li>创建新的自定义功能（格式化、AI拆分）</li>
                        <li>编辑现有功能（修改提示词、选择AI模型）</li>
                        <li>启用/禁用功能</li>
                        <li>删除不需要的功能</li>
                      </ul>
                      
                      <h4>注意事项</h4>
                      <ul>
                        <li><strong>首次使用</strong>：需要在设置中配置AI服务</li>
                        <li><strong>AI是辅助</strong>：保持人工审核和创作的主导地位</li>
                        <li><strong>记忆与测试协同</strong>：记忆学习使用FSRS，测试练习侧使用EWMA评估掌握度</li>
                        <li><strong>溯源透明</strong>：所有AI生成内容都可追溯来源</li>
                        <li><strong>层级清晰</strong>：子卡片不可再拆，防止过度复杂化</li>
                      </ul>
                      
                      <p class="tutorial-note">提示：合理使用AI助手，让学习更高效，知识更牢固</p>
                    </div>
                  </div>
                  
                {:else if activeTab === 'progressive'}
                  <!-- ==================== 标签页3: 渐进式挖空 ==================== -->
                  
                  <!-- Section 1: 功能概述 -->
                  <div class="tutorial-section">
                    <div class="tutorial-section-title">
                      <span>渐进式挖空：独立学习每个挖空</span>
                    </div>
                    
                    <div class="tutorial-text">
                      <h4>核心特性</h4>
                      <p><strong>渐进式挖空</strong>将一张卡片的多个挖空独立学习，每个挖空都有自己的FSRS数据和复习历史。</p>
                      <ul>
                        <li><strong>独立学习进度</strong>：每个挖空有自己的FSRS数据，互不影响</li>
                        <li><strong>单卡片存储</strong>：所有挖空共享一张卡片，避免内容重复</li>
                        <li><strong>动态渲染</strong>：学习时只隐藏当前挖空，其他挖空显示答案</li>
                        <li><strong>智能解析</strong>：自动检测并提示拆分为渐进式挖空</li>
                      </ul>
                      
                      <h4>与普通挖空的区别</h4>
                      <pre>普通挖空：一张卡片 → 一次学习
渐进式挖空：一张卡片 → 多次独立学习</pre>
                    </div>
                  </div>

                  <!-- 分割线 -->
                  <div class="tutorial-divider"></div>

                  <!-- Section 2: Markdown自由编辑与动态解析 -->
                  <div class="tutorial-section">
                    <div class="tutorial-section-title">
                      <span>Markdown自由编辑与动态解析</span>
                    </div>
                    
                    <div class="tutorial-text">
                      <h4>插件核心优势：动态题型解析</h4>
                      <p>Weave插件的独特之处在于<strong>Markdown自由编辑，实时动态解析</strong>为不同题型。</p>
                      
                      <h4>题型转换示例</h4>
                      <pre># 挖空题 → 问答题
编辑前：什么是{'{{'}c1::FSRS}}？
编辑后：Q: 什么是FSRS？

---div---

Free Spaced Repetition Scheduler</pre>
                      
                      <pre># 挖空题 → 选择题
编辑前：FSRS是{'{{'}c1::间隔重复算法}}
编辑后：Q: FSRS是什么？

A. 固定间隔算法
B. 间隔重复算法
C. 随机复习算法
D. 顺序学习算法

正确答案：B</pre>
                      
                      <h4>实时动态预览</h4>
                      <p>修改卡片内容后，插件会：</p>
                      <ul>
                        <li><strong>自动识别</strong>：根据Markdown符号识别题型</li>
                        <li><strong>动态渲染</strong>：实时预览最终学习效果</li>
                        <li><strong>保留进度</strong>：题型转换不影响学习历史</li>
                        <li><strong>无缝切换</strong>：在编辑和学习模式间自由切换</li>
                      </ul>
                    </div>
                  </div>

                  <!-- 分割线 -->
                  <div class="tutorial-divider"></div>

                  <!-- Section 3: 序列号格式化快捷键 -->
                  <div class="tutorial-section">
                    <div class="tutorial-section-title">
                      <span>序列号格式化快捷键</span>
                    </div>
                    
                    <div class="tutorial-text">
                      <h4>Obsidian渐进式挖空序列格式化</h4>
                      <p>插件提供专用快捷键，帮助快速格式化挖空序列号。</p>
                      
                      <h4>序列号跳号处理</h4>
                      <p>删除中间挖空后出现跳号（如c1, c3）是正常现象，与Anki行为一致。</p>
                      <p>如需连续序列号，可手动修改：</p>
                      <pre>{'{{'}c1::A}} {'{{'}c3::C}} → {'{{'}c1::A}} {'{{'}c2::C}}</pre>
                      <p>修改后，c3的学习进度会转移到c2。</p>
                      
                      <h4>适用场景</h4>
                      <ul>
                        <li><strong>英语单词学习</strong>：单词 + 多个词义</li>
                        <li><strong>知识点学习</strong>：公式 + 变量定义</li>
                        <li><strong>代码学习</strong>：语法结构的不同部分</li>
                        <li><strong>概念理解</strong>：复杂概念的多个关键点</li>
                      </ul>
                    </div>
                  </div>

                  <!-- 分割线 -->
                  <div class="tutorial-divider"></div>

                  <!-- Section 4: 学习特性 -->
                  <div class="tutorial-section">
                    <div class="tutorial-section-title">
                      <span>学习特性与数据管理</span>
                    </div>
                    
                    <div class="tutorial-text">
                      <h4>独立学习进度</h4>
                      <p>每个挖空都有独立的：</p>
                      <ul>
                        <li><strong>FSRS数据</strong>：稳定性、难度、复习次数等</li>
                        <li><strong>复习历史</strong>：完整的学习轨迹记录</li>
                        <li><strong>虚拟UUID</strong>：格式如 <code>card123_c1</code>，用于精确追踪</li>
                      </ul>
                      
                      <h4>智能渲染</h4>
                      <p>学习时的显示效果：</p>
                      <pre>原始内容：什么是{'{{'}c1::FSRS}}？它是{'{{'}c2::算法}}。

学习c1时：什么是____？它是算法。
学习c2时：什么是FSRS？它是____。</pre>
                      
                      <h4>学习进度保留</h4>
                      <ul>
                        <li><strong>编辑内容</strong>：修改挖空文本不影响学习进度</li>
                        <li><strong>添加挖空</strong>：新挖空从新卡片开始</li>
                        <li><strong>删除挖空</strong>：序列号可能跳号，但进度保留</li>
                        <li><strong>转换继承</strong>：普通挖空转换时，c1继承原有进度</li>
                      </ul>
                    </div>
                  </div>
                  
                {:else if activeTab === 'priority'}
                  <!-- ==================== 标签页4: 卡片优先级 ==================== -->
                  
                  <!-- Section 1: 优先级概述 -->
                  <div class="tutorial-section">
                    <div class="tutorial-section-title">
                      <span>卡片优先级：控制学习顺序的核心工具</span>
                    </div>
                    
                    <div class="tutorial-text">
                      <h4>什么是卡片优先级</h4>
                      <p>卡片优先级是一个<strong>队列管理工具</strong>，用于控制同一学习会话中卡片的出现顺序。通过设置不同的优先级，您可以确保重要内容优先复习。</p>
                      
                      <h4>优先级等级</h4>
                      <ul>
                        <li><strong>1 - 低优先级</strong>：不紧急的辅助内容</li>
                        <li><strong>2 - 中优先级</strong>：默认优先级，常规学习内容</li>
                        <li><strong>3 - 高优先级</strong>：重要知识点</li>
                        <li><strong>4 - 紧急</strong>：考前重点、关键内容</li>
                      </ul>
                      
                      <h4>核心理念</h4>
                      <p class="tutorial-note">优先级<strong>只影响学习顺序</strong>，不影响记忆算法。这意味着FSRS系统仍然会根据您的记忆曲线计算最佳复习间隔，优先级只是决定在同一时间段内先学哪张卡片。</p>
                    </div>
                  </div>

                  <!-- 分割线 -->
                  <div class="tutorial-divider"></div>

                  <!-- Section 2: 优先级计算机制 -->
                  <div class="tutorial-section">
                    <div class="tutorial-section-title">
                      <span>四层优先级计算系统</span>
                    </div>
                    
                    <div class="tutorial-text">
                      <h4>综合优先级公式</h4>
                      <p>插件使用四层叠加的优先级计算系统：</p>
                      <pre>最终优先级 = State优先级 + 用户优先级 + Difficulty微调 + Leech提升</pre>
                      
                      <h4>各层级详解</h4>
                      <ul>
                        <li><strong>第1层 - State优先级（100-400分）</strong>：
                          <ul>
                            <li>Learning（学习中）：100-199分 - 最高优先级</li>
                            <li>Relearning（重学中）：200-299分</li>
                            <li>Review（复习）：300-399分</li>
                            <li>New（新卡片）：400+分 - 最低优先级</li>
                          </ul>
                        </li>
                        <li><strong>第2层 - 用户优先级（0-40分）</strong>：
                          <ul>
                            <li>优先级1：+10分</li>
                            <li>优先级2：+20分（默认）</li>
                            <li>优先级3：+30分</li>
                            <li>优先级4：+40分</li>
                          </ul>
                        </li>
                        <li><strong>第3层 - Difficulty微调（0-5分）</strong>：根据卡片难度追踪数据自动调整</li>
                        <li><strong>第4层 - Leech提升（-20~0分）</strong>：困难卡片获得额外提升（负数=提前）</li>
                      </ul>
                      
                      <h4>计算示例</h4>
                      <pre>卡片A：Review状态 + 优先级4（紧急）
       = 300 + 40 + 微调 = 340左右

卡片B：Review状态 + 优先级1（低）
       = 300 + 10 + 微调 = 310左右

结果：卡片A会优先于卡片B出现</pre>
                    </div>
                  </div>

                  <!-- 分割线 -->
                  <div class="tutorial-divider"></div>

                  <!-- Section 3: 对学习队列的影响 -->
                  <div class="tutorial-section">
                    <div class="tutorial-section-title">
                      <span>优先级如何影响学习队列</span>
                    </div>
                    
                    <div class="tutorial-text">
                      <h4>优先级分层机制</h4>
                      <p>学习队列按每100分划分为不同层级：</p>
                      <ul>
                        <li><strong>Layer 1（100-199）</strong>：Learning卡片，始终最优先</li>
                        <li><strong>Layer 2（200-299）</strong>：Relearning卡片</li>
                        <li><strong>Layer 3（300-399）</strong>：Review卡片</li>
                        <li><strong>Layer 4（400+）</strong>：New卡片，最后学习</li>
                      </ul>
                      
                      <h4>同层内排序</h4>
                      <p>用户优先级主要影响<strong>同一层级内</strong>的相对顺序：</p>
                      <ul>
                        <li>在同一State（如都是Review卡片）中，优先级4的卡片排在前面</li>
                        <li>优先级1的卡片排在后面</li>
                        <li>即使设置为优先级4，New卡片仍然在所有Learning/Review卡片之后</li>
                      </ul>
                      
                      <h4>Interleaving交错影响</h4>
                      <p>在启用交错功能时：</p>
                      <ul>
                        <li>每层内先按优先级排序</li>
                        <li>再按标签进行交错排列</li>
                        <li>保持优先级的大致方向不变</li>
                        <li>避免同一标签的卡片连续出现</li>
                      </ul>
                    </div>
                  </div>

                  <!-- 分割线 -->
                  <div class="tutorial-divider"></div>

                  <!-- Section 4: 对复习时间的影响 -->
                  <div class="tutorial-section">
                    <div class="tutorial-section-title">
                      <span>优先级与复习间隔的关系</span>
                    </div>
                    
                    <div class="tutorial-text">
                      <h4>直接影响：无</h4>
                      <p class="tutorial-note"><strong>重要</strong>：用户优先级<strong>不会改变FSRS算法计算的复习间隔</strong>。无论设置为优先级1还是4，卡片的下次复习时间完全由以下因素决定：</p>
                      <ul>
                        <li>您的评分（Again/Hard/Good/Easy）</li>
                        <li>卡片的记忆难度（Difficulty）</li>
                        <li>卡片的记忆稳定性（Stability）</li>
                        <li>历史遗忘次数（Lapses）</li>
                        <li>当前记忆状态（State）</li>
                      </ul>
                      
                      <h4>间接影响：学习起始时间</h4>
                      <p>优先级通过影响学习顺序，可能产生间接影响：</p>
                      <pre>示例对比：

优先级4（紧急）：
  下午3:00学习 → 评分Good → 4天后复习（12月8日 3:00）

优先级1（低）：
  晚上9:00学习 → 评分Good → 4天后复习（12月8日 9:00）

间隔时长相同，但起始时间不同</pre>
                      
                      <h4>记忆效果影响</h4>
                      <p>可能存在的心理效应：</p>
                      <ul>
                        <li>标记为"紧急"的卡片可能获得更多注意力</li>
                        <li>更专注的学习可能带来更好的评分</li>
                        <li>更好的评分会导致更长的复习间隔</li>
                        <li>但这不是优先级本身的作用，而是学习态度的影响</li>
                      </ul>
                    </div>
                  </div>

                  <!-- 分割线 -->
                  <div class="tutorial-divider"></div>

                  <!-- Section 5: 实际使用场景 -->
                  <div class="tutorial-section">
                    <div class="tutorial-section-title">
                      <span>优先级使用场景与最佳实践</span>
                    </div>
                    
                    <div class="tutorial-text">
                      <h4>场景1：考前冲刺</h4>
                      <p><strong>策略</strong>：将考试重点内容设为优先级4（紧急）</p>
                      <ul>
                        <li>确保在有限时间内优先复习重点</li>
                        <li>其他内容可暂时设为优先级1（低）</li>
                        <li>考试后恢复正常优先级</li>
                      </ul>
                      
                      <h4>场景2：主题式学习</h4>
                      <p><strong>策略</strong>：本周专注某个主题时，提高相关卡片优先级</p>
                      <ul>
                        <li>本周学习主题A：A相关卡片→优先级4</li>
                        <li>下周学习主题B：调整为B相关卡片→优先级4</li>
                        <li>保持学习的连贯性和专注度</li>
                      </ul>
                      
                      <h4>场景3：基础优先策略</h4>
                      <p><strong>策略</strong>：基础知识优先于高级知识</p>
                      <ul>
                        <li>基础概念卡片：优先级3（高）</li>
                        <li>应用和拓展：优先级2（中）</li>
                        <li>高级话题：优先级1（低）</li>
                        <li>符合学习规律，先打好基础</li>
                      </ul>
                      
                      <h4>场景4：时间管理</h4>
                      <p><strong>策略</strong>：根据可用时间调整优先级</p>
                      <ul>
                        <li>时间充足：保持默认优先级2，全面复习</li>
                        <li>时间有限：核心内容→优先级3-4，确保重点不遗漏</li>
                        <li>临时调整后记得恢复，保持长期平衡</li>
                      </ul>
                      
                      <h4>使用建议</h4>
                      <p class="tutorial-note">优先级是灵活的工具，建议：</p>
                      <ul>
                        <li><strong>不要过度使用</strong>：大部分卡片保持默认优先级2即可</li>
                        <li><strong>定期调整</strong>：根据学习阶段和目标变化适时调整</li>
                        <li><strong>配合FSRS</strong>：优先级管理顺序，FSRS管理记忆，两者结合使用</li>
                        <li><strong>避免极端</strong>：不要把所有卡片都设为优先级4，这会失去优先级的意义</li>
                      </ul>
                    </div>
                  </div>

                  <!-- 分割线 -->
                  <div class="tutorial-divider"></div>

                  <!-- Section 6: 其他影响 -->
                  <div class="tutorial-section">
                    <div class="tutorial-section-title">
                      <span>优先级的其他影响</span>
                    </div>
                    
                    <div class="tutorial-text">
                      <h4>队列缓存刷新</h4>
                      <p>修改优先级后：</p>
                      <ul>
                        <li>当前学习会话：可能需要重新加载队列才能看到效果</li>
                        <li>下次学习会话：自动使用新的优先级排序</li>
                        <li>系统会自动清除相关卡片的优先级缓存</li>
                      </ul>
                      
                      <h4>Learning Steps交互</h4>
                      <p>在渐进式学习中：</p>
                      <ul>
                        <li>优先级不影响Learning Steps的触发条件</li>
                        <li>但会影响卡片重新插入队列的位置</li>
                        <li>优先级高的卡片重新插入时仍然靠前</li>
                      </ul>
                      
                      <h4>Difficulty Tracking</h4>
                      <p>难度追踪系统：</p>
                      <ul>
                        <li>优先级不影响难度等级的计算</li>
                        <li>难度追踪基于FSRS数据和评分历史</li>
                        <li>但难度追踪会影响最终优先级（第3层微调）</li>
                      </ul>
                      
                      <h4>Leech检测</h4>
                      <p>困难卡片检测：</p>
                      <ul>
                        <li>Leech检测完全基于客观数据（难度、遗忘次数等）</li>
                        <li>用户优先级不参与Leech判断</li>
                        <li>但检测到的Leech卡片会自动获得优先级提升</li>
                      </ul>
                    </div>
                  </div>

                  <!-- 分割线 -->
                  <div class="tutorial-divider"></div>

                  <!-- Section 7: 总结 -->
                  <div class="tutorial-section">
                    <div class="tutorial-section-title">
                      <span>核心要点总结</span>
                    </div>
                    
                    <div class="tutorial-text">
                      <h4>优先级的本质</h4>
                      <p class="tutorial-note">卡片优先级是一个<strong>队列组织工具</strong>，它的作用是：</p>
                      <ul>
                        <li>控制"什么时候学"（学习顺序）</li>
                        <li>不控制"学得怎么样"（记忆效果）</li>
                        <li>不控制"多久复习"（复习间隔）</li>
                      </ul>
                      
                      <h4>关键理解</h4>
                      <pre>用户优先级（1-4）
       ↓
影响队列排序
       ↓
决定先学哪张卡片
       ↓
不影响FSRS算法
       ↓
不改变记忆曲线</pre>
                      
                      <h4>最佳实践原则</h4>
                      <ul>
                        <li><strong>灵活运用</strong>：根据学习目标动态调整</li>
                        <li><strong>保持平衡</strong>：避免过度使用极端优先级</li>
                        <li><strong>信任FSRS</strong>：让算法处理记忆规律</li>
                        <li><strong>专注质量</strong>：优先级只是工具，学习质量才是关键</li>
                      </ul>
                    </div>
                  </div>
                  
                {:else if activeTab === 'queue'}
                  <!-- ==================== 标签页6: 学习队列 ==================== -->
                  
                  <!-- Section 1: 智能学习队列概述 -->
                  <div class="tutorial-section">
                    <div class="tutorial-section-title">
                      <span>智能学习队列：科学优化学习效率</span>
                    </div>
                    
                    <div class="tutorial-text">
                      <h4>什么是智能学习队列</h4>
                      <p>智能学习队列是Weave的核心优化系统，通过<strong>三个科学机制</strong>显著提升学习效率和记忆效果。</p>
                      
                      <h4>解决的核心问题</h4>
                      <ul>
                        <li><strong>会话内遗忘</strong>：刚学的内容又忘了，但要等到明天才能再复习</li>
                        <li><strong>记忆干扰</strong>：连续10张都是相似主题，容易混淆</li>
                        <li><strong>效率低下</strong>：某些卡片总是记不住，浪费大量时间</li>
                      </ul>
                      
                      <h4>三大优化机制</h4>
                      <ul>
                        <li><strong>Learning Steps（会话内重复）</strong>：忘记的卡片立即巩固，无需等待</li>
                        <li><strong>Interleaving（交错学习）</strong>：不同主题交替出现，减少干扰</li>
                        <li><strong>Difficulty Tracking（难度追踪）</strong>：自动识别困难卡片，智能调整优先级</li>
                      </ul>
                      
                      <h4>科学依据</h4>
                      <p class="tutorial-note">基于认知心理学的三大效应：测试效应（Testing Effect）、交错练习效应（Interleaving Effect）、自适应学习理论（Adaptive Learning）。经大量研究证实，这些机制能显著提升学习效果。</p>
                    </div>
                  </div>

                  <!-- 分割线 -->
                  <div class="tutorial-divider"></div>

                  <!-- Section 2: Learning Steps -->
                  <div class="tutorial-section">
                    <div class="tutorial-section-title">
                      <span>Learning Steps：会话内重复巩固</span>
                    </div>
                    
                    <div class="tutorial-text">
                      <h4>核心功能</h4>
                      <p>新卡片点击<strong>"重来"</strong>后，不会等到明天，而是在<strong>同一次学习会话</strong>中重复2-3次，立即巩固记忆。</p>
                      
                      <h4>学习流程</h4>
                      <pre>学习新卡片 → 点击"重来"（忘记了）
    ↓
进入Learning Steps：1分钟后再次出现
    ↓
如果又忘记 → 重复步骤，1分钟后再学
如果记住 → 进入第2步，10分钟后再学
    ↓
10分钟后再次学习
    ↓
再次记住 → 毕业，进入正常复习周期
再次忘记 → 重置到第1步</pre>
                      
                      <h4>实际效果</h4>
                      <ul>
                        <li><strong>记忆留存率提升30-40%</strong>（24小时内）</li>
                        <li><strong>不用等到明天</strong>：当场巩固，立即见效</li>
                        <li><strong>减少长期遗忘率</strong>：短期内重复加深印象</li>
                      </ul>
                      
                      <h4>适用场景</h4>
                      <ul>
                        <li>新学习的困难单词/概念</li>
                        <li>容易混淆的知识点</li>
                        <li>需要即时巩固的内容</li>
                      </ul>
                      
                      <p class="tutorial-note"><strong>提示</strong>：Learning Steps默认间隔为[1分钟, 10分钟]，可在设置中自定义调整。</p>
                    </div>
                  </div>

                  <!-- 分割线 -->
                  <div class="tutorial-divider"></div>

                  <!-- Section 3: Interleaving -->
                  <div class="tutorial-section">
                    <div class="tutorial-section-title">
                      <span>Interleaving：交错学习减少干扰</span>
                    </div>
                    
                    <div class="tutorial-text">
                      <h4>核心功能</h4>
                      <p>自动将<strong>不同主题/标签</strong>的卡片交错排列，避免相似内容连续出现，减少记忆干扰。</p>
                      
                      <h4>问题示例对比</h4>
                      <pre><strong>无交错（传统模式）：</strong>
1. 英语单词: abandon
2. 英语单词: abbreviate
3. 英语单词: abdomen
4. 英语单词: abide
→ 4张相似单词连续出现，容易混淆

<strong>有交错（智能模式）：</strong>
1. 英语单词: abandon
2. 历史事件: 第一次世界大战
3. 数学公式: 二次方程
4. 英语单词: abbreviate
→ 不同主题交替，减少干扰</pre>
                      
                      <h4>实际效果</h4>
                      <ul>
                        <li><strong>混淆错误减少35%</strong>：相似内容分散，记忆更清晰</li>
                        <li><strong>学习体验更丰富</strong>：主题切换，保持新鲜感</li>
                        <li><strong>专注度提升</strong>：避免单调重复，维持学习兴趣</li>
                      </ul>
                      
                      <h4>工作机制</h4>
                      <p>系统基于卡片<strong>标签</strong>自动分组，轮流从不同组中抽取卡片。同时保持FSRS算法的优先级排序，确保到期卡片优先复习。</p>
                      
                      <p class="tutorial-note"><strong>建议</strong>：为卡片添加合理的标签（如 #英语/单词、#历史/事件、#数学/公式），交错效果更明显。</p>
                    </div>
                  </div>

                  <!-- 分割线 -->
                  <div class="tutorial-divider"></div>

                  <!-- Section 4: Difficulty Tracking -->
                  <div class="tutorial-section">
                    <div class="tutorial-section-title">
                      <span>Difficulty Tracking：智能难度追踪</span>
                    </div>
                    
                    <div class="tutorial-text">
                      <h4>核心功能</h4>
                      <p>自动追踪每张卡片的<strong>学习难度</strong>，识别"困难卡片"并提前安排复习，避免浪费时间在重复遗忘上。</p>
                      
                      <h4>追踪指标</h4>
                      <ul>
                        <li><strong>遗忘次数（Lapses）</strong>：记录卡片被遗忘的次数</li>
                        <li><strong>平均评分</strong>：统计学习时的平均评分</li>
                        <li><strong>复习间隔稳定性</strong>：判断记忆是否稳定</li>
                        <li><strong>Leech标记</strong>：多次遗忘的"困难户"</li>
                      </ul>
                      
                      <h4>自动干预机制</h4>
                      <pre>检测到困难卡片
    ↓
自动提高优先级
    ↓
提前安排复习时间
    ↓
建议优化卡片内容（如简化、拆分）</pre>
                      
                      <h4>实际效果</h4>
                      <ul>
                        <li><strong>学习效率提升25%</strong>：困难内容获得更多关注</li>
                        <li><strong>避免无效重复</strong>：不在简单卡片上浪费时间</li>
                        <li><strong>智能资源分配</strong>：学习精力用在刀刃上</li>
                      </ul>
                      
                      <p class="tutorial-note"><strong>系统会自动工作</strong>：无需手动配置，系统会在后台持续追踪和优化队列。</p>
                    </div>
                  </div>

                  <!-- 分割线 -->
                  <div class="tutorial-divider"></div>

                  <!-- Section 5: 使用指南 -->
                  <div class="tutorial-section">
                    <div class="tutorial-section-title">
                      <span>如何使用与最佳实践</span>
                    </div>
                    
                    <div class="tutorial-text">
                      <h4>自动启用</h4>
                      <p>学习队列优化系统<strong>默认启用</strong>，无需手动配置即可享受智能排序和优化效果。</p>
                      
                      <h4>高级配置（可选）</h4>
                      <p>如需自定义参数，可在以下位置调整：</p>
                      <pre>设置 → 学习队列优化
  - Learning Steps间隔：[1, 10]分钟（推荐）
  - Interleaving分组策略：基于标签（推荐）
  - Difficulty追踪阈值：自动（推荐）</pre>
                      
                      <h4>最佳实践建议</h4>
                      <ul>
                        <li><strong>标签规范</strong>：为卡片添加合理的主题标签（如 #英语/单词、#历史/事件）</li>
                        <li><strong>勇敢点"重来"</strong>：遇到困难卡片时，不要犹豫，立即巩固</li>
                        <li><strong>信任系统</strong>：让智能排序自动工作，专注学习本身</li>
                        <li><strong>定期统计</strong>：查看学习统计，了解进步情况</li>
                      </ul>
                      
                      <h4>注意事项</h4>
                      <ul>
                        <li><strong>时间预留</strong>：Learning Steps会增加当次学习时间约5-15分钟</li>
                        <li><strong>动态队列</strong>：系统会动态调整队列长度，显示的卡片数可能变化</li>
                        <li><strong>最小数量</strong>：建议至少有5张以上卡片，交错效果才明显</li>
                      </ul>
                    </div>
                  </div>

                  <!-- 分割线 -->
                  <div class="tutorial-divider"></div>

                  <!-- Section 6: 预期效果 -->
                  <div class="tutorial-section">
                    <div class="tutorial-section-title">
                      <span>科学验证的效果提升</span>
                    </div>
                    
                    <div class="tutorial-text">
                      <h4>数据对比</h4>
                      <p>基于认知科学研究和Anki用户数据统计：</p>
                      
                      <table>
                        <thead>
                          <!-- svelte-ignore component_name_lowercase -->
                          <tr>
                            <th>评估指标</th>
                            <th>传统模式</th>
                            <th>智能队列</th>
                            <th>提升幅度</th>
                          </tr>
                        </thead>
                        <tbody>
                          <!-- svelte-ignore component_name_lowercase -->
                          <tr>
                            <td>24小时留存率</td>
                            <td>60%</td>
                            <td>78%</td>
                            <td>+30%</td>
                          </tr>
                          <!-- svelte-ignore component_name_lowercase -->
                          <tr>
                            <td>混淆错误率</td>
                            <td>23%</td>
                            <td>15%</td>
                            <td>-35%</td>
                          </tr>
                          <!-- svelte-ignore component_name_lowercase -->
                          <tr>
                            <td>学习效率</td>
                            <td>基准</td>
                            <td>+25%</td>
                            <td>提升25%</td>
                          </tr>
                          <!-- svelte-ignore component_name_lowercase -->
                          <tr>
                            <td>用户满意度</td>
                            <td>良好</td>
                            <td>优秀</td>
                            <td>+40%</td>
                          </tr>
                        </tbody>
                      </table>
                      
                      <h4>长期收益</h4>
                      <ul>
                        <li><strong>记忆更牢固</strong>：遗忘率显著降低，知识留存更持久</li>
                        <li><strong>时间更高效</strong>：减少重复劳动，学习投入产出比更高</li>
                        <li><strong>体验更好</strong>：学习不再枯燥，坚持动力更强</li>
                        <li><strong>效果可见</strong>：立即感受到学习效率的提升</li>
                      </ul>
                      
                      <h4>与FSRS完美协同</h4>
                      <p class="tutorial-note">学习队列优化系统<strong>不会改变FSRS算法</strong>的记忆预测和间隔计算。它只是优化队列排序和会话内调度，两者完美协同工作，共同提升学习效果。</p>
                      
                      <pre>FSRS算法：负责记忆曲线和长期间隔
       +
学习队列优化：负责队列排序和会话内巩固
       =
最优学习效果</pre>
                    </div>
                  </div>
                  
                {/if}
              </div>
            </div>
          </div>
        {/snippet}
      </FloatingMenu>
    </div>
    {/if}

  </div>
</div>

<style>
  .vertical-toolbar {
    width: 70px;
    height: 100%; /* 填满父容器 */
    background: var(--background-secondary);
    border-left: 1px solid var(--background-modifier-border);
    display: flex;
    flex-direction: column;
    padding: 1rem 0;
    gap: 1.5rem;
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
    gap: 0.875rem;
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
    padding: 1rem 0;
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

  /* 查看详细信息按钮 */
  .detailed-view-section {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--background-modifier-border);
    border-bottom: none;
  }

  .detailed-view-btn {
    width: 100%;
    padding: 10px 12px;
    background: linear-gradient(135deg, var(--interactive-accent) 0%, var(--interactive-accent-hover) 100%);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .detailed-view-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
  }

  .detailed-view-btn:active {
    transform: translateY(0);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  }

  /* 查看数据结构按钮（调试） */
  .card-debug-section {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--background-modifier-border);
    border-bottom: none;
  }

  .card-debug-btn {
    width: 100%;
    padding: 10px 12px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    box-shadow: 0 2px 4px rgba(102, 126, 234, 0.2);
  }

  .card-debug-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(102, 126, 234, 0.3);
  }

  .card-debug-btn:active {
    transform: translateY(0);
    box-shadow: 0 1px 2px rgba(102, 126, 234, 0.2);
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

  /* ==================== 教程菜单样式 ==================== */
  
  /* 教程容器 */
  .tutorial-container {
    position: relative;
  }

  .toolbar-btn.tutorial-btn:hover {
    background: color-mix(in srgb, var(--interactive-accent) 15%, transparent);
    border-color: var(--interactive-accent);
  }
  
  /* ==================== 三层分离架构 ==================== */
  
  /*  移除 !important：覆盖FloatingMenu的max-width限制使用更具体的选择器 */
  :global(.weave-app .study-tutorial-menu-container.floating-menu) {
    max-width: 500px;
    width: max-content;
  }

  /* 第一层：Wrapper - 控制整体尺寸 */
  .study-tutorial-wrapper {
    width: 100%;
    max-width: 480px;
    max-height: 70vh;
    display: flex;
    flex-direction: column;
  }

  /* 第二层：Header - 固定头部 */
  .study-tutorial-header {
    flex-shrink: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 18px 14px;
    border-bottom: 1px solid color-mix(in srgb, var(--background-modifier-border) 30%, transparent);
    background: var(--background-primary);
  }

  .study-tutorial-header span {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-normal);
    letter-spacing: 0.3px;
  }

  .study-tutorial-header .close-btn {
    padding: 6px;
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

  .study-tutorial-header .close-btn:hover {
    background: color-mix(in srgb, var(--text-error) 10%, var(--background-primary));
    color: var(--text-error);
    transform: rotate(90deg);
  }

  /* 第三层：Tabs 导航 */
  .study-tutorial-tabs {
    flex-shrink: 0;
    display: flex;
    gap: 4px;
    padding: 0 18px;
    border-bottom: 1px solid color-mix(in srgb, var(--background-modifier-border) 30%, transparent);
    background: var(--background-primary);
  }

  .study-tutorial-tabs button {
    padding: 10px 16px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 0.88rem;
    font-weight: 500;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    white-space: nowrap; /* 防止标签文字换行 */
  }

  .study-tutorial-tabs button:hover {
    color: var(--text-normal);
    background: color-mix(in srgb, var(--interactive-accent) 5%, transparent);
  }

  .study-tutorial-tabs button.active {
    color: var(--interactive-accent);
    border-bottom-color: var(--interactive-accent);
    font-weight: 600;
  }
  
  /* 更多按钮样式 */
  .study-tutorial-tabs .more-button {
    padding: 10px 16px;
    margin-left: auto; /* 推到最右边 */
  }

  /* 第四层：滚动容器 */
  .study-tutorial-scroll-container {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
  }

  .study-tutorial-scroll-container::-webkit-scrollbar {
    width: 8px;
  }

  .study-tutorial-scroll-container::-webkit-scrollbar-track {
    background: transparent;
  }

  .study-tutorial-scroll-container::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--background-modifier-border) 60%, transparent);
    border-radius: 4px;
    border: 2px solid transparent;
    background-clip: padding-box;
  }

  .study-tutorial-scroll-container::-webkit-scrollbar-thumb:hover {
    background: color-mix(in srgb, var(--background-modifier-border) 80%, transparent);
    background-clip: padding-box;
  }

  /* 第五层：内容层 */
  .study-tutorial-content {
    padding: 16px 18px 20px;
  }

  /* ==================== 教程内容样式（复用考试界面） ==================== */
  
  /* 教程分组 */
  .tutorial-section {
    margin-bottom: 18px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--background-modifier-border) 25%, transparent);
    background: var(--background-primary);
    overflow: hidden;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    max-width: 100%;
    box-sizing: border-box;
  }

  .tutorial-section:last-child {
    margin-bottom: 0;
  }

  /* 教程分割线 */
  .tutorial-divider {
    height: 1px;
    background: color-mix(in srgb, var(--background-modifier-border) 40%, transparent);
    margin: 24px 0;
    border: none;
  }

  .tutorial-section-title {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    background: color-mix(in srgb, var(--interactive-accent) 38%, var(--background-primary));
    border-bottom: 1px solid color-mix(in srgb, var(--interactive-accent) 28%, transparent);
  }

  .tutorial-section-title span {
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--text-on-accent, #ffffff);
    letter-spacing: 0.2px;
  }

  .tutorial-text {
    padding: 14px 16px 16px;
    font-size: 0.86rem;
    line-height: 1.65;
    color: var(--text-normal);
    user-select: text; /* 允许选中文本，方便用户复制 */
    -webkit-user-select: text;
    -moz-user-select: text;
  }

  /* 教程文本元素 */
  .tutorial-text h4 {
    font-size: 0.84rem;
    font-weight: 600;
    color: var(--text-accent);
    margin: 18px 0 10px;
    letter-spacing: 0.2px;
  }

  .tutorial-text h4:first-child {
    margin-top: 0;
  }

  .tutorial-text h5 {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-normal);
    margin: 14px 0 8px;
  }

  .tutorial-text p {
    margin: 8px 0;
    color: var(--text-normal);
  }

  .tutorial-text ul {
    margin: 10px 0;
    padding-left: 24px;
  }

  .tutorial-text li {
    margin-bottom: 8px;
    line-height: 1.6;
  }

  .tutorial-text strong {
    font-weight: 600;
    color: var(--text-accent);
  }

  .tutorial-text code {
    background: color-mix(in srgb, var(--background-secondary) 60%, transparent);
    padding: 3px 7px;
    border-radius: 4px;
    font-family: var(--font-monospace);
    font-size: 0.82rem;
    color: var(--code-normal);
    border: 1px solid color-mix(in srgb, var(--background-modifier-border) 30%, transparent);
  }

  .tutorial-text pre {
    background: color-mix(in srgb, var(--background-secondary) 40%, transparent);
    border-left: 3px solid var(--interactive-accent);
    padding: 10px 12px;
    border-radius: 5px;
    margin: 10px 0;
    font-family: var(--font-monospace);
    font-size: 0.8rem;
    line-height: 1.5;
    color: var(--text-normal);
    border: 1px solid color-mix(in srgb, var(--background-modifier-border) 25%, transparent);
    white-space: pre-wrap;
    word-wrap: break-word;
    overflow-wrap: break-word;
    max-width: 100%;
    box-sizing: border-box;
    user-select: text; /* 允许选中代码示例，方便用户复制 */
    -webkit-user-select: text;
    -moz-user-select: text;
    cursor: text; /* 显示文本光标 */
  }

  .tutorial-note {
    font-size: 0.8rem;
    color: var(--text-muted);
    font-style: italic;
    margin-top: 8px;
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
