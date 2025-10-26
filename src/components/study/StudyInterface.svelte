<script lang="ts">
  // ============================================
  // 📦 导入声明区
  // ============================================
  
  // UI组件导入
  import EnhancedButton from "../ui/EnhancedButton.svelte";
  import EnhancedIcon from "../ui/EnhancedIcon.svelte";
  import MarkdownView from "../atoms/MarkdownRenderer.svelte";
  import StatsCards from "./StatsCards.svelte";
  import VerticalToolbar from "./VerticalToolbar.svelte";
  import RatingSection from "./RatingSection.svelte";
  import CardPreview from "./CardPreview.svelte";
  import PreviewContainer from "../preview/PreviewContainer.svelte";

  // 🔒 高级功能限制
  import { PremiumFeatureGuard, PREMIUM_FEATURES } from "../../services/premium/PremiumFeatureGuard";
  import ActivationPrompt from "../premium/ActivationPrompt.svelte";
  import PremiumBadge from "../premium/PremiumBadge.svelte";

  import type { TempFileManager } from "../../services/temp-file-manager";
  import type { Deck } from "../../data/types";
  import type { Card, Rating } from "../../data/types";
  import { CardState } from "../../data/types";
  import type { StudySession } from "../../data/study-types";
  import type { FSRS } from "../../algorithms/fsrs";
  import type { AnkiDataStorage } from "../../data/storage";
  import type AnkiPlugin from "../../main";
  import { generateId } from "../../utils/helpers";
  import { MarkdownRenderer } from "obsidian";
  import { onMount, onDestroy, tick } from "svelte";
  import StudyProgressBar from "./StudyProgressBar.svelte";
  import { StudySessionManager } from "../../services/StudySessionManager";

  import { CardType as PreviewCardType } from "../preview/ContentPreviewEngine";
  import { UnifiedCardType, getCardTypeName } from "../../types/unified-card-types";
  import type { ParseTemplate } from "../../types/newCardParsingTypes";
  import { UI_CONSTANTS } from "../../constants/app-constants";
  import { cardToMarkdown, markdownToCard } from "../../utils/card-markdown-serializer";
  import { CardFormatService } from "../../services/CardFormatService";
  import { AIFormatterService } from "../../services/ai/AIFormatterService";
  import type { FormatRequest } from "../../services/ai/AIFormatterService";
  
  // 🆕 AI格式化功能组件
  import FormatPreviewModal from "./FormatPreviewModal.svelte";
  import CustomFormatActionManager from "./CustomFormatActionManager.svelte";
  import type { FormatPreviewResult, CustomFormatAction } from "../../types/ai-types";

  // 🎯 FSRS6个性化优化系统
  import { RobustPersonalizationManager } from "../../algorithms/optimization/RobustPersonalizationManager";
  
  // 🔄 复习撤销功能
  import { ReviewUndoManager, type ReviewSnapshot } from "../../services/ReviewUndoManager";

  // 👨‍👩‍👧 父子卡片功能
  import { CardRelationService } from "../../services/relation/CardRelationService";
  import { DerivationMethod } from "../../services/relation/types";
  import ChildCardsOverlay from "./ChildCardsOverlay.svelte";
  import UnifiedActionsBar from "./UnifiedActionsBar.svelte";
  import type { SplitCardRequest } from "../../types/ai-types";

  // 🛠️ 学习界面工具函数
  import {
    processClozeText,
    enhanceEmbeds,
    parseCSVLine,
    findColumnIndex,
    clearHoverTooltips,
    attachHoverCleanup,
    removeHoverCleanup,
    setupBlockLinkHandlers
  } from "../../utils/study/studyInterfaceUtils";
  import { processFieldContent } from "../../utils/study/fieldProcessing";
  import { minutesToDays, formatStudyTime } from "../../utils/study/timeCalculation";

  // ============================================
  // 🎯 类型定义与接口
  // ============================================

  interface Props {
    cards: Card[];
    fsrs: FSRS;
    dataStorage: AnkiDataStorage;
    plugin: AnkiPlugin;
    onClose: () => void;
    onComplete: (session: StudySession) => void;
  }

  interface LearningConfig {
    learningSteps: number[];
    relearningSteps: number[];
    graduatingInterval: number;
    easyInterval: number;
  }

  // ============================================
  // 💾 核心状态管理 (43个$state变量)
  // ============================================

  let { cards, fsrs, dataStorage, plugin, onClose, onComplete }: Props = $props();

  // --- 管理器实例 ---
  const sessionManager = StudySessionManager.getInstance();
  const personalizationManager = new RobustPersonalizationManager(dataStorage);
  const premiumGuard = PremiumFeatureGuard.getInstance();
  const reviewUndoManager = new ReviewUndoManager();
  const cardRelationService = new CardRelationService(dataStorage);

  // --- 会话核心状态 ---
  let currentSessionId = $state<string | null>(null);
  let currentCardIndex = $state(0);
  let showAnswer = $state(false);
  let cardStartTime = $state(Date.now());
  let personalizationEnabled = $state(true);

  // --- 数据状态 ---
  let decks = $state<Deck[]>([]);
  let availableTemplates = $state<ParseTemplate[]>([]);

  let fieldTemplates = $state<ParseTemplate[]>([]);
  let learningConfig = $state<LearningConfig | null>(null);
  let currentStudyTime = $state(0);

  // --- 题型与预览状态 ---
  let detectedCardType = $state<UnifiedCardType | null>(null);
  let cardTypeDisplayName = $derived(detectedCardType ? getCardTypeName(detectedCardType) : '未知题型');

  // --- 媒体自动播放状态 ---
  let autoPlayMedia = $state(plugin.settings.mediaAutoPlay?.enabled ?? false);
  let playMediaMode = $state<'first' | 'all'>(plugin.settings.mediaAutoPlay?.mode ?? 'first');
  let playMediaTiming = $state<'cardChange' | 'showAnswer'>(plugin.settings.mediaAutoPlay?.timing ?? 'cardChange');
  let playbackInterval = $state(plugin.settings.mediaAutoPlay?.playbackInterval ?? 2000);

  // --- 父子卡片浮层状态 ---
  let showChildCardsOverlay = $state(false);
  let childCards = $state<Card[]>([]);
  let aiSplitInProgress = $state(false);
  let childCardsOverlayRef: any = $state(null); // 浮层组件引用

  // ============================================
  // 🧮 计算属性 ($derived)
  // ============================================

  // --- 选择题统计 ---
  let currentCardChoiceStats = $derived.by(() => {
    if (!currentCard) return null;
    
    const isChoiceType = detectedCardType === UnifiedCardType.SINGLE_CHOICE || 
                        detectedCardType === UnifiedCardType.MULTIPLE_CHOICE;
    
    if (!isChoiceType) return null;
    
    return currentCard.stats?.choiceStats || null;
  });

  // 实时反应时间计算（仅在显示答案后有效）
  let currentResponseTime = $derived.by(() => {
    if (!showAnswer) return 0;
    return Date.now() - cardStartTime;
  });

  let choiceStatsDisplay = $derived.by(() => {
    if (!currentCardChoiceStats || currentCardChoiceStats.totalAttempts === 0) {
      return null;
    }
    
    const accuracy = Math.round(currentCardChoiceStats.accuracy * 100);
    return {
      accuracy,
      correct: currentCardChoiceStats.correctAttempts,
      total: currentCardChoiceStats.totalAttempts
    };
  });

  // ============================================
  // 🎬 核心业务逻辑
  // ============================================

  // --- 预览系统回调 ---
  function handleCardTypeDetected(cardType: UnifiedCardType): void {
    console.log(`[StudyModal] 检测到卡片题型: ${cardType}`);
    
    // 直接使用统一题型
    detectedCardType = cardType;

    console.log(`[StudyModal] 统一题型: ${detectedCardType} (${cardTypeDisplayName})`);
  }

  function handlePreviewReady(previewData: any): void {
    console.log(`[StudyModal] 预览就绪:`, previewData);

    // 如果预览数据包含题型信息，更新检测结果
    if (previewData?.cardType) {
      detectedCardType = previewData.cardType;
    }
  }

  // --- 错题集管理 ---
  async function handleAddToErrorBook() {
    if (!currentCard) return;

    try {
      // 初始化选择题统计（如果不存在）
      if (!currentCard.stats.choiceStats) {
        currentCard.stats.choiceStats = {
          totalAttempts: 0,
          correctAttempts: 0,
          accuracy: 0,
          averageResponseTime: 0,
          recentAttempts: [],
          isInErrorBook: false,
          errorCount: 0
        };
      }

      // 标记为错题集
      currentCard.stats.choiceStats.isInErrorBook = true;

      // 保存卡片
      await dataStorage.saveCard(currentCard);

      // 触发界面刷新
      cards = [...cards];

      new (window as any).Notice('✅ 已加入错题集');
      console.log('[StudyModal] 卡片已加入错题集:', currentCard.id);
    } catch (error) {
      console.error('[StudyModal] 加入错题集失败:', error);
      new (window as any).Notice('❌ 加入错题集失败');
    }
  }

  async function handleRemoveFromErrorBook() {
    if (!currentCard || !currentCard.stats.choiceStats) return;

    try {
      // 移除错题集标记
      currentCard.stats.choiceStats.isInErrorBook = false;

      // 保存卡片
      await dataStorage.saveCard(currentCard);

      // 触发界面刷新
      cards = [...cards];

      new (window as any).Notice('✅ 已移出错题集');
      console.log('[StudyModal] 卡片已移出错题集:', currentCard.id);
    } catch (error) {
      console.error('[StudyModal] 移出错题集失败:', error);
      new (window as any).Notice('❌ 移出错题集失败');
    }
  }

  // ============================================
  // 👨‍👩‍👧 父子卡片功能
  // ============================================

  /**
   * AI拆分父卡片
   * @param targetCount 目标生成数量，0表示让AI自动决定
   */
  async function handleAISplit(targetCount: number = 0) {
    if (!currentCard || aiSplitInProgress) return;

    try {
      aiSplitInProgress = true;
      new (window as any).Notice('🤖 正在拆分卡片...');

      // 获取AI服务（从AIServiceFactory获取）
      const { AIServiceFactory } = await import('../../services/ai/AIServiceFactory');
      
      // 🎯 使用AI拆分专用提供商，回退逻辑：splittingProvider -> defaultProvider -> 'openai'
      const aiConfig = plugin.settings.aiConfig;
      const provider = aiConfig?.splittingProvider || aiConfig?.defaultProvider || 'openai';
      
      console.log('[AI拆分] 使用提供商:', provider);
      const aiService = AIServiceFactory.createService(provider, plugin);
      
      if (!aiService) {
        throw new Error(`AI服务未配置，请在设置中配置 ${provider} 的API密钥`);
      }

      // 构建拆分请求
      const request: SplitCardRequest = {
        parentCardId: currentCard.id,
        content: {
          front: currentCard.fields?.front || currentCard.content || '',
          back: currentCard.fields?.back || ''
        },
        targetCount: targetCount // 使用传入的数量
      };

      // 调用AI拆分
      const response = await aiService.splitParentCard(request);

      if (!response.success || !response.childCards || response.childCards.length === 0) {
        throw new Error(response.error || '拆分失败');
      }

      // 转换为临时卡片数据（用于预览）
      const tempChildCards: Card[] = response.childCards.map((child: any, index: number) => ({
        id: `temp-${Date.now()}-${index}`,
        uuid: `temp-uuid-${Date.now()}-${index}`,
        deckId: currentCard.deckId,
        templateId: currentCard.templateId,
        type: currentCard.type,
        content: `${child.front}\n\n${child.back}`,
        fields: {
          front: child.front,
          back: child.back
        },
        tags: child.tags || currentCard.tags || [],
        priority: 0,
        fsrs: {
          due: new Date().toISOString(),
          stability: 0,
          difficulty: 0,
          elapsedDays: 0,
          scheduledDays: 0,
          reps: 0,
          lapses: 0,
          state: 0,
          retrievability: 0
        },
        reviewHistory: [],
        stats: {
          totalReviews: 0,
          totalTime: 0,
          averageTime: 0,
          memoryRate: 0
        },
        created: new Date().toISOString(),
        modified: new Date().toISOString()
      }));

      childCards = tempChildCards;
      showChildCardsOverlay = true;

      new (window as any).Notice(`✅ 成功拆分为${childCards.length}张子卡片`);
    } catch (error) {
      console.error('[StudyInterface] AI拆分失败:', error);
      const errorMessage = error instanceof Error ? error.message : '拆分失败';
      new (window as any).Notice(`❌ 拆分失败: ${errorMessage}`);
    } finally {
      aiSplitInProgress = false;
    }
  }

  /**
   * 重新生成子卡片
   * - 如果有选中的卡片：只重新生成选中的部分，未选中的保留
   * - 如果没有选中：全部重新生成
   */
  async function handleRegenerateChildCards() {
    if (!currentCard || !childCardsOverlayRef) return;

    try {
      // 获取选中的卡片ID
      const selectedIds = childCardsOverlayRef.getSelectedCardIds() || [];
      const hasSelection = selectedIds.length > 0;

      if (hasSelection) {
        // 有选中：只重新生成选中的，保留未选中的
        const unselectedCards = childCards.filter(card => !selectedIds.includes(card.id));
        const selectedCount = selectedIds.length;
        
        new (window as any).Notice(`🔄 正在重新生成 ${selectedCount} 张选中的卡片...`);
        
        // 临时保存未选中的卡片
        const preservedCards = [...unselectedCards];
        
        // 清空子卡片列表（用于重新生成）
        childCards = [];
        
        // 清空选中状态
        childCardsOverlayRef.clearSelection();
        
        // 仅重新生成选中的数量
        await handleAISplit(selectedCount);
        
        // 等待AI生成完成后，将未选中的卡片添加回来
        await tick(); // 等待响应式更新
        
        if (childCards.length > 0) {
          // 合并：保留的卡片 + 新生成的卡片
          childCards = [...preservedCards, ...childCards];
          new (window as any).Notice(`✅ 已重新生成 ${selectedCount} 张卡片，保留了 ${preservedCards.length} 张`);
        }
      } else {
        // 无选中：全部重新生成
        const totalCount = childCards.length;
        
        new (window as any).Notice(`🔄 正在重新生成全部 ${totalCount} 张卡片...`);
        
        // 清空当前子卡片
        childCards = [];
        
        // 清空选中状态
        childCardsOverlayRef.clearSelection();
        
        // 重新拆分（使用原数量）
        await handleAISplit(totalCount > 0 ? totalCount : 0);
      }
    } catch (error) {
      console.error('[StudyInterface] 重新生成失败:', error);
      new (window as any).Notice('❌ 重新生成失败');
    }
  }

  /**
   * 保存选中的子卡片到子牌组
   */
  async function handleSaveSelectedChildCards() {
    if (!currentCard || childCards.length === 0) return;

    try {
      // 获取选中的卡片ID
      const selectedIds = childCardsOverlayRef?.getSelectedCardIds?.() || [];
      
      if (selectedIds.length === 0) {
        new (window as any).Notice('⚠️ 请先选择要收入的卡片');
        return;
      }

      // 过滤出选中的卡片
      const selectedCards = childCards.filter(card => selectedIds.includes(card.id));

      new (window as any).Notice('💾 正在保存子卡片...');

      // 获取AI服务重新生成完整的子卡片数据
      const childCardsData = selectedCards.map(card => ({
        content: card.content,
        fields: card.fields,
        tags: card.tags
      }));

      // 创建子卡片
      const createdChildCards = await cardRelationService.createChildCards(
        currentCard,
        childCardsData,
        DerivationMethod.AI_SPLIT
      );

      // 保存到子牌组
      const savedCount = await cardRelationService.saveChildCardsToDeck(
        createdChildCards,
        currentCard
      );

      new (window as any).Notice(`✅ 成功收入${savedCount}张子卡片`);

      // 关闭浮层
      showChildCardsOverlay = false;
      childCards = [];
      
      // 清空选中状态
      if (childCardsOverlayRef?.clearSelection) {
        childCardsOverlayRef.clearSelection();
      }
    } catch (error) {
      console.error('[StudyInterface] 保存子卡片失败:', error);
      const errorMessage = error instanceof Error ? error.message : '保存失败';
      new (window as any).Notice(`❌ 保存失败: ${errorMessage}`);
    }
  }

  /**
   * 关闭子卡片浮层
   */
  function handleCloseChildOverlay() {
    showChildCardsOverlay = false;
    childCards = [];
    
    // 清空选中状态
    if (childCardsOverlayRef?.clearSelection) {
      childCardsOverlayRef.clearSelection();
    }
  }


  // --- UI控制状态 ---
  let showSidebar = $state(true);
  let statsCollapsed = $state(true);
  let showEditModal = $state(false);
  
  // 🎯 响应式侧边栏紧凑模式控制
  let sidebarCompactMode = $state(false);
  let sidebarResizeObserver: ResizeObserver | null = null;
  let checkTimeoutId: number | null = null; // 防抖定时器
  let lastCheckResult = $state<boolean | null>(null); // 缓存上次检测结果
  let lastContentSize = { width: 0, height: 0 }; // 缓存上次内容尺寸，防止ResizeObserver无限触发
  
  // 🎯 侧边栏紧凑模式设置：auto(自动) | fixed(固定显示图标+名称)
  let sidebarCompactModeSetting = $state<'auto' | 'fixed'>('auto');
  
  // 🔍 从 localStorage 恢复紧凑模式设置
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('tuanki-sidebar-compact-mode-setting');
      if (saved && (saved === 'auto' || saved === 'fixed')) {
        sidebarCompactModeSetting = saved as 'auto' | 'fixed';
      }
    } catch (error) {
      console.warn('[StudyInterface] 恢复紧凑模式设置失败:', error);
    }
  }
  
  // 🔍 DEBUG: 监控showEditModal变化
  $effect(() => {
    console.log('[StudyInterface] showEditModal 变化:', showEditModal);
  });
  
  // 🔍 监听侧边栏显示/隐藏状态变化，展开时重新检测
  $effect(() => {
    if (showSidebar && sidebarCompactModeSetting === 'auto') {
      // 侧边栏展开时，延迟重新检测以确保DOM已更新
      setTimeout(() => {
        checkSidebarScrollable();
      }, 100);
    }
  });
  
  // 🆕 AI格式化功能状态
  let showFormatPreview = $state(false);
  let formatPreviewResult = $state<FormatPreviewResult | null>(null);
  let selectedFormatActionName = $state("");
  let showFormatManager = $state(false);

  // --- 高级功能状态 ---
  let isPremium = $state(false);
  let showActivationPrompt = $state(false);

  // 订阅高级版状态
  $effect(() => {
    const unsubscribe = premiumGuard.isPremiumActive.subscribe(value => {
      isPremium = value;
    });
    return unsubscribe;
  });



  // 注：挖空处理、Hover清理等工具函数已提取到utils/study/studyInterfaceUtils.ts

  // 从 ModernCardTable.svelte 移植并适配的函数 - 增强字段视觉分隔 + 挖空处理 + 错误处理
  function getFieldContent(card: Card, side: 'front' | 'back'): string {
    try {
      // 验证输入参数
      if (!card) {
        console.warn('getFieldContent: card is null/undefined');
        return '<div class="field-container error-field"><div class="field-label">错误</div><div class="field-content">卡片数据无效</div></div>';
      }

      if (!card.id) {
        console.warn('getFieldContent: card has no id', card);
        return '<div class="field-container error-field"><div class="field-label">错误</div><div class="field-content">卡片ID无效</div></div>';
      }

      // 确保 fields 存在，即使为空对象
      const fields = card.fields || {};
      console.log(`getFieldContent: card ${card.id}, side ${side}, fields:`, fields);

      // 验证字段数据类型
      if (typeof fields !== 'object' || Array.isArray(fields)) {
        console.error('getFieldContent: invalid fields structure', { cardId: card.id, fields });
        return '<div class="field-container error-field"><div class="field-label">错误</div><div class="field-content">字段数据结构无效</div></div>';
      }

      // 查找模板，使用新的模板系统
      let template = null;
      try {
        template = availableTemplates?.find(t => t && t.id === card.templateId) || null;
      } catch (templateError) {
        console.error('getFieldContent: template search failed', templateError);
      }

      // 验证通过后，模板必定存在
      if (!template) {
        console.log(`getFieldContent: no template found for ${card.templateId}, using default fields`);
        return handleDefaultFieldContent(fields, side);
      }

      // 使用模板处理字段
      return handleTemplateFieldContent(fields, template, side);

    } catch (error) {
      console.error('getFieldContent: unexpected error', {
        error: error instanceof Error ? error.message : String(error),
        cardId: card?.id || 'unknown',
        side
      });

      return `<div class="field-container error-field">
                <div class="field-label">渲染错误</div>
                <div class="field-content">字段内容处理失败，请刷新重试</div>
              </div>`;
    }
  }

  // 处理默认字段内容 - 从getFieldContent中提取出来提高可维护性
  function handleDefaultFieldContent(fields: Record<string, any>, side: 'front' | 'back'): string {
    try {
      // 尝试多种字段名称的组合
      let content = '';
      if (side === 'front') {
        content = fields['question'] || fields['front'] || fields['prompt'] || '';
      } else {
        content = fields['answer'] || fields['back'] || fields['response'] || '';
      }

      console.log(`handleDefaultFieldContent: default field content for ${side}:`, content);

      // 验证内容类型
      if (content && typeof content !== 'string') {
        console.warn('handleDefaultFieldContent: content is not string', { content, type: typeof content });
        content = String(content);
      }

      if (!content || !content.trim()) {
        // 如果默认字段也没有内容，显示所有可用字段
        const availableFields = Object.keys(fields).filter(k => {
          const value = fields[k];
          return !['templateId', 'templateName', 'notes'].includes(k) &&
                 value &&
                 typeof value === 'string' &&
                 value.trim();
        });

        if (availableFields.length > 0) {
          console.log(`handleDefaultFieldContent: using first available field: ${availableFields[0]}`);
          content = String(fields[availableFields[0]]);
        } else {
          console.log('handleDefaultFieldContent: no content found in any field');
          return `<div class="field-container error-field">
                    <div class="field-label">无内容</div>
                    <div class="field-content">该卡片没有${side === 'front' ? '问题' : '答案'}内容</div>
                  </div>`;
        }
      }

      // 应用挖空处理，传递showAnswer状态
      const processedContent = processClozeText(content, side, showAnswer);

      // 为默认字段添加标签
      const label = side === 'front' ? '问题' : '答案';
      return `<div class="field-container default-field">
                <div class="field-label">${label}</div>
                <div class="field-content">${processedContent}</div>
              </div>`;

    } catch (error) {
      console.error('handleDefaultFieldContent: error processing default fields', error);
      return `<div class="field-container error-field">
                <div class="field-label">处理错误</div>
                <div class="field-content">默认字段处理失败</div>
              </div>`;
    }
  }
  // 处理模板字段内容 - 从getFieldContent中提取出来提高可维护性
  function handleTemplateFieldContent(fields: Record<string, any>, template: any, side: 'front' | 'back'): string {
    try {
      // 验证模板结构
      if (!template || !template.fields || !Array.isArray(template.fields)) {
        console.error('handleTemplateFieldContent: invalid template structure', template);
        return handleDefaultFieldContent(fields, side);
      }

      console.log(`handleTemplateFieldContent: using template ${template.name}`);

      // 根据模板组合字段，为每个字段创建独立的视觉容器
      const relevantFields = template.fields
        .filter((f: any) => {
          try {
            return f && f.type === 'field' && (f.side === side || f.side === 'both');
          } catch (error) {
            console.warn('handleTemplateFieldContent: field filter error', error);
            return false;
          }
        })
        .filter((f: any) => {
          try {
            const field = f as import('../../data/template-types').FieldTemplateField;
            const fieldValue = fields[field.key];
            const hasContent = fieldValue && typeof fieldValue === 'string' && fieldValue.trim();
            console.log(`handleTemplateFieldContent: field ${field.key} has content:`, hasContent);
            return hasContent;
          } catch (error) {
            console.warn('handleTemplateFieldContent: field content check error', error);
            return false;
          }
        }) // 过滤掉空值或未定义的字段
        .map((f: any) => {
          try {
            const field = f as import('../../data/template-types').FieldTemplateField;
            const content = String(fields[field.key] || '');
            const label = field.name || field.key;

            // 应用挖空处理，传递showAnswer状态
            const processedContent = processClozeText(content, side, showAnswer);

            return `<div class="field-container template-field" data-field-key="${field.key}">
                      <div class="field-label">${label}</div>
                      <div class="field-content">${processedContent}</div>
                    </div>`;
          } catch (error) {
            console.error('handleTemplateFieldContent: field mapping error', error);
            return '';
          }
        })
        .filter(Boolean); // 过滤掉空字符串

      console.log(`handleTemplateFieldContent: found ${relevantFields.length} relevant fields for ${side}`);

      if (relevantFields.length === 0) {
        console.log(`handleTemplateFieldContent: no relevant fields found for ${side}, using fallback`);
        return handleFallbackFieldContent(fields, side);
      }

      return relevantFields.join('');

    } catch (error) {
      console.error('handleTemplateFieldContent: unexpected error', error);
      return handleDefaultFieldContent(fields, side);
    }
  }

  // 处理降级字段内容 - 当模板字段都为空时使用
  function handleFallbackFieldContent(fields: Record<string, any>, side: 'front' | 'back'): string {
    try {
      // 如果模板中没有匹配的字段，显示所有可用字段
      const availableFields = Object.keys(fields).filter(k => {
        try {
          const value = fields[k];
          return !['templateId', 'templateName', 'notes'].includes(k) &&
                 value &&
                 typeof value === 'string' &&
                 value.trim();
        } catch (error) {
          console.warn('handleFallbackFieldContent: field check error', error);
          return false;
        }
      });

      if (availableFields.length > 0) {
        return availableFields.map(key => {
          try {
            const content = String(fields[key]);
            const processedContent = processClozeText(content, side, showAnswer);
            return `<div class="field-container fallback-field" data-field-key="${key}">
                      <div class="field-label">${key}</div>
                      <div class="field-content">${processedContent}</div>
                    </div>`;
          } catch (error) {
            console.error('handleFallbackFieldContent: field processing error', error);
            return '';
          }
        }).filter(Boolean).join('');
      } else {
        return `<div class="field-container error-field">
                  <div class="field-label">无内容</div>
                  <div class="field-content">该卡片没有可显示的${side === 'front' ? '问题' : '答案'}内容</div>
                </div>`;
      }
    } catch (error) {
      console.error('handleFallbackFieldContent: unexpected error', error);
      return `<div class="field-container error-field">
                <div class="field-label">处理错误</div>
                <div class="field-content">降级字段处理失败</div>
              </div>`;
    }
  }

  // enhanceEmbeds已提取到utils/study/studyInterfaceUtils.ts

  // Handle block link click - navigate to Obsidian file and block with highlighting
  function handleBlockLinkClick(blockLink: string) {
    try {
      // Parse block link format: [[filename#^block-id]] or [[filename#^block-id|alias]]
      const match = blockLink.match(/\[\[([^#]+)#\^([^|\]]+)(?:\|[^\]]+)?\]\]/);
      if (!match) {
        console.log('Invalid block link format:', blockLink);
        new (window as any).Notice('无效的块链接格式');
        return;
      }

      const [, fileName, blockId] = match;

      // Find the file
      const files = plugin.app.vault.getMarkdownFiles();
      const file = files.find(f => f.basename === fileName || f.name === fileName + '.md');

      if (!file) {
        console.log('File not found:', fileName);
        new (window as any).Notice(`文件未找到: ${fileName}`);
        return;
      }

      // Open the file and navigate to the block with enhanced targeting
      plugin.app.workspace.openLinkText(file.path, '', true).then(async () => {
        // Wait a bit longer to ensure file is fully loaded
        setTimeout(async () => {
          const activeView = plugin.app.workspace.getActiveViewOfType('markdown' as any);
          if (activeView && (activeView as any).editor) {
            const editor = (activeView as any).editor;

            try {
              // Read file content to find the exact block position
              const content = await plugin.app.vault.read(file);
              const lines = content.split('\n');

              let targetLine = -1;
              let blockStartLine = -1;
              let blockContent = '';

              // Find the line with the block reference
              for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.includes(`^${blockId}`)) {
                  targetLine = i;

                  // Try to find the start of the block content
                  for (let j = i; j >= 0; j--) {
                    if (lines[j].trim() && !lines[j].includes(`^${blockId}`)) {
                      blockStartLine = j;
                      break;
                    }
                  }

                  // Extract block content for highlighting
                  if (blockStartLine >= 0) {
                    const contentLines = [];
                    for (let k = blockStartLine; k <= i; k++) {
                      const lineText = lines[k].replace(/\s*\^[a-zA-Z0-9-]+\s*$/, '').trim();
                      if (lineText) {
                        contentLines.push(lineText);
                      }
                    }
                    blockContent = contentLines.join(' ');
                  }
                  break;
                }
              }

              if (targetLine >= 0) {
                // Navigate to the target line
                const cursorLine = blockStartLine >= 0 ? blockStartLine : targetLine;
                editor.setCursor({ line: cursorLine, ch: 0 });
                editor.scrollIntoView({
                  from: { line: cursorLine, ch: 0 },
                  to: { line: targetLine, ch: lines[targetLine].length }
                });

                // Highlight the content if we found it
                if (blockStartLine >= 0 && blockContent) {
                  // Select the block content for visual feedback
                  const startCh = 0;
                  const endLine = targetLine;
                  const endCh = lines[targetLine].replace(/\s*\^[a-zA-Z0-9-]+\s*$/, '').length;

                  editor.setSelection(
                    { line: blockStartLine, ch: startCh },
                    { line: endLine, ch: endCh }
                  );

                  // Clear selection after a moment to show highlight effect
                  setTimeout(() => {
                    editor.setCursor({ line: cursorLine, ch: 0 });
                  }, 1000);

                  new (window as any).Notice(`已定位到块内容: ${blockContent.slice(0, 50)}${blockContent.length > 50 ? '...' : ''}`);
                } else {
                  new (window as any).Notice('已定位到块引用位置');
                }
              } else {
                console.log(`Block reference ^${blockId} not found in file`);
                new (window as any).Notice(`未找到块引用: ^${blockId}`);
              }
            } catch (readError) {
              console.error('Error reading file content:', readError);
              new (window as any).Notice('读取文件内容时出错');
            }
          } else {
            console.log('Could not access markdown editor');
            new (window as any).Notice('无法访问Markdown编辑器');
          }
        }, 200);
      }).catch(error => {
        console.error('Error opening file:', error);
        new (window as any).Notice('打开文件时出错');
      });

    } catch (error) {
      console.error('Error handling block link click:', error);
      new (window as any).Notice('处理块链接时出错');
    }
  }

  // --- 编辑器状态 ---
  let tempFileManager: TempFileManager | null = $state(null);
  let tempFileUnavailable = $state(false);
  let editCleanupFn: (() => void) | null = $state(null);
  let isClozeMode = $state(false);
  let inlineEditorContainer: HTMLDivElement | null = $state(null);

  // 初始化临时文件管理器和模板数据
  onMount(async () => {
    try {
      const { TempFileManager } = await import("../../services/temp-file-manager");
      tempFileManager = new TempFileManager(plugin);

      // 加载模板数据
      await loadTemplateData();
    } catch (error) {
      console.error('Failed to initialize temp file manager:', error);
    }
  });

  // 加载模板数据
  async function loadTemplateData() {
    try {
      // 从插件设置中获取模板数据
      const settings = plugin.settings;
      if (settings?.simplifiedParsing?.templates) {
        availableTemplates = settings.simplifiedParsing.templates;
        fieldTemplates = settings.simplifiedParsing.templates; // 同步更新 fieldTemplates
        console.log('[StudyModal] 已加载模板数据:', availableTemplates.length, '个模板');
      } else {
        console.warn('[StudyModal] 未找到模板数据');
        availableTemplates = [];
        fieldTemplates = [];
      }
    } catch (error) {
      console.error('[StudyModal] 加载模板数据失败:', error);
      availableTemplates = [];
      fieldTemplates = [];
    }
  }

  // --- 学习会话数据 ---
  let session = $state<StudySession>({
    id: generateId(),
    deckId: cards[0]?.deckId || "",
    startTime: new Date(),
    cardsReviewed: 0,
    newCardsLearned: 0,
    correctAnswers: 0,
    totalTime: 0,
    cardReviews: []
  });

  // 牌组设置缓存
  // --- 牌组设置 ---
  let deckSettingsMap = $state(new Map<string, any>());

  // 使用 $derived 实现即时响应的状态管理
  let currentCard = $derived.by(() => {
    if (Array.isArray(cards) && currentCardIndex >= 0 && currentCardIndex < cards.length) {
      const card = cards[currentCardIndex];
      // 添加调试日志
      if (plugin?.settings?.enableDebugMode) {
        console.debug('[StudyModal] currentCard updated:', {
          cardId: card?.id,
          currentCardIndex,
          cardsLength: cards.length
        });
      }
      return card;
    }
    return undefined;
  });

  let currentIndexDisplay = $derived.by(() => {
    return cards.length > 0 ? Math.min(currentCardIndex + 1, cards.length) : 0;
  });

  let remainingCards = $derived.by(() => {
    return Math.max(0, cards.length - currentCardIndex);
  });

  let progress = $derived.by(() => {
    if (cards.length === 0) return 100;
    const displayIndex = currentIndexDisplay;
    const ratio = displayIndex / cards.length;
    return Math.max(0, Math.min(100, ratio * 100));
  });

  let currentDeckName = $derived.by(() => {
    const card = currentCard;
    if (card?.deckId) {
      const deck = decks.find(x => x.id === card.deckId);
      return deck?.name || "";
    } else {
      const deck = decks.find(x => x.id === session.deckId);
      return deck?.name || "";
    }
  });
  
  // 🆕 获取自定义格式化功能列表
  const customFormatActions = $derived(
    plugin.settings.aiConfig?.customFormatActions || []
  );
  
  // 🔄 获取可撤销次数
  let undoCount = $state(0);
  
  // 更新撤销计数（需要手动触发）
  function updateUndoCount() {
    undoCount = reviewUndoManager.getUndoCount();
  }

  // 计时器状态
  let currentCardTime = $state(0);
  let averageTime = $state(0);

  // 进度条刷新触发器
  let progressBarRefreshTrigger = $state(0);

  // 独立的学习配置更新 $effect
  $effect(() => {
    const card = currentCard;
    const did = card?.deckId || "";
    const deckCfg = deckSettingsMap.get(did) || {};
    const globalCfg = (plugin as any)?.settings || {};
    
    learningConfig = {
      learningSteps: deckCfg.learningSteps ?? globalCfg.learningSteps ?? [1, 10],
      relearningSteps: deckCfg.relearningSteps ?? [10],
      graduatingInterval: deckCfg.graduatingInterval ?? globalCfg.graduatingInterval ?? 1,
      easyInterval: deckCfg.easyInterval ?? 4
    };
  });

  // 学习会话管理 - 当卡片变化时创建新会话
  $effect(() => {
    const card = currentCard;
    if (card && card.id) {
      // 清理旧会话
      if (currentSessionId) {
        sessionManager.dispose(currentSessionId);
      }
      // 创建新会话
      currentSessionId = sessionManager.createSession(card);
    }
  });

  // 单独的 effect 来更新学习时间 - 简化为直接更新
  $effect(() => {
    currentStudyTime = showAnswer ? Date.now() - cardStartTime : 0;
  });

  // 移除重复的卡片时间更新effect，避免与定时器冲突
  // currentCardTime 现在只在定时器中更新

  // 单独的 effect 来更新平均时间
  $effect(() => {
    if (session.cardReviews.length === 0) {
      averageTime = 0;
    } else {
      const totalTime = session.cardReviews.reduce((sum, review) => sum + review.responseTime, 0);
      averageTime = totalTime / session.cardReviews.length;
    }
  });

  // 调试日志工具已移除，使用console.log直接输出




  // 模板驱动的预览字段生成 - 已被新系统替代
  function handleTemplateMenuPosition() {
    try {
      // 使用实际宽度再次精确定位（始终显示在按钮左侧，避免遮挡功能键）
      if (lastTemplateAnchor && templateMenuEl) {
        const width = templateMenuEl.offsetWidth || UI_CONSTANTS.ESTIMATED_WIDTH;
        const height = templateMenuEl.offsetHeight || 200;

        // 水平定位：确保在按钮左侧且不遮挡其他功能键
        const candidateLeft = lastTemplateAnchor.left - width - UI_CONSTANTS.GAP;
        const safeLeft = Math.max(8, Math.min(candidateLeft, window.innerWidth - width - 8));
        templateMenuLeft = Math.round(safeLeft);

        // 垂直定位：避免遮挡上下功能键，优先向上展开
        const buttonCenterY = lastTemplateAnchor.top + lastTemplateAnchor.height / 2;
        const BUTTON_HEIGHT = 48; // 功能键高度估算
        const BUTTON_GAP = 8;     // 功能键间距

        // 尝试向上展开（菜单底部对齐按钮中心）
        let candidateTop = buttonCenterY - height + BUTTON_HEIGHT / 2;

        // 如果向上空间不足，改为向下展开
        if (candidateTop < 12) {
          candidateTop = buttonCenterY - BUTTON_HEIGHT / 2;
        }

        // 最终安全边界检查
        const safeTop = Math.max(12, Math.min(candidateTop, window.innerHeight - height - 12));
        templateMenuTop = Math.round(safeTop);
      }

      console.log(`[StudyModal] 显示模板列表，共 ${templateList.length} 个模板`, {
        anchorRect: lastTemplateAnchor,
        left: templateMenuLeft,
        top: templateMenuTop
      });
    } catch (error) {
      console.error('[StudyModal] 获取模板列表失败:', error);
      templateList = [];
      showTemplateList = true;
    }
  }

  function handleCloseTemplateList() {
    showTemplateList = false;
  }

  // 处理模板选择
  function handleTemplateSelect(template: ParseTemplate) {
    console.log('选择模板:', template.name);
    // 这里可以添加模板切换逻辑
    showTemplateList = false;
    new (window as any).Notice(`已选择模板: ${template.name}`);
  }

  function getCurrentTemplateInfo() {
    if (!currentCard) return null;

    try {
      // 使用新模板系统
      const template = availableTemplates?.find(t => t && t.id === currentCard.templateId);

      if (template && template.fields) {
        const frontFields = template.fields.filter((f: any) =>
          f.name && (f.name.toLowerCase().includes('front') || f.name.toLowerCase().includes('question'))
        ).length;
        const backFields = template.fields.filter((f: any) =>
          f.name && (f.name.toLowerCase().includes('back') || f.name.toLowerCase().includes('answer'))
        ).length;

        return {
          template,
          frontFieldCount: frontFields,
          backFieldCount: backFields
        };
      }
    } catch (error) {
      console.error('[StudyModal] 获取当前模板信息失败:', error);
    }

    return null;
  }

  // 选择题状态管理函数已移除（选择题功能暂不支持）

  // 热重载测试注释

  // 响应式刷新机制 - 确保界面状态与数据同步
  // --- 刷新触发器 ---
  let refreshTrigger = $state(0);

  function forceRefresh() {
    refreshTrigger++;
    // 触发PreviewContainer重新渲染
    console.log('强制刷新界面，触发器:', refreshTrigger);
  }

  // 🔥 已禁用传统渲染逻辑 - 监听刷新触发器，确保界面更新
  $effect(() => {
    if (refreshTrigger > 0) {
      // 🔥 新系统：PreviewContainer会自动处理刷新，无需手动调用renderMarkdown
      console.log('[StudyModal] 刷新触发，PreviewContainer会自动更新');
    }
  });

  // 学习进度实时更新机制 - 移除重复的progress更新避免循环
  let progressUpdateInterval: ReturnType<typeof setInterval> | null = null;

  $effect(() => {
    // 每秒更新一次学习时间统计（不更新progress，避免与主effect冲突）
    progressUpdateInterval = setInterval(() => {
      if (!showEditModal && currentCard) {
        // 只更新时间相关的状态，不更新progress
        currentCardTime = Date.now() - cardStartTime;

        // 更新会话总时间
        session.totalTime = Math.floor((Date.now() - session.startTime.getTime()) / 1000);
      }
    }, 1000);

    return () => {
      if (progressUpdateInterval) {
        clearInterval(progressUpdateInterval);
      }
    };
  });

  // --- 模板相关状态 ---
  let showTemplateList = $state(false);
  let templateMenuTop = $state(0);
  let templateMenuLeft = $state(0);
  let templateMenuEl: HTMLDivElement | null = $state(null);
  let lastTemplateAnchor: DOMRect | null = $state(null);
  let templateList = $state<ParseTemplate[]>([]);
  // 载入牌组设置（仅在组件挂载时执行一次）
  let decksLoaded = false;
  $effect(() => {
    if (decksLoaded) return;

    (async () => {
      try {
        const loadedDecks = await dataStorage.getDecks();
        const map = new Map<string, any>();
        for (const d of loadedDecks) map.set(d.id, d.settings);
        deckSettingsMap = map;
        // 载入牌组列表供编辑模态使用
        decks = loadedDecks;
        decksLoaded = true;
      } catch (e) {
        console.warn('加载牌组设置失败', e);
      }
    })();
  });

  // minutesToDays已从utils/study/timeCalculation.ts导入

  function applyLearningScheduling(prevState: number, rating: Rating, updatedFsrsCard: any, card: Card) {
    const deckSettings = deckSettingsMap.get(card.deckId);
    const globalSettings = plugin.settings;
    const learningSteps: number[] = deckSettings?.learningSteps ?? globalSettings.learningSteps ?? [1, 10];
    const relearningSteps: number[] = deckSettings?.relearningSteps ?? [10];
    const graduatingInterval: number = deckSettings?.graduatingInterval ?? globalSettings.graduatingInterval ?? 1;
    const easyInterval: number = deckSettings?.easyInterval ?? 4;
    
    // 从SessionManager读取learningStepIndex（不再从card.fields读取）
    const sessionState = currentSessionId ? sessionManager.getSessionState(currentSessionId) : null;
    let stepIndex: number = sessionState?.learningStepIndex ?? 0;
    
    const isNewOrLearning = prevState === CardState.New || prevState === CardState.Learning;
    const isRelearning = prevState === CardState.Relearning;

    const steps = isRelearning ? relearningSteps : learningSteps;
    const nextStepDays = (idx: number) => minutesToDays(steps[Math.min(idx, steps.length - 1)] ?? 1);

    const now = new Date();
    const setDueAfterDays = (days: number) => {
      updatedFsrsCard.scheduledDays = Math.max(0, days);
      const ms = Math.round(days * 24 * 60 * 60 * 1000);
      updatedFsrsCard.due = new Date(now.getTime() + ms);
    };

    if (isNewOrLearning || isRelearning) {
      switch (rating) {
        case 1: // Again
          stepIndex = 0;
          setDueAfterDays(nextStepDays(stepIndex));
          updatedFsrsCard.state = isNewOrLearning ? CardState.Learning : CardState.Relearning;
          break;
        case 2: // Hard
          setDueAfterDays(nextStepDays(stepIndex));
          updatedFsrsCard.state = isNewOrLearning ? CardState.Learning : CardState.Relearning;
          stepIndex = Math.min(stepIndex + 1, Math.max(steps.length - 1, 0));
          break;
        case 3: // Good
          stepIndex += 1;
          if (stepIndex < steps.length) {
            setDueAfterDays(nextStepDays(stepIndex));
            updatedFsrsCard.state = isNewOrLearning ? CardState.Learning : CardState.Relearning;
          } else {
            // 毕业到复习
            setDueAfterDays(Math.max(1, graduatingInterval));
            updatedFsrsCard.state = CardState.Review;
            stepIndex = 0;
          }
          break;
        case 4: // Easy
          setDueAfterDays(Math.max(1, easyInterval));
          updatedFsrsCard.state = CardState.Review;
          stepIndex = 0;
          break;
      }
      // 更新步骤索引到SessionManager（不再保存到card.fields）
      if (currentSessionId) {
        sessionManager.updateStepIndex(currentSessionId, stepIndex);
      }
    }
  }

  // 判断事件目标是否在可编辑区域（输入框、contenteditable 或 CodeMirror 编辑器内）
  function isEditableTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    if (!element) return false;
    return Boolean(
      element.closest(
        'input, textarea, select, [contenteditable=""], [contenteditable="true"], .cm-editor, .cm-content'
      )
    );
  }

  // 快捷键处理（受设置控制）
  function handleKeyPress(event: KeyboardEvent) {
    if (!plugin.settings.enableShortcuts) return;
    // 当编辑模态窗打开时，暂停学习模态的快捷键处理，避免冲突
    if (showEditModal) return;
    if (!currentCard) return;

    // 当焦点在可编辑控件或 CodeMirror 内时，放行按键（例如空格键输入）
    if (isEditableTarget(event.target) || isEditableTarget(document.activeElement)) return;

    switch (event.key) {
      case ' ':
      case 'Enter':
      case 'NumpadEnter':
        event.preventDefault();
        if (!showAnswer) {
          showAnswerCard();
        }
        break;
      case '1':
      case 'Numpad1':
        if (showAnswer) {
          event.preventDefault();
          rateCard(1);
        }
        break;
      case '2':
      case 'Numpad2':
        if (showAnswer) {
          event.preventDefault();
          rateCard(2);
        }
        break;
      case '3':
      case 'Numpad3':
        if (showAnswer) {
          event.preventDefault();
          rateCard(3);
        }
        break;
      case '4':
      case 'Numpad4':
        if (showAnswer) {
          event.preventDefault();
          rateCard(4);
        }
        break;
      case 'Escape':
        event.preventDefault();
        handleClose();
        break;
      // 新增快捷键
      case 'e':
      case 'E':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          handleToggleEdit();
        }
        break;
      case 'd':
      case 'D':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          handleDeleteCard();
        }
        break;
      case 's':
      case 'S':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          showSidebar = !showSidebar;
        }
        break;
      case 'r':
      case 'R':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          forceRefresh();
          try {
            new (window as any).Notice('界面已刷新');
          } catch {
            console.log('界面已刷新');
          }
        }
        break;
    }
  }

  // 显示答案
  /**
   * 显示当前卡片的答案
   * 
   * 功能：
   * - 切换showAnswer状态
   * - 触发PreviewContainer重新渲染
   * - 启用评分按钮
   * - 🔥 强制触发媒体自动播放（播放背面内容）
   */
  function showAnswerCard() {
    showAnswer = true;
    cardStartTime = Date.now();

    // 🎵 自动播放媒体文件
    // 🔥 关键改进：无论时机设置如何，都在显示答案时触发一次
    // 这样可以确保用户在正面停留时间长后，点击背面仍能播放背面的音频
    if (autoPlayMedia) {
      console.log('[StudyInterface] 🎵 显示答案，触发背面内容自动播放');
      // 使用 'callback' 触发方式，优先级高
      autoPlayMediaFiles('callback');
    }
  }

  // 撤销显示答案 - 回到隐藏答案状态
  function undoShowAnswer() {
    showAnswer = false;
    cardStartTime = Date.now(); // 重置计时
    console.log('[StudyModal] 撤销显示答案，返回预览状态');
  }

  // 🔄 撤销上一次评分
  /**
   * 撤销最后一次评分操作
   * 
   * 功能：
   * - 从撤销栈获取快照
   * - 恢复卡片FSRS数据、reviewHistory、stats
   * - 恢复会话统计
   * - 返回上一张卡片（currentCardIndex--）
   * - 保存到数据库
   */
  async function handleUndoReview() {
    const snapshot = reviewUndoManager.undo();
    
    if (!snapshot) {
      new (window as any).Notice('没有可撤销的操作');
      console.warn('[StudyModal] 撤销栈为空');
      return;
    }
    
    try {
      console.log('[StudyModal] 开始撤销评分:', {
        cardId: snapshot.cardId,
        cardIndex: snapshot.cardIndex,
        rating: snapshot.reviewInfo.rating
      });
      
      // 恢复卡片索引
      currentCardIndex = snapshot.cardIndex;
      
      // 等待currentCard更新
      await tick();
      
      if (!currentCard || currentCard.id !== snapshot.cardId) {
        throw new Error('卡片索引恢复失败');
      }
      
      // 恢复卡片数据
      currentCard.fsrs = JSON.parse(JSON.stringify(snapshot.cardSnapshot.fsrs));
      currentCard.reviewHistory = JSON.parse(JSON.stringify(snapshot.cardSnapshot.reviewHistory));
      currentCard.stats = JSON.parse(JSON.stringify(snapshot.cardSnapshot.stats));
      currentCard.modified = snapshot.cardSnapshot.modified;
      
      // 恢复会话统计
      session.cardsReviewed = snapshot.sessionSnapshot.cardsReviewed;
      session.newCardsLearned = snapshot.sessionSnapshot.newCardsLearned;
      session.correctAnswers = snapshot.sessionSnapshot.correctAnswers;
      session.totalTime = snapshot.sessionSnapshot.totalTime;
      
      // 保存到数据库
      const result = await dataStorage.saveCard(currentCard);
      
      if (result.success) {
        // 更新内存中的cards数组
        cards[currentCardIndex] = currentCard;
        cards = [...cards]; // 触发响应式更新
        
        // 重置UI状态
        showAnswer = false;
        cardStartTime = Date.now();
        
        // 更新撤销计数
        updateUndoCount();
        
        // 触发进度条刷新
        progressBarRefreshTrigger++;
        
        new (window as any).Notice('✅ 已撤销上一次评分');
        console.log('[StudyModal] 撤销成功');
      } else {
        throw new Error('保存卡片失败');
      }
    } catch (error) {
      console.error('[StudyModal] 撤销失败:', error);
      new (window as any).Notice('❌ 撤销失败: ' + (error instanceof Error ? error.message : '未知错误'));
      
      // 恢复撤销栈（将快照放回）
      if (snapshot) {
        reviewUndoManager.saveSnapshot(snapshot);
        updateUndoCount();
      }
    }
  }


  // 评分卡片 - 使用FSRS6增强算法
  /**
   * 对卡片进行评分并更新FSRS数据
   * 
   * @param rating - 评分等级 (1=Again, 2=Hard, 3=Good, 4=Easy)
   * 
   * 核心流程：
   * 1. 计算响应时间
   * 2. 调用FSRS算法计算新的间隔
   * 3. 应用学习步骤逻辑
   * 4. 更新卡片统计数据
   * 5. 更新FSRS6增强统计
   * 6. 触发个性化优化
   * 7. 保存卡片并切换下一张
   */
  async function rateCard(rating: Rating) {
    // 添加详细的调试日志
    console.log('[StudyModal] rateCard called:', {
      rating,
      hasCurrentCard: !!currentCard,
      currentCardId: currentCard?.id,
      showAnswer,
      cardStartTime
    });

    if (!currentCard || !showAnswer) {
      console.warn('[StudyModal] rateCard early return:', {
        hasCurrentCard: !!currentCard,
        showAnswer
      });
      return;
    }

    const responseTime = Date.now() - cardStartTime;
    
    // 🔄 保存评分前的快照（用于撤销功能）
    try {
      const snapshot: ReviewSnapshot = {
        cardIndex: currentCardIndex,
        cardId: currentCard.id,
        cardSnapshot: {
          fsrs: currentCard.fsrs,
          reviewHistory: currentCard.reviewHistory || [],
          stats: currentCard.stats || {
            totalReviews: 0,
            totalTime: 0,
            averageTime: 0,
            memoryRate: 0
          },
          modified: currentCard.modified || new Date().toISOString()
        },
        sessionSnapshot: {
          cardsReviewed: session.cardsReviewed,
          newCardsLearned: session.newCardsLearned,
          correctAnswers: session.correctAnswers,
          totalTime: session.totalTime
        },
        reviewInfo: {
          rating,
          timestamp: Date.now(),
          responseTime
        }
      };
      
      reviewUndoManager.saveSnapshot(snapshot);
      updateUndoCount(); // 更新撤销计数
    } catch (error) {
      console.error('[StudyModal] 保存撤销快照失败:', error);
    }

    // 使用FSRS6算法更新卡片
    const prevState = currentCard.fsrs.state;
    const { card: updatedCard, log } = fsrs.review(currentCard.fsrs, rating);

    // 应用学习步骤/毕业间隔调度（覆盖 FSRS 在新/重学阶段的排程）
    applyLearningScheduling(prevState, rating, updatedCard, currentCard);

    // 更新卡片数据
    currentCard.fsrs = updatedCard;

    // 确保 reviewHistory 数组存在
    if (!currentCard.reviewHistory) {
      currentCard.reviewHistory = [];
      console.warn('[StudyModal] reviewHistory was undefined, initialized as empty array');
    }
    currentCard.reviewHistory.push(log);

    // 确保 stats 对象存在
    if (!currentCard.stats) {
      currentCard.stats = {
        totalReviews: 0,
        totalTime: 0,
        averageTime: 0,
        memoryRate: 0
      };
      console.warn('[StudyModal] currentCard.stats was undefined, initialized with default values');
    }

    currentCard.stats.totalReviews++;
    const responseSeconds = Math.max(0, Math.round(responseTime / 1000));
    currentCard.stats.totalTime += responseSeconds;
    currentCard.stats.averageTime = currentCard.stats.totalReviews > 0 ? (currentCard.stats.totalTime / currentCard.stats.totalReviews) : 0;

    // FSRS6增强统计更新
    updateFSRS6Statistics(currentCard, rating, responseTime);

    // 更新记忆成功率
    updateMemorySuccessRate(currentCard, rating);

    // ===== 选择题统计更新 =====
    updateChoiceQuestionStats(currentCard, rating, responseTime);

    // 更新学习会话数据
    // 确保 cardReviews 数组存在
    if (!session.cardReviews) {
      session.cardReviews = [];
      console.warn('[StudyModal] session.cardReviews was undefined, initialized as empty array');
    }
    session.cardReviews.push({
      cardId: currentCard.id,
      rating,
      responseTime,
      timestamp: new Date()
    });

    session.cardsReviewed++;
    if (prevState === CardState.New) {
      session.newCardsLearned++;
    }
    if (rating >= 3) {
      session.correctAnswers++;
    }

    // 持久化更新后的卡片
    try {
      await dataStorage.saveCard(currentCard);
      
      // 🔧 更新内存中的cards数组，确保Svelte 5响应式数据一致性
      cards[currentCardIndex] = currentCard;
      cards = [...cards];  // 触发响应式更新
      
      // 🎯 FSRS6个性化优化：更新优化系统
      if (personalizationEnabled && plugin.settings.enablePersonalization) {
        try {
          await personalizationManager.updateAfterReview(log, currentCard.reviewHistory);
          
          // 检查优化进度并显示提示
          const progress = personalizationManager.getOptimizationProgress();
          if (progress.state !== 'baseline' && session.cardsReviewed % 50 === 0) {
            console.log('📊 [StudyModal] 个性化优化进度:', progress);
          }
        } catch (error) {
          console.error('❌ [StudyModal] 个性化优化失败:', error);
        }
      }
      
      // 触发进度条刷新
      progressBarRefreshTrigger++;
      console.log('StudyModal - Card saved, triggering progress bar refresh:', progressBarRefreshTrigger);
    } catch (e) {
      console.error("保存卡片失败", e);
    }

    // 移动到下一张卡片
    nextCard();
  }

  /**
   * 更新FSRS6增强统计信息
   * 
   * @param card - 卡片对象
   * @param rating - 评分等级
   * @param responseTime - 响应时间（毫秒）
   * 
   * 更新内容：
   * - 预测准确性（基于评分和响应时间）
   * - 稳定性趋势（连续复习的稳定性变化）
   * - 难度趋势（难度的动态变化）
   */
  function updateFSRS6Statistics(card: Card, rating: Rating, responseTime: number) {
    // 更新预测准确性 (基于评分和响应时间)
    if (card.stats.predictionAccuracy !== undefined) {
      const isCorrect = rating >= 3 ? 1 : 0;
      // 考虑响应时间：快速正确回答提高准确性权重
      const timeBonus = responseTime < 5000 && isCorrect ? 0.1 : 0;
      const currentAccuracy = card.stats.predictionAccuracy;
      card.stats.predictionAccuracy = (currentAccuracy * 0.9) + ((isCorrect + timeBonus) * 0.1);
    } else {
      card.stats.predictionAccuracy = rating >= 3 ? 1 : 0;
    }

    // 更新稳定性趋势
    if (card.reviewHistory.length >= 2) {
      const prevStability = card.reviewHistory[card.reviewHistory.length - 2].stability;
      const currentStability = card.fsrs.stability;
      const stabilityChange = (currentStability - prevStability) / prevStability;

      if (card.stats.stabilityTrend !== undefined) {
        card.stats.stabilityTrend = (card.stats.stabilityTrend * 0.8) + (stabilityChange * 0.2);
      } else {
        card.stats.stabilityTrend = stabilityChange;
      }
    }

    // 更新难度趋势
    if (card.reviewHistory.length >= 2) {
      const prevDifficulty = card.reviewHistory[card.reviewHistory.length - 2].difficulty;
      const currentDifficulty = card.fsrs.difficulty;
      const difficultyChange = currentDifficulty - prevDifficulty;

      if (card.stats.difficultyTrend !== undefined) {
        card.stats.difficultyTrend = (card.stats.difficultyTrend * 0.8) + (difficultyChange * 0.2);
      } else {
        card.stats.difficultyTrend = difficultyChange;
      }
    }
  }

  /**
   * 更新记忆成功率
   * 
   * @param card - 卡片对象
   * @param rating - 评分等级 (>=3为成功)
   * 
   * 计算累计的记忆成功率百分比
   */
  function updateMemorySuccessRate(card: Card, rating: Rating) {
    const isSuccess = rating >= 3;
    const totalReviews = card.stats.totalReviews;

    if (totalReviews === 1) {
      card.stats.memoryRate = isSuccess ? 1 : 0;
    } else {
      const prevSuccessCount = Math.round(card.stats.memoryRate * (totalReviews - 1));
      const newSuccessCount = prevSuccessCount + (isSuccess ? 1 : 0);
      card.stats.memoryRate = newSuccessCount / totalReviews;
    }
  }

  /**
   * 更新选择题统计数据
   * 
   * @param card - 卡片对象
   * @param rating - 评分等级
   * @param responseTime - 响应时间（毫秒）
   * 
   * 功能：
   * - 判断选择题答案是否正确
   * - 更新正确率统计
   * - 更新平均响应时间
   * - 记录最近10次答题历史
   * - 更新错题计数
   * 
   * 仅处理单选题和多选题类型
   */
  function updateChoiceQuestionStats(card: Card, rating: Rating, responseTime: number) {
    // 仅处理选择题类型
    const isChoiceType = detectedCardType === UnifiedCardType.SINGLE_CHOICE || 
                        detectedCardType === UnifiedCardType.MULTIPLE_CHOICE;
    
    if (!isChoiceType) {
      return; // 非选择题，直接返回
    }

    // 获取选择题数据
    const choiceData = previewContainer?.getChoiceQuestionData?.();
    if (!choiceData || !choiceData.isChoiceQuestion) {
      console.warn('[StudyModal] 无法获取选择题数据');
      return;
    }

    const { questionData, selectedOptions } = choiceData;
    if (!questionData) {
      return;
    }

    // 判断用户回答是否正确
    const correctLabels = questionData.correctAnswers;
    let isCorrect = false;
    
    if (questionData.isMultipleChoice) {
      // 多选题：必须完全匹配
      const selectedSet = new Set(selectedOptions);
      const correctSet = new Set(correctLabels);
      
      if (selectedSet.size === correctSet.size) {
        isCorrect = true;
        for (const label of selectedOptions) {
          if (!correctSet.has(label)) {
            isCorrect = false;
            break;
          }
        }
      }
    } else {
      // 单选题：选中的选项必须是正确答案
      isCorrect = selectedOptions.length === 1 && correctLabels.includes(selectedOptions[0]);
    }

    console.log('[StudyModal] 选择题答题结果:', {
      selected: selectedOptions,
      correct: correctLabels,
      isCorrect
    });

    // 初始化选择题统计（如果不存在）
    if (!card.stats.choiceStats) {
      card.stats.choiceStats = {
        totalAttempts: 0,
        correctAttempts: 0,
        accuracy: 0,
        averageResponseTime: 0,
        recentAttempts: [],
        isInErrorBook: false,
        errorCount: 0
      };
    }

    const stats = card.stats.choiceStats;

    // 更新统计数据
    stats.totalAttempts++;
    if (isCorrect) {
      stats.correctAttempts++;
    } else {
      stats.errorCount++;
      stats.lastErrorDate = new Date().toISOString();
    }

    // 重新计算正确率
    stats.accuracy = stats.correctAttempts / stats.totalAttempts;

    // 更新平均反应时间（加权平均）
    if (stats.totalAttempts === 1) {
      stats.averageResponseTime = responseTime;
    } else {
      stats.averageResponseTime = 
        (stats.averageResponseTime * (stats.totalAttempts - 1) + responseTime) / stats.totalAttempts;
    }

    // 添加到历史记录
    const attemptRecord = {
      timestamp: new Date().toISOString(),
      selectedOptions: [...selectedOptions],
      correctOptions: [...correctLabels],
      correct: isCorrect,
      responseTime: responseTime
    };

    stats.recentAttempts.unshift(attemptRecord);

    // 只保留最近10条记录
    if (stats.recentAttempts.length > 10) {
      stats.recentAttempts = stats.recentAttempts.slice(0, 10);
    }

    console.log('[StudyModal] 选择题统计已更新:', {
      totalAttempts: stats.totalAttempts,
      correctAttempts: stats.correctAttempts,
      accuracy: `${Math.round(stats.accuracy * 100)}%`,
      avgResponseTime: `${Math.round(stats.averageResponseTime / 1000)}s`
    });
  }

  /**
   * 🔍 查找容器中的所有媒体元素（增强版）
   * 
   * 支持：
   * - Obsidian 原生媒体嵌入
   * - media-extended 插件
   * - Shadow DOM
   * - 深度嵌套结构
   * 
   * @param rootContainer 根容器（默认为 document.body）
   * @param debug 是否输出调试信息
   * @returns 去重后的媒体元素数组
   */
  function findMediaElements(rootContainer?: HTMLElement, debug: boolean = false): HTMLMediaElement[] {
    const container = rootContainer || document.body;
    const elementsSet = new Set<HTMLMediaElement>();
    
    if (debug) {
      console.log('[findMediaElements] 🔍 开始媒体元素搜索');
      console.log('[findMediaElements] 容器:', container.className, container.id);
    }
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 策略 1: 标准选择器（基础覆盖）
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const standardSelectors = [
      // 标准 HTML5 媒体元素
      'audio',
      'video',
      // Obsidian internal-embed 结构
      '.internal-embed audio',
      '.internal-embed video',
      // Obsidian media-embed 结构
      '.media-embed audio',
      '.media-embed video',
      // 类型特定的 embed
      '.audio-embed audio',
      '.video-embed video',
      // file-embed（某些 Obsidian 版本）
      '.file-embed audio',
      '.file-embed video',
      // markdown 渲染容器
      '.markdown-preview-view audio',
      '.markdown-preview-view video',
      '.markdown-reading-view audio',
      '.markdown-reading-view video',
      // 学习界面特定容器
      '.card-preview audio',
      '.card-preview video',
      '.preview-container audio',
      '.preview-container video',
      '.main-study-area audio',
      '.main-study-area video',
      '.tuanki-obsidian-renderer audio',
      '.tuanki-obsidian-renderer video'
    ];
    
    standardSelectors.forEach(selector => {
      try {
        const elements = container.querySelectorAll<HTMLMediaElement>(selector);
        elements.forEach(el => elementsSet.add(el));
        if (debug && elements.length > 0) {
          console.log(`[findMediaElements] ✅ 标准选择器 "${selector}" 找到 ${elements.length} 个元素`);
        }
      } catch (e) {
        console.warn(`[findMediaElements] 选择器查询失败: ${selector}`, e);
      }
    });
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 策略 2: media-extended 插件专用选择器
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const mediaExtendedSelectors = [
      // media-extended 已知类名模式
      '.mx-video-player video',
      '.mx-audio-player audio',
      '.mx-media-player video',
      '.mx-media-player audio',
      '.media-extended-player video',
      '.media-extended-player audio',
      // media-extended 可能的容器
      '[data-mx-video] video',
      '[data-mx-audio] audio',
      '[data-media-extended] video',
      '[data-media-extended] audio',
      // iframe 内的媒体（某些版本）
      'iframe video',
      'iframe audio'
    ];
    
    mediaExtendedSelectors.forEach(selector => {
      try {
        const elements = container.querySelectorAll<HTMLMediaElement>(selector);
        elements.forEach(el => elementsSet.add(el));
        if (debug && elements.length > 0) {
          console.log(`[findMediaElements] 🔌 media-extended 选择器 "${selector}" 找到 ${elements.length} 个元素`);
        }
      } catch (e) {
        // 静默失败，因为这些是可选选择器
      }
    });
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 策略 3: 深度遍历（查找所有嵌套的媒体元素）
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    function deepFindMedia(element: Element): void {
      // 检查当前元素是否是媒体元素
      if (element.tagName === 'AUDIO' || element.tagName === 'VIDEO') {
        elementsSet.add(element as HTMLMediaElement);
        if (debug) {
          console.log(`[findMediaElements] 🌲 深度遍历找到: ${element.tagName}`, {
            src: (element as HTMLMediaElement).src,
            parent: element.parentElement?.className
          });
        }
      }
      
      // 遍历子元素（包括 Shadow DOM）
      if (element.shadowRoot) {
        if (debug) {
          console.log('[findMediaElements] 🌑 检测到 Shadow DOM');
        }
        element.shadowRoot.querySelectorAll('audio, video').forEach(media => {
          elementsSet.add(media as HTMLMediaElement);
          if (debug) {
            console.log(`[findMediaElements] 🌑 Shadow DOM 找到: ${media.tagName}`);
          }
        });
      }
      
      // 递归遍历子节点
      Array.from(element.children).forEach(child => deepFindMedia(child));
    }
    
    // 仅在前两个策略失败时进行深度遍历（性能优化）
    if (elementsSet.size === 0) {
      if (debug) {
        console.log('[findMediaElements] ⚠️ 前两个策略未找到媒体，启动深度遍历');
      }
      deepFindMedia(container);
    }
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 策略 4: iframe 内的媒体元素（media-extended 在线视频）
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const iframes = container.querySelectorAll<HTMLIFrameElement>('iframe');
    iframes.forEach(iframe => {
      try {
        // 尝试访问 iframe 内容（同源限制）
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) {
          iframeDoc.querySelectorAll<HTMLMediaElement>('audio, video').forEach(media => {
            elementsSet.add(media);
            if (debug) {
              console.log(`[findMediaElements] 🖼️ iframe 内找到: ${media.tagName}`);
            }
          });
        }
      } catch (e) {
        // 跨域 iframe 无法访问，静默失败
        if (debug) {
          console.log('[findMediaElements] ⚠️ iframe 跨域，无法访问内容');
        }
      }
    });
    
    const result = Array.from(elementsSet);
    
    if (debug) {
      console.log(`[findMediaElements] 📊 总计找到 ${result.length} 个媒体元素`);
      if (result.length > 0) {
        result.forEach((media, index) => {
          console.log(`[findMediaElements]   ${index + 1}. ${media.tagName}:`, {
            src: media.src || media.currentSrc || 'no-src',
            className: media.className,
            parent: media.parentElement?.className,
            controls: media.controls,
            autoplay: media.autoplay
          });
        });
      }
    }
    
    return result;
  }

  /**
   * 🎵 播放媒体元素（增强版 - 支持等待加载和顺序播放）
   * 
   * @param mediaElements 要播放的媒体元素数组
   */
  async function playMediaElements(mediaElements: HTMLMediaElement[]): Promise<void> {
    if (mediaElements.length === 0) {
      console.log('[StudyInterface] 没有媒体元素需要播放');
      return;
    }

    console.log(`[StudyInterface] 🎵 找到 ${mediaElements.length} 个媒体元素，播放模式: ${playMediaMode}`);

    try {
      if (playMediaMode === 'first') {
        // 只播放第一个（等待就绪）
        const firstMedia = mediaElements[0];
        await playMediaElement(firstMedia, 1, 1);
      } else {
        // 🔥 改进：顺序播放所有媒体（而非同时播放）
        // 第一个播放完 → 间隔2秒 → 播放第二个 → ...
        console.log('[StudyInterface] 🎵 开始顺序播放所有媒体');
        for (let i = 0; i < mediaElements.length; i++) {
          const media = mediaElements[i];
          
          // 🎬 播放当前媒体并等待播放完成
          await playMediaElementSequentially(media, i + 1, mediaElements.length);
          
          // ⏸️ 如果不是最后一个，等待间隔后再播放下一个
          if (i < mediaElements.length - 1) {
            console.log(`[StudyInterface] ⏸️ 等待 ${playbackInterval}ms 后播放下一个媒体`);
            await new Promise(resolve => setTimeout(resolve, playbackInterval));
          }
        }
        console.log('[StudyInterface] ✅ 所有媒体顺序播放完成');
      }
    } catch (error) {
      // 自动播放失败（浏览器策略限制）
      console.warn('[StudyInterface] ⚠️ 自动播放失败（可能需要用户交互）:', error);
      // 静默失败，不影响用户体验
    }
  }

  /**
   * 🎬 播放单个媒体元素并等待播放完成（用于顺序播放）
   * 
   * @param media 媒体元素
   * @param index 索引（用于日志）
   * @param total 总数（用于日志）
   */
  async function playMediaElementSequentially(media: HTMLMediaElement, index: number, total: number): Promise<void> {
    const prefix = total > 1 ? `${index}/${total}` : '';
    const logTag = prefix ? `[${prefix}]` : '';
    
    console.log(`[StudyInterface] ${logTag} 🎬 顺序播放: ${media.tagName}`, {
      src: media.src || media.currentSrc || 'no-src',
      readyState: media.readyState,
      networkState: media.networkState
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 步骤 1: 检查媒体源是否有效
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const src = media.src || media.currentSrc;
    if (!src || src === 'no-src' || src.trim() === '') {
      console.warn(`[StudyInterface] ${logTag} ⚠️ 跳过：媒体源未设置`);
      return;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 步骤 2: 等待媒体就绪
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (media.readyState < 2) {
      console.log(`[StudyInterface] ${logTag} ⏳ 等待媒体加载 (readyState: ${media.readyState})`);
      try {
        await waitForMediaReady(media, 5000);
        console.log(`[StudyInterface] ${logTag} ✅ 媒体加载完成 (readyState: ${media.readyState})`);
      } catch (error) {
        console.warn(`[StudyInterface] ${logTag} ⚠️ 等待超时：媒体加载失败`);
        return;
      }
    } else {
      console.log(`[StudyInterface] ${logTag} ✅ 媒体已就绪 (readyState: ${media.readyState})`);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 步骤 3: 播放并等待播放完成
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    try {
      // 重置媒体到开始位置
      media.currentTime = 0;
      
      // 开始播放
      await media.play();
      console.log(`[StudyInterface] ${logTag} ▶️ 开始播放`);
      
      // 🔥 关键：等待播放完成
      await waitForMediaEnded(media);
      console.log(`[StudyInterface] ${logTag} ✅ 播放完成`);
    } catch (error) {
      console.warn(`[StudyInterface] ${logTag} ⚠️ 播放失败:`, error);
    }
  }

  /**
   * ⏸️ 等待媒体播放完成
   * 
   * @param media 媒体元素
   * @returns Promise（播放完成后 resolve）
   */
  function waitForMediaEnded(media: HTMLMediaElement): Promise<void> {
    return new Promise((resolve) => {
      // 如果已经播放完成，立即返回
      if (media.ended) {
        resolve();
        return;
      }

      // 监听播放结束事件
      const onEnded = () => {
        cleanup();
        resolve();
      };

      // 监听错误事件
      const onError = () => {
        cleanup();
        resolve(); // 即使出错也resolve，继续播放下一个
      };

      // 监听暂停事件（用户可能手动暂停）
      const onPause = () => {
        // 只在真正结束时清理，不在暂停时清理
        if (media.ended) {
          cleanup();
          resolve();
        }
      };

      function cleanup() {
        media.removeEventListener('ended', onEnded);
        media.removeEventListener('error', onError);
        media.removeEventListener('pause', onPause);
      }

      // 添加事件监听器
      media.addEventListener('ended', onEnded);
      media.addEventListener('error', onError);
      media.addEventListener('pause', onPause);
    });
  }

  /**
   * 🎬 播放单个媒体元素（等待加载就绪）
   * 
   * @param media 媒体元素
   * @param index 索引（用于日志）
   * @param total 总数（用于日志）
   */
  async function playMediaElement(media: HTMLMediaElement, index: number, total: number): Promise<void> {
    const prefix = total > 1 ? `${index}/${total}` : '';
    const logTag = prefix ? `[${prefix}]` : '';
    
    console.log(`[StudyInterface] ${logTag} 准备播放: ${media.tagName}`, {
      src: media.src || media.currentSrc || 'no-src',
      readyState: media.readyState,
      networkState: media.networkState
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 步骤 1: 检查媒体源是否有效
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const src = media.src || media.currentSrc;
    if (!src || src === 'no-src' || src.trim() === '') {
      console.warn(`[StudyInterface] ${logTag} ⚠️ 跳过：媒体源未设置`);
      return;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 步骤 2: 检查媒体是否已就绪
    // readyState:
    //   0 = HAVE_NOTHING - 没有关于媒体资源的信息
    //   1 = HAVE_METADATA - 已获取元数据
    //   2 = HAVE_CURRENT_DATA - 当前播放位置的数据可用
    //   3 = HAVE_FUTURE_DATA - 当前及未来数据可用
    //   4 = HAVE_ENOUGH_DATA - 足够的数据可用
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (media.readyState >= 2) {
      // 媒体已就绪，可以直接播放
      console.log(`[StudyInterface] ${logTag} ✅ 媒体已就绪 (readyState: ${media.readyState})`);
      try {
        await media.play();
        console.log(`[StudyInterface] ${logTag} ✅ 播放成功`);
        return;
      } catch (error) {
        console.warn(`[StudyInterface] ${logTag} ⚠️ 播放失败:`, error);
        return;
      }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 步骤 3: 等待媒体加载完成（最多等待 5 秒）
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log(`[StudyInterface] ${logTag} ⏳ 等待媒体加载 (readyState: ${media.readyState})`);
    
    try {
      await waitForMediaReady(media, 5000);
      console.log(`[StudyInterface] ${logTag} ✅ 媒体加载完成 (readyState: ${media.readyState})`);
      
      // 尝试播放
      await media.play();
      console.log(`[StudyInterface] ${logTag} ✅ 播放成功`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('timeout')) {
        console.warn(`[StudyInterface] ${logTag} ⚠️ 等待超时：媒体加载失败`);
      } else {
        console.warn(`[StudyInterface] ${logTag} ⚠️ 播放失败:`, error);
      }
    }
  }

  /**
   * ⏳ 等待媒体元素加载就绪
   * 
   * @param media 媒体元素
   * @param timeout 超时时间（毫秒）
   * @returns Promise（媒体就绪或超时后 resolve）
   */
  function waitForMediaReady(media: HTMLMediaElement, timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      // 如果已经就绪，立即返回
      if (media.readyState >= 2) {
        resolve();
        return;
      }

      let resolved = false;
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          reject(new Error('Media loading timeout'));
        }
      }, timeout);

      // 监听多个加载事件
      const onLoadedData = () => {
        if (!resolved && media.readyState >= 2) {
          resolved = true;
          cleanup();
          resolve();
        }
      };

      const onCanPlay = () => {
        if (!resolved && media.readyState >= 2) {
          resolved = true;
          cleanup();
          resolve();
        }
      };

      const onError = (e: Event) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          reject(new Error(`Media loading error: ${(e as ErrorEvent).message || 'unknown'}`));
        }
      };

      function cleanup() {
        clearTimeout(timeoutId);
        media.removeEventListener('loadeddata', onLoadedData);
        media.removeEventListener('canplay', onCanPlay);
        media.removeEventListener('error', onError);
      }

      // 添加事件监听器
      media.addEventListener('loadeddata', onLoadedData);
      media.addEventListener('canplay', onCanPlay);
      media.addEventListener('error', onError);

      // 🔥 关键：主动触发加载（如果还未开始）
      if (media.networkState === 0) { // NETWORK_EMPTY
        console.log('[waitForMediaReady] 主动触发加载: load()');
        media.load();
      }
    });
  }

  /**
   * 👀 使用 MutationObserver 监听媒体元素出现
   * 
   * 作为备用方案，当立即查找和重试都失败时使用
   * 支持 media-extended 插件和深度嵌套结构
   * 
   * @returns Promise（在找到媒体元素或超时后resolve）
   */
  function observeMediaElements(): Promise<void> {
    return new Promise((resolve) => {
      const container = document.querySelector('.main-study-area') || document.body;
      let resolved = false;
      let checkCount = 0;

      const observer = new MutationObserver((mutations) => {
        if (resolved) return;
        
        checkCount++;
        console.log(`[StudyInterface] 🔍 MutationObserver 检查 #${checkCount}`);
        
        // 使用调试模式查找（显示详细信息）
        const mediaElements = findMediaElements(container as HTMLElement, true);
        if (mediaElements.length > 0) {
          resolved = true;
          observer.disconnect();
          console.log('[StudyInterface] ✅ MutationObserver 检测到媒体元素');
          playMediaElements(mediaElements);
          resolve();
        }
      });

      // 监听 DOM 变化（包括子树和属性变化）
      observer.observe(container, {
        childList: true,      // 监听子节点添加/删除
        subtree: true,        // 监听所有后代节点
        attributes: true,     // 监听属性变化（media-extended 可能动态设置属性）
        attributeFilter: ['src', 'class', 'data-mx-video', 'data-mx-audio'] // 只监听相关属性
      });

      // 超时保护（3秒后放弃，比之前增加1秒给 media-extended 更多时间）
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          observer.disconnect();
          console.warn('[StudyInterface] ⚠️ MutationObserver 超时，未找到媒体元素');
          console.warn(`[StudyInterface] 总共检查了 ${checkCount} 次 DOM 变化`);
          
          // 最后尝试：完整的深度调试查找
          console.log('[StudyInterface] 🔍 超时后最后尝试深度查找');
          const lastAttempt = findMediaElements(container as HTMLElement, true);
          if (lastAttempt.length > 0) {
            console.log('[StudyInterface] 🎉 超时后找到媒体元素！');
            playMediaElements(lastAttempt);
          }
          
          resolve();
        }
      }, 3000); // 增加到 3 秒
    });
  }

  /**
   * 🎬 自动播放媒体文件（增强版 v2.0）
   * 
   * 四重策略确保可靠性：
   * 1. 立即查找（快速响应）
   * 2. 重试机制（应对渲染延迟）
   * 3. 深度调试查找（media-extended 等插件支持）
   * 4. MutationObserver（备用方案）
   * 
   * @param triggeredBy 触发来源（用于调试）
   */
  async function autoPlayMediaFiles(triggeredBy: 'callback' | 'mutation' | 'manual' = 'manual'): Promise<void> {
    if (!autoPlayMedia) {
      return; // 未启用自动播放
    }

    console.log(`[StudyInterface] 🎵 开始自动播放媒体 (触发方式: ${triggeredBy})`);

    // ⚡ 策略1: 立即查找（最快，无调试）
    await tick(); // 等待 Svelte 更新 DOM
    let mediaElements = findMediaElements();
    
    if (mediaElements.length > 0) {
      console.log('[StudyInterface] ✅ 立即找到媒体元素');
      await playMediaElements(mediaElements);
      return;
    }

    // 🔄 策略2: 重试机制（应对异步渲染延迟）
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 200; // 200ms 间隔
    
    for (let i = 0; i < MAX_RETRIES; i++) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      mediaElements = findMediaElements();
      
      if (mediaElements.length > 0) {
        console.log(`[StudyInterface] ✅ 重试成功找到媒体元素 (第 ${i + 1} 次重试)`);
        await playMediaElements(mediaElements);
        return;
      }
      
      console.log(`[StudyInterface] ⏳ 重试 ${i + 1}/${MAX_RETRIES} 未找到媒体元素`);
    }

    // 🔍 策略3: 深度调试查找（启用完整调试信息）
    console.log('[StudyInterface] 🔍 启动深度调试查找（支持 media-extended 等插件）');
    await new Promise(resolve => setTimeout(resolve, 300)); // 额外延迟
    mediaElements = findMediaElements(undefined, true); // 🔥 启用调试模式
    
    if (mediaElements.length > 0) {
      console.log('[StudyInterface] ✅ 深度调试查找成功');
      await playMediaElements(mediaElements);
      return;
    }

    // 👀 策略4: MutationObserver 备用方案（最可靠）
    console.log('[StudyInterface] ⏳ 启动 MutationObserver 监听媒体元素');
    await observeMediaElements();
  }

  /**
   * 📢 处理渲染完成回调
   * 
   * 当 Obsidian 渲染引擎完成内容渲染时触发
   * 这是最可靠的媒体播放时机（未来集成）
   * 
   * @param container 渲染完成的容器元素
   */
  function handleRenderComplete(container: HTMLElement): void {
    console.log('[StudyInterface] 📢 收到渲染完成回调');
    
    // 如果启用了自动播放且时机为切换卡片
    if (autoPlayMedia && playMediaTiming === 'cardChange') {
      // 使用回调触发方式，优先级最高
      autoPlayMediaFiles('callback');
    }
  }

  /**
   * 切换到下一张卡片
   * 
   * 功能：
   * - 退出编辑模式（如果正在编辑）
   * - 更新索引并重置状态
   * - 到达末尾时结束学习会话
   */
  async function nextCard() {
    // ✅ 步骤1：如果正在编辑模式，先退出
    if (showEditModal) {
      console.log('[StudyModal] 切换卡片前退出编辑模式');
      handleEditorCancel(); // 取消当前编辑，不保存
      await tick(); // 等待状态更新
    }

    // 防御性检查：确保数组和索引有效
    if (!Array.isArray(cards) || cards.length === 0) {
      console.warn('nextCard: No cards available');
      finishSession();
      return;
    }

    // 添加详细的调试日志
    if (plugin?.settings?.enableDebugMode) {
      console.debug('[StudyModal] nextCard called:', {
        currentCardIndex,
        cardsLength: cards.length,
        currentCardId: currentCard?.id
      });
    }

    if (currentCardIndex >= cards.length - 1) {
      console.debug('[StudyModal] Reached end of cards, finishing session');
      finishSession();
    } else {
      // 安全地更新索引
      const nextIndex = currentCardIndex + 1;
      if (nextIndex < cards.length) {
        const prevIndex = currentCardIndex;
        currentCardIndex = nextIndex;
        showAnswer = false;
        cardStartTime = Date.now(); // 重置卡片计时

        // 添加状态变更确认日志
        if (plugin?.settings?.enableDebugMode) {
          console.debug('[StudyModal] Card index updated:', {
            from: prevIndex,
            to: currentCardIndex,
            newCardId: cards[currentCardIndex]?.id
          });
        }

        // 🎵 自动播放媒体文件（如果启用且时机为切换卡片）
        if (autoPlayMedia && playMediaTiming === 'cardChange') {
          autoPlayMediaFiles();
        }

        // 切换卡片时若启用自动显示答案，则重新安排定时器
        if (plugin.settings.autoShowAnswerSeconds > 0) {
          // 触发 $effect 中的定时器逻辑
        }
      } else {
        console.warn('nextCard: Invalid next index', nextIndex, 'cards.length:', cards.length);
        finishSession();
      }
    }
  }


  async function finishSession() {
    session.endTime = new Date();
    session.totalTime = Math.max(0, Math.round((session.endTime.getTime() - session.startTime.getTime()) / 1000));
    try {
      await dataStorage.saveStudySession(session);
    } catch (e) {
      console.error("保存学习会话失败", e);
    }
    
    // 🔄 清空撤销栈
    reviewUndoManager.clear();
    updateUndoCount();
    
    onComplete(session);
    onClose();
  }



  function handleClose() {
    // 清理hover tooltips
    clearHoverTooltips(plugin);

    if (session.cardsReviewed > 0) {
      const confirmed = confirm("确定要退出学习吗？当前进度将会保存。");
      if (!confirmed) return;
      finishSession();
    } else {
      onClose();
    }
  }

  // 工具栏操作 - 行内编辑切换
  async function handleToggleEdit() {
    if (!currentCard) {
      console.warn('No current card available for editing');
      return;
    }

    if (!showEditModal) {
      // 进入编辑模式
      await enterEditMode();
    } else {
      // 退出编辑模式（保存并切回预览）
      await exitEditMode();
    }
  }

  // 进入编辑模式
  /**
   * 进入卡片编辑模式
   * 
   * 使用Obsidian原生编辑器进行卡片编辑
   * 
   * 流程：
   * 1. 清理hover提示
   * 2. 创建临时文件
   * 3. 初始化嵌入式编辑器
   * 4. 应用自适应高度
   * 
   * @returns Promise<void>
   */
  async function enterEditMode() {
    if (!currentCard || !tempFileManager) {
      console.error('Cannot enter edit mode: missing card or tempFileManager');
      return;
    }

    try {
      // ✅ 步骤1：清理之前的编辑器实例（如果有）
      if (editCleanupFn) {
        console.log('[StudyModal] 清理之前的编辑器实例');
        editCleanupFn();
        editCleanupFn = null;
      }

      // 重置降级标志并先切换到编辑态以渲染容器
      tempFileUnavailable = false;
      showEditModal = true;
      await tick();

      // ✅ 步骤2：显式清空编辑器容器
      const editorContainer = inlineEditorContainer as HTMLElement | null;
      if (!editorContainer) {
        console.error('[StudyModal] 编辑器容器未找到');
        tempFileUnavailable = true;
        showEditModal = false;
        return;
      }

      console.log('[StudyModal] 清空编辑器容器，当前子节点数:', editorContainer.childNodes.length);
      editorContainer.innerHTML = ''; // 显式清空容器
      console.log('[StudyModal] 容器已清空');

      // ✅ 步骤3：创建临时文件
      const tempFileResult = await tempFileManager.createTempFile(currentCard);
      if (!tempFileResult.success) {
        console.error('Failed to create temp file:', tempFileResult.error);
        tempFileUnavailable = true;
        showEditModal = false;
        new (window as any).Notice('临时文件创建失败，请使用普通文本编辑器');
        return;
      }

      // ✅ 步骤4：创建嵌入式编辑器
      const editorResult = await tempFileManager.createEmbeddedEditor(
        editorContainer,
        currentCard.id,
        handleEditorSave,
        handleEditorCancel
      );

      if (!editorResult.success) {
        console.error('Failed to create embedded editor:', editorResult.error);
        tempFileUnavailable = true;
        showEditModal = false;
        new (window as any).Notice('编辑器创建失败，请使用普通文本编辑器');
        return;
      }

      // 保存清理函数
      editCleanupFn = editorResult.cleanup || null;

      console.log('[StudyModal] 编辑模式启动成功，卡片ID:', currentCard.id);
      
      // 编辑器创建成功后，手动触发高度调整
      setTimeout(() => {
        applyAdaptiveHeight();
        console.log('[StudyModal] 编辑模式高度调整完成');
      }, 50);

    } catch (error) {
      console.error('[StudyModal] 进入编辑模式失败:', error);
      tempFileUnavailable = true;
      showEditModal = false;
      new (window as any).Notice('进入编辑模式失败');
    }
  }
  // 退出编辑模式（保存并切回预览）
  async function exitEditMode() {
    if (!currentCard || !tempFileManager) {
      console.error('Cannot exit edit mode: missing card or tempFileManager');
      return;
    }

    try {
      // 调用finishEditing保存更改
      const result = await tempFileManager.finishEditing(currentCard.id, true);

      if (result.success && result.updatedCard) {
        // 更新当前卡片数据
        cards[currentCardIndex] = result.updatedCard;
        cards = [...cards]; // 触发响应式更新

        console.log('[StudyModal] 卡片保存成功:', result.updatedCard.id);
        new (window as any).Notice('卡片已保存');

        // ✅ 仅在保存成功时才退出编辑模式
        // 清理编辑器资源
        if (editCleanupFn) {
          editCleanupFn();
          editCleanupFn = null;
        }

        // 退出编辑状态
        showEditModal = false;
        tempFileUnavailable = false;
        isClozeMode = false;
      } else {
        // ❌ 保存失败：停留在编辑模式，不清理资源
        console.error('[StudyModal] 卡片保存失败:', result.error);
        new (window as any).Notice('保存失败: ' + (result.error || '未知错误'));
        // 不执行任何清理和状态切换，用户可以继续编辑或重试
      }

    } catch (error) {
      // ❌ 异常情况：停留在编辑模式
      console.error('[StudyModal] 保存过程异常:', error);
      new (window as any).Notice('保存失败: ' + (error instanceof Error ? error.message : '未知错误'));
      // 不执行任何清理和状态切换
    }
  }

  // 编辑器保存回调
  function handleEditorSave(_content: string) {
    console.log('Editor save callback triggered');
    // 这个回调由TempFileManager内部处理，我们只需要在exitEditMode中处理最终保存
  }

  // 编辑器取消回调
  function handleEditorCancel() {
    console.log('Editor cancel callback triggered');
    if (editCleanupFn) {
      editCleanupFn();
      editCleanupFn = null;
    }

    // 取消编辑，不保存
    if (tempFileManager && currentCard) {
      tempFileManager.cancelEditing(currentCard.id);
    }

    showEditModal = false;
    tempFileUnavailable = false;
    isClozeMode = false;
  }
  // 普通文本编辑器回调
  function handleOpenPlainEditor() {
    if (!currentCard) return;

    // 使用序列化工具将卡片转换为Markdown
    const markdownContent = cardToMarkdown(currentCard);

    // 设置为普通编辑器模式
    tempFileUnavailable = true;
    showEditModal = true;

    console.log('Opened plain text editor for card:', currentCard.id);
  }

  // 普通文本编辑器保存回调
  async function handlePlainEditorSave(content: string) {
    if (!currentCard) return;

    try {
      // 使用序列化工具解析内容
      const updatedCard = markdownToCard(content, currentCard);

      // 保存到数据存储
      await dataStorage.saveCard(updatedCard);

      // 更新本地数组
      cards[currentCardIndex] = updatedCard;
      cards = [...cards]; // 触发响应式更新

      console.log('Plain editor: Card saved successfully:', updatedCard.id);
      new (window as any).Notice('卡片已保存');

      // 退出编辑模式
      showEditModal = false;
      tempFileUnavailable = false;

    } catch (error) {
      console.error('Failed to save card from plain editor:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      new (window as any).Notice('保存失败: ' + errorMessage);
    }
  }



  // 挖空预览切换回调
  function handleToggleCloze() {
    isClozeMode = !isClozeMode;

    // 切换编辑器容器的CSS类
    const editorContainer = document.querySelector('.inline-editor-container');
    if (editorContainer) {
      if (isClozeMode) {
        editorContainer.classList.add('cloze-deletion-mode');
      } else {
        editorContainer.classList.remove('cloze-deletion-mode');
      }
    }

    console.log('Cloze mode toggled:', isClozeMode);
  }

  // 旧的编辑模态窗相关函数已移除，现在使用行内编辑


  async function handleDeleteCard() {
    if (!currentCard) return;

    const cardIdentifier = getFieldContent(currentCard, 'front').slice(0, 30) || `ID: ${currentCard.id}`;
    if (!confirm(`确定要删除卡片"${cardIdentifier}..."吗？`)) return;

    try {
      const res = await dataStorage.deleteCard(currentCard.id);
      if (!res?.success) {
        try {
          new (window as any).Notice(`删除失败：${res?.error || '未知错误'}`);
        } catch {
          alert(`删除失败：${res?.error || '未知错误'}`);
        }
        return;
      }

      // 记录删除前的状态
      const removedIndex = currentCardIndex;

      // 从本地列表移除卡片
      cards = cards.filter((_, idx) => idx !== removedIndex);

      // 优化索引切换逻辑
      if (cards.length === 0) {
        // 没有卡片了，结束学习
        currentCardIndex = 0;
        showAnswer = false;
        finishSession();
        return;
      } else {
        // 智能索引调整：优先显示下一张卡片
        if (removedIndex < cards.length) {
          // 如果删除的不是最后一张，保持当前索引（显示原来的下一张）
          currentCardIndex = removedIndex;
        } else {
          // 如果删除的是最后一张，显示新的最后一张
          currentCardIndex = cards.length - 1;
        }

        // 重置答案显示状态
        showAnswer = false;
        cardStartTime = Date.now(); // 重置计时

        // 强制触发界面刷新
        cards = [...cards]; // 创建新数组引用
        forceRefresh(); // 使用统一的刷新机制
      }

      // 显示删除成功提示
      try {
        new (window as any).Notice('卡片已删除');
      } catch {
        console.log('卡片已删除');
      }

      console.log(`卡片删除成功，从索引 ${removedIndex} 切换到 ${currentCardIndex}，剩余 ${cards.length} 张卡片`);

    } catch (e) {
      console.error('删除失败', e);
      try {
        new (window as any).Notice('删除卡片时发生错误，请重试');
      } catch {
        alert('删除卡片时发生错误，请重试');
      }
    }
  }

  // 提醒功能状态
  let showReminderModal = $state(false);
  let customReviewDate = $state("");
  let customReviewTime = $state("");

  // 优先级功能状态
  let showPriorityModal = $state(false);
  let selectedPriority = $state(2);

  // 倒计时定时器ID
  let countdownTimerId: number | null = $state(null);

  function handleSetReminder() {
    if (!currentCard) return;

    // 设置默认值为明天此时
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    customReviewDate = tomorrow.toISOString().split('T')[0];
    customReviewTime = new Date().toTimeString().slice(0, 5);

    showReminderModal = true;
  }

  async function confirmSetReminder() {
    if (!currentCard || !customReviewDate || !customReviewTime) {
      new (window as any).Notice('请选择有效的日期和时间');
      return;
    }

    try {
      // 组合日期和时间
      const reviewDateTime = new Date(`${customReviewDate}T${customReviewTime}`);

      if (reviewDateTime <= new Date()) {
        new (window as any).Notice('复习时间必须是未来时间');
        return;
      }

      // 更新卡片的复习时间
      const updatedCard = {
        ...currentCard,
        fsrs: {
          ...currentCard.fsrs,
          due: reviewDateTime.toISOString()
        },
        modified: new Date().toISOString()
      };

      // 保存卡片
      const result = await dataStorage.saveCard(updatedCard);
      if (result.success) {
        // 更新当前卡片引用
        cards[currentCardIndex] = updatedCard;
        new (window as any).Notice(`复习时间已设置为：${reviewDateTime.toLocaleString()}`);
        showReminderModal = false;
      } else {
        new (window as any).Notice('设置复习时间失败');
      }
    } catch (error) {
      console.error('Error setting reminder:', error);
      new (window as any).Notice('设置复习时间时出错');
    }
  }

  function handleChangePriority() {
    if (!currentCard) return;
    selectedPriority = (currentCard as any).priority || 2;
    showPriorityModal = true;
  }

  async function confirmChangePriority() {
    if (!currentCard) return;

    try {
      // 更新卡片的优先级
      const updatedCard = {
        ...currentCard,
        priority: selectedPriority,
        modified: new Date().toISOString()
      } as any;

      // 保存卡片
      const result = await dataStorage.saveCard(updatedCard);
      if (result.success) {
        // 更新当前卡片引用
        (cards[currentCardIndex] as any).priority = selectedPriority;

        const priorityText = ['', '低', '中', '高', '紧急'][selectedPriority] || '中';
        new (window as any).Notice(`优先级已设置为：${priorityText}`);
        showPriorityModal = false;
      } else {
        new (window as any).Notice('设置优先级失败');
      }
    } catch (error) {
      console.error('Error changing priority:', error);
      new (window as any).Notice('设置优先级时出错');
    }
  }


  // 防止牌组切换无限循环的状态
  // --- 牌组切换状态 ---
  let isDeckChanging = $state(false);

  // 处理AI格式化
  async function handleAIFormat(formatType: string) {
    if (!currentCard) {
      new (window as any).Notice('当前没有可格式化的卡片');
      return;
    }

    // 检查AI配置
    const aiConfig = plugin.settings.aiConfig;
    if (!aiConfig?.formatting?.enabled) {
      new (window as any).Notice('AI格式化功能未启用\n请在设置→AI配置中开启');
      return;
    }

    try {
      console.log(`[StudyModal] 开始AI格式化，类型: ${formatType}`);
      
      // 显示加载提示
      const loadingNotice = new (window as any).Notice('🤖 AI正在格式化卡片...', 0);
      
      // 获取卡片内容
      let currentContent = currentCard.content || '';
      
      if (!currentContent.trim()) {
        // 降级方案：从fields构建
        const front = currentCard.fields?.front || currentCard.fields?.question || '';
        const back = currentCard.fields?.back || currentCard.fields?.answer || '';
        currentContent = front;
        if (back) {
          currentContent += '\n\n---\n\n' + back;
        }
      }
      
      if (!currentContent.trim()) {
        loadingNotice.hide();
        new (window as any).Notice('卡片内容为空，无法格式化');
        return;
      }
      
      console.log('[StudyModal] 卡片内容长度:', currentContent.length);
      
      // 调用AI格式化服务
      const formatResult = await AIFormatterService.formatChoiceQuestion(
        { content: currentContent, formatType: 'choice' },
        plugin
      );
      
      // 隐藏加载提示
      loadingNotice.hide();
      
      if (!formatResult.success) {
        new (window as any).Notice(`❌ 格式化失败\n${formatResult.error || '未知错误'}`);
        console.error('[StudyModal] AI格式化失败:', formatResult);
        return;
      }
      
      if (!formatResult.formattedContent) {
        new (window as any).Notice('格式化结果为空');
        return;
      }
      
      console.log('[StudyModal] AI格式化成功:', {
        provider: formatResult.provider,
        model: formatResult.model
      });
      
      // 更新卡片
      const updatedCard = { ...currentCard };
      updatedCard.content = formatResult.formattedContent;
      updatedCard.modified = new Date().toISOString();
      
      // 重新解析fields
      try {
        const parsedCard = markdownToCard(formatResult.formattedContent, currentCard);
        updatedCard.fields = parsedCard.fields;
        updatedCard.parsedMetadata = parsedCard.parsedMetadata;
      } catch (parseError) {
        console.warn('[StudyModal] 字段解析失败，仅更新content:', parseError);
      }
      
      // 保存卡片
      const result = await dataStorage.saveCard(updatedCard);
      
      if (result.success) {
        cards[currentCardIndex] = updatedCard;
        cards = [...cards];
        
        const providerLabel = formatResult.provider ? ` (${formatResult.provider})` : '';
        new (window as any).Notice(`✨ AI格式化成功${providerLabel}`);
        
        console.log('[StudyModal] 卡片已保存');
        forceRefresh();
      } else {
        new (window as any).Notice('保存失败');
      }
      
    } catch (error) {
      console.error('[StudyModal] AI格式化异常:', error);
      new (window as any).Notice(
        `❌ 格式化失败\n${error instanceof Error ? error.message : '未知错误'}`
      );
    }
  }

  // 🆕 处理自定义AI格式化
  async function handleAIFormatCustom(actionId: string) {
    if (!currentCard) {
      new (window as any).Notice('当前没有可格式化的卡片');
      return;
    }
    
    const action = customFormatActions.find(a => a.id === actionId);
    if (!action) {
      new (window as any).Notice('未找到该格式化功能');
      return;
    }
    
    const loadingNotice = new (window as any).Notice('🤖 AI正在格式化...', 0);
    
    try {
      const result = await AIFormatterService.formatWithCustomAction(
        action,
        currentCard,
        {
          template: availableTemplates.find(t => t.id === currentCard.templateId),
          deck: decks.find(d => d.id === currentCard.deckId)
        },
        plugin
      );
      
      loadingNotice.hide();
      
      if (result.success) {
        formatPreviewResult = result;
        selectedFormatActionName = action.name;
        showFormatPreview = true;
      } else {
        new (window as any).Notice('格式化失败: ' + result.error);
      }
    } catch (error) {
      loadingNotice.hide();
      console.error('[StudyInterface] 格式化异常:', error);
      new (window as any).Notice('格式化失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  }

  // 🆕 应用格式化结果
  async function applyFormattedContent() {
    if (!currentCard || !formatPreviewResult?.formattedContent) return;
    
    try {
      const updatedCard = { ...currentCard };
      updatedCard.content = formatPreviewResult.formattedContent;
      updatedCard.modified = new Date().toISOString();
      
      // 重新解析fields
      try {
        const parsedCard = markdownToCard(formatPreviewResult.formattedContent, currentCard);
        updatedCard.fields = parsedCard.fields;
        updatedCard.parsedMetadata = parsedCard.parsedMetadata;
      } catch (parseError) {
        console.warn('[StudyInterface] 字段解析失败，仅更新content:', parseError);
      }
      
      // 保存卡片
      const result = await dataStorage.saveCard(updatedCard);
      
      if (result.success) {
        cards[currentCardIndex] = updatedCard;
        cards = [...cards];
        
        const providerLabel = formatPreviewResult.provider ? ` (${formatPreviewResult.provider})` : '';
        new (window as any).Notice(`✨ AI格式化成功${providerLabel}`);
        
        console.log('[StudyInterface] 卡片已保存并应用格式化');
        forceRefresh();
        
        // 关闭预览
        showFormatPreview = false;
        formatPreviewResult = null;
      } else {
        new (window as any).Notice('保存失败');
      }
    } catch (error) {
      console.error('[StudyInterface] 应用格式化失败:', error);
      new (window as any).Notice('应用失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  }

  // 🆕 保存自定义格式化功能列表
  async function saveCustomFormatActions(actions: CustomFormatAction[]) {
    try {
      // 直接添加到现有配置，aiConfig已经在插件设置中初始化
      const config = plugin.settings.aiConfig || {} as any;
      config.customFormatActions = actions;
      plugin.settings.aiConfig = config;
      await plugin.saveSettings();
      
      new (window as any).Notice('✅ 功能列表已保存');
      console.log('[StudyInterface] 自定义格式化功能已保存:', actions.length);
    } catch (error) {
      console.error('[StudyInterface] 保存功能列表失败:', error);
      new (window as any).Notice('保存失败');
    }
  }

  // 处理牌组切换
  async function handleChangeDeck(deckId: string) {
    if (!currentCard || isDeckChanging) {
      console.log('handleChangeDeck: 跳过 - 无当前卡片或正在切换中');
      return;
    }

    // 防止重复调用
    isDeckChanging = true;

    try {
      console.log(`开始切换牌组: ${currentCard.id} -> ${deckId}`);

      // 更新卡片的牌组ID
      const updatedCard = {
        ...currentCard,
        deckId: deckId,
        modified: new Date().toISOString()
      };

      // 保存卡片
      const result = await dataStorage.saveCard(updatedCard);
      if (result.success) {
        // 更新当前卡片引用 - 避免触发过多的响应式更新
        cards[currentCardIndex] = updatedCard;

        // 获取新牌组名称
        const newDeck = decks.find(d => d.id === deckId);
        const deckName = newDeck?.name || '未知牌组';

        try {
          new (window as any).Notice(`已将卡片移动到：${deckName}`);
        } catch {
          console.log(`已将卡片移动到：${deckName}`);
        }

        console.log(`卡片已移动到牌组：${deckName} (${deckId})`);

        // 延迟切换到下一张卡片，避免状态冲突
        setTimeout(() => {
          isDeckChanging = false; // 重置状态
          nextCard();
        }, 300); // 减少延迟时间
      } else {
        isDeckChanging = false; // 重置状态
        try {
          new (window as any).Notice('更换牌组失败');
        } catch {
          alert('更换牌组失败');
        }
      }
    } catch (error) {
      isDeckChanging = false; // 重置状态
      console.error('Error changing deck:', error);
      try {
        new (window as any).Notice('更换牌组时发生错误');
      } catch {
        alert('更换牌组时发生错误');
      }
    }
  }

  // 处理媒体自动播放设置变更
  function handleMediaAutoPlayChange(setting: 'enabled' | 'mode' | 'timing' | 'interval', value: boolean | 'first' | 'all' | 'cardChange' | 'showAnswer' | number) {
    if (setting === 'enabled' && typeof value === 'boolean') {
      autoPlayMedia = value;
      plugin.settings.mediaAutoPlay = plugin.settings.mediaAutoPlay || { enabled: false, mode: 'first', timing: 'cardChange', playbackInterval: 2000 };
      plugin.settings.mediaAutoPlay.enabled = value;
    } else if (setting === 'mode' && (value === 'first' || value === 'all')) {
      playMediaMode = value;
      plugin.settings.mediaAutoPlay = plugin.settings.mediaAutoPlay || { enabled: false, mode: 'first', timing: 'cardChange', playbackInterval: 2000 };
      plugin.settings.mediaAutoPlay.mode = value;
    } else if (setting === 'timing' && (value === 'cardChange' || value === 'showAnswer')) {
      playMediaTiming = value;
      plugin.settings.mediaAutoPlay = plugin.settings.mediaAutoPlay || { enabled: false, mode: 'first', timing: 'cardChange', playbackInterval: 2000 };
      plugin.settings.mediaAutoPlay.timing = value;
    } else if (setting === 'interval' && typeof value === 'number') {
      playbackInterval = value;
      plugin.settings.mediaAutoPlay = plugin.settings.mediaAutoPlay || { enabled: false, mode: 'first', timing: 'cardChange', playbackInterval: 2000 };
      plugin.settings.mediaAutoPlay.playbackInterval = value;
    }
    
    // 保存设置
    plugin.saveSettings();
  }

  // 自动显示答案与快捷键绑定（编辑模态开启时暂停监听与自动计时）
  $effect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (!showEditModal && plugin.settings.autoShowAnswerSeconds > 0 && !showAnswer) {
      timer = setTimeout(() => showAnswerCard(), plugin.settings.autoShowAnswerSeconds * 1000);
    }
    if (!showEditModal) document.addEventListener('keydown', handleKeyPress);
    return () => { document.removeEventListener('keydown', handleKeyPress); if (timer) clearTimeout(timer); };
  });

  // 高度自适应响应式监听
  $effect(() => {
    // 监听影响高度的状态变化
    if (modalRef && (showEditModal !== undefined || showAnswer !== undefined || statsCollapsed !== undefined)) {
      setTimeout(applyAdaptiveHeight, 200); // ✅ 延迟到编辑器创建完成后
    }
  });

  // 高度自适应计算
  let modalRef: HTMLDivElement | null = null;
  // --- 组件引用 ---
  let previewContainer = $state<any>(null);

  /**
   * 计算可用的内容区域高度
   */
  function calculateAvailableHeight(): number {
    if (!modalRef) return 400; // ✅ 默认最小值从0改为400

    const modalRect = modalRef.getBoundingClientRect();
    const headerEl = modalRef.querySelector('.study-header') as HTMLElement;
    const footerEl = modalRef.querySelector('.study-footer') as HTMLElement;
    const statsEl = modalRef.querySelector('.stats-cards') as HTMLElement;

    let usedHeight = 0;

    // 计算已使用的高度
    if (headerEl) usedHeight += headerEl.offsetHeight;
    if (footerEl && !showEditModal) usedHeight += footerEl.offsetHeight; // 编辑状态无footer
    if (statsEl && !statsCollapsed) usedHeight += statsEl.offsetHeight;

    // 预留间距：顶部、底部、内部间距
    // 编辑模式: container的padding(1rem上下) + editor的margin(1rem*2) = ~48px
    const reservedSpacing = showEditModal ? 48 : 80; // ✅ 编辑状态预留足够间距

    return Math.max(400, modalRect.height - usedHeight - reservedSpacing); // ✅ 最小值从300改为400
  }

  /**
   * 应用高度自适应
   */
  function applyAdaptiveHeight(): void {
    const availableHeight = calculateAvailableHeight();

    // 为编辑器容器设置高度
    const editorContainer = modalRef?.querySelector('.inline-editor-container') as HTMLElement;
    if (editorContainer && showEditModal) {
      // ✅ 新增：编辑器就绪检查
      const cmEditor = editorContainer.querySelector('.cm-editor');
      if (!cmEditor) {
        console.log('[StudyModal] 编辑器DOM未就绪，跳过高度计算');
        return; // 编辑器未就绪，跳过本次计算
      }
      
      // ✅ 应用高度，确保最小值，不设置maxHeight让其充分扩展
      const finalHeight = Math.max(400, availableHeight);
      editorContainer.style.height = `${finalHeight}px`;
      editorContainer.style.maxHeight = 'none'; // ✅ 移除maxHeight限制，让编辑器充分扩展
      console.log(`[StudyModal] 编辑器高度已设置: ${finalHeight}px`);
    }

    // 为预览容器设置高度
    const previewContainer = modalRef?.querySelector('.tuanki-preview-container') as HTMLElement;
    if (previewContainer && !showEditModal) {
      // ✅ 移除固定高度限制，改用min-height确保基础高度，允许内容自适应扩展
      previewContainer.style.height = 'auto';
      previewContainer.style.minHeight = `${Math.max(300, availableHeight)}px`;
      previewContainer.style.maxHeight = 'none'; // 允许内容自由扩展
    }
  }

  // 可访问性：焦点陷阱
  function trapFocus(e: FocusEvent) {
    // 当编辑模态打开时，禁用学习模态的焦点陷阱，避免双重陷阱导致卡住
    if (showEditModal) return;
    if (!modalRef) return;
    const focusable = modalRef.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.target === document.body) first.focus();
    modalRef.addEventListener('keydown', (ke: KeyboardEvent) => {
      if (ke.key !== 'Tab') return;
      if (ke.shiftKey && document.activeElement === first) { ke.preventDefault(); (last as HTMLElement).focus(); }
      else if (!ke.shiftKey && document.activeElement === last) { ke.preventDefault(); (first as HTMLElement).focus(); }
    }, { once: true });
  }
  
  // 🎯 检测侧边栏是否需要紧凑模式（带防抖和稳定性检测）
  function checkSidebarScrollable() {
    // 🎯 如果是固定模式，不执行自动检测，总是显示完整（图标+名称）
    if (sidebarCompactModeSetting === 'fixed') {
      sidebarCompactMode = false;
      lastCheckResult = false;
      return;
    }
    
    // 清除之前的防抖定时器
    if (checkTimeoutId !== null) {
      clearTimeout(checkTimeoutId);
      checkTimeoutId = null;
    }
    
    // 防抖：延迟执行实际检测
    checkTimeoutId = window.setTimeout(() => {
      performScrollCheck();
    }, 150); // 150ms 防抖延迟
  }
  
  // 实际执行检测的函数
  function performScrollCheck() {
    if (!modalRef) {
      return;
    }
    
    // 方案A：视口高度检测（兜底方案）
    const viewportHeight = window.innerHeight;
    const viewportTooSmall = viewportHeight < 750;
    
    // 方案B：检测真正的滚动容器 .sidebar-content
    const sidebarContent = modalRef.querySelector('.sidebar-content') as HTMLElement;
    let contentScrollable = false;
    
    if (sidebarContent) {
      const scrollHeight = sidebarContent.scrollHeight;
      const clientHeight = sidebarContent.clientHeight;
      
      // 🎯 关键：增加阈值避免临界值抖动
      // 进入紧凑模式：需要超过 20px 才触发
      // 退出紧凑模式：需要小于 -20px 才退出
      const threshold = sidebarCompactMode ? -20 : 20;
      const diff = scrollHeight - clientHeight;
      contentScrollable = diff > threshold;
    }
    
    // 双重检测：任一条件满足即触发紧凑模式
    const shouldCompact = viewportTooSmall || contentScrollable;
    
    // 🎯 状态稳定性检测：只在状态真正需要改变时才改变
    if (lastCheckResult !== shouldCompact) {
      sidebarCompactMode = shouldCompact;
      lastCheckResult = shouldCompact;
    }
  }
  
  // 🎯 处理紧凑模式设置变化
  function handleCompactModeSettingChange(setting: 'auto' | 'fixed') {
    sidebarCompactModeSetting = setting;
    
    // 保存到 localStorage
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('tuanki-sidebar-compact-mode-setting', setting);
      } catch (error) {
        // 静默失败
      }
    }
    
    // 立即应用新设置
    if (setting === 'fixed') {
      // 固定模式：总是显示完整
      sidebarCompactMode = false;
      lastCheckResult = false;
    } else {
      // 自动模式：重新检测
      setTimeout(() => {
        checkSidebarScrollable();
      }, 100);
    }
  }
  
  onMount(() => {
    document.addEventListener('focus', trapFocus, true);

    // 添加窗口大小变化监听（同时触发滚动检测）
    const handleResize = () => {
      setTimeout(applyAdaptiveHeight, 100);
      setTimeout(checkSidebarScrollable, 150); // 窗口变化时重新检测
    };
    window.addEventListener('resize', handleResize);

    // 初始化高度自适应
    setTimeout(() => {
      const el = modalRef as HTMLDivElement | null;
      if (el && typeof (el as any).focus === 'function') {
        el.focus();
      }
      applyAdaptiveHeight();
    }, 100);
    
    // 🎯 初始侧边栏检测（只执行一次）
    setTimeout(() => checkSidebarScrollable(), 500);
    
    // 🎯 设置 ResizeObserver 监听侧边栏内容变化（带尺寸缓存防止无限触发）
    setTimeout(() => {
      if (!modalRef) return;
      
      const sidebarContent = modalRef.querySelector('.sidebar-content') as HTMLElement;
      if (sidebarContent) {
        sidebarResizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const newWidth = entry.contentRect.width;
            const newHeight = entry.contentRect.height;
            
            // 🎯 关键：只有尺寸真正变化超过阈值时才触发检测
            const widthDiff = Math.abs(newWidth - lastContentSize.width);
            const heightDiff = Math.abs(newHeight - lastContentSize.height);
            
            if (widthDiff > 5 || heightDiff > 5) {
              lastContentSize = { width: newWidth, height: newHeight };
              checkSidebarScrollable();
            }
          }
        });
        sidebarResizeObserver.observe(sidebarContent);
      }
    }, 500);

    // 清理函数
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  });
  onDestroy(() => {
    document.removeEventListener('focus', trapFocus, true);

    // 🎯 清理侧边栏滚动检测
    if (sidebarResizeObserver) {
      sidebarResizeObserver.disconnect();
      sidebarResizeObserver = null;
    }
    
    // 🎯 清理防抖定时器
    if (checkTimeoutId !== null) {
      clearTimeout(checkTimeoutId);
      checkTimeoutId = null;
    }

    // 清理倒计时定时器
    if (countdownTimerId !== null) {
      clearInterval(countdownTimerId);
      countdownTimerId = null;
    }

    // 清理编辑器资源
    if (showEditModal && currentCard && tempFileManager) {
      console.log('Cleaning up editor resources on destroy');

      // 清理编辑器
      if (editCleanupFn) {
        editCleanupFn();
        editCleanupFn = null;
      }

      // 取消编辑（不保存）
      tempFileManager.cancelEditing(currentCard.id);
    }

    // 清理学习会话
    if (currentSessionId) {
      sessionManager.dispose(currentSessionId);
      console.log('[StudyModal] 会话已清理:', currentSessionId);
    }
  });

  // setupBlockLinkHandlers已提取到utils/study/studyInterfaceUtils.ts
  // 传统renderMarkdown渲染系统已完全移除 - 现在使用PreviewContainer统一处理所有题型渲染
