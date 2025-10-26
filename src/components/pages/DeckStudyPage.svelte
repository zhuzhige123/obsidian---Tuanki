<script lang="ts">
  import { onMount } from "svelte";
  import ObsidianIcon from "../ui/ObsidianIcon.svelte";
  import EnhancedIcon from "../ui/EnhancedIcon.svelte";
  import BouncingBallsLoader from "../ui/BouncingBallsLoader.svelte";

  import StudyInterface from "../study/StudyInterface.svelte";
  import type { AnkiDataStorage } from "../../data/storage";
  import type { FSRS } from "../../algorithms/fsrs";
  import type { Card, Deck, DeckStats } from "../../data/types";
  import { CardType } from "../../data/types";
  import type { StudySession } from "../../data/study-types";
  import { generateId, generateUUID } from "../../utils/helpers";
  import type AnkiPlugin from "../../main";
  import CreateDeckModal from "../modals/CreateDeckModal.svelte";
  import APKGImportModal from "../modals/APKGImportModal.svelte";
  import MoveDeckModal from "../modals/MoveDeckModal.svelte";
  import type { ImportResult } from "../../domain/apkg/types";
  import { Menu, Notice } from "obsidian";
  import type { DeckTreeNode } from "../../services/deck/DeckHierarchyService";
  
  // 🛡️ 导入服务就绪检查工具
  import { waitForService, safeServiceCall } from "../../utils/service-ready-check";
  
  // 🆕 导入视图组件
  import KanbanView from "../deck-views/KanbanView.svelte";
  import GridCardView from "../deck-views/GridCardView.svelte";
  import CategoryFilter from "../deck-views/CategoryFilter.svelte";
  
  // 🎉 导入庆祝模态窗
  import CelebrationModal from "../modals/CelebrationModal.svelte";
  import type { CelebrationStats } from "../../types/celebration-types";
  import type { DeckCategory } from "../../data/types";
  import { getCategoryStorage } from "../../data/CategoryStorage";
  
  // 🆕 导入学习完成逻辑辅助函数
  import { loadDeckCardsForStudy, isDeckCompleteForToday, getAdvanceStudyCards, getLearnedNewCardsCountToday } from "../../utils/study/studyCompletionHelper";
  
  // 🔒 高级功能限制
  import { PremiumFeatureGuard, PREMIUM_FEATURES } from "../../services/premium/PremiumFeatureGuard";
  import ActivationPrompt from "../premium/ActivationPrompt.svelte";
  import PremiumBadge from "../premium/PremiumBadge.svelte";

  interface Props {
    dataStorage: AnkiDataStorage;
    fsrs: FSRS;
    plugin: AnkiPlugin;
  }

  let { dataStorage, fsrs, plugin }: Props = $props();

  // 核心状态
  // ⚠️ showStudyModal 已废弃 - 现在使用 plugin.openStudySession()
  // let showStudyModal = $state(false);
  let studyCards = $state<Card[]>([]);
  let showCreateDeckModal = $state(false);
  let showAPKGImportModal = $state(false);
  
  // 🎯 加载状态
  let isLoading = $state(true);


  // 牌组编辑模态窗状态
  let showEditDeckModal = $state(false);
  let editingDeck: Deck | null = $state(null);

  // 创建子牌组状态
  let createSubdeckParentId: string | null = $state(null);

  // 移动牌组模态窗状态
  let showMoveDeckModal = $state(false);
  let movingDeck: Deck | null = $state(null);
  
  // 🎉 庆祝模态窗状态
  let showCelebrationModal = $state(false);
  let celebrationDeckName = $state<string>('');
  let celebrationStats = $state<CelebrationStats | null>(null);


  // 使用数据层的 Deck 类型

  // 数据状态
  let decks = $state<Deck[]>([]);
  let deckTree = $state<DeckTreeNode[]>([]);
  let expandedDeckIds = $state<Set<string>>(new Set());
  let allCards = $state<Card[]>([]);
  let deckStats = $state<Record<string, DeckStats>>({});
  let studySessions = $state<StudySession[]>([]);
  
  // 🆕 视图状态 - 默认使用仪表盘视图
  let currentView = $state<'classic' | 'kanban' | 'grid'>('grid');
  
  // 🆕 分类状态（用于经典视图）
  let categories = $state<DeckCategory[]>([]);
  let selectedCategoryId = $state<string | null>(null);
  const categoryStorage = getCategoryStorage();
  
  // 🔒 高级功能守卫
  const premiumGuard = PremiumFeatureGuard.getInstance();
  let isPremium = $state(false);
  let showActivationPrompt = $state(false);
  let promptFeatureId = $state('');

  // 订阅高级版状态
  $effect(() => {
    const unsubscribe = premiumGuard.isPremiumActive.subscribe(value => {
      isPremium = value;
    });
    return unsubscribe;
  });
  
  // 🆕 从 localStorage 加载视图偏好
  onMount(() => {
    const savedView = localStorage.getItem('tuanki-deck-view');
    // 如果保存的视图是高级功能且未激活，则使用经典视图
    if (savedView && ['classic', 'kanban', 'grid'].includes(savedView)) {
  const viewMap: Record<string, string> = {
    'kanban': PREMIUM_FEATURES.KANBAN_VIEW,
    'grid': PREMIUM_FEATURES.MULTI_STUDY_VIEWS
  };
      
      const featureId = viewMap[savedView];
      if (!featureId || premiumGuard.canUseFeature(featureId)) {
        currentView = savedView as typeof currentView;
      } else {
        currentView = 'classic'; // 降级到免费视图
      }
    } else if (savedView === 'timeline' || savedView === 'card') {
      // 时间轴视图和卡片视图已移除，降级到经典视图
      currentView = 'classic';
      localStorage.setItem('tuanki-deck-view', 'classic');
    }
    
    // 🆕 订阅数据同步服务
    let unsubscribeDecks: (() => void) | undefined;
    let unsubscribeSessions: (() => void) | undefined;
    let unsubscribeCards: (() => void) | undefined;
    
    if (plugin.dataSyncService) {
      console.log('[DeckStudyPage] 订阅数据变更通知');
      
      // 订阅牌组变更
      unsubscribeDecks = plugin.dataSyncService.subscribe(
        'decks',
        async (event) => {
          console.log('[DeckStudyPage] 牌组数据变更:', event.action, event.ids);
          await refreshData(false);
        },
        { debounce: 300 }
      );
      
      // 订阅学习会话变更
      unsubscribeSessions = plugin.dataSyncService.subscribe(
        'sessions',
        async (event) => {
          console.log('[DeckStudyPage] 学习会话变更:', event.action, event.ids);
          await refreshData(false);
        },
        { debounce: 300 }
      );
      
      // 订阅卡片变更（影响统计）
      unsubscribeCards = plugin.dataSyncService.subscribe(
        'cards',
        async (event) => {
          console.log('[DeckStudyPage] 卡片数据变更:', event.action, event.ids);
          await refreshData(false);
        },
        { debounce: 500 }
      );
    }
    
    // 清理订阅
    return () => {
      console.log('[DeckStudyPage] 清理数据订阅');
      if (unsubscribeDecks) unsubscribeDecks();
      if (unsubscribeSessions) unsubscribeSessions();
      if (unsubscribeCards) unsubscribeCards();
    };
  });
  
  // 🆕 视图切换逻辑（使用 Obsidian Menu API）
  function showViewSwitcher(evt: MouseEvent) {
    const menu = new Menu();
    
    // 🎯 调整视图顺序：网格卡片 > 看板 > 经典列表
    const views = [
      { id: 'grid', label: '网格卡片', icon: 'grid', desc: '色卡风格，多彩展示', premium: true, featureId: PREMIUM_FEATURES.MULTI_STUDY_VIEWS },
      { id: 'kanban', label: '看板视图', icon: 'columns', desc: '按阶段组织，可视化流程', premium: true, featureId: PREMIUM_FEATURES.KANBAN_VIEW },
      { id: 'classic', label: '经典列表', icon: 'list', desc: 'Anki 风格，简洁高效', premium: false }
    ] as const;
    
    views.forEach(view => {
      menu.addItem((item) => {
        const isPremiumView = view.premium && !isPremium;
        const label = isPremiumView ? `${view.label} 🔒` : view.label;
        
        item
          .setTitle(label)
          .setIcon(view.icon)
          .setChecked(currentView === view.id)
          .onClick(() => {
            // 检查高级功能权限
            if (view.premium && view.featureId && !premiumGuard.canUseFeature(view.featureId)) {
              promptFeatureId = view.featureId;
              showActivationPrompt = true;
              return;
            }
            
            currentView = view.id;
            localStorage.setItem('tuanki-deck-view', view.id);
          });
      });
    });
    
    menu.showAtMouseEvent(evt);
  }
  
  // 🆕 监听全局视图切换事件
  $effect(() => {
    const handleShowViewMenu = (e: CustomEvent) => {
      showViewSwitcher(e.detail.event);
    };
    
    window.addEventListener('show-view-menu', handleShowViewMenu as EventListener);
    
    return () => {
      window.removeEventListener('show-view-menu', handleShowViewMenu as EventListener);
    };
  });

  // 手动清理临时文件
  async function handleCleanupTempFiles() {
    try {
      // 显示确认提示
      const confirmed = confirm(
        '将清理所有旧的临时文件。\n\n' +
        '当前正在编辑的文件不会被删除。\n\n' +
        '是否继续？'
      );
      
      if (!confirmed) {
        return;
      }

      // 显示清理进度提示
      new Notice('🔄 正在清理临时文件...', 2000);

      // 执行清理
      const tempFileManager = (plugin as any).tempFileManager;
      if (!tempFileManager || typeof tempFileManager.manualCleanup !== 'function') {
        new Notice('❌ 临时文件管理器不可用', 3000);
        return;
      }

      const result = await tempFileManager.manualCleanup();

      // 显示清理结果
      if (result.success) {
        if (result.cleaned === 0) {
          new Notice('✅ 无需清理，没有找到旧的临时文件', 3000);
        } else {
          new Notice(
            `✅ 清理完成！\n已删除 ${result.cleaned} 个临时文件`,
            5000
          );
        }
      } else {
        const failedCount = result.errors.length;
        new Notice(
          `⚠️ 清理部分完成\n成功: ${result.cleaned}/${result.total}\n失败: ${failedCount}`,
          6000
        );
        console.error('[TempFileCleanup] 清理错误:', result.errors);
      }
    } catch (error) {
      console.error('[TempFileCleanup] 清理失败:', error);
      new Notice(
        `❌ 清理失败: ${error instanceof Error ? error.message : '未知错误'}`,
        5000
      );
    }
  }

  // 显示更多操作菜单（使用 Obsidian 原生菜单）
  function showMoreActionsMenu(event: MouseEvent) {
    const menu = new Menu();
    
    menu.addItem((item) => {
      item
        .setTitle("旧版APKG格式导入")
        .setIcon("package")
        .onClick(() => { showAPKGImportModal = true; });
    });
    
    menu.addItem((item) => {
      item
        .setTitle("导入CSV文件")
        .setIcon("file-text")
        .onClick(importCSV);
    });
    
    menu.addItem((item) => {
      item
        .setTitle("导出JSON数据")
        .setIcon("download")
        .setDisabled(decks.length === 0)
        .onClick(exportDeck);
    });
    
    menu.addSeparator();
    
    menu.addItem((item) => {
      item
        .setTitle("清理临时文件")
        .setIcon("trash-2")
        .onClick(handleCleanupTempFiles);
    });
    
    menu.showAtMouseEvent(event);
  }


  // 数据刷新
  async function refreshData(showLoading = false) {
    if (showLoading) {
      isLoading = true;
    }
    
    try {
      decks = await dataStorage.getDecks();
      allCards = await dataStorage.getCards();
      await calculateDeckStats();
      
      // 加载牌组树结构
      await loadDeckTree();
      
      // 加载学习历史数据（最近30天）
      await loadStudySessions();
      
      // 🆕 加载分类（用于经典视图）
      await loadCategories();
    } finally {
      if (showLoading) {
        isLoading = false;
      }
    }
  }
  
  // 🆕 加载分类数据
  async function loadCategories() {
    try {
      await categoryStorage.initialize();
      categories = await categoryStorage.getCategories();
      
      // 恢复上次选择的分类（仅在经典视图中）
      if (currentView === 'classic') {
        const savedCategoryId = localStorage.getItem('tuanki-classic-selected-category');
        if (savedCategoryId && categories.find(c => c.id === savedCategoryId)) {
          selectedCategoryId = savedCategoryId;
        } else if (categories.length > 0 && !selectedCategoryId) {
          // 默认选中第一个分类
          selectedCategoryId = categories[0].id;
          localStorage.setItem('tuanki-classic-selected-category', categories[0].id);
        }
      }
    } catch (error) {
      console.error('[DeckStudyPage] 分类加载失败:', error);
    }
  }
  
  // 🆕 分类选择处理
  function handleCategorySelect(categoryId: string) {
    selectedCategoryId = categoryId;
    localStorage.setItem('tuanki-classic-selected-category', categoryId);
  }
  
  // 🆕 检查牌组是否属于指定分类
  function isDeckInCategory(node: DeckTreeNode, categoryId: string): boolean {
    const deck = decks.find(d => d.id === node.deck.id);
    if (!deck) return false;
    
    // 检查牌组自身是否包含该分类
    if (deck.categoryIds && deck.categoryIds.includes(categoryId)) {
      return true;
    }
    
    // 检查子牌组是否包含该分类
    return node.children.some(child => isDeckInCategory(child, categoryId));
  }
  
  // 🆕 过滤后的牌组树（用于经典视图）
  const filteredDeckTree = $derived(() => {
    if (!selectedCategoryId || currentView !== 'classic') {
      return deckTree;
    }
    
    // 类型保护：确保 selectedCategoryId 不是 null
    const categoryId: string = selectedCategoryId;
    return deckTree.filter(node => isDeckInCategory(node, categoryId));
  });
  
  // 加载学习历史数据
  async function loadStudySessions() {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      studySessions = await dataStorage.getStudySessions({
        since: thirtyDaysAgo.toISOString()
      });
    } catch (error) {
      console.error('[DeckStudyPage] 加载学习历史失败:', error);
      studySessions = [];
    }
  }
  
  // 获取最近学习的牌组ID
  function getRecentlyStudiedDeck(): string | null {
    if (studySessions.length === 0) return null;
    
    // 按开始时间倒序排序
    const sorted = [...studySessions].sort((a, b) => 
      new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );
    
    // 返回最近一次学习的牌组ID
    return sorted[0].deckId;
  }
  
  // 继续学习功能（选择最近学习的牌组）
  async function handleContinueStudy() {
    try {
      // 尝试获取最近学习的牌组
      let targetDeckId = getRecentlyStudiedDeck();
      
      // 如果没有最近学习记录，选择第一个有待办的牌组
      if (!targetDeckId) {
        for (const deckId of Object.keys(deckStats)) {
          const stats = deckStats[deckId];
          const totalDue = (stats?.newCards ?? 0) + (stats?.learningCards ?? 0) + (stats?.reviewCards ?? 0);
          if (totalDue > 0) {
            targetDeckId = deckId;
            break;
          }
        }
      }
      
      // 如果找到了目标牌组，开始学习
      if (targetDeckId) {
        await startStudy(targetDeckId);
      } else {
        new Notice('没有需要学习的卡片');
      }
    } catch (error) {
      console.error('[DeckStudyPage] 继续学习失败:', error);
      new Notice('启动学习时出错，请重试');
    }
  }

  // 加载牌组树
  async function loadDeckTree() {
    try {
      // 🛡️ 等待 deckHierarchy 服务就绪
      const deckHierarchy = await waitForService(
        () => plugin?.deckHierarchy,
        'deckHierarchy',
        5000
      );
      
      deckTree = await deckHierarchy.getDeckTree();
      
      // 首次加载时从 localStorage 恢复展开状态
      const hasStoredState = localStorage.getItem('tuanki-deck-expanded-state');
      
      if (hasStoredState) {
        // 恢复保存的展开状态
        loadExpandedState();
      } else if (expandedDeckIds.size === 0) {
        // 首次使用，默认展开根级牌组
        deckTree.forEach(node => {
          expandedDeckIds.add(node.deck.id);
        });
        expandedDeckIds = new Set(expandedDeckIds);
        saveExpandedState();
      }
    } catch (error) {
      console.error('[DeckStudyPage] Failed to load deck tree:', error);
      deckTree = [];
    }
  }

  // 计算牌组统计
  async function calculateDeckStats() {
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const stats: Record<string, DeckStats> = {};

    for (const card of allCards) {
      const deckId = card.deckId;
      if (!stats[deckId]) {
        stats[deckId] = {
          totalCards: 0,
          newCards: 0,
          learningCards: 0,
          reviewCards: 0,
          todayNew: 0,
          todayReview: 0,
          todayTime: 0,
          totalReviews: 0,
          totalTime: 0,
          memoryRate: 0,
          averageEase: 0,
          forecastDays: {}
        };
      }

      const due = new Date(card.fsrs.due) <= now;
      if (card.fsrs.state === 0) stats[deckId].newCards += 1;
      else if (card.fsrs.state === 1) stats[deckId].learningCards += 1;
      else if (card.fsrs.state === 2 && due) stats[deckId].reviewCards += 1;

      // 计算记忆率
      const elapsed = Math.max(0, card.fsrs.elapsedDays || 0);
      const stability = Math.max(0.01, card.fsrs.stability || 0.01);
      const retention = Math.exp(-elapsed / stability);
      stats[deckId].memoryRate += retention;
    }

    // 计算平均记忆率和总卡片数
    for (const deckId of Object.keys(stats)) {
      const deckCards = allCards.filter(card => card.deckId === deckId);
      const total = Math.max(1, deckCards.length);
      stats[deckId].memoryRate = stats[deckId].memoryRate / total;
      stats[deckId].totalCards = deckCards.length;
    }

    deckStats = stats;
  }

  // 处理APKG导入完成
  async function handleAPKGImportComplete(result: ImportResult) {
    if (result.success) {
      const message = `导入成功！牌组: ${result.deckName || '未知'}, 导入: ${result.stats.importedCards} 张卡片`;
      const N = (plugin as any).app?.plugins?.plugins?.obsidian?.Notice ||
                 (globalThis as any).Notice || console.log;
      if (typeof N === 'function') {
        new N(`✅ ${message}`, 5000);
      }

      // 刷新牌组列表
      await refreshData();
    } else {
      const errorMessage = result.errors && result.errors.length > 0
        ? result.errors[0].message
        : '导入失败';
      const N = (plugin as any).app?.plugins?.plugins?.obsidian?.Notice ||
                 (globalThis as any).Notice || console.error;
      if (typeof N === 'function') {
        new N(`❌ ${errorMessage}`, 8000);
      }
    }
  }


  async function importCSV() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const result = await parseAndImportCSV(text, file.name);
        
        if (result.success) {
          const N = (plugin as any).app?.plugins?.plugins?.obsidian?.Notice || 
                 (globalThis as any).Notice ||
                 console.log;
          if (typeof N === 'function') {
            new N(`成功导入 ${result.cardsCount} 张卡片到牌组 "${result.deckName}"`, 5000);
          }
          // 刷新牌组列表
          await refreshData();
        } else {
          throw new Error(result.error || '导入失败');
        }
      } catch (err) {
        console.error('CSV导入失败', err);
        const N = (plugin as any).app?.plugins?.plugins?.obsidian?.Notice || 
               (globalThis as any).Notice ||
               console.error;
        if (typeof N === 'function') {
          const message = err instanceof Error ? err.message : String(err);
          new N(`CSV导入失败: ${message}`, 5000);
        }
      }
    };
    input.click();
  }

  async function parseAndImportCSV(csvText: string, fileName: string): Promise<{
    success: boolean;
    error?: string;
    cardsCount?: number;
    deckName?: string;
  }> {
    try {
      // 解析CSV文本
      const lines = csvText.split('\n').map(line => line.trim()).filter(line => line);
      if (lines.length < 2) {
        throw new Error('CSV文件至少需要包含标题行和一行数据');
      }

      // 解析标题行
      const headers = parseCSVLine(lines[0]);
      const questionIndex = findColumnIndex(headers, ['question', '问题', 'front', '正面', '题目']);
      const answerIndex = findColumnIndex(headers, ['answer', '答案', 'back', '背面', '答复']);

      if (questionIndex === -1 || answerIndex === -1) {
        throw new Error('CSV文件必须包含问题和答案列。支持的列名：question/问题/front/正面/题目 和 answer/答案/back/背面/答复');
      }

      // 创建新牌组
      const deckName = fileName.replace(/\.csv$/i, '');
      const newDeck: Deck = {
        id: generateId(),
        name: deckName,
        description: `从CSV文件导入: ${fileName}`,
        category: 'imported',
        // 层级结构字段
        path: deckName,
        level: 0,
        order: 0,
        inheritSettings: false,
        includeSubdecks: false,
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        settings: {
          newCardsPerDay: 20,
          maxReviewsPerDay: 100,
          enableAutoAdvance: false,
          showAnswerTime: 0,
          fsrsParams: {
            w: [0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61],
            requestRetention: 0.9,
            maximumInterval: 36500,
            enableFuzz: true
          },
          learningSteps: [1, 10],
          relearningSteps: [10],
          graduatingInterval: 1,
          easyInterval: 4
        },
        stats: {
          totalCards: 0,
          newCards: 0,
          learningCards: 0,
          reviewCards: 0,
          todayNew: 0,
          todayReview: 0,
          todayTime: 0,
          totalReviews: 0,
          totalTime: 0,
          memoryRate: 0,
          averageEase: 2.5,
          forecastDays: {}
        },
        tags: ['csv-import'],
        metadata: {
          importedFrom: fileName,
          importDate: new Date().toISOString()
        }
      };

      // 保存牌组
      const deckResult = await dataStorage.saveDeck(newDeck);
      if (!deckResult.success) {
        throw new Error(`创建牌组失败: ${deckResult.error}`);
      }

      // 解析数据行并创建卡片
      const cards: Card[] = [];
      for (let i = 1; i < lines.length; i++) {
        const row = parseCSVLine(lines[i]);
        if (row.length <= Math.max(questionIndex, answerIndex)) continue;

        const question = row[questionIndex]?.trim();
        const answer = row[answerIndex]?.trim();

        if (!question || !answer) continue;

        // 创建额外字段
        const extraFields: Record<string, string> = {};
        headers.forEach((header, index) => {
          if (index !== questionIndex && index !== answerIndex && row[index]) {
            extraFields[header] = row[index].trim();
          }
        });

        const card: Card = {
          id: generateId(),
          uuid: generateUUID(),
          deckId: newDeck.id,
          templateId: 'default',
          type: CardType.Basic,
          // content是唯一持久化的内容来源
          content: `${question}\n---div---\n${answer}`,
          fields: {
            question,
            answer,
            ...extraFields
          },
          fsrs: fsrs.createCard(),
          reviewHistory: [],
          stats: {
            totalReviews: 0,
            totalTime: 0,
            averageTime: 0,
            memoryRate: 0
          },
          created: new Date().toISOString(),
          modified: new Date().toISOString()
        };

        cards.push(card);
      }

      if (cards.length === 0) {
        throw new Error('没有找到有效的卡片数据');
      }

      // 批量保存卡片
      let successCount = 0;
      for (const card of cards) {
        const result = await dataStorage.saveCard(card);
        if (result.success) {
          successCount++;
        }
      }

      return {
        success: true,
        cardsCount: successCount,
        deckName: newDeck.name
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    let i = 0;

    while (i < line.length) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // 转义的双引号
          current += '"';
          i += 2;
        } else {
          // 开始或结束引号
          inQuotes = !inQuotes;
          i++;
        }
      } else if (char === ',' && !inQuotes) {
        // 字段分隔符
        result.push(current);
        current = '';
        i++;
      } else {
        current += char;
        i++;
      }
    }
    
    result.push(current);
    return result;
  }

  function findColumnIndex(headers: string[], possibleNames: string[]): number {
    for (const name of possibleNames) {
      const index = headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
      if (index !== -1) return index;
    }
    return -1;
  }

  async function exportDeck() {
    try {
      const data = await dataStorage.exportData();
      const dataStr = JSON.stringify(data, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `anki-data-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('导出失败', e);
    }
  }


  async function startStudy(deckId: string) {
    try {
      const deck = decks.find(d => d.id === deckId);
      const allDeckCards = await dataStorage.getCards({ deckId });
      
      // 🆕 应用新卡片每日限额逻辑
      const newCardsPerDay = plugin.settings.newCardsPerDay || 20;
      const reviewsPerDay = plugin.settings.reviewsPerDay || 20;
      
      // 获取今天已学习的新卡片数量
      const learnedNewCardsToday = await getLearnedNewCardsCountToday(dataStorage, deckId);
      
      // ✅ 使用新的完成判定逻辑
      const isComplete = isDeckCompleteForToday(allDeckCards, newCardsPerDay, learnedNewCardsToday);
      
      if (isComplete) {
        // 🎉 学习已完成，显示庆祝动画
        console.log(`[DeckStudyPage] ✅ 牌组 ${deckId} 今日学习已完成`);
        
        // TODO: 这里可以添加"提前学习"选项
        // const advanceCards = getAdvanceStudyCards(allDeckCards, 20);
        
      } else {
        // ✅ 使用新的辅助函数加载卡片（应用新卡片限额）
        studyCards = await loadDeckCardsForStudy(
          dataStorage,
          deckId,
          newCardsPerDay,
          reviewsPerDay
        );
        
        console.log(`[DeckStudyPage] ✅ 加载卡片: ${studyCards.length}, 新卡片限额: ${newCardsPerDay}, 今日已学: ${learnedNewCardsToday}`);
      }

      // 只有在确定有卡片可学时才打开学习界面
      if (studyCards.length > 0) {
        // 🆕 使用学习会话入口（标签页模式）
        await plugin.openStudySession(deckId);
      } else {
        // 🎉 智能判断：是完成学习还是空牌组
        const stats = deckStats[deckId];
        const totalCards = stats?.totalCards ?? 0;
        
        if (totalCards > 0) {
          // ✨ 有卡片但都已学完 → 显示庆祝动画
          
          // 防重复逻辑：30分钟内同一牌组不重复显示
          const lastShownKey = `celebration-last-shown-${deckId}`;
          const lastShown = localStorage.getItem(lastShownKey);
          const currentTime = Date.now();
          const thirtyMinutes = 1800000; // 30分钟
          
          const shouldShowCelebration = !lastShown || (currentTime - parseInt(lastShown)) > thirtyMinutes;
          
          if (shouldShowCelebration) {
            // 计算统计数据
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayEnd = new Date();
            todayEnd.setHours(23, 59, 59, 999);
            
            const todaySessions = studySessions.filter(s => {
              const sessionDate = new Date(s.startTime);
              return s.deckId === deckId && sessionDate >= today && sessionDate <= todayEnd;
            });
            
            const todayStudyTime = todaySessions.reduce((sum, s) => sum + (s.totalTime || 0), 0) / 1000; // 秒
            const todayReviewed = todaySessions.reduce((sum, s) => sum + (s.cardsReviewed || 0), 0);
            
            celebrationDeckName = deck?.name || '牌组';
            celebrationStats = {
              reviewed: todayReviewed,
              studyTime: todayStudyTime,
              memoryRate: stats?.memoryRate ?? 0.9,
              newCards: stats?.newCards ?? 0
            };
            showCelebrationModal = true;
            
            // 记录显示时间
            localStorage.setItem(lastShownKey, currentTime.toString());
          } else {
            // 30分钟内已显示过，但仍显示庆祝（用户主动点击）
            // 计算统计数据
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayEnd = new Date();
            todayEnd.setHours(23, 59, 59, 999);
            
            const todaySessions = studySessions.filter(s => {
              const sessionDate = new Date(s.startTime);
              return s.deckId === deckId && sessionDate >= today && sessionDate <= todayEnd;
            });
            
            const todayStudyTime = todaySessions.reduce((sum, s) => sum + (s.totalTime || 0), 0) / 1000;
            const todayReviewed = todaySessions.reduce((sum, s) => sum + (s.cardsReviewed || 0), 0);
            
            celebrationDeckName = deck?.name || '牌组';
            celebrationStats = {
              reviewed: todayReviewed,
              studyTime: todayStudyTime,
              memoryRate: stats?.memoryRate ?? 0.9,
              newCards: stats?.newCards ?? 0
            };
            showCelebrationModal = true;
          }
        } else {
          // ⚠️ 空牌组 → 普通提示
          new Notice('牌组中还没有卡片哦~', 3000);
        }
      }
    } catch (error) {
      console.error('Error starting study:', error);
      const N = (plugin as any).app?.plugins?.plugins?.obsidian?.Notice || (globalThis as any).Notice;
      if (typeof N === 'function') {
        new N('启动学习时出错，请重试。', 3000);
      }
    }
  }

  /**
   * 🆕 启动提前学习（学习未到期的复习卡片）
   */
  async function startAdvanceStudy(deckId: string) {
    try {
      const deck = decks.find(d => d.id === deckId);
      const allDeckCards = await dataStorage.getCards({ deckId });
      
      // 🔑 获取未到期的复习卡片
      const advanceCards = getAdvanceStudyCards(allDeckCards, 20);
      
      if (advanceCards.length === 0) {
        new Notice('暂无可提前学习的卡片');
        return;
      }
      
      console.log(`[DeckStudyPage] 🆕 提前学习: ${advanceCards.length} 张卡片`);
      
      // 🔑 传递卡片ID列表和学习模式到学习界面
      await plugin.openStudySession({
        deckId,
        mode: 'advance',
        cardIds: advanceCards.map(card => card.id)
      });
      
      new Notice(`开始提前学习（${advanceCards.length} 张未到期卡片）`);
    } catch (error) {
      console.error('[DeckStudyPage] 启动提前学习失败:', error);
      new Notice('启动提前学习失败');
    }
  }
  
  // 🎉 关闭庆祝模态窗
  function handleCloseCelebration() {
    showCelebrationModal = false;
    celebrationStats = null;
  }

  async function handleStudyComplete(session: StudySession) {
    // 清理状态
    studyCards = [];
    
    // 🆕 刷新数据（学习完成后统计数据已变化）
    await refreshData();
    
    // 🗑️ 已移除旧的 CustomEvent 触发（tuanki:refresh-decks）
    // 现在通过 DataSyncService 在 saveStudySession 时自动通知
    
    // 🎉 显示庆祝界面
    const deck = decks.find(d => d.id === session.deckId);
    if (deck) {
      const stats = deckStats[session.deckId];
      
      celebrationDeckName = deck.name;
      celebrationStats = {
        reviewed: session.cardsReviewed || 0,
        studyTime: session.totalTime ? session.totalTime / 1000 : 0,
        memoryRate: stats?.memoryRate ?? 0.9,
        newCards: stats?.newCards ?? 0
      };
      showCelebrationModal = true;
      
      // 记录显示时间
      const lastShownKey = `celebration-last-shown-${session.deckId}`;
      localStorage.setItem(lastShownKey, Date.now().toString());
    }
  }

  // ⚠️ closeStudyModal 已废弃 - 学习界面现在由 plugin.openStudySession() 管理
  // function closeStudyModal() {
  //   showStudyModal = false;
  //   studyCards = [];
  // }

  async function editDeck(deckId: string) {
    const deck = decks.find(d => d.id === deckId);
    if (!deck) return;
    editingDeck = deck;
    showEditDeckModal = true;
  }

  async function deleteDeck(deckId: string) {
    try {
      // 🛡️ 等待 deckHierarchy 服务就绪
      const deckHierarchy = await waitForService(
        () => plugin?.deckHierarchy,
        'deckHierarchy',
        5000
      );
      
      // 1. 检查是否有子牌组
      const children = await deckHierarchy.getChildren(deckId);
      const descendants = await deckHierarchy.getDescendants(deckId);
      
      // 2. 构建确认消息
      let confirmMessage = '确定要删除该牌组及其所有卡片吗？';
      if (descendants.length > 0) {
        confirmMessage = `该牌组包含 ${descendants.length} 个子牌组，将一并删除。\n\n` +
                         `子牌组列表：\n${descendants.map(d => `• ${d.name}`).slice(0, 5).join('\n')}` +
                         (descendants.length > 5 ? `\n...还有 ${descendants.length - 5} 个` : '') +
                         '\n\n确定要删除吗？';
      }
      
      const confirmed = confirm(confirmMessage);
      if (!confirmed) return;
      
      // 3. 显示删除进度
      new Notice('🗑️ 正在删除牌组...');
      
      // 4. 使用级联删除方法
      await deckHierarchy.deleteDeckWithChildren(deckId);
      
      // 5. 刷新数据
      decks = await dataStorage.getDecks();
      await refreshData();
      
      // 6. 显示成功消息
      const totalDeleted = descendants.length + 1;
      new Notice(`✅ 成功删除 ${totalDeleted} 个牌组`);
    } catch (error) {
      console.error('[DeckStudyPage] 删除牌组失败:', error);
      new Notice(`❌ 删除失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  type RowMenuItem = { id: string; label: string; icon?: string; onClick: () => void };

  function analyzeDeck(deckId: string) {
    console.log("Analyze deck:", deckId);

    // 获取牌组信息
    const deck = decks.find(d => d.id === deckId);
    if (!deck) {
      console.error("Deck not found:", deckId);
      return;
    }

    // 获取牌组的卡片
    const deckCards = allCards.filter(card => card.deckId === deckId);

    // 简单的分析提示
    const N = (plugin as any).app?.plugins?.plugins?.obsidian?.Notice || (globalThis as any).Notice;
    if (typeof N === 'function') {
      new N(`正在分析牌组: ${deck.name}，共 ${deckCards.length} 张卡片`, 2000);
    }

    // TODO: 可以在这里添加其他分析功能，比如导出统计数据等
  }

  // 创建子牌组
  function createSubdeck(parentDeckId: string) {
    createSubdeckParentId = parentDeckId;
    showCreateDeckModal = true;
  }

  // 移动牌组
  function moveDeck(deckId: string) {
    const deck = decks.find(d => d.id === deckId);
    if (deck) {
      movingDeck = deck;
      showMoveDeckModal = true;
    }
  }

  // 确认移动牌组
  async function handleMoveDeckConfirm(targetParentId: string | null) {
    if (!movingDeck) return;

    try {
      new Notice('🔄 正在移动牌组...');
      
      // 🛡️ 等待 deckHierarchy 服务就绪
      const deckHierarchy = await waitForService(
        () => plugin?.deckHierarchy,
        'deckHierarchy',
        5000
      );
      
      await deckHierarchy.moveDeck(movingDeck.id, targetParentId);
      
      // 刷新数据
      await refreshData();
      
      new Notice('✅ 牌组移动成功');
    } catch (error) {
      console.error('[DeckStudyPage] 移动牌组失败:', error);
      new Notice(`❌ 移动失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      showMoveDeckModal = false;
      movingDeck = null;
    }
  }

  // 取消移动牌组
  function handleMoveDeckCancel() {
    showMoveDeckModal = false;
    movingDeck = null;
  }

  // 🆕 显示分类选择菜单
  async function showCategoryMenu(event: MouseEvent, deckId: string) {
    const { getCategoryStorage } = await import('../../data/CategoryStorage');
    const categoryStorage = getCategoryStorage();
    await categoryStorage.initialize();
    const categories = await categoryStorage.getCategories();
    
    const deck = decks.find(d => d.id === deckId);
    if (!deck) return;
    
    const menu = new Menu();
    
    categories.forEach((cat: import('../../data/types').DeckCategory) => {
      menu.addItem((item) => {
        const isSelected = deck.categoryIds?.includes(cat.id) || false;
        item
          .setTitle(cat.name)
          .setChecked(isSelected)
          .onClick(async () => {
            // 切换分类选择
            let newCategoryIds: string[] = [];
            if (deck.categoryIds && deck.categoryIds.length > 0) {
              if (isSelected) {
                // 取消选择（至少保留一个分类）
                newCategoryIds = deck.categoryIds.filter(id => id !== cat.id);
                if (newCategoryIds.length === 0) {
                  new Notice('至少需要保留一个分类');
                  return;
                }
              } else {
                // 添加选择
                newCategoryIds = [...deck.categoryIds, cat.id];
              }
            } else {
              // 首次添加分类
              newCategoryIds = [cat.id];
            }
            
            // 保存更新
            deck.categoryIds = newCategoryIds;
            await dataStorage.saveDeck(deck);
            await refreshData();
            new Notice(`已更新分类`);
          });
      });
    });
    
    menu.showAtMouseEvent(event);
  }

  // 使用 Obsidian 原生 Menu
  function showDeckMenu(event: MouseEvent, deckId: string) {
    const menu = new Menu();
    
    // 获取牌组信息以判断是否为子牌组
    const deck = decks.find(d => d.id === deckId);
    const isSubdeck = deck?.parentId != null;

    // 🆕 提前学习功能
    menu.addItem((item) =>
      item
        .setTitle("提前学习")
        .setIcon("fast-forward")
        .onClick(async () => await startAdvanceStudy(deckId))
    );

    menu.addSeparator();

    menu.addItem((item) =>
      item
        .setTitle("创建子牌组")
        .setIcon("folder-plus")
        .onClick(() => createSubdeck(deckId))
    );

    menu.addItem((item) =>
      item
        .setTitle("移动牌组")
        .setIcon("move")
        .onClick(() => moveDeck(deckId))
    );
    
    // 🆕 移动分类（仅父牌组可用）
    menu.addItem((item) => {
      item
        .setTitle("移动分类")
        .setIcon("tag");
      
      if (isSubdeck) {
        // 子牌组禁用此选项
        item.setDisabled(true);
      } else {
        // 父牌组启用此选项
        item.onClick((e) => {
          showCategoryMenu(e as any, deckId);
        });
      }
      
      return item;
    });

    menu.addSeparator();

    menu.addItem((item) =>
      item
        .setTitle("编辑")
        .setIcon("edit")
        .onClick(() => editDeck(deckId))
    );

    menu.addItem((item) =>
      item
        .setTitle("删除")
        .setIcon("trash-2")
        .onClick(() => deleteDeck(deckId))
    );

    menu.addSeparator();

    menu.addItem((item) =>
      item
        .setTitle("分析")
        .setIcon("bar-chart-2")
        .onClick(() => analyzeDeck(deckId))
    );

    menu.showAtMouseEvent(event);
  }

  // 展开/折叠功能
  function toggleExpand(deckId: string) {
    if (expandedDeckIds.has(deckId)) {
      expandedDeckIds.delete(deckId);
    } else {
      expandedDeckIds.add(deckId);
    }
    expandedDeckIds = new Set(expandedDeckIds);
    
    // 保存到 localStorage
    saveExpandedState();
  }

  function isExpanded(deckId: string): boolean {
    return expandedDeckIds.has(deckId);
  }

  // 保存展开状态到 localStorage
  function saveExpandedState() {
    try {
      const stateArray = Array.from(expandedDeckIds);
      localStorage.setItem('tuanki-deck-expanded-state', JSON.stringify(stateArray));
    } catch (error) {
      console.error('Failed to save expanded state:', error);
    }
  }

  // 从 localStorage 加载展开状态
  function loadExpandedState() {
    try {
      const saved = localStorage.getItem('tuanki-deck-expanded-state');
      if (saved) {
        const stateArray = JSON.parse(saved);
        expandedDeckIds = new Set(stateArray);
      }
    } catch (error) {
      console.error('Failed to load expanded state:', error);
      expandedDeckIds = new Set();
    }
  }

  // 递归计算牌组总卡片数（包含子牌组）
  function getTotalCards(node: DeckTreeNode): number {
    const stats = deckStats[node.deck.id] || { newCards: 0, learningCards: 0, reviewCards: 0 };
    let total = stats.newCards + stats.learningCards + stats.reviewCards;
    
    for (const child of node.children) {
      total += getTotalCards(child);
    }
    
    return total;
  }

  // 递归计算子牌组的统计（不包含自己）
  function getSubdeckStats(node: DeckTreeNode): { newCards: number; learningCards: number; reviewCards: number } {
    let newCards = 0;
    let learningCards = 0;
    let reviewCards = 0;

    for (const child of node.children) {
      const childStats = deckStats[child.deck.id] || { newCards: 0, learningCards: 0, reviewCards: 0 };
      newCards += childStats.newCards;
      learningCards += childStats.learningCards;
      reviewCards += childStats.reviewCards;

      // 递归累加子牌组的子牌组
      const subStats = getSubdeckStats(child);
      newCards += subStats.newCards;
      learningCards += subStats.learningCards;
      reviewCards += subStats.reviewCards;
    }

    return { newCards, learningCards, reviewCards };
  }

  // 获取总统计（本牌组 + 所有子牌组）
  function getTotalStats(node: DeckTreeNode): { newCards: number; learningCards: number; reviewCards: number; total: number } {
    const ownStats = deckStats[node.deck.id] || { newCards: 0, learningCards: 0, reviewCards: 0 };
    const subStats = getSubdeckStats(node);

    const newCards = ownStats.newCards + subStats.newCards;
    const learningCards = ownStats.learningCards + subStats.learningCards;
    const reviewCards = ownStats.reviewCards + subStats.reviewCards;

    return {
      newCards,
      learningCards,
      reviewCards,
      total: newCards + learningCards + reviewCards
    };
  }


  // 初始化加载牌组和卡片
  // 初始化数据加载
  $effect(() => {
    (async () => {
      try {
        isLoading = true;
        await refreshData();
      } catch (error) {
        console.error('[DeckStudyPage] ❌ 初始化失败:', error);
        // 即使初始化失败，也不阻止组件渲染
        // 用户可以通过手动刷新重试
      } finally {
        isLoading = false;
      }
    })();
  });

  // 🗑️ 已移除旧的 CustomEvent 监听器（tuanki:refresh-decks）
  // 现在使用 DataSyncService 在 onMount 中统一订阅数据变更

  // 监听导航栏功能键事件
  $effect(() => {
    const handleCreateDeck = () => {
      showCreateDeckModal = true;
    };

    const handleMoreActions = (e: Event) => {
      // 从 CustomEvent 中获取原始鼠标事件
      const customEvent = e as CustomEvent<{ event: MouseEvent }>;
      const mouseEvent = customEvent.detail?.event;
      if (mouseEvent) {
        showMoreActionsMenu(mouseEvent);
      }
    };

    document.addEventListener('create-deck', handleCreateDeck);
    document.addEventListener('more-actions', handleMoreActions);

    return () => {
      document.removeEventListener('create-deck', handleCreateDeck);
      document.removeEventListener('more-actions', handleMoreActions);
    };
  });



  function getUrgencyLevel(stats: any): 'urgent' | 'due' | 'completed' | 'normal' {
    if (!stats) return 'normal';

    const reviewCards = stats.reviewCards ?? 0;
    const newCards = stats.newCards ?? 0;
    const learningCards = stats.learningCards ?? 0;

    if (reviewCards > 10) return 'urgent';
    if (reviewCards > 0 || learningCards > 0) return 'due';
    if (newCards === 0 && reviewCards === 0 && learningCards === 0) return 'completed';
    return 'normal';
  }


</script>

{#snippet deckNode(node: DeckTreeNode, depth: number)}
  {@const stats = deckStats[node.deck.id]}
  {@const totalDue = (stats?.newCards ?? 0) + (stats?.learningCards ?? 0) + (stats?.reviewCards ?? 0)}
  {@const urgencyLevel = getUrgencyLevel(stats)}
  {@const hasChildren = node.children.length > 0}
  {@const expanded = isExpanded(node.deck.id)}

  <div
    class="new-deck-row anki-font-interface"
    class:urgent={urgencyLevel === 'urgent'}
    class:due={urgencyLevel === 'due'}
    class:completed={totalDue === 0}
    class:has-children={hasChildren}
    style="padding-left: {depth * 24}px"
    role="button"
    tabindex="0"
    oncontextmenu={(e) => {
      e.preventDefault();
      showDeckMenu(e, node.deck.id);
    }}
  >
    <!-- 展开/折叠按钮 -->
    <div class="row-deck-name">
      {#if hasChildren}
        <button
          class="expand-toggle"
          onclick={(e) => {
            e.stopPropagation();
            toggleExpand(node.deck.id);
          }}
          aria-label={expanded ? "折叠" : "展开"}
        >
          <ObsidianIcon 
            name={expanded ? "chevron-down" : "chevron-right"} 
            size={14} 
          />
        </button>
      {:else}
        <span class="expand-spacer"></span>
      {/if}

      <div class="deck-name-content">
        {#if node.deck.icon}
          <span class="deck-emoji">{node.deck.icon}</span>
        {/if}
        <span class="deck-name">{node.deck.name}</span>
        
        <!-- 牌组类型徽章 -->
        {#if node.deck.deckType === 'choice-only'}
          <span class="choice-deck-badge">
            <ObsidianIcon name="check-square" size={12} />
            <span>选择题</span>
          </span>
        {:else if node.deck.deckType === 'video-course'}
          <span class="video-deck-badge">
            <ObsidianIcon name="film" size={12} />
            <span>视频课程</span>
          </span>
        {/if}
        
        <!-- 子牌组统计气泡（仅当有子牌组时显示） -->
        {#if hasChildren}
          {@const totalStats = getTotalStats(node)}
          {@const subStats = getSubdeckStats(node)}
          {@const subTotal = subStats.newCards + subStats.learningCards + subStats.reviewCards}
          {#if subTotal > 0}
            <span class="subdeck-indicator" title={`包含 ${subTotal} 张子牌组卡片 (新卡: ${subStats.newCards}, 学习: ${subStats.learningCards}, 复习: ${subStats.reviewCards})`}>
              +{subTotal}
            </span>
          {/if}
        {/if}
        
        {#if urgencyLevel === 'urgent'}
          <span class="deck-status urgent">紧急</span>
        {:else if totalDue === 0}
          <span class="deck-status completed">完成</span>
        {/if}
      </div>
    </div>

    <!-- 统计数据区域（仅显示本牌组的统计） -->
    <div class="row-stats-group">
      <div class="row-stat new-cards">
        <span class="stat-number">{stats?.newCards ?? 0}</span>
      </div>
      <div class="row-stat learning-cards">
        <span class="stat-number">{stats?.learningCards ?? 0}</span>
      </div>
      <div class="row-stat review-cards">
        <span class="stat-number">{stats?.reviewCards ?? 0}</span>
      </div>
    </div>

    <!-- 操作 -->
    <div class="row-actions">
      <div class="deck-actions">
        {#if totalDue > 0}
          <button
            class="study-button primary"
            onclick={() => startStudy(node.deck.id)}
          >
            <ObsidianIcon name="play" size={16} />
            学习 ({totalDue})
          </button>
        {:else}
          <button
            class="study-button completed"
            disabled
          >
            <ObsidianIcon name="check" size={16} />
            完成
          </button>
        {/if}

        <button
          class="icon-button menu-button"
          onclick={(e) => {
            e.stopPropagation();
            showDeckMenu(e, node.deck.id);
          }}
          aria-label="更多操作"
        >
          <EnhancedIcon name="more-horizontal" size={16} />
        </button>
      </div>
    </div>
  </div>

  <!-- 递归渲染子节点 -->
  {#if expanded && hasChildren}
    {#each node.children as child}
      {@render deckNode(child, depth + 1)}
    {/each}
  {/if}
{/snippet}

<div class="anki-app deck-study-page">
  <!-- 🎯 加载动画 - 全屏显示 -->
  {#if isLoading}
    <div class="deck-loading-overlay">
      <BouncingBallsLoader message="正在加载牌组数据..." />
    </div>
  {:else}
  <div class="deck-study-content">
    <!-- 🆕 条件渲染不同视图 -->
    {#if currentView === 'grid'}
      <!-- 网格卡片视图 -->
      <GridCardView 
        {deckTree}
        {deckStats}
        {studySessions}
        {plugin}
        onStartStudy={startStudy}
        onContinueStudy={handleContinueStudy}
        onCreateSubdeck={createSubdeck}
        onMoveDeck={moveDeck}
        onEditDeck={editDeck}
        onDeleteDeck={deleteDeck}
        onAnalyzeDeck={analyzeDeck}
        onRefreshData={refreshData}
      />
    {:else if currentView === 'classic'}
      <!-- 经典列表视图 -->
      <div class="deck-list-container">
        <!-- 🆕 彩色圆点分类过滤器 -->
        {#if categories.length > 0}
          <div class="category-filter-wrapper">
            <CategoryFilter 
              {categories}
              {selectedCategoryId}
              onSelect={handleCategorySelect}
            />
          </div>
        {/if}
        
        <div class="new-deck-header">
          <div class="header-deck-name">牌组名称</div>
          <div class="header-stats-group">
            <div class="header-stat">新卡片</div>
            <div class="header-stat">学习中</div>
            <div class="header-stat">待复习</div>
          </div>
          <div class="header-actions">操作</div>
        </div>

        <div class="deck-list-body">
          {#each filteredDeckTree() as node}
            {@render deckNode(node, 0)}
          {/each}
        </div>
      </div>
     {:else if currentView === 'kanban'}
       <!-- 看板视图 -->
       <KanbanView 
         {deckTree}
         {deckStats}
         {dataStorage}
         onStartStudy={startStudy}
         onDeckUpdate={refreshData}
       />
    {/if}
  </div>
  {/if}
</div>

<!-- ⚠️ 学习模态窗已移除 - 现在使用 plugin.openStudySession() -->
<!-- 
  学习界面现在通过 plugin.openStudySession() 打开（标签页模式）
-->
<!-- 
{#if showStudyModal}
  <StudyInterface
    cards={studyCards}
    {fsrs}
    {dataStorage}
    {plugin}
    onClose={closeStudyModal}
    onComplete={handleStudyComplete}
  />
{/if}
-->


<!-- 编辑牌组模态窗（复用 CreateDeckModal 的编辑模式） -->
{#if showEditDeckModal && editingDeck}
  <CreateDeckModal
    open={showEditDeckModal}
    {plugin}
    {dataStorage}
    mode="edit"
    initialDeck={editingDeck}
    onClose={() => { showEditDeckModal = false; editingDeck = null; }}
    onUpdated={() => { showEditDeckModal = false; editingDeck = null; refreshData(); }}
  />
{/if}

<!-- 新建牌组模态窗 -->
{#if showCreateDeckModal}
  <CreateDeckModal
    open={showCreateDeckModal}
    {plugin}
    {dataStorage}
    parentDeckId={createSubdeckParentId}
    onClose={() => { 
      showCreateDeckModal = false; 
      createSubdeckParentId = null;
    }}
    onCreated={async () => { 
      showCreateDeckModal = false; 
      createSubdeckParentId = null;
      await refreshData(); 
    }}
  />
{/if}

<!-- APKG导入模态窗 -->
{#if showAPKGImportModal}
  <APKGImportModal
    show={showAPKGImportModal}
    {plugin}
    {dataStorage}
    wasmUrl="https://cdn.jsdelivr.net/npm/sql.js@1.8.0/dist/sql-wasm.wasm"
    onClose={() => { showAPKGImportModal = false; }}
    onImportComplete={handleAPKGImportComplete}
  />
{/if}

<!-- 移动牌组模态窗 -->
{#if showMoveDeckModal && movingDeck}
  <MoveDeckModal
    open={showMoveDeckModal}
    currentDeck={movingDeck}
    {deckTree}
    onconfirm={handleMoveDeckConfirm}
    oncancel={handleMoveDeckCancel}
  />
{/if}

<!-- 🎉 庆祝模态窗 -->
{#if showCelebrationModal && celebrationStats}
  <CelebrationModal
    deckName={celebrationDeckName}
    stats={celebrationStats}
    soundEnabled={true}
    soundVolume={0.5}
    onClose={handleCloseCelebration}
  />
{/if}

<!-- 🔒 激活提示 -->
<ActivationPrompt
  featureId={promptFeatureId}
  visible={showActivationPrompt}
  onClose={() => showActivationPrompt = false}
/>

<style>
  .deck-study-page {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--background-primary);
    overflow: hidden;
    /* ✅ 不需要 position: relative，庆祝模态窗使用 fixed 定位 */
    min-height: 100vh;
  }

  /* 🎯 加载覆盖层 */
  .deck-loading-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--background-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    animation: fadeIn 0.3s ease-in-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .deck-study-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 1rem;
    overflow: hidden;
  }




  /* 🎨 卡片化风格的列表视图样式（与热力图风格统一） */
  .deck-list-container {
    background: transparent;
    border: none;
    overflow: visible;
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 0 4px;
  }

  /* 🆕 彩色圆点容器 - 增加上方空间 */
  .category-filter-wrapper {
    padding: 16px 0 8px 0; /* 🎯 上方16px留白，下方8px */
  }

  .deck-list-body {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    display: flex; /* 🆕 使用 Flexbox */
    flex-direction: column; /* 🆕 垂直排列 */
    gap: 10px; /* 🆕 行间距（替代 border-bottom） */
    padding: 4px; /* 🆕 内边距 */
  }

  /* 🎨 卡片化表头样式 - 统计居中布局 */
  .new-deck-header {
    display: grid;
    grid-template-columns: 1fr 300px 140px; /* 名称 | 统计(居中) | 操作 */
    background: var(--background-secondary);
    border-radius: 8px;
    border-bottom: none;
    margin-bottom: 12px;
    margin-top: 8px; /* 🆕 为彩色圆点留出空间 */
    padding: 0.75rem 1rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    flex-shrink: 0;
  }

  .header-deck-name {
    display: flex;
    align-items: center;
    justify-content: flex-start;
  }

  .header-stats-group {
    display: flex;
    align-items: center;
    justify-content: center; /* 🎯 统计在中间 */
    gap: 20px; /* 🆕 统计项之间的间距 */
  }

  .header-stat {
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  .header-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }


  /* 🎨 卡片化数据行样式 - 统计居中布局 */
  .new-deck-row {
    display: grid;
    grid-template-columns: 1fr 300px 140px; /* 🎯 名称 | 统计(居中) | 操作 */
    align-items: center;
    padding: 12px 16px;
    border-bottom: none;
    transition: all 0.2s ease;
    background: var(--background-primary);
    position: relative;
    border-radius: 8px;
    margin-bottom: 0;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  }

  .new-deck-row:hover {
    background: var(--background-modifier-hover);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  }

  /* 🎨 卡片化状态指示 - 保持状态样式 */
  .new-deck-row.urgent {
    background: linear-gradient(135deg, var(--background-primary) 0%, rgba(239, 68, 68, 0.03) 100%);
    border: 1px solid rgba(239, 68, 68, 0.1);
    box-shadow: 0 1px 3px rgba(239, 68, 68, 0.1); /* 🆕 状态色阴影 */
  }

  .new-deck-row.due {
    background: linear-gradient(135deg, var(--background-primary) 0%, rgba(245, 158, 11, 0.03) 100%);
    border: 1px solid rgba(245, 158, 11, 0.1);
    box-shadow: 0 1px 3px rgba(245, 158, 11, 0.1); /* 🆕 状态色阴影 */
  }

  .new-deck-row.completed {
    background: linear-gradient(135deg, var(--background-primary) 0%, rgba(16, 185, 129, 0.03) 100%);
    border: 1px solid rgba(16, 185, 129, 0.1);
    box-shadow: 0 1px 3px rgba(16, 185, 129, 0.1); /* 🆕 状态色阴影 */
  }

  /* 牌组名称区域 */
  .row-deck-name {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  /* 展开/折叠按钮 */
  .expand-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-muted);
    transition: all 0.2s ease;
    flex-shrink: 0;
  }

  .expand-toggle:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .expand-spacer {
    display: inline-block;
    width: 20px;
    flex-shrink: 0;
  }

  .deck-emoji {
    font-size: 1rem;
    line-height: 1;
    margin-right: 0.25rem;
  }

  .deck-name-content {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
  }

  .deck-name {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-normal);
    margin: 0;
  }

  /* 子牌组统计气泡 */
  .subdeck-indicator {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.125rem 0.375rem;
    margin-left: 0.5rem;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-radius: 10px;
    font-size: 0.7rem;
    font-weight: 600;
    cursor: help;
    transition: all 0.2s ease;
    opacity: 0.75;
  }

  .subdeck-indicator:hover {
    opacity: 1;
    transform: scale(1.05);
  }

  /* 菜单按钮 - Cursor 风格圆形设计 */
  .menu-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    color: var(--text-muted);
    transition: all 0.2s ease;
    opacity: 0.6;
  }

  .menu-button:hover {
    opacity: 1;
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .menu-button:active {
    transform: scale(0.95);
    background: var(--background-modifier-active);
  }

  .deck-status {
    padding: 0.125rem 0.5rem;
    border-radius: 12px;
    font-size: 0.7rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .deck-status.urgent {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.2);
  }

  .deck-status.completed {
    background: rgba(16, 185, 129, 0.1);
    color: #10b981;
    border: 1px solid rgba(16, 185, 129, 0.2);
  }

  /* 牌组类型徽章样式 */
  .choice-deck-badge,
  .video-deck-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    margin-left: 8px;
    color: white;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 500;
    line-height: 1;
    vertical-align: middle;
  }
  
  .choice-deck-badge {
    background: linear-gradient(135deg, #06b6d4, #0891b2);
  }
  
  .video-deck-badge {
    background: linear-gradient(135deg, #8b5cf6, #7c3aed);
  }
  
  .choice-deck-badge :global(svg),
  .video-deck-badge :global(svg) {
    width: 12px;
    height: 12px;
    color: white;
    fill: currentColor;
  }

  /* 🎯 统计数据区域 - 居中显示 */
  .row-stats-group {
    display: flex;
    align-items: center;
    justify-content: center; /* 🎯 统计居中 */
    gap: 20px; /* 🆕 统计项之间的间距 */
  }

  .row-stat {
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    font-weight: 600;
    font-size: 0.9rem;
    min-width: 60px; /* 🆕 确保对齐 */
  }

  .row-stat.new-cards .stat-number {
    color: #3b82f6;
  }

  .row-stat.learning-cards .stat-number {
    color: #f59e0b;
  }

  .row-stat.review-cards .stat-number {
    color: #10b981;
  }


  /* 新的操作区域 */
  .row-actions {
    display: flex;
    justify-content: flex-end;
  }

  .deck-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .study-button {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .study-button.primary {
    background: #3b82f6;
    color: white;
  }

  .study-button.primary:hover {
    background: #2563eb;
  }

  .study-button.completed {
    background: var(--background-modifier-border);
    color: var(--text-muted);
    cursor: not-allowed;
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .new-deck-header,
    .new-deck-row {
      grid-template-columns: 1fr 240px 100px;
    }

    .deck-name {
      font-size: 0.85rem;
    }

    .deck-status {
      font-size: 0.65rem;
      padding: 0.1rem 0.4rem;
    }

    .study-button {
      padding: 0.4rem 0.8rem;
      font-size: 0.75rem;
    }
  }

  @media (max-width: 480px) {
    .new-deck-header,
    .new-deck-row {
      grid-template-columns: 1fr 180px 80px;
      padding: 0.75rem;
    }

    .deck-actions {
      flex-direction: column;
      gap: 0.25rem;
    }

    .study-button {
      padding: 0.375rem 0.75rem;
      font-size: 0.7rem;
    }
  }


  .stat-number {
    font-weight: 600;
    font-size: 1.125rem;
  }

</style>


