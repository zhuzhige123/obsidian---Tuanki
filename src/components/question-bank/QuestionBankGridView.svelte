<script lang="ts">
  import { showObsidianConfirm } from '../../utils/obsidian-confirm';
import { logger } from '../../utils/logger';
  import { resolveQuestionBankSessionEntryAction } from '../../utils/question-bank-resume';
  import { openObsidianDeckEditModal } from '../../utils/obsidian-deck-edit-modal';

  import { onMount, onDestroy } from 'svelte';
  import { Menu, Notice } from 'obsidian';
  import type { Deck, Card } from '../../data/types';
  import type { DeckTreeNode } from '../../services/deck/DeckHierarchyService';
  import type { TestMode, QuestionBankModeConfig } from '../../types/question-bank-types';
  import type { WeavePlugin } from '../../main';
  import QuestionBankGridCard from './QuestionBankGridCard.svelte';
  import QuestionBankElegantCard from './QuestionBankElegantCard.svelte';
  import { getColorSchemeForDeck } from '../../config/card-color-schemes';
  import type { DeckCardStyle } from '../../types/plugin-settings.d';
  import BouncingBallsLoader from '../ui/BouncingBallsLoader.svelte';
  import TestModeSelectionModal from '../modals/TestModeSelectionModal.svelte';
  import { QuestionBankAnalyticsModalObsidian } from '../modals/QuestionBankAnalyticsModalObsidian';

  interface QuestionBankStats {
    total: number;      // 总题数
    completed: number;  // 已练题数
    accuracy: number;   // 正确率 (0-100)
    errorCount: number; // 错题数
  }

  interface Props {
    plugin: WeavePlugin;
  }

  let { plugin }: Props = $props();

  // 获取当前牌组卡片设计样式
  const deckCardStyle = $derived<DeckCardStyle>(
    (plugin.settings.deckCardStyle as DeckCardStyle) || 'default'
  );


  // 状态管理
  let questionBankTree = $state<DeckTreeNode[]>([]);
  let bankStats = $state<Record<string, QuestionBankStats>>({});
  let isLoading = $state(true);
  
  // 模式选择相关状态
  let showModeSelectionModal = $state(false);
  let selectedBankId = $state<string | null>(null);
  let selectedBankName = $state<string>("");
  let selectedBankQuestionCount = $state(0);
  let selectedBankQuestions = $state<Card[]>([]);
  
  // 分析模态窗状态
  let analyticsModalInstance: QuestionBankAnalyticsModalObsidian | null = null;

  // 加载考试题组树
  async function loadQuestionBankTree() {
    isLoading = true;
    try {
      if (!plugin.questionBankService || !plugin.questionBankHierarchy || !plugin.deckHierarchy) {
        logger.warn("[QuestionBankGridView] Required services not initialized");
        questionBankTree = [];
        return;
      }

      // 1. 获取记忆牌组树
      const memoryDeckTree = await plugin.deckHierarchy.getDeckTree();
      
      // 2. 基于记忆牌组树构建考试题组树
      questionBankTree = await plugin.questionBankHierarchy.buildQuestionBankTree(memoryDeckTree);
      
      // 3. 加载统计数据
      await loadBankStats();
    } catch (error) {
      logger.error("[QuestionBankGridView] Failed to load question bank tree:", error);
      new Notice("加载题库失败: " + (error instanceof Error ? error.message : "未知错误"));
      questionBankTree = [];
    } finally {
      isLoading = false;
    }
  }

  // 加载统计数据
  async function loadBankStats() {
    if (!plugin.questionBankService) return;

    const allBanks = await plugin.questionBankService.getAllBanks();
    
    for (const bank of allBanks) {
      const questions = await plugin.questionBankService.getQuestionsByBank(bank.id);
      const total = questions.length;
      
      // 计算完成度、正确率和错题数
      let completed = 0;
      let correctCount = 0;
      let errorCount = 0;
      
      for (const question of questions) {
        if (question.stats?.testStats && question.stats.testStats.totalAttempts > 0) {
          completed++;
          const currentAccuracy = question.stats.testStats.masteryMetrics?.currentAccuracy;
          if (currentAccuracy !== undefined) {
            correctCount += currentAccuracy;
          } else {
            correctCount += (question.stats.testStats.accuracy || 0) * 100;
          }
          
          // 统计错题数
          errorCount += question.stats.testStats.incorrectAttempts;
        }
      }
      
      const accuracy = completed > 0 ? correctCount / completed : 0;
      
      bankStats[bank.id] = {
        total,
        completed,
        accuracy,
        errorCount
      };
    }
  }

  // 开始测试 - 显示模式选择窗口
  async function handleStartTest(bankId: string) {
    if (!plugin.questionBankService) {
      new Notice("题库服务未初始化");
      return;
    }
    
    const questions = await plugin.questionBankService.getQuestionsByBank(bankId);
    const bank = await plugin.questionBankService.getBankById(bankId);
    const bankName = bank?.name || "未知题库";
    
    if (questions.length === 0) {
      new Notice("该题库暂无题目");
      return;
    }

    const entryAction = await resolveQuestionBankSessionEntryAction(plugin, bankId, bankName);
    if (entryAction === 'cancel') {
      return;
    }

    if (entryAction === 'resume') {
      await plugin.openQuestionBankSession({
        bankId,
        bankName,
        resumeBehavior: 'resume'
      });
      return;
    }
    
    // 设置选择状态并显示模式选择窗口
    selectedBankId = bankId;
    selectedBankName = bankName;
    selectedBankQuestionCount = questions.length;
    selectedBankQuestions = questions;
    showModeSelectionModal = true;
  }

  // 开始考试（模式选择后调用）
  async function handleStartStudying(bankId: string, bankName: string, questions: Card[], mode: TestMode = 'exam', config?: QuestionBankModeConfig) {
    logger.debug('[QuestionBankGridView] 开始考试:', { bankId, bankName, questionCount: questions.length, mode, config });
    
    if (questions.length === 0) {
      new Notice('题库为空，请先添加题目');
      return;
    }
    
    // 如果有配置，保存到题库
    if (config && plugin.questionBankService) {
      try {
        await plugin.questionBankService.updateBankConfig(bankId, config);
        logger.debug('[QuestionBankGridView] 配置已保存:', config);
      } catch (error) {
        logger.error('[QuestionBankGridView] 保存配置失败:', error);
      }
    }
    
    // 新方式：打开独立的考试学习标签页
    await plugin.openQuestionBankSession({
      bankId,
      bankName,
      mode,
      config
    });
  }

  // 处理模式选择
  async function handleModeSelected(mode: TestMode, config?: QuestionBankModeConfig) {
    logger.debug('[QuestionBankGridView] 模式选择:', { mode, config });
    showModeSelectionModal = false;
    
    if (selectedBankId && selectedBankQuestions.length > 0) {
      await handleStartStudying(selectedBankId, selectedBankName, selectedBankQuestions, mode, config);
    }
  }

  // 取消模式选择
  function handleModeSelectionCancel() {
    logger.debug('[QuestionBankGridView] 取消模式选择');
    showModeSelectionModal = false;
    selectedBankId = null;
    selectedBankName = "";
    selectedBankQuestionCount = 0;
    selectedBankQuestions = [];
  }

  // 分析题库
  async function analyzeBank(bankId: string) {
    try {
      logger.debug('[QuestionBankGridView] 分析题库:', bankId);
      
      const bank = await plugin.questionBankService?.getBankById(bankId);
      if (!bank) {
        new Notice('题库不存在');
        return;
      }
      
      analyticsModalInstance?.close();
      analyticsModalInstance = new QuestionBankAnalyticsModalObsidian(plugin.app, {
        plugin,
        questionBank: bank,
        onClose: () => {
          analyticsModalInstance = null;
        }
      });
      analyticsModalInstance.open();
    } catch (error) {
      logger.error('[QuestionBankGridView] 分析题库失败:', error);
      new Notice('打开分析界面失败');
    }
  }

  // 删除题库
  async function deleteBank(bankId: string) {
    try {
      const bank = await plugin.questionBankService?.getBankById(bankId);
      if (!bank) {
        new Notice('题库不存在');
        return;
      }

      const confirmed = await showObsidianConfirm(plugin.app, `确定要删除题库「${bank.name}」吗？\n\n删除后题库数据将无法恢复。`, { title: '确认删除' });
      if (!confirmed) return;

      new Notice('正在删除题库...');
      
      await plugin.questionBankService?.deleteBank(bankId);
      await loadQuestionBankTree();
      
      new Notice('题库删除成功');
    } catch (error) {
      logger.error('[QuestionBankGridView] 删除题库失败:', error);
      new Notice(`删除失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  // 初始化加载
  onMount(() => {
    loadQuestionBankTree();
    
  });

  onDestroy(() => {
    analyticsModalInstance?.close();
    analyticsModalInstance = null;
  });

  // 扁平化题库树（保持层级结构）
  function flattenBankTree(nodes: DeckTreeNode[]): Deck[] {
    const result: Deck[] = [];
    for (const node of nodes) {
      result.push(node.deck);
      if (node.children.length > 0) {
        result.push(...flattenBankTree(node.children));
      }
    }
    return result;
  }

  const allBanks = $derived(flattenBankTree(questionBankTree));

  // 显示题库菜单（考试题组专用菜单）
  function showBankMenu(event: MouseEvent, bankId: string) {
    event.preventDefault();
    const menu = new Menu();

    // 牌组编辑
    menu.addItem((item) =>
      item
        .setTitle("牌组编辑")
        .setIcon("edit-3")
        .onClick(() => handleEditBank(bankId))
    );

    // 分析功能
    menu.addItem((item) =>
      item
        .setTitle("分析")
        .setIcon("bar-chart-2")
        .onClick(() => analyzeBank(bankId))
    );

    menu.addSeparator();

    // 删除功能
    menu.addItem((item) =>
      item
        .setTitle("删除")
        .setIcon("trash-2")
        .onClick(() => deleteBank(bankId))
    );

    menu.showAtMouseEvent(event);
  }

  // 牌组编辑（名称 + 标签）
  async function handleEditBank(bankId: string) {
    
    const bank = allBanks.find(b => b.id === bankId);
    if (!bank) return;

    const availableTags = Array.from(
      new Set(allBanks.flatMap((item) => Array.isArray(item.tags) ? item.tags : []).filter(Boolean))
    ).sort((left, right) => left.localeCompare(right, 'zh-CN'));

    openObsidianDeckEditModal({
      app: plugin.app,
      title: '编辑考试题组',
      nameLabel: '名称',
      tagLabel: '标签',
      tagPlaceholder: '输入标签后按回车',
      tagHint: '可为考试题组设置一个标签，用于分组和筛选。',
      confirmText: '保存',
      cancelText: '取消',
      initialName: bank.name,
      initialTag: (bank.tags && bank.tags.length > 0) ? bank.tags[0] : '',
      availableTags,
      onSubmit: async ({ name, tag }) => {
        try {
          const dataStorage = plugin.dataStorage;
          const updated: Deck = {
            ...bank,
            name,
            tags: tag ? [tag] : [],
            modified: new Date().toISOString(),
          };
          await dataStorage.saveDeck(updated);
          await loadQuestionBankTree();
          plugin.app.workspace.trigger('Weave:data-changed');
          new Notice('牌组已更新');
        } catch (error) {
          logger.error('[QuestionBankGridView] 编辑失败:', error);
          new Notice('编辑失败');
          throw error;
        }
      }
    });
  }

</script>

<div class="question-bank-grid-view">
  {#if isLoading}
    <!-- 加载动画 -->
    <div class="loading-container">
      <BouncingBallsLoader message="正在加载题库..." />
    </div>
  {:else if allBanks.length > 0}
    <!-- 网格视图 -->
    <div class="cards-grid">
      {#each allBanks as bank, index (bank.id)}
        {@const stats = bankStats[bank.id] || {
          total: 0,
          completed: 0,
          accuracy: 0,
          errorCount: 0
        }}
        {@const colorScheme = getColorSchemeForDeck(bank.id)}
        {@const colorVariant = ((index % 4) + 1) as 1 | 2 | 3 | 4}
        
        <div class="deck-card-shell">
          {#if deckCardStyle === 'chinese-elegant'}
          <!-- 典雅风格卡片 -->
          <QuestionBankElegantCard
            {bank}
            {stats}
            {colorVariant}
            onTest={() => handleStartTest(bank.id)}
            onMenu={(e) => showBankMenu(e, bank.id)}
          />
        {:else}
          <!-- 默认风格卡片 -->
          <QuestionBankGridCard
            {bank}
            {stats}
            {colorScheme}
            onTest={() => handleStartTest(bank.id)}
            onMenu={(e) => showBankMenu(e, bank.id)}
          />
          {/if}
        </div>
      {/each}
    </div>
  {:else}
    <!-- 空状态占位符 -->
    <div class="mode-placeholder">
      <h2 class="placeholder-title">暂无考试题组</h2>
      <p class="placeholder-desc">请在卡片管理中从选择题引入组建考试题组</p>
    </div>
  {/if}
</div>

<!-- 模式选择模态窗 -->
<TestModeSelectionModal
  open={showModeSelectionModal}
  bankName={selectedBankName}
  totalQuestions={selectedBankQuestionCount}
  onSelect={handleModeSelected}
  onCancel={handleModeSelectionCancel}
/>

<style>
  .question-bank-grid-view {
    --weave-deck-card-min-width: 320px;
    --weave-deck-grid-gap: 20px;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 0;
    overflow-y: auto;
    background: var(--background-primary);
    container-type: inline-size;
    container-name: question-bank-grid;
  }

  /* 加载容器 */
  .loading-container {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 400px;
  }

  .cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--weave-deck-card-min-width)), 1fr));
    gap: var(--weave-deck-grid-gap);
    padding: 8px 0;
    container-type: inline-size;
  }

  .deck-card-shell {
    min-width: 0;
    container-type: inline-size;
    container-name: deck-card;
  }

  /* 模式占位符样式 */
  .mode-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    padding: 3rem 2rem;
    text-align: center;
  }

  .placeholder-title {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-normal);
    margin-bottom: 0.5rem;
  }

  .placeholder-desc {
    font-size: 1rem;
    color: var(--text-muted);
    max-width: 500px;
  }

  /* 响应式 */
  @container question-bank-grid (max-width: 1100px) {
    .question-bank-grid-view {
      --weave-deck-card-min-width: 280px;
      --weave-deck-grid-gap: 18px;
    }
  }

  @container question-bank-grid (max-width: 760px) {
    .question-bank-grid-view {
      --weave-deck-card-min-width: 100%;
      --weave-deck-grid-gap: 12px;
    }

    .cards-grid {
      padding: 4px 0;
    }

    .mode-placeholder {
      min-height: 300px;
      padding: 2rem 1rem;
    }

    .placeholder-title {
      font-size: 1.25rem;
    }
  }

  @container question-bank-grid (max-width: 420px) {
    .question-bank-grid-view {
      --weave-deck-grid-gap: 8px;
    }

    .cards-grid {
      padding: 2px 0;
    }
  }

  /* Obsidian 移动端特定样式 - 内容区贴边 */
  :global(body.is-mobile) .cards-grid {
    gap: 8px; /* 减少卡片之间的间距 */
    padding: 4px 0;
  }

  :global(body.is-phone) .cards-grid {
    gap: 6px; /* 手机端进一步减少卡片间距 */
  }
</style>