</script>

<div
  class="study-interface-overlay"
  role="presentation"
  onclick={onClose}
  ondrop={(e) => e.stopPropagation()}
  ondragover={(e) => e.stopPropagation()}
  ondragleave={(e) => e.stopPropagation()}
>
  <div
    class="study-interface-content"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    bind:this={modalRef}
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => { if (showEditModal) return; if (e.key === 'Escape') handleClose(); }}
  >
    <!-- 头部工具栏 -->
    <div class="study-header">
      <div class="header-left">
        <h2 class="study-title">{currentDeckName || '学习'}</h2>
        <div class="study-progress">
          <StudyProgressBar deckId={session.deckId} {dataStorage} refreshTrigger={progressBarRefreshTrigger} />
          <span class="progress-text">{currentIndexDisplay} / {cards.length}</span>
        </div>
      </div>

      <div class="header-right">
        <div class="study-stats">
          {#if choiceStatsDisplay}
            <span 
              class="stat-item choice-stat-item" 
              title="选择题正确率: {choiceStatsDisplay.correct}/{choiceStatsDisplay.total}"
            >
              📊 <span class="choice-accuracy">{choiceStatsDisplay.accuracy}%</span>
            </span>
          {/if}
        </div>

        <EnhancedButton
          variant="ghost"
          onclick={() => statsCollapsed = !statsCollapsed}
          ariaLabel={statsCollapsed ? "展开统计" : "收起统计"}
        >
          <EnhancedIcon name={statsCollapsed ? "chevron-down" : "chevron-up"} size="18" />
        </EnhancedButton>

        <EnhancedButton
          variant="ghost"
          onclick={() => showSidebar = !showSidebar}
          ariaLabel={showSidebar ? "隐藏侧边栏" : "显示侧边栏"}
        >
          <EnhancedIcon name={showSidebar ? "sidebar-close" : "sidebar-open"} size="18" />
        </EnhancedButton>

        <EnhancedButton variant="ghost" onclick={onClose} ariaLabel="关闭">
          <EnhancedIcon name="times" size="18" />
        </EnhancedButton>
      </div>
    </div>

    <!-- 主要内容区域 -->
    <div class="study-content" class:with-sidebar={showSidebar}>
      <!-- 主学习区域 -->
      <div class="main-study-area">
        {#if currentCard}
          <!-- 🔍 DEBUG: currentCard存在 -->
          {#if typeof window !== 'undefined'}
            {console.log('[StudyInterface] 渲染currentCard:', {
              id: currentCard.id,
              showEditModal,
              hasFields: !!currentCard.fields
            })}
          {/if}
          <!-- 统计卡片（可折叠） - 现在通过侧边栏控制 -->
          {#if !statsCollapsed}
            {#if isPremium}
              <StatsCards card={currentCard} {fsrs} />
            {:else}
              <div class="stats-locked-hint">
                <div class="stats-locked-content">
                  <span class="lock-icon">🔒</span>
                  <span class="lock-text">统计情况详情</span>
                  <button 
                    class="unlock-btn" 
                    onclick={() => showActivationPrompt = true}
                  >
                    激活查看
                  </button>
                </div>
              </div>
            {/if}
          {/if}

          <!-- 卡片学习区域 - 预览与编辑互斥显示，高度自适应 -->
          <div class="card-study-container">
            <div class="card-container">
              {#if showEditModal}
                <!-- 编辑器容器 - 仅编辑态显示 -->
                <div class="inline-editor-container" bind:this={inlineEditorContainer} class:cloze-deletion-mode={isClozeMode}>
                  <!-- 编辑器将在这里被TempFileManager创建 -->
                  {#if tempFileUnavailable}
                    <!-- 降级普通文本编辑器 -->
                    <div class="plain-editor-container">
                      <textarea
                        class="plain-text-editor"
                        value={currentCard ? cardToMarkdown(currentCard) : ''}
                        oninput={(_e) => {
                          // 实时保存编辑内容到临时变量
                          // 这里可以添加实时预览或自动保存逻辑
                        }}
                        placeholder="在此编辑卡片内容..."
                      ></textarea>
                      <div class="plain-editor-actions">
                    <button
                      class="btn-secondary"
                      onclick={handleEditorCancel}
                    >
                      取消
                    </button>
                    <button
                      class="btn-primary"
                      onclick={() => {
                        const textarea = document.querySelector('.plain-text-editor') as HTMLTextAreaElement;
                        if (textarea) {
                          handlePlainEditorSave(textarea.value);
                        }
                      }}
                    >
                      保存
                    </button>
                  </div>
                </div>
              {/if}
            </div>
          {:else}
            <!-- 新的预览系统 - 统一处理所有题型 -->
            {#if typeof window !== 'undefined'}
              {console.log('[StudyInterface] 准备渲染PreviewContainer:', {
                hasCurrentCard: !!currentCard,
                showAnswer,
                hasPlugin: !!plugin
              })}
            {/if}
            <PreviewContainer
              bind:this={previewContainer}
              card={currentCard}
              {showAnswer}
              enableAnimations={true}
              enableAnswerControls={false}
              themeMode="auto"
              renderingMode="quality"
              {plugin}
              onCardTypeDetected={handleCardTypeDetected}
              onPreviewReady={handlePreviewReady}
              onAddToErrorBook={handleAddToErrorBook}
              onRemoveFromErrorBook={handleRemoveFromErrorBook}
              {currentResponseTime}
            />

          {/if}
            </div>
          </div>
        {/if}
      </div>

      <!-- 右侧信息面板已移除 -->

      <!-- 子卡片浮层 -->
      {#if currentCard && !showEditModal && showChildCardsOverlay}
        <ChildCardsOverlay 
          {childCards}
          bind:this={childCardsOverlayRef}
        />
      {/if}

      <!-- 统一操作栏 -->
      {#if currentCard && !showEditModal}
        <UnifiedActionsBar
          showChildOverlay={showChildCardsOverlay}
          selectedCount={childCardsOverlayRef?.getSelectedCardIds?.().length || 0}
          onReturn={handleCloseChildOverlay}
          onRegenerate={handleRegenerateChildCards}
          onSave={handleSaveSelectedChildCards}
          canUndo={reviewUndoManager.canUndo()}
          onUndo={handleUndoReview}
        />
      {/if}

      <!-- 底部功能栏 - 移到Grid内部 -->
      {#if currentCard && !showEditModal}
        <div class="study-footer">
          <RatingSection
            card={currentCard}
            {fsrs}
            {showAnswer}
            onRate={rateCard}
            onShowAnswer={showAnswerCard}
            onUndoShowAnswer={undoShowAnswer}
            cardType={detectedCardType}
            learningConfig={learningConfig ?? undefined}
            learningStepIndex={currentSessionId ? sessionManager.getSessionState(currentSessionId)?.learningStepIndex : undefined}
          />
        </div>
      {/if}

      <!-- 右侧垂直工具栏 -->
      {#if currentCard && showSidebar}
        <div class="sidebar-content">
          <VerticalToolbar
            compactMode={sidebarCompactMode}
            compactModeSetting={sidebarCompactModeSetting}
            onCompactModeSettingChange={handleCompactModeSettingChange}
            card={currentCard}
            {currentCardTime}
            {averageTime}
            {plugin}
            decks={decks}
            isEditing={showEditModal}
            {tempFileUnavailable}
            onToggleEdit={handleToggleEdit}
            onDelete={handleDeleteCard}
            onAISplit={handleAISplit}
            onSetReminder={handleSetReminder}
            onChangePriority={handleChangePriority}
            onChangeDeck={handleChangeDeck}
            onOpenPlainEditor={handleOpenPlainEditor}
            onAIFormat={handleAIFormat}
            customFormatActions={customFormatActions}
            onAIFormatCustom={handleAIFormatCustom}
            onManageFormatActions={() => showFormatManager = true}
            {undoCount}
            onUndo={handleUndoReview}
            {autoPlayMedia}
            {playMediaMode}
            {playMediaTiming}
            {playbackInterval}
            onMediaAutoPlayChange={handleMediaAutoPlayChange}
          />
        </div>
      {/if}
    </div>

  </div>
</div>

<!-- 旧的独立编辑模态窗已移除，现在使用行内编辑 -->

<!-- 模板选择列表（锚定到功能键左侧展开） -->
{#if showTemplateList}
  <div class="menu-overlay" role="dialog" aria-modal="true" tabindex="-1" onclick={handleCloseTemplateList} onkeydown={(e) => e.key === 'Escape' && handleCloseTemplateList()}>
    <div
      class="template-menu"
      role="menu"
      tabindex="0"
      bind:this={templateMenuEl}
      style={`top:${templateMenuTop}px; left:${templateMenuLeft}px;`}
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <div class="template-dropdown-list">
        {#if templateList.length > 0}
          {#each templateList as template}
            {@const isCurrent = currentCard && template.id === currentCard.templateId}
            <div class="template-dropdown-item" class:current={isCurrent} onclick={() => handleTemplateSelect(template)} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && handleTemplateSelect(template)}>
              <span class="template-name">{template.name}</span>
              {#if isCurrent}
                <span class="current-marker">⭐</span>
              {/if}
            </div>
          {/each}
        {:else}
          <div class="no-templates-message">未找到可用模板</div>
        {/if}
      </div>
    </div>
  </div>
{/if}




<!-- 提醒设置模态窗 -->
{#if showReminderModal}
  <div class="modal-overlay" role="dialog" aria-modal="true" tabindex="-1" onclick={() => showReminderModal = false} onkeydown={(e) => e.key === 'Escape' && (showReminderModal = false)}>
    <div class="reminder-modal" role="button" tabindex="0" onclick={(e) => e.stopPropagation()} onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Escape') showReminderModal = false; }}>
      <div class="modal-header">
        <h3>设置复习提醒</h3>
        <button class="modal-close" onclick={() => showReminderModal = false}>×</button>
      </div>

      <div class="modal-body">
        <p class="modal-description">为当前卡片自定义下次复习时间：</p>

        <div class="form-group">
          <label for="review-date">复习日期：</label>
          <input
            id="review-date"
            type="date"
            bind:value={customReviewDate}
            class="date-input"
          />
        </div>

        <div class="form-group">
          <label for="review-time">复习时间：</label>
          <input
            id="review-time"
            type="time"
            bind:value={customReviewTime}
            class="time-input"
          />
        </div>

        <div class="warning-message">
          <EnhancedIcon name="info" size="16" />
          <span>注意：自定义复习时间将覆盖算法计算的时间</span>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" onclick={() => showReminderModal = false}>
          取消
        </button>
        <button class="btn-primary" onclick={confirmSetReminder}>
          确认设置
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- 优先级设置模态窗 -->
{#if showPriorityModal}
  <div class="modal-overlay" role="dialog" aria-modal="true" tabindex="-1" onclick={() => showPriorityModal = false} onkeydown={(e) => e.key === 'Escape' && (showPriorityModal = false)}>
    <div class="priority-modal" role="button" tabindex="0" onclick={(e) => e.stopPropagation()} onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Escape') showPriorityModal = false; }}>
      <div class="modal-header">
        <h3>设置优先级</h3>
        <button class="modal-close" onclick={() => showPriorityModal = false}>×</button>
      </div>

      <div class="modal-body">
        <p class="modal-description">选择当前卡片的重要程度：</p>

        <div class="priority-options">
          {#each [1, 2, 3, 4] as priority}
            <button
              class="priority-option"
              class:selected={selectedPriority === priority}
              onclick={() => selectedPriority = priority}
            >
              <div class="priority-stars">
                {#each Array(priority) as _}
                  <EnhancedIcon name="starFilled" size="16" />
                {/each}
                {#each Array(4 - priority) as _}
                  <EnhancedIcon name="star" size="16" />
                {/each}
              </div>
              <span class="priority-label">
                {['', '低优先级', '中优先级', '高优先级', '紧急'][priority]}
              </span>
            </button>
          {/each}
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" onclick={() => showPriorityModal = false}>
          取消
        </button>
        <button class="btn-primary" onclick={confirmChangePriority}>
          确认设置
        </button>
      </div>
    </div>
  </div>
{/if}


<!-- 🔒 激活提示 -->
<ActivationPrompt
  featureId={PREMIUM_FEATURES.ADVANCED_ANALYTICS}
  visible={showActivationPrompt}
  onClose={() => showActivationPrompt = false}
/>

<!-- 🆕 AI格式化预览对比 -->
{#if showFormatPreview && formatPreviewResult}
  <FormatPreviewModal
    show={showFormatPreview}
    previewResult={formatPreviewResult}
    actionName={selectedFormatActionName}
    onConfirm={applyFormattedContent}
    onCancel={() => {
      showFormatPreview = false;
      formatPreviewResult = null;
    }}
  />
{/if}

<!-- 🆕 自定义格式化功能管理 -->
{#if showFormatManager}
  <CustomFormatActionManager
    show={showFormatManager}
    actions={customFormatActions}
    onSave={saveCustomFormatActions}
    onClose={() => showFormatManager = false}
  />
{/if}

<style>
  /* 🎨 新的题型样式系统已集成到组件中 */

  .study-interface-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(17, 17, 17, 0.88);
    backdrop-filter: blur(8px);
    z-index: 999999; /* 强制置顶，避免主题样式覆盖 */
    pointer-events: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .study-interface-content {
    background: var(--background-primary);
    border-radius: var(--tuanki-radius-lg);
    width: 100%;
    max-width: 1400px;
    height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow: var(--tuanki-shadow-xl);
    border: 1px solid var(--background-modifier-border);
    overflow: hidden;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* 头部工具栏 */
  .study-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
    flex-shrink: 0;
  }



  .header-left {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    flex: 1;
  }

  .study-title {
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--text-normal);
    margin: 0;
  }

  .study-progress {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }


  .progress-text {
    font-size: 0.875rem;
    color: var(--text-muted);
    font-weight: 600;
    min-width: 60px;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .study-stats {
    display: flex;
    gap: 1rem;
    align-items: center;
  }

  .stat-item {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.875rem;
    color: var(--text-muted);
    font-weight: 600;
  }

  /* 选择题统计特殊样式 */
  .choice-stat-item {
    background: color-mix(in srgb, var(--text-accent) 10%, transparent);
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    border: 1px solid var(--text-accent);
    color: var(--text-accent);
    transition: all 0.2s ease;
  }

  .choice-stat-item:hover {
    background: color-mix(in srgb, var(--text-accent) 15%, transparent);
    transform: translateY(-1px);
  }

  .choice-accuracy {
    font-weight: 700;
    font-family: var(--font-monospace);
    font-size: 0.9375rem;
  }

  /* 主要内容区域 - Grid布局优化 */
  .study-content {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr auto; /* 主内容区自适应 + 侧边栏 */
    grid-template-rows: 1fr auto; /* 内容区自适应 + 底部栏 */
    overflow: hidden;
    transition: all 0.3s ease;
    min-height: 0; /* 允许flex子元素收缩 */
    
    /* Grid自动流，允许元素按照grid定位自动排列 */
    grid-auto-flow: dense;
  }
  
  /* 当侧边栏隐藏时，恢复单列布局 */
  .study-content:not(.with-sidebar) {
    grid-template-columns: 1fr;
  }

  /* 编辑模式下（没有footer），调整网格行为单行 */
  .study-content:has(.inline-editor-container) {
    grid-template-rows: 1fr; /* 只有一行 */
  }

  /* 主学习区域 - Grid布局优化 */
  .main-study-area {
    grid-column: 1;
    grid-row: 1;
    display: flex;
    flex-direction: column;
    min-height: 0; /* 允许flex子元素收缩 */
    overflow: hidden;
  }

  /* 侧边栏内容容器 - 延伸到底部 */
  .sidebar-content {
    grid-column: 2;
    grid-row: 1 / 3; /* 跨越两行，延伸到底部 */
    display: flex;
    flex-direction: column;
    gap: 1rem;
    overflow-y: auto;
  }

  /* 卡片学习容器 - 高度自适应优化，合理间距设计 */
  .card-study-container {
    flex: 1;
    padding: var(--tuanki-space-md, 1rem); /* ✅ 恢复合理间距 */
    overflow: visible; /* ✅ 不滚动容器，让内容自己滚动 */
    display: flex;
    align-items: stretch; /* ✅ 改为stretch，让子元素填充高度 */
    justify-content: center; /* 居中显示卡片容器 */
    min-height: 0; /* 允许flex子元素收缩 */
  }

  .card-container {
    /* 极简透明容器 - 只负责布局 */
    width: min(100%, 1300px);
    max-width: 100%;
    height: 100%; /* ✅ 确保填充父容器的全部高度 */
    
    /* 移除所有视觉样式 */
    border: none;
    border-radius: 0;
    padding: var(--tuanki-space-md);
    background: transparent;
    box-shadow: none;
    
    /* 保留布局功能 */
    display: flex;
    flex-direction: column;
    gap: 0;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }
  
  /* ✅ 编辑模式时移除card-container的padding，让编辑器占满空间 */
  .card-container:has(.inline-editor-container) {
    padding: 0;
  }

  /* 新的预览系统样式已移至 PreviewContainer 组件 */




  /* 响应式设计 */
  @media (max-width: 1200px) {
    .study-interface-content {
      max-width: 1200px;
    }
  }

  /* 平板端布局 - 侧边栏移到底部，恢复Flexbox布局 */
  @media (max-width: 1024px) {
    .study-content {
      display: flex; /* 恢复flexbox */
      flex-direction: column;
      grid-template-columns: unset;
      grid-template-rows: unset;
    }
    
    .main-study-area {
      grid-column: unset;
      grid-row: unset;
    }
    
    .sidebar-content {
      grid-column: unset;
      grid-row: unset;
    }
    
    .study-footer {
      grid-column: unset;
      grid-row: unset;
      padding: 0.75rem 1rem; /* 平板端适当减小 */
    }

    .card-study-container {
      padding: var(--tuanki-space-sm, 0.75rem); /* 平板端适当间距 */
      flex: 1;
      overflow: visible; /* 不滚动容器 */
    }

    .card-container {
      width: min(100%, 1100px); /* 平板端保持较大宽度 */
      padding: var(--tuanki-space-lg, 1.25rem); /* 平板端适当间距 */
      flex: 1;
      overflow-y: auto; /* 内容滚动 */
    }

    /* 平板端编辑器高度优化 */
    .inline-editor-container {
      flex: 1;
    }
    
    .inline-editor-container :global(.cm-editor) {
      min-height: 250px; /* 平板端最小高度 */
    }



  }

  /* 手机端布局 */
  @media (max-width: 768px) {
    .study-interface-content {
      margin: 0;
      height: 100vh;
      border-radius: 0;
    }

    .study-interface-overlay {
      padding: 0;
    }
    
    .study-footer {
      padding: 0.75rem; /* 手机端最小padding */
    }

    .study-header {
      flex-direction: column;
      gap: 1rem;
      align-items: stretch;
    }

    .header-left {
      justify-content: center;
      flex-direction: column;
      gap: 1rem;
    }

    .card-study-container {
      padding: var(--tuanki-space-sm, 0.5rem); /* 手机端最小间距 */
      overflow: visible; /* 不滚动容器 */
    }

    .card-container {
      width: 100%; /* 手机端占满宽度 */
      padding: var(--tuanki-space-md, 1rem); /* 手机端保持间距 */
      border-radius: var(--tuanki-radius-md, 8px); /* 手机端圆角 */
      flex: 1;
      overflow-y: auto; /* 内容滚动 */
    }

    /* 手机端编辑器高度优化 */
    .inline-editor-container {
      flex: 1;
      margin-bottom: 1rem; /* 手机端减少底部间距 */
    }
    
    .inline-editor-container :global(.cm-editor) {
      min-height: 200px; /* 手机端最小高度 */
    }



  }

  /* 增强动画效果 */
  @keyframes slideInUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes bounceIn {
    0% {
      opacity: 0;
      transform: scale(0.3);
    }
    50% {
      opacity: 1;
      transform: scale(1.05);
    }
    100% {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes statsSlideDown {
    from {
      opacity: 0;
      transform: translateY(-20px);
      max-height: 0;
    }
    to {
      opacity: 1;
      transform: translateY(0);
      max-height: 200px;
    }
  }

  @keyframes progressPulse {
    0%, 100% {
      box-shadow: 0 0 0 0 rgba(var(--tuanki-info-rgb), 0.4);
    }
    50% {
      box-shadow: 0 0 0 4px rgba(var(--tuanki-info-rgb), 0);
    }
  }

  .study-interface-content {
    animation: fadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  }



  .card-container {
    animation: fadeIn 0.4s ease-out 0.2s both;
  }


  /* 提醒和优先级模态窗样式 */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000000; /* 高于学习模态窗的z-index */
    backdrop-filter: blur(2px);
  }

  .reminder-modal,
  .priority-modal {
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 12px;
    box-shadow: var(--shadow-s);
    max-width: 450px;
    min-width: 350px;
    max-height: 80vh;
    overflow: hidden;
    animation: bounceIn 0.3s ease-out;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--background-modifier-border);
    background: var(--background-secondary);
  }

  .modal-header h3 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .modal-close {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 0.25rem;
    font-size: 1.2rem;
    line-height: 1;
    transition: all 0.15s ease;
  }

  .modal-close:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .modal-body {
    padding: 1.5rem;
  }

  .modal-description {
    margin: 0 0 1rem 0;
    color: var(--text-normal);
    font-size: 0.95rem;
    line-height: 1.5;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    color: var(--text-normal);
    font-weight: 500;
    font-size: 0.9rem;
  }

  .date-input,
  .time-input {
    width: 100%;
    padding: 0.75rem;
    border: 1.5px solid var(--background-modifier-border);
    border-radius: 8px;
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.95rem;
    transition: all 0.2s ease;
  }

  .date-input:focus,
  .time-input:focus {
    outline: none;
    border-color: var(--text-accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--text-accent) 20%, transparent);
  }

  .warning-message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: color-mix(in srgb, var(--text-warning) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--text-warning) 30%, transparent);
    border-radius: 6px;
    color: var(--text-warning);
    font-size: 0.85rem;
    margin-top: 1rem;
  }

  .priority-options {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .priority-option {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    border: 1.5px solid var(--background-modifier-border);
    border-radius: 8px;
    background: var(--background-primary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .priority-option:hover {
    background: var(--background-modifier-hover);
    border-color: var(--background-modifier-border-hover);
  }

  .priority-option.selected {
    background: color-mix(in srgb, var(--text-accent) 10%, var(--background-primary));
    border-color: var(--text-accent);
  }

  .priority-stars {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    color: #fbbf24; /* 统一使用金黄色 */
  }

  .priority-label {
    color: var(--text-normal);
    font-weight: 500;
  }

  .priority-option.selected .priority-label {
    color: var(--text-accent);
    font-weight: 600;
  }

  .modal-footer {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
    padding: 1rem 1.5rem;
    background: var(--background-secondary);
  }

  .btn-secondary,
  .btn-primary {
    padding: 0.75rem 1.5rem;
    border-radius: 6px;
    border: none;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    min-width: 80px;
  }

  .btn-secondary {
    background: var(--background-primary);
    color: var(--text-normal);
    border: 1px solid var(--background-modifier-border);
  }

  .btn-secondary:hover {
    background: var(--background-modifier-hover);
  }

  .btn-primary {
    background: var(--text-accent);
    color: var(--text-on-accent);
  }

  .btn-primary:hover {
    background: color-mix(in srgb, var(--text-accent) 90%, black);
    transform: translateY(-1px);
  }

  /* 所有预览相关样式已移至新的预览系统 */

  /* 响应式设计优化 - 使用统一的断点和变量 */
  @media (max-width: var(--breakpoint-mobile)) {
    .study-interface-content {
      height: 95vh;
      margin: var(--tuanki-space-sm);
    }

    .study-header {
      padding: var(--tuanki-space-md);
    }

    .study-content {
      padding: 0; /* 移动端移除内边距，让卡片内容完全贴合 */
    }
  }

  /* 行内编辑器样式 - 高度自适应优化 */
  .inline-editor-container {
    flex: 1; /* ✅ 填满可用空间 */
    display: flex;
    flex-direction: column;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    overflow: hidden; /* ✅ 由内部编辑器处理滚动 */
    margin: var(--tuanki-space-md); /* ✅ 四周留出合适间距 */
    min-height: 400px; /* ✅ 确保最小显示高度，防止过度收缩 */
  }
  
  /* ✅ CodeMirror编辑器填满容器 */
  .inline-editor-container :global(.cm-editor) {
    flex: 1;
    min-height: 300px; /* 确保最小显示高度 */
  }
  
  /* ✅ 确保CodeMirror内部滚动区域正确 */
  .inline-editor-container :global(.cm-scroller) {
    overflow-y: auto !important;
  }

  /* 学习页脚（难度选择固定在底部，减小高度突出内容区） */
  .study-footer {
    grid-column: 1; /* 只占据主内容区列 */
    grid-row: 2;
    padding: 0.75rem 1.5rem; /* 减小padding以突出内容区 */
    background: var(--background-primary);
  }

  /* 挖空预览模式 */
  .inline-editor-container.cloze-deletion-mode :global(.cm-editor) {
    /* 隐藏==高亮==内容的样式 */
    position: relative;
  }

  .inline-editor-container.cloze-deletion-mode :global(.cm-editor .cm-highlight) {
    background: var(--background-modifier-border);
    color: transparent;
    cursor: pointer;
    border-radius: 3px;
  }

  .inline-editor-container.cloze-deletion-mode :global(.cm-editor .cm-highlight:hover) {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  /* 普通文本编辑器样式 */
  .plain-editor-container {
    flex: 1; /* ✅ 填满可用空间 */
    display: flex;
    flex-direction: column;
    min-height: 0; /* ✅ 允许收缩 */
  }

  .plain-text-editor {
    flex: 1;
    width: 100%;
    min-height: 350px;
    padding: 1rem;
    border: none;
    background: var(--background-primary);
    color: var(--text-normal);
    font-family: var(--font-text);
    font-size: 0.875rem;
    line-height: 1.6;
    resize: none;
    outline: none;
  }

  .plain-text-editor:focus {
    background: var(--background-primary);
  }

  .plain-editor-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1rem;
    background: var(--background-secondary);
    border-top: 1px solid var(--background-modifier-border);
  }

  .plain-editor-actions button {
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-secondary {
    background: var(--background-modifier-form-field);
    border: 1px solid var(--background-modifier-border);
    color: var(--text-normal);
  }

  .btn-secondary:hover {
    background: var(--background-modifier-hover);
  }

  .btn-primary {
    background: var(--color-accent);
    border: 1px solid var(--color-accent);
    color: var(--text-on-accent);
  }

  .btn-primary:hover {
    background: var(--color-accent-hover);
    border-color: var(--color-accent-hover);
  }







  /* 移除未使用的模板字段样式 */

  /* 挖空样式已移至PreviewContainer组件 */

  /* 模板下拉菜单样式已移至VerticalToolbar组件 */

  .template-dropdown-list {
    max-height: 50vh;
    overflow-y: auto;
  }

  .template-dropdown-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    cursor: pointer;
    transition: background-color 0.2s ease;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .template-dropdown-item:last-child {
    border-bottom: none;
  }

  .template-dropdown-item:hover {
    background: var(--background-modifier-hover);
  }

  .template-dropdown-item.current {
    background: var(--color-accent-2);
  }

  .template-dropdown-item .template-name {
    font-size: 0.875rem;
    color: var(--text-normal);
    font-weight: 500;
    white-space: nowrap; /* 自适应宽度：单行不换行 */
  }

  /* 锚定菜单样式 */
  .menu-overlay {
    position: fixed;
    inset: 0;
    z-index: 10000050; /* 高于学习模态窗(999999) 与其他弹窗(1000000) */
    background: transparent;
  }

  .template-menu {
    position: fixed;
    width: max-content;   /* 随内容自适应宽度 */
    min-width: 140px;     /* 保底宽度避免过窄 */
    max-width: 60vw;      /* 视口保护 */
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    transform: none;      /* 移除垂直居中，改用精确定位 */
    padding: 0;
    z-index: 10000051;
  }

  .current-marker {
    color: var(--text-accent);
    font-size: 0.9rem;
    font-weight: 700;
    margin-left: 8px;
  }

  .no-templates-message {
    padding: 1rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  /* 预览容器样式已移至PreviewContainer组件 */

  /* 响应式适配已移至PreviewContainer组件 */

  /* 🔒 统计卡片锁定提示 */
  .stats-locked-hint {
    padding: 16px;
    margin-bottom: 16px;
    background: var(--background-secondary);
    border-radius: var(--tuanki-radius-md);
    border: 1px solid var(--background-modifier-border);
  }

  .stats-locked-content {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }

  .lock-icon {
    font-size: 20px;
  }

  .lock-text {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-muted);
  }

  .unlock-btn {
    padding: 6px 16px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-on-accent);
    background: var(--interactive-accent);
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .unlock-btn:hover {
    transform: translateY(-1px);
    box-shadow: var(--shadow-s);
  }

  .unlock-btn:active {
    transform: translateY(0);
  }
</style>



