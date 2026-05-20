<script lang="ts">
  import { showObsidianConfirm } from '../../utils/obsidian-confirm';
import { logger } from '../../utils/logger';
import { vaultStorage } from '../../utils/vault-local-storage';
  import { resolveQuestionBankSessionEntryAction } from '../../utils/question-bank-resume';

  import { onMount, onDestroy } from "svelte";
  import type { WeavePlugin } from "../../main";
  import type { TestMode, QuestionBankModeConfig } from "../../types/question-bank-types";
  import type { Card } from "../../data/types";
  import type { DeckTreeNode } from "../../services/deck/DeckHierarchyService";
  import ObsidianIcon from "../ui/ObsidianIcon.svelte";
  import EnhancedIcon from "../ui/EnhancedIcon.svelte";
  import BouncingBallsLoader from "../ui/BouncingBallsLoader.svelte";
  import CreateQuestionBankModal from "../modals/CreateQuestionBankModal.svelte";
  import TestModeSelectionModal from "../modals/TestModeSelectionModal.svelte";
import { QuestionBankAnalyticsModalObsidian } from "../modals/QuestionBankAnalyticsModalObsidian";
import { Notice, Menu } from "obsidian";
import { isInputClozeQuestionContent } from "../../utils/question-bank/input-cloze-utils";
import { tr } from "../../utils/i18n";

  interface Props {
    plugin: WeavePlugin;
    onCreateBank?: () => void;
    onStartTest?: (bankId: string) => void;
  }

  let { plugin, onCreateBank, onStartTest }: Props = $props();
  let t = $derived($tr);

  // 状态管理
  let questionBankTree = $state<DeckTreeNode[]>([]);
  let isLoading = $state(true);
  let expandedBankIds = $state<Set<string>>(new Set());
  
  // 对话框状态
  let showCreateModal = $state(false);
  
  // 模式选择相关状态
  let showModeSelectionModal = $state(false);
  let selectedBankId = $state<string | null>(null);
  let selectedBankName = $state<string>("");
  let selectedBankQuestionCount = $state(0);
  let selectedBankQuestions = $state<Card[]>([]);
  
  // 分析模态窗状态
  let analyticsModalInstance: QuestionBankAnalyticsModalObsidian | null = null;
  
  // 统计数据
  let bankStats = $state<Record<string, { total: number; completed: number; accuracy: number }>>({});

  // 加载考试题组树
  async function loadQuestionBankTree() {
    isLoading = true;
    try {
      if (!plugin.questionBankService || !plugin.questionBankHierarchy || !plugin.deckHierarchy) {
        logger.warn("[QuestionBankListView] Required services not initialized");
        questionBankTree = [];
        return;
      }

      // 检查是否有考试题组数据
      const allBanks = await plugin.questionBankService.getAllBanks();
      logger.debug('[QuestionBankListView] 考试题组总数:', allBanks.length);
      if (allBanks.length > 0) {
        logger.debug('[QuestionBankListView] 考试题组列表:', allBanks.map(b => ({ id: b.id, name: b.name, parentId: b.parentId })));
      }

      // 1. 获取记忆牌组树
      const memoryDeckTree = await plugin.deckHierarchy.getDeckTree();
      logger.debug('[QuestionBankListView] 记忆牌组树节点数:', memoryDeckTree.length);
      
      // 2. 基于记忆牌组树构建考试题组树
      questionBankTree = await plugin.questionBankHierarchy.buildQuestionBankTree(memoryDeckTree);
      logger.debug('[QuestionBankListView] 构建的考试题组树节点数:', questionBankTree.length);
      
      // 3. 加载统计数据
      await loadBankStats();
      
      // 4. 恢复展开状态
      const savedState = vaultStorage.getItem('weave-question-bank-expanded-state');
      if (savedState) {
        try {
          const stateArray = JSON.parse(savedState);
          expandedBankIds = new Set(stateArray);
        } catch (e) {
          logger.warn('[QuestionBankListView] Failed to load expanded state:', e);
        }
      } else {
        // 首次使用，默认展开根级牌组
        questionBankTree.forEach(node => {
          expandedBankIds.add(node.deck.id);
        });
        expandedBankIds = new Set(expandedBankIds);
        saveExpandedState();
      }
    } catch (error) {
      logger.error("[QuestionBankListView] Failed to load question bank tree:", error);
      new Notice(t('study.questionBankUI.bankCollection.loadFailed', {
        error: error instanceof Error ? error.message : t('study.questionBankUI.cardInfoTab.unknown')
      }));
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
      
      // 计算完成度和正确率
      let completed = 0;
      let correctCount = 0;
      
      for (const question of questions) {
        if (question.stats?.testStats && question.stats.testStats.totalAttempts > 0) {
          completed++;
          // 使用EWMA算法的当前掌握度，回退到旧的简单平均
          const currentAccuracy = question.stats.testStats.masteryMetrics?.currentAccuracy;
          if (currentAccuracy !== undefined) {
            correctCount += currentAccuracy;
          } else {
            // 回退：使用简单平均
            correctCount += (question.stats.testStats.accuracy || 0) * 100;
          }
        }
      }
      
      const accuracy = completed > 0 ? correctCount / completed : 0;
      
      bankStats[bank.id] = {
        total,
        completed,
        accuracy
      };
    }
  }

  // 展开/折叠切换
  function toggleExpand(bankId: string) {
    if (expandedBankIds.has(bankId)) {
      expandedBankIds.delete(bankId);
    } else {
      expandedBankIds.add(bankId);
    }
    expandedBankIds = new Set(expandedBankIds);
    saveExpandedState();
  }

  function saveExpandedState() {
    try {
      const stateArray = Array.from(expandedBankIds);
      vaultStorage.setItem('weave-question-bank-expanded-state', JSON.stringify(stateArray));
    } catch (error) {
      logger.error('Failed to save expanded state:', error);
    }
  }

  // 显示考试题组树
  const filteredQuestionBankTree = $derived(() => questionBankTree);

  // 开始测试 - 显示模式选择窗口
  async function handleStartTest(bankId: string) {
    if (onStartTest) {
      onStartTest(bankId);
      return;
    }
    
    // 加载题目数据
    if (!plugin.questionBankService) {
      new Notice(t('study.questionBankUI.bankCollection.serviceNotReady'));
      return;
    }
    
    const questions = await plugin.questionBankService.getQuestionsByBank(bankId);
    const bank = await plugin.questionBankService.getBankById(bankId);
    const bankName = bank?.name || t('study.questionBankUI.cardInfoTab.unknown');
    
    if (questions.length === 0) {
      new Notice(t('study.questionBankUI.bankCollection.noQuestions'));
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

  // 开始考试
  async function handleStartStudying(bankId: string, bankName: string, questions: Card[], mode: TestMode = 'exam', config?: QuestionBankModeConfig) {
    logger.debug('[QuestionBankListView] 开始考试:', { bankId, bankName, questionCount: questions.length, mode, config });
    
    if (questions.length === 0) {
      new Notice(t('study.questionBankUI.bankCollection.bankEmpty'));
      return;
    }
    
    // 如果有配置，保存到题库
    if (config && plugin.questionBankService) {
      try {
        await plugin.questionBankService.updateBankConfig(bankId, config);
        logger.debug('[QuestionBankListView] 配置已保存:', config);
      } catch (error) {
        logger.error('[QuestionBankListView] 保存配置失败:', error);
      }
    }

    //  根据配置筛选和处理题目
    let filteredQuestions = await applyQuestionFilters(questions, config, mode);
    logger.debug('[QuestionBankListView] 题目筛选结果:', {
      原始题目数: questions.length,
      筛选后题目数: filteredQuestions.length,
      配置: config
    });

    if (filteredQuestions.length === 0) {
      new Notice(t('study.questionBankUI.bankCollection.noFilteredQuestions'));
      return;
    }
    
    //  新方式：打开独立的考试学习标签页
    await plugin.openQuestionBankSession({
      bankId,
      bankName,
      mode,
      config: {
        ...config,
        //  注意：筛选后的题目会由 QuestionBankView 重新加载
        // 这里只传递配置，题目加载逻辑在 QuestionBankView 中
      }
    });
  }

  //  根据配置筛选题目
  async function applyQuestionFilters(
    allQuestions: Card[], 
    config: QuestionBankModeConfig | undefined, 
    mode: TestMode
  ): Promise<Card[]> {
    if (!config) {
      logger.debug('[QuestionBankListView] 无配置，返回所有题目');
      return allQuestions;
    }

    let filteredQuestions = [...allQuestions];
    logger.debug('[QuestionBankListView] 开始筛选题目，配置:', config);

    // 1. 根据题目来源筛选
    if (config.questionSource && config.questionSource !== 'all') {
      // 根据题目来源筛选（简化实现）
      logger.debug('[QuestionBankListView] 题目来源筛选:', config.questionSource);
      // 可以根据不同来源筛选，如：错题集、收藏题目等
      // 暂时保留所有题目，未来可以扩展
    }

    // 2. 智能筛选：根据题型比例和难度分布进行分层采样
    const questionCount = getQuestionCount(config, mode);
    const targetCount = questionCount && questionCount > 0 ? Math.min(questionCount, filteredQuestions.length) : filteredQuestions.length;
    
    if (config.questionTypeRatio || config.difficultyDistribution) {
      filteredQuestions = await applyIntelligentFiltering(
        filteredQuestions, 
        {
          questionTypeRatio: config.questionTypeRatio || { single_choice: 40, multiple_choice: 30, cloze: 20, short_answer: 10 },
          difficultyDistribution: config.difficultyDistribution || { easy: 30, medium: 50, hard: 20 }
        },
        targetCount
      );
      logger.debug('[QuestionBankListView] 智能筛选完成，目标数量:', targetCount, '实际数量:', filteredQuestions.length);
    } else if (questionCount && questionCount > 0 && questionCount < filteredQuestions.length) {
      // 没有配置比例时，随机选择指定数量
      filteredQuestions = shuffleArray(filteredQuestions).slice(0, questionCount);
      logger.debug('[QuestionBankListView] 随机限制题目数量:', questionCount);
    }

    // 5. 应用其他选项
    if (config.options?.shuffleQuestions) {
      filteredQuestions = shuffleArray(filteredQuestions);
      logger.debug('[QuestionBankListView] 已打乱题目顺序');
    }

    logger.debug('[QuestionBankListView] 筛选完成:', {
      原始数量: allQuestions.length,
      最终数量: filteredQuestions.length
    });

    return filteredQuestions;
  }

  // 获取题目数量配置
  function getQuestionCount(config: QuestionBankModeConfig, mode: TestMode): number | null {
    if (config.customQuestionCount) {
      return config.customQuestionCount[mode] || null;
    }
    return null;
  }

  //  题型识别函数
  function detectQuestionType(card: Card): 'single_choice' | 'multiple_choice' | 'cloze' | 'short_answer' {
    const content = card.content;
    
    // 1. 选择题检测（基于现有解析器）
    if (isChoiceQuestion(content)) {
      // 通过正确答案数量区分单选/多选
      try {
        const parsed = parseChoiceQuestion(content);
        if (parsed && parsed.correctAnswers) {
          return parsed.correctAnswers.length > 1 ? 'multiple_choice' : 'single_choice';
        }
      } catch (error) {
        logger.warn('[题型识别] 选择题解析失败:', error);
      }
      // 默认返回单选
      return 'single_choice';
    }
    
    // 2. 挖空题检测
    if (isClozeQuestion(content)) {
      return 'cloze';
    }
    
    // 3. 问答题（默认）
    return 'short_answer';
  }

  //  选择题识别（基于现有模式）
  function isChoiceQuestion(content: string): boolean {
    if (!content) return false;
    
    // 检查是否包含问题标记和选项格式
    const hasQuestion = /^(?:Q:|问题：)/m.test(content);
    const hasOptions = /^[A-H]\)/m.test(content);
    const hasCorrectMark = /\{(?:✓|✔|correct)\}/.test(content);
    
    return hasQuestion && hasOptions && hasCorrectMark;
  }

  //  挖空题识别：仅将输入式挖空计入题库填空题
  function isClozeQuestion(content: string): boolean {
    return isInputClozeQuestionContent(content);
  }

  //  选择题解析（简化版）
  function parseChoiceQuestion(content: string): { correctAnswers: string[] } | null {
    try {
      const correctAnswers: string[] = [];
      const lines = content.split('\n');
      
      for (const line of lines) {
        const match = line.match(/^([A-H])\).*?\{(?:✓|✔|correct)\}/);
        if (match) {
          correctAnswers.push(match[1]);
        }
      }
      
      return correctAnswers.length > 0 ? { correctAnswers } : null;
    } catch (error) {
      return null;
    }
  }

  // 重新分配比例（排除空题型）- 通用工具函数
  function redistributeRatio(
    originalRatio: Record<string, number>, 
    availableTypes: string[]
  ): Record<string, number> {
    const adjustedRatio: Record<string, number> = {};
    let totalRatio = 0;
    
    // 计算可用题型的总比例
    availableTypes.forEach(type => {
      totalRatio += originalRatio[type] || 0;
    });
    
    if (totalRatio === 0) {
      // 平均分配
      const averageRatio = 100 / availableTypes.length;
      availableTypes.forEach(type => {
        adjustedRatio[type] = averageRatio;
      });
    } else {
      // 按比例重新分配到100%
      availableTypes.forEach(type => {
        adjustedRatio[type] = ((originalRatio[type] || 0) / totalRatio) * 100;
      });
    }
    
    return adjustedRatio;
  }

  //  动态难度评估接口
  interface DynamicDifficulty {
    totalAttempts: number;        // 总答题次数
    correctAttempts: number;      // 正确次数  
    currentAccuracy: number;      // 当前正确率
    recentAccuracy: number;       // 近期正确率（最近10次）
    computedDifficulty: number;   // 计算出的难度(1-10)
    difficultyLevel: 'easy' | 'medium' | 'hard';
    confidence: number;           // 置信度(0-1)
  }

  //  核心：动态难度评估算法（基于用户答题统计）
  function computeDynamicDifficulty(card: Card): DynamicDifficulty {
    const stats = card.stats?.errorTracking;
    
    // 默认难度（新题目）
    if (!stats) {
      return {
        totalAttempts: 0,
        correctAttempts: 0,
        currentAccuracy: 0.5, // 默认中等水平
        recentAccuracy: 0.5,
        computedDifficulty: 5, // 初始中等难度
        difficultyLevel: 'medium',
        confidence: 0 // 新题目置信度为0
      };
    }
    
    const totalAttempts = stats.correctCount + stats.errorCount;
    const accuracy = stats.accuracy;
    const correctAttempts = stats.correctCount;
    
    logger.debug(`[难度评估] 卡片 ${card.uuid}: 总次数=${totalAttempts}, 正确率=${accuracy}`);
    
    //  您提出的核心算法：基于答题次数和正确率
    let difficulty = 5; // 初始中等难度
    
    // 1. 基于正确率调整难度
    if (accuracy >= 0.9) {
      difficulty = 2; // 很高正确率 -> 简单
    } else if (accuracy >= 0.7) {
      difficulty = 3; // 高正确率 -> 较简单  
    } else if (accuracy >= 0.5) {
      difficulty = 5; // 中等正确率 -> 中等
    } else if (accuracy >= 0.3) {
      difficulty = 7; // 低正确率 -> 较难
    } else {
      difficulty = 9; // 很低正确率 -> 困难
    }
    
    // 2. 基于答题次数调整（置信度加权）
    const confidence = Math.min(totalAttempts / 10, 1); // 10次后达到满置信度
    const adjustedDifficulty = difficulty * confidence + 5 * (1 - confidence);
    
    // 3. 近期趋势调整（基于最近的表现）
    let recentAccuracy = accuracy; // 简化：暂时使用总体正确率
    if (totalAttempts >= 5) {
      // TODO: 实现基于最近N次的正确率计算
      recentAccuracy = accuracy;
    }
    
    // 4. 最终难度值
    const finalDifficulty = Math.max(1, Math.min(10, Math.round(adjustedDifficulty)));
    
    const result: DynamicDifficulty = {
      totalAttempts,
      correctAttempts,
      currentAccuracy: accuracy,
      recentAccuracy,
      computedDifficulty: finalDifficulty,
      difficultyLevel: finalDifficulty <= 3 ? 'easy' : finalDifficulty <= 7 ? 'medium' : 'hard',
      confidence
    };
    
    logger.debug(`[难度评估] 结果: 难度=${finalDifficulty} (${result.difficultyLevel}), 置信度=${confidence.toFixed(2)}`);
    return result;
  }

  //  获取题目的综合难度（静态+动态）
  function getQuestionDifficulty(card: Card): 'easy' | 'medium' | 'hard' {
    // 优先使用动态评估的结果
    const dynamicDiff = computeDynamicDifficulty(card);
    
    // 如果有足够的答题数据（置信度 > 0.3），使用动态评估
    if (dynamicDiff.confidence > 0.3) {
      return dynamicDiff.difficultyLevel;
    }
    
    // 否则使用静态难度或默认值
    return card.difficulty || 'medium';
  }


  //  核心：智能分层采样筛选算法
  async function applyIntelligentFiltering(
    questions: Card[], 
    config: {
      questionTypeRatio: Record<string, number>;
      difficultyDistribution: Record<string, number>;
    },
    targetCount: number
  ): Promise<Card[]> {
    
    logger.debug('[智能筛选] 开始分层采样:', {
      总题数: questions.length,
      目标数量: targetCount,
      题型比例: config.questionTypeRatio,
      难度比例: config.difficultyDistribution
    });

    if (targetCount <= 0 || questions.length === 0) {
      return [];
    }

    if (targetCount >= questions.length) {
      // 如果目标数量大于等于总数，直接返回所有题目
      return config.questionTypeRatio ? shuffleArray(questions) : questions;
    }

    // 1. 题型分类和难度评估
    const questionsWithMetadata = questions.map(question => ({
      ...question,
      questionType: detectQuestionType(question),
      evaluatedDifficulty: getQuestionDifficulty(question),
      dynamicData: computeDynamicDifficulty(question)
    }));

    // 2. 双维度分组 (题型 × 难度)
    const groups = createDoubleGroups(questionsWithMetadata);
    logger.debug('[智能筛选] 双维度分组完成:', summarizeGroups(groups));

    // 3. 分层采样
    const sampledQuestions = await performLayeredSampling(groups, config, targetCount);
    
    logger.debug('[智能筛选] 采样完成:', {
      采样数量: sampledQuestions.length,
      目标数量: targetCount,
      完成率: `${(sampledQuestions.length / targetCount * 100).toFixed(1)}%`
    });

    return shuffleArray(sampledQuestions);
  }

  // 创建题型×难度双维度分组
  function createDoubleGroups(questions: Array<Card & { questionType: string; evaluatedDifficulty: string; dynamicData: DynamicDifficulty }>) {
    const groups: Record<string, Record<string, typeof questions>> = {};
    
    questions.forEach(question => {
      const type = question.questionType;
      const difficulty = question.evaluatedDifficulty;
      
      if (!groups[type]) {
        groups[type] = {};
      }
      if (!groups[type][difficulty]) {
        groups[type][difficulty] = [];
      }
      
      groups[type][difficulty].push(question);
    });
    
    return groups;
  }

  // 汇总分组信息（用于日志）
  function summarizeGroups(groups: Record<string, Record<string, any[]>>) {
    const summary: Record<string, any> = {};
    
    Object.keys(groups).forEach(type => {
      summary[type] = {};
      Object.keys(groups[type]).forEach(difficulty => {
        summary[type][difficulty] = groups[type][difficulty].length;
      });
    });
    
    return summary;
  }

  // 分层采样核心算法
  async function performLayeredSampling(
    groups: Record<string, Record<string, Card[]>>, 
    config: { questionTypeRatio: Record<string, number>; difficultyDistribution: Record<string, number> },
    targetCount: number
  ): Promise<Card[]> {
    
    const sampledQuestions: Card[] = [];
    const { questionTypeRatio, difficultyDistribution } = config;
    
    // 获取可用的题型和难度
    const availableTypes = Object.keys(groups).filter(type => 
      Object.values(groups[type]).some(arr => arr.length > 0)
    );
    const availableDifficulties = ['easy', 'medium', 'hard'].filter(difficulty =>
      availableTypes.some(type => groups[type]?.[difficulty]?.length > 0)
    );

    logger.debug('[分层采样] 可用维度:', { 题型: availableTypes, 难度: availableDifficulties });

    // 重新计算比例
    const adjustedTypeRatio = redistributeRatio(questionTypeRatio, availableTypes);
    const adjustedDifficultyRatio = redistributeRatio(difficultyDistribution, availableDifficulties);

    // 按题型分配
    for (const type of availableTypes) {
      const typeCount = Math.floor(targetCount * (adjustedTypeRatio[type] || 0) / 100);
      if (typeCount <= 0) continue;

      logger.debug(`[分层采样] 题型 ${type}: 目标 ${typeCount} 题`);

      // 在该题型内按难度分配
      for (const difficulty of availableDifficulties) {
        const difficultyCount = Math.floor(typeCount * (adjustedDifficultyRatio[difficulty] || 0) / 100);
        const availableQuestions = groups[type]?.[difficulty] || [];
        
        if (difficultyCount <= 0 || availableQuestions.length === 0) continue;

        // 采样该分组的题目
        const actualCount = Math.min(difficultyCount, availableQuestions.length);
        const sampled = shuffleArray(availableQuestions).slice(0, actualCount);
        
        sampledQuestions.push(...sampled);
        logger.debug(`[分层采样] ${type}-${difficulty}: 采样 ${sampled.length}/${availableQuestions.length} 题`);
      }
    }

    // 补足数量（如果采样不够）
    const remaining = targetCount - sampledQuestions.length;
    if (remaining > 0) {
      const allAvailable = Object.values(groups)
        .flatMap(typeGroup => Object.values(typeGroup))
        .flat();
      
      const unused = allAvailable.filter(q => !sampledQuestions.some(s => s.uuid === q.uuid));
      const additional = shuffleArray(unused).slice(0, remaining);
      
      sampledQuestions.push(...additional);
      logger.debug(`[分层采样] 补足题目: ${additional.length} 题`);
    }

    return sampledQuestions;
  }

  // 数组乱序工具函数
  function shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // 根据正确率获取颜色
  function getAccuracyColor(accuracy: number): string {
    if (accuracy === 0) return '#9ca3af'; // 灰色
    if (accuracy < 60) return '#ef4444'; // 红色
    if (accuracy < 80) return '#f97316'; // 橙色
    return '#22c55e'; // 绿色
  }

  // 根据题库状态获取紧急等级（与记忆牌组逻辑保持一致）
  function getUrgencyLevel(stats: { total: number; completed: number; accuracy: number }): 'urgent' | 'due' | 'completed' | 'normal' {
    if (stats.total === 0) return 'normal';
    
    // 已完成且正确率高
    if (stats.completed === stats.total && stats.accuracy >= 80) {
      return 'completed';
    }
    
    // 正确率低于60%且已练习超过50% → 需要重点复习
    if (stats.completed > 0 && stats.accuracy < 60 && stats.completed > stats.total * 0.5) {
      return 'urgent';
    }
    
    // 有未完成的题目 → 待练习状态（橙色）
    if (stats.completed < stats.total) {
      return 'due';
    }
    
    return 'normal';
  }

  // 处理创建题库
  function handleCreateBank() {
    if (onCreateBank) {
      onCreateBank();
    } else {
      showCreateModal = true;
    }
  }

  // 处理题库创建成功
  function handleBankCreated(bank: any) {
    showCreateModal = false;
    loadQuestionBankTree();
  }

  // 显示题库菜单（使用 Obsidian 原生菜单）
  async function showBankMenu(event: MouseEvent, bankId: string) {
    const menu = new Menu();
    
    // 分析功能
      menu.addItem((item) =>
      item
        .setTitle(t('study.questionBankUI.bankCollection.menu.analyze'))
        .setIcon("bar-chart-2")
        .onClick(() => analyzeBank(bankId))
    );

    menu.addSeparator();

    // 删除功能
      menu.addItem((item) =>
      item
        .setTitle(t('study.questionBankUI.bankCollection.menu.delete'))
        .setIcon("trash-2")
        .onClick(() => deleteBank(bankId))
    );

    menu.showAtMouseEvent(event);
  }


  // 🆕 分析题库
  async function analyzeBank(bankId: string) {
    try {
      logger.debug('[QuestionBankListView] 分析题库:', bankId);
      
      // 获取题库信息
      const bank = await plugin.questionBankService?.getBankById(bankId);
      if (!bank) {
        new Notice(t('study.questionBankUI.bankCollection.bankMissing'));
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
      
      logger.debug('[QuestionBankListView] 打开分析模态窗:', bank.name);
    } catch (error) {
      logger.error('[QuestionBankListView] 分析题库失败:', error);
      new Notice(t('study.questionBankUI.bankCollection.openAnalyticsFailed'));
    }
  }

  // 🆕 删除题库
  async function deleteBank(bankId: string) {
    try {
      const bank = await plugin.questionBankService?.getBankById(bankId);
      if (!bank) {
        new Notice(t('study.questionBankUI.bankCollection.bankMissing'));
        return;
      }

      const confirmed = await showObsidianConfirm(
        plugin.app,
        t('study.questionBankUI.bankCollection.deleteConfirmMessage', { name: bank.name }),
        { title: t('study.questionBankUI.bankCollection.deleteConfirmTitle') }
      );
      if (!confirmed) return;

      new Notice(t('study.questionBankUI.bankCollection.deleting'));
      
      await plugin.questionBankService?.deleteBank(bankId);
      await loadQuestionBankTree();
      
      new Notice(t('study.questionBankUI.bankCollection.deleteSuccess'));
    } catch (error) {
      logger.error('[QuestionBankListView] 删除题库失败:', error);
      new Notice(t('study.questionBankUI.bankCollection.deleteFailed', {
        error: error instanceof Error ? error.message : t('study.questionBankUI.cardInfoTab.unknown')
      }));
    }
  }

  // 处理模式选择
  async function handleModeSelected(mode: TestMode, config?: QuestionBankModeConfig) {
    logger.debug('[QuestionBankListView] 模式选择:', { mode, config });
    showModeSelectionModal = false;
    
    if (selectedBankId && selectedBankQuestions.length > 0) {
      await handleStartStudying(selectedBankId, selectedBankName, selectedBankQuestions, mode, config);
    }
  }

  // 取消模式选择
  function handleModeSelectionCancel() {
    logger.debug('[QuestionBankListView] 取消模式选择');
    showModeSelectionModal = false;
    selectedBankId = null;
    selectedBankName = "";
    selectedBankQuestionCount = 0;
    selectedBankQuestions = [];
  }

  // 初始化加载
  onMount(() => {
    loadQuestionBankTree();
  });

  onDestroy(() => {
    analyticsModalInstance?.close();
    analyticsModalInstance = null;
  });
</script>

{#snippet questionBankNode(node: DeckTreeNode, depth: number)}
  {@const stats = bankStats[node.deck.id] || { total: 0, completed: 0, accuracy: 0 }}
  {@const isEmpty = stats.total === 0}
  {@const hasChildren = node.children.length > 0}
  {@const expanded = expandedBankIds.has(node.deck.id)}
  {@const urgencyLevel = getUrgencyLevel(stats)}

  <div
    class="question-bank-row"
    class:empty={isEmpty}
    class:urgent={urgencyLevel === 'urgent'}
    class:due={urgencyLevel === 'due'}
    class:completed={urgencyLevel === 'completed'}
    class:has-children={hasChildren}
    style="padding-left: {depth * 24}px"
    role="button"
    tabindex="0"
  >
    <!-- 展开/折叠按钮 -->
    <div class="row-bank-name">
      {#if hasChildren}
        <button
          class="expand-toggle"
          onclick={(e) => {
            e.preventDefault();
            toggleExpand(node.deck.id);
          }}
          aria-label={expanded ? t('study.questionBankUI.bankCollection.collapse') : t('study.questionBankUI.bankCollection.expand')}
        >
          <ObsidianIcon 
            name={expanded ? "chevron-down" : "chevron-right"} 
            size={14} 
          />
        </button>
      {:else}
        <span class="expand-spacer"></span>
      {/if}

      <div class="bank-name-content">
        <span class="bank-name">{node.deck.name}</span>
        
        {#if isEmpty}
          <span class="bank-status empty">{t('study.questionBankUI.bankCollection.emptyBank')}</span>
        {:else if stats.completed === stats.total}
          <span class="bank-status completed">{t('study.questionBankUI.bankCollection.completed')}</span>
        {/if}
      </div>
    </div>

    <!-- 统计数据区域 -->
    <div class="row-stat">
      <span class="stat-number stat-total">{stats.total}</span>
    </div>
    <div class="row-stat">
      <span class="stat-number stat-completed">{stats.completed}</span>
    </div>
    <div class="row-stat">
      <span class="stat-number stat-accuracy" style="color: {getAccuracyColor(stats.accuracy)}">
        {stats.accuracy.toFixed(0)}%
      </span>
    </div>

    <!-- 操作 -->
    <div class="row-actions">
      <div class="bank-actions">
        {#if !isEmpty}
          <button
            class="study-button primary"
            onclick={() => handleStartTest(node.deck.id)}
          >
            <ObsidianIcon name="play" size={16} />
            {t('study.questionBankUI.bankCollection.startExam', { count: stats.total })}
          </button>
        {:else}
          <button
            class="study-button empty"
            disabled
          >
            <ObsidianIcon name="list" size={16} />
            {t('study.questionBankUI.bankCollection.emptyBank')}
          </button>
        {/if}

        <!-- 🆕 三点菜单按钮 -->
        <button
          class="menu-button"
          onclick={(e) => {
            e.preventDefault();
            showBankMenu(e, node.deck.id);
          }}
          aria-label={t('study.questionBankUI.bankCollection.moreActions')}
        >
          <EnhancedIcon name="more-horizontal" size={16} />
        </button>
      </div>
    </div>
  </div>

  <!-- 递归渲染子节点 -->
  {#if expanded && hasChildren}
    {#each node.children as child}
      {@render questionBankNode(child, depth + 1)}
    {/each}
  {/if}
{/snippet}

<div class="question-bank-list-view">
  {#if isLoading}
    <!-- 加载动画 -->
    <div class="loading-container">
      <BouncingBallsLoader message={t('study.questionBankUI.bankCollection.loading')} />
    </div>
  {:else}
    <!-- 表头 -->
    <div class="question-bank-header">
      <div class="header-bank-name">{t('study.questionBankUI.bankCollection.headers.bankName')}</div>
      <div class="header-stat">{t('study.questionBankUI.bankCollection.headers.total')}</div>
      <div class="header-stat">{t('study.questionBankUI.bankCollection.headers.completed')}</div>
      <div class="header-stat">{t('study.questionBankUI.bankCollection.headers.accuracy')}</div>
      <div class="header-actions">{t('study.questionBankUI.bankCollection.headers.actions')}</div>
    </div>

    <!-- 考试题组列表 -->
    <div class="question-bank-list-body" class:has-empty={filteredQuestionBankTree().length === 0}>
      {#if filteredQuestionBankTree().length > 0}
        {#each filteredQuestionBankTree() as node}
          {@render questionBankNode(node, 0)}
        {/each}
      {:else}
        <div class="empty-state">
          <p>{t('study.questionBankUI.bankCollection.noExamSets')}</p>
          <p class="empty-hint">{t('study.questionBankUI.bankCollection.noExamSetsHint')}</p>
        </div>
      {/if}
    </div>
  {/if}
</div>

<!-- 创建题库对话框 -->
<CreateQuestionBankModal
  bind:open={showCreateModal}
  {plugin}
  mode="create"
  onClose={() => showCreateModal = false}
  onCreated={handleBankCreated}
/>

<!-- 🆕 模式选择模态窗 -->
<TestModeSelectionModal
  open={showModeSelectionModal}
  bankName={selectedBankName}
  totalQuestions={selectedBankQuestionCount}
  onSelect={handleModeSelected}
  onCancel={handleModeSelectionCancel}
/>

<style>
  .question-bank-list-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 1rem;
    overflow: hidden;
  }

  /* 加载容器 */
  .loading-container {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 400px;
  }

  /* 表头 - CSS Table布局 */
  .question-bank-header {
    display: table !important;
    width: 100%;
    table-layout: fixed;
    background: var(--background-secondary);
    border-radius: 8px;
    margin-bottom: 12px;
    padding: 8px 12px;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    flex-shrink: 0;
    border-collapse: separate;
    border-spacing: 0;
  }

  .header-bank-name,
  .header-stat,
  .header-actions {
    display: table-cell !important;
    vertical-align: middle;
    border: none;
    position: static !important;
    float: none !important;
  }

  .header-bank-name {
    width: 60%; /* 🎯 最大化题库名称空间 */
    text-align: left;
    padding: 4px 0px 4px 8px;
  }

  .header-stat {
    width: 8%; /* 🎯 紧凑统计列：总题/已练/正确率 */
    text-align: center;
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--text-muted);
    padding: 4px 2px;
  }

  .header-actions {
    width: 16%; /* 🎯 压缩操作列 */
    text-align: right;
    padding: 4px 8px 4px 0px;
  }

  /* 列表体 */
  .question-bank-list-body {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 4px;
    position: relative;
  }

  /* 考试题组行 - CSS Table布局 */
  .question-bank-row {
    display: table !important;
    width: 100%;
    table-layout: fixed;
    padding: 8px 12px;
    transition: all 0.2s ease;
    background: var(--background-primary);
    position: relative;
    border-radius: 8px;
    margin-bottom: 0;
    border: 1px solid var(--background-modifier-border);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    border-collapse: separate;
    border-spacing: 0;
  }

  .question-bank-row:hover {
    background: var(--background-modifier-hover);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  }

  .question-bank-row.empty {
    opacity: 0.7;
  }

  /*  状态指示底色 */
  .question-bank-row.urgent {
    background: linear-gradient(135deg, var(--background-primary) 0%, rgba(239, 68, 68, 0.03) 100%);
    border: 1px solid rgba(239, 68, 68, 0.1);
    box-shadow: 0 1px 3px rgba(239, 68, 68, 0.1);
  }

  .question-bank-row.due {
    background: linear-gradient(135deg, var(--background-primary) 0%, rgba(245, 158, 11, 0.03) 100%);
    border: 1px solid rgba(245, 158, 11, 0.1);
    box-shadow: 0 1px 3px rgba(245, 158, 11, 0.1);
  }

  .question-bank-row.completed {
    background: linear-gradient(135deg, var(--background-primary) 0%, rgba(16, 185, 129, 0.03) 100%);
    border: 1px solid rgba(16, 185, 129, 0.1);
    box-shadow: 0 1px 3px rgba(16, 185, 129, 0.1);
  }

  /*  数据行元素 - Table Cell布局 */
  .row-bank-name,
  .row-stat,
  .row-actions {
    display: table-cell !important;
    vertical-align: middle;
    border: none;
    position: static !important;
    float: none !important;
  }

  .row-bank-name {
    width: 60%; /* 🎯 与header保持一致的宽度 */
    text-align: left;
    padding: 4px 0px 4px 8px;
  }

  /*  题库名称内容容器 */
  .row-bank-name .bank-name-content,
  .row-bank-name {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .row-bank-name {
    display: table-cell !important; /* 🎯 覆盖flex，强制table-cell */
  }

  .row-stat {
    width: 8%; /* 🎯 与header保持一致的宽度 */
    text-align: center;
    font-weight: 600;
    font-size: 0.9rem;
    padding: 4px 2px;
  }

  .row-actions {
    width: 16%; /* 🎯 与header保持一致的宽度 */
    text-align: right;
    padding: 4px 8px 4px 0px;
  }

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
    transition: all 0.2s;
  }

  .expand-toggle:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .expand-spacer {
    width: 20px;
    height: 20px;
  }

  .bank-name-content {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
  }

  .bank-name {
    font-size: 0.95rem;
    font-weight: 500;
    color: var(--text-normal);
  }

  .bank-status {
    padding: 0.125rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .bank-status.empty {
    background: rgba(156, 163, 175, 0.1);
    color: #9ca3af;
  }

  .bank-status.completed {
    background: rgba(34, 197, 94, 0.1);
    color: #22c55e;
  }

  /*  移除旧的统计组样式 - 已改为table-cell布局 */

  .stat-number {
    font-size: 1rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .stat-total {
    color: #3b82f6;
  }

  .stat-completed {
    color: #f97316;
  }


  /*  移除重复的操作区域样式 - 已在table-cell规则中定义 */

  /* 操作按钮组 */
  .bank-actions {
    display: flex;
    align-items: center; 
    justify-content: flex-end; /* 🎯 确保按钮右对齐在操作列内 */
    gap: 8px;
    width: 100%; /* 🎯 确保占满table-cell宽度 */
  }

  /* 三点菜单按钮 - Cursor 风格圆形设计 */
  .menu-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
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

  .study-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .study-button.primary {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .study-button.primary:hover {
    background: var(--interactive-accent-hover);
  }

  .study-button.empty {
    background: var(--background-modifier-border);
    color: var(--text-muted);
    cursor: not-allowed;
    opacity: 0.6;
  }

  /* 列表体 - 当有空状态时 */
  .question-bank-list-body.has-empty {
    /* 当有空状态时，不占据全部空间，只占据内容所需的空间 */
    flex: 0 0 auto;
    min-height: auto;
    overflow: visible;
  }

  /* 空状态 */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 2rem;
    color: var(--text-muted);
    text-align: center;
    /* 允许点击事件穿透，不阻止下层元素的交互 */
    pointer-events: none;
    /* 限制最大宽度，避免占据整个屏幕 */
    max-width: 100%;
    margin: 0 auto;
    /* 确保不占据整个父容器的高度 */
    height: auto;
    min-height: auto;
  }

  /* 空状态内的所有元素都需要允许点击穿透 */
  .empty-state * {
    pointer-events: none;
  }

  .empty-state p {
    margin: 1rem 0 0.5rem;
    font-size: 1rem;
    font-weight: 500;
  }

  .empty-hint {
    font-size: 0.85rem;
    opacity: 0.7;
  }

  /* 响应式设计 */
  @media (max-width: 768px) {
    .question-bank-list-view {
      padding: 0.5rem;
    }

    .header-bank-name,
    .row-bank-name {
      width: 55%; /* 🎯 中屏幕：保持题库名称的最大化利用 */
    }

    .header-stat,
    .row-stat {
      width: 9%; /* 🎯 中屏幕：统计列适中宽度 */
    }

    .header-actions,
    .row-actions {
      width: 18%; /* 🎯 中屏幕：压缩操作列为名称列让出空间 */
    }
  }

  @media (max-width: 480px) {
    .header-bank-name,
    .row-bank-name {
      width: 50%; /* 🎯 小屏幕：仍然最大化利用名称空间 */
    }

    .header-stat,
    .row-stat {
      width: 10%; /* 🎯 小屏幕：统计列保持紧凑 */
    }

    .header-actions,
    .row-actions {
      width: 20%; /* 🎯 小屏幕：压缩操作列 */
    }

    .bank-actions {
      flex-direction: column;
      gap: 0.25rem;
    }
  }
</style>
