<script lang="ts">
  import { onMount, onDestroy, tick, untrack } from "svelte";
  import { Platform, Notice, Menu } from "obsidian";
  import type { WeavePlugin } from "../../main";
  import type { TestSession, TestQuestionRecord, TestMode, QuestionBankResumeBehavior } from "../../types/question-bank-types";
  import type { Card } from "../../data/types";
  import { TestSessionManager, TestScoringEngine } from "../../services/question-bank";
  import type { EmbeddableEditorManager } from "../../services/editor/EmbeddableEditorManager";
  import ObsidianIcon from "../ui/ObsidianIcon.svelte";
  import EnhancedIcon from "../ui/EnhancedIcon.svelte";
  import { showObsidianChoice, showObsidianConfirm } from "../../utils/obsidian-confirm";
  import PriorityPickerPopover from "../shared/PriorityPickerPopover.svelte";
  import QuestionBankHeader from "./QuestionBankHeader.svelte";
  import QuestionBankStatsCards from "./QuestionBankStatsCards.svelte";
  import QuestionBankActionSection from "./QuestionBankActionSection.svelte";
  import QuestionBankVerticalToolbar from "./QuestionBankVerticalToolbar.svelte";
  import QuestionNavigator from "./QuestionNavigator.svelte";
  import CardEditorContainer from "../study/CardEditorContainer.svelte";
  import { saveMemoryCard, deleteMemoryCard } from "../../services/weave-domain";
  import { logger } from "../../utils/logger";
  import { detectClozeModeFromContent } from "../../utils/cloze-mode";
  import { isInputClozeQuestionContent } from "../../utils/question-bank/input-cloze-utils";
  import {
    applyQuestionBankSessionFilters,
    resolveSessionQuestionCount,
    shouldShuffleSessionOptions,
    shouldShuffleSessionQuestions,
  } from "../../utils/question-bank/apply-question-bank-session-filters";
  import { extractBodyContent } from "../../utils/yaml-utils";
  
  // 选择题渲染支持
  import ChoiceOptionRenderer from "../atoms/ChoiceOptionRenderer.svelte";
  import ObsidianRenderer from "../atoms/ObsidianRenderer.svelte";
  import type { ChoiceQuestion } from "../../parsing/choice-question-parser";
  import { parseCardContent } from "../../parsing/card-content-parser";
  import CardContentView from "../content/CardContentView.svelte";
  import type { ChoiceOptionOrder } from '../../utils/study/choiceOptionOrder';
  import { applyChoiceQuestionOptionOrder } from '../../utils/study/choiceOptionOrder';
  
  // 重要程度贴纸
  import ImportanceIndicator from "./ImportanceIndicator.svelte";
  
  //  移动端组件
  import MobileQuestionStatsBar from "./MobileQuestionStatsBar.svelte";
  import type { QuestionBankMenuCallbacks } from "../../services/menu/QuestionBankMenuBuilder";
  import { populateQuestionBankMenuSession } from "../../services/menu/question-bank-menu-session";
  import { tr } from "../../utils/i18n";

  //  移动端视图实例类型
  import type { QuestionBankView } from "../../views/QuestionBankView";

  interface Props {
    bankId: string;
    bankName?: string;
    plugin: WeavePlugin;
    questions: Card[];
    mode?: TestMode;
    config?: import("../../types/question-bank-types").QuestionBankModeConfig;
    resumeBehavior?: QuestionBankResumeBehavior;
    viewInstance?: QuestionBankView; //  视图实例用于移动端回调
    isStagingSession?: boolean;
    onStagingQuestionReviewed?: (card: Card) => void;
    onStagingDiscard?: (cardUuid: string) => void;
    onStagingSessionComplete?: () => void;
    onStagingCardEdited?: (card: Card) => void;
    onComplete?: (session: TestSession) => void;
    onExit?: () => void;
  }

  const editorSessionId = `weave-question-bank-session-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let {
    bankId,
    bankName = "",
    plugin,
    questions,
    mode = 'exam',
    config,
    resumeBehavior = 'prompt',
    viewInstance,
    isStagingSession = false,
    onStagingQuestionReviewed,
    onStagingDiscard,
    onStagingSessionComplete,
    onStagingCardEdited,
    onComplete,
    onExit
  }: Props = $props();
  let t = $derived($tr);
  $effect(() => {
    if (!bankName) bankName = t('study.questionBankUI.studyInterface.defaultBankName');
  });

  // 会话管理
  let sessionManager: TestSessionManager | null = $state(null);  // 使用 $state 声明
  let currentSession = $state<TestSession | null>(null);
  let currentQuestion = $state<TestQuestionRecord | null>(null);

  // UI状态
  let isLoading = $state(false);
  let userAnswer = $state<string | string[] | null>(null);
  let hasSubmitted = $state(false);
  let statsCollapsed = $state(false);
  let showSidebar = $state(true);
  // 题目导航栏显示状态：桌面端默认展开，移动端默认折叠
  let showNavigator = $state(!Platform.isMobile);

  // 撤销功能
  let undoCount = $state(0); // 已使用的撤销次数
  const maxUndoCount = $derived(Math.ceil(questions.length * 0.2)); // 最大撤销次数（20%）
  const canUndo = $derived(undoCount < maxUndoCount && hasSubmitted); // 是否可以撤销

  // 编辑器状态
  let showEditModal = $state(false);
  let editorPoolManager: EmbeddableEditorManager | null = $state(null);
  let tempFileUnavailable = $state(false);
  let isClozeMode = $state(false);

  // 删除确认（直接删除开关仍沿用全局设置）
  let enableDirectDelete = $state(untrack(() => plugin.settings.enableDirectDelete ?? false));
  let showPriorityModal = $state(false);
  let selectedPriority = $state(2);
  let priorityAnchorElement: HTMLElement | null = $state(null);

  const studyViewPrefs = untrack(() => plugin.getStudyInterfaceViewPreferences());

  // 题目学习顺序设置
  let questionOrder = $state<'sequential' | 'random'>(studyViewPrefs.cardOrder || 'sequential');
  let choiceOptionOrder = $state<ChoiceOptionOrder>(studyViewPrefs.choiceOptionOrder || 'sequential');
  
  // 题目导航列数模式（持久化）
  let navColumnMode = $state<1 | 3>(3);

  // 侧边栏紧凑模式
  let compactMode = $state(false);
  let compactModeSetting = $state<'auto' | 'fixed'>('auto');

  let sidebarContentEl: HTMLDivElement | null = $state(null);
  let sidebarResizeObserver: ResizeObserver | null = $state(null);
  let questionContentEl: HTMLDivElement | null = $state(null);

  //  移动端状态
  const isMobile = Platform.isMobile;
  let showMobileStatsBar = $state(true); // 答题情况信息栏是否展开

  let questionBankOverlayEl = $state<HTMLDivElement | null>(null);
  let modalRef = $state<HTMLDivElement | null>(null);

  // 计时器
  let elapsedSeconds = $state(0);
  let timerInterval: number | null = null;

  // 考试倒计时
  let examDuration = $state(60 * 60 * 1000);  // 默认60分钟
  let examStartTime = $state(0);
  let remainingTime = $state(0);
  let isPaused = $state(false);
  let totalPausedMs = $state(0);
  let pauseStartedAt = $state(0);
  const isPureExamMode = $derived(!!config?.options?.pureExamMode);

  function getExamTimeLimitMinutes() {
    return config?.examTimeLimit?.exam;
  }

  function resolveExamDurationMs(): number {
    const configuredDurationMs = currentSession?.config?.timeLimit
      ?? config?.timeLimit
      ?? (getExamTimeLimitMinutes() ? getExamTimeLimitMinutes()! * 60 * 1000 : undefined);

    return configuredDurationMs && configuredDurationMs > 0
      ? configuredDurationMs
      : 60 * 60 * 1000;
  }

  // ===== 工具函数 =====
  
  /**
   * 统一错误处理函数
   * @param error 错误对象
   * @param operation 操作名称（用于日志）
   * @param userMessage 显示给用户的消息（可选，默认为"${operation}失败"）
   */
  function handleOperationError(error: unknown, operation: string, userMessage?: string) {
    const errorMessage = error instanceof Error ? error.message : t('study.questionBankUI.studyInterface.unknownError');
    logger.error(`[QuestionBankStudyInterface] ${operation} failed:`, error);
    new Notice(userMessage || t('study.questionBankUI.studyInterface.operationFailed', { error: errorMessage }));
  }

  // 自动解析当前题目的选择题数据（支持Obsidian渲染）
  // 使用 $derived 而非 $effect 避免无限循环
  let choiceQuestionDerived = $derived.by(() => {
    if (currentQuestion?.question.content) {
      try {
        const parsed = parseCardContent(currentQuestion.question.content);
        const choice: ChoiceQuestion | null = parsed.kind === 'choice' ? parsed.choice : null;
        //  调试日志：记录解析结果
        if (choice) {
          logger.debug('[QuestionBankStudyInterface] 选择题解析成功:', {
            hasExplanation: !!choice.explanation,
            explanationLength: choice.explanation?.length || 0,
            explanationPreview: choice.explanation?.substring(0, 50) || '(无解析)'
          });
        }
        return choice;
      } catch (error) {
        // 不是选择题格式，返回null
        logger.debug('[QuestionBankStudyInterface] 选择题解析失败:', error);
        return null;
      }
    }
    return null;
  });

  const orderedChoiceQuestionResult = $derived.by(() => {
    if (!choiceQuestionDerived || !currentQuestion?.question) {
      return null;
    }

    const seedSource = `${currentQuestion.question.uuid || currentQuestion.question.sourceFile || currentQuestion.question.content}::${choiceQuestionDerived.question}`;
    return applyChoiceQuestionOptionOrder(choiceQuestionDerived, choiceOptionOrder, seedSource);
  });

  const isInputClozeQuestion = $derived.by(() =>
    !choiceQuestionDerived
      && !!currentQuestion?.question.content
      && isInputClozeQuestionContent(currentQuestion.question.content)
  );

  const currentQuestionClozeMode = $derived.by(() =>
    currentQuestion?.question.content
      ? detectClozeModeFromContent(currentQuestion.question.content)
      : 'reveal'
  );

  const currentQuestionTypeLabel = $derived.by(() => {
    if (choiceQuestionDerived?.isMultipleChoice) {
      return t('study.questionBankUI.studyInterface.multipleChoice');
    }

    if (choiceQuestionDerived) {
      return t('study.questionBankUI.studyInterface.singleChoice');
    }

    if (isInputClozeQuestion) {
      return t('study.questionBankUI.studyInterface.inputCloze');
    }

    return t('study.questionBankUI.studyInterface.question');
  });

  function mapChoiceAnswerWithLabelMap(
    answer: string | string[] | null,
    labelMap: Record<string, string> | null | undefined
  ): string | string[] | null {
    if (!answer || !labelMap) {
      return answer;
    }

    if (Array.isArray(answer)) {
      return answer.map((item) => labelMap[item] ?? item);
    }

    return labelMap[answer] ?? answer;
  }

  function mapStoredChoiceAnswerToDisplayed(answer: string | string[] | null): string | string[] | null {
    return mapChoiceAnswerWithLabelMap(answer, orderedChoiceQuestionResult?.originalToDisplayedLabelMap);
  }

  function mapDisplayedChoiceAnswerToStored(answer: string | string[] | null): string | string[] | null {
    return mapChoiceAnswerWithLabelMap(answer, orderedChoiceQuestionResult?.displayedToOriginalLabelMap);
  }

  const clozeUserAnswers = $derived.by(() => {
    if (Array.isArray(userAnswer)) {
      return userAnswer;
    }

    if (typeof userAnswer === 'string' && userAnswer.trim()) {
      return [userAnswer];
    }

    return [];
  });

  function hasSubmissionAnswer(
    answer: string | string[] | null,
    treatAsInputCloze = false
  ): boolean {
    if (!answer) {
      return false;
    }

    if (Array.isArray(answer)) {
      return treatAsInputCloze
        ? answer.some(value => value.trim().length > 0)
        : answer.length > 0;
    }

    return answer.trim().length > 0;
  }

  const hasAnswerForSubmit = $derived.by(() =>
    hasSubmissionAnswer(userAnswer, isInputClozeQuestion)
  );

  function collectInputClozeAnswersFromDom(): string[] {
    if (!questionContentEl) {
      return Array.isArray(userAnswer) ? userAnswer : [];
    }

    return Array.from(
      questionContentEl.querySelectorAll<HTMLInputElement>('input[data-cloze-input="true"]')
    ).map((input) => input.value ?? '');
  }

  function handleQuestionContentInput(event: Event) {
    if (!isInputClozeQuestion || hasSubmitted) {
      return;
    }

    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.dataset.clozeInput !== 'true') {
      return;
    }

    userAnswer = collectInputClozeAnswersFromDom();
  }

  function handleQuestionRenderComplete(container: HTMLElement) {
    if (!isInputClozeQuestion) {
      return;
    }

    const inputElements = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[data-cloze-input="true"]')
    );

    if (isPureExamMode && hasSubmitted) {
      inputElements.forEach((input) => {
        input.readOnly = true;
        input.disabled = true;
      });
      return;
    }

    inputElements.forEach((input) => {
      input.readOnly = false;
      input.disabled = false;
    });
  }

  // 初始化会话
  async function initSession() {
    isLoading = true;
    try {
      if (!plugin.questionBankStorage) {
        throw new Error("QuestionBankStorage not initialized");
      }

      sessionManager = new TestSessionManager(plugin.questionBankStorage, plugin.questionBankService);

      const persisted = await plugin.questionBankStorage.loadInProgressSession(bankId);
      if (persisted && persisted.status === 'in_progress') {
        let action: 'resume' | 'restart' | 'cancel' = 'cancel';

        if (resumeBehavior === 'resume') {
          action = 'resume';
        } else if (resumeBehavior === 'restart') {
          action = 'restart';
        } else {
          const choice = await showObsidianChoice<'resume' | 'restart'>(
            plugin.app,
            t('study.questionBankUI.studyInterface.resumePrompt'),
            {
              title: t('study.questionBankUI.studyInterface.resumeTitle'),
              cancelText: t('study.questionBankUI.studyInterface.cancel'),
              layout: 'horizontal',
              choices: [
                {
                  value: 'resume',
                  text: t('study.questionBankUI.studyInterface.resume'),
                  className: 'mod-cta'
                },
                {
                  value: 'restart',
                  text: t('study.questionBankUI.studyInterface.restart')
                }
              ]
            }
          );

          action = choice ?? 'cancel';
        }

        if (action === 'resume') {
          currentSession = await sessionManager.restoreSession(bankId);
          if (currentSession) {
            currentQuestion = sessionManager.getCurrentQuestion();
            if (currentQuestion) {
              userAnswer = mapStoredChoiceAnswerToDisplayed(currentQuestion.userAnswer || null);
              hasSubmitted = currentQuestion.isCorrect !== null && currentQuestion.isCorrect !== undefined;
            }
            startTimer();
            initExamTimer(true);
            return;
          }

          action = 'restart';
        }

        if (action === 'restart') {
          await plugin.questionBankStorage.clearInProgressSession(bankId);
        } else {
          onExit?.();
          return;
        }
      }

      const sessionQuestions = isStagingSession
        ? questions
        : await applyQuestionBankSessionFilters(questions, config, mode);

      if (sessionQuestions.length === 0) {
        throw new Error(t('study.questionBankUI.bankCollection.noFilteredQuestions'));
      }

      const resolvedQuestionCount = resolveSessionQuestionCount(
        config,
        mode,
        sessionQuestions.length
      );

      currentSession = await sessionManager.startSession(
        {
          bankId,
          mode: mode,
          shuffleQuestions: shouldShuffleSessionQuestions(config, questionOrder),
          shuffleOptions: shouldShuffleSessionOptions(config, choiceOptionOrder),
          questionCount: resolvedQuestionCount,
          timeLimit: config?.timeLimit ?? (getExamTimeLimitMinutes() ? getExamTimeLimitMinutes()! * 60 * 1000 : undefined)
        },
        sessionQuestions
      );

      currentQuestion = sessionManager.getCurrentQuestion();
      startTimer();
      initExamTimer(false);
    } catch (error) {
      handleOperationError(error, '初始化测试', t('study.questionBankUI.studyInterface.startupFailed'));
    } finally {
      isLoading = false;
    }
  }

  // 提交答案
  async function handleSubmitAnswer() {
    if (!sessionManager || !currentQuestion || hasSubmitted) {
      return;
    }

    try {
      let answerToSubmit: string | string[] | null = userAnswer;
      if (isInputClozeQuestion) {
        answerToSubmit = collectInputClozeAnswersFromDom();
        userAnswer = answerToSubmit;
      }

      if (!hasSubmissionAnswer(answerToSubmit, isInputClozeQuestion)) {
        return;
      }

      const normalizedAnswerToSubmit = answerToSubmit as string | string[];
      const sessionAnswerToSubmit = (choiceQuestionDerived
        ? mapDisplayedChoiceAnswerToStored(normalizedAnswerToSubmit)
        : normalizedAnswerToSubmit) as string | string[];

      const result = await sessionManager.submitAnswer({
        questionId: currentQuestion.questionId,
        answer: sessionAnswerToSubmit,
        timeSpent: elapsedSeconds
      });

      hasSubmitted = true;

      // 同步更新 currentQuestion 的 isCorrect 状态
      // 确保UI能正确显示答题结果和解析内容
      if (currentQuestion) {
        currentQuestion.isCorrect = result.isCorrect;
        currentQuestion.userAnswer = sessionAnswerToSubmit;
        currentQuestion.submittedAt = new Date().toISOString();
        // 触发响应式更新
        currentQuestion = { ...currentQuestion };
      }

      // 更新当前会话
      currentSession = sessionManager.getCurrentSession();

      if (isStagingSession && currentQuestion?.question) {
        onStagingQuestionReviewed?.(currentQuestion.question);
      }

      if (isPureExamMode) {
        const isLastQuestion = (currentSession?.currentQuestionIndex ?? 0) >= ((currentSession?.totalQuestions ?? questions.length) - 1);
        if (isLastQuestion) {
          await handleCompleteTest();
        } else {
          await handleNextQuestion();
        }
        return;
      }
      
      //  调试日志：记录提交答案后的解析状态
      logger.debug('[QuestionBankStudyInterface] 提交答案后:', {
        hasSubmitted,
        hasExplanation: !!choiceQuestionDerived?.explanation,
        explanationLength: choiceQuestionDerived?.explanation?.length || 0,
        isCorrect: currentQuestion?.isCorrect,
        explanationContent: choiceQuestionDerived?.explanation
      });
    } catch (error) {
      handleOperationError(error, '提交答案', t('study.questionBankUI.studyInterface.submitAnswerFailed'));
    }
  }

  // 下一题
  async function handleNextQuestion() {
    if (!sessionManager) return;

    const hasNext = await sessionManager.moveToNextQuestion();
    
    if (hasNext) {
      // 使用刷新方法从数据库加载最新数据
      currentQuestion = await sessionManager.getCurrentQuestionWithRefresh();
      userAnswer = null;
      hasSubmitted = false;
      elapsedSeconds = 0;
      currentSession = sessionManager.getCurrentSession();
    } else {
      // 已经是最后一题，完成测试
      await handleCompleteTest();
    }
  }

  // 上一题（仅查看）
  async function handlePreviousQuestion() {
    if (!sessionManager) return;

    const hasPrev = await sessionManager.moveToPreviousQuestion();
    
    if (hasPrev) {
      // 使用刷新方法从数据库加载最新数据
      currentQuestion = await sessionManager.getCurrentQuestionWithRefresh();
      userAnswer = mapStoredChoiceAnswerToDisplayed(currentQuestion?.userAnswer || null);
      // 统一判断逻辑，确保已作答的题目正确显示状态
      hasSubmitted = currentQuestion?.isCorrect !== null && currentQuestion?.isCorrect !== undefined;
      currentSession = sessionManager.getCurrentSession();
      
      //  调试日志：记录切换后的状态
      logger.debug('[QuestionBankStudyInterface] 切换到上一题:', {
        hasSubmitted,
        isCorrect: currentQuestion?.isCorrect,
        userAnswer: currentQuestion?.userAnswer
      });
    }
  }

  // 完成测试
  async function handleCompleteTest() {
    if (!sessionManager) return;

    try {
      const completedSession = await sessionManager.completeSession();
      stopTimer();

      if (isStagingSession) {
        onStagingSessionComplete?.();
        return;
      }
      
      if (onComplete) {
        onComplete(completedSession);
      }
    } catch (error) {
      handleOperationError(error, '完成测试', t('study.questionBankUI.studyInterface.completeTestFailed'));
    }
  }

  // 撤销答案
  async function handleUndoAnswer() {
    if (!canUndo || !currentQuestion || !sessionManager) {
      return;
    }

    try {
      const undone = await sessionManager.undoCurrentAnswer();
      if (!undone) {
        return;
      }

      undoCount++;
      userAnswer = null;
      hasSubmitted = false;
      currentSession = sessionManager.getCurrentSession();
      if (currentQuestion) {
        currentQuestion = {
          ...currentQuestion,
          userAnswer: null,
          isCorrect: null,
          timeSpent: 0,
          submittedAt: null,
        };
      }
      elapsedSeconds = 0;
    } catch (error) {
      handleOperationError(error, '撤销答案', t('study.questionBankUI.studyInterface.submitAnswerFailed'));
    }
  }

  // 收藏功能
  async function handleToggleFavorite() {
    if (!currentQuestion) return;

    const favoriteTag = '#收藏';
    const tags = currentQuestion.question.tags || [];
    const isFavorited = tags.includes(favoriteTag);

    if (isFavorited) {
      currentQuestion.question.tags = tags.filter(tag => tag !== favoriteTag);
      new Notice(t('study.questionBankUI.studyInterface.unfavoriteSuccess'));
    } else {
      currentQuestion.question.tags = [...tags, favoriteTag];
      new Notice(t('study.questionBankUI.studyInterface.favoriteSuccess'));
    }

    // 保存到数据库
    try {
      await saveMemoryCard(plugin, currentQuestion.question, 'update');
      // 触发界面刷新
      currentQuestion = { ...currentQuestion };
    } catch (error) {
      handleOperationError(error, '保存收藏状态', t('study.questionBankUI.studyInterface.saveFailed'));
    }
  }

  // 编辑功能切换
  async function handleToggleEdit() {
    if (!currentQuestion) {
      logger.warn('[QuestionBankStudyInterface] No current question for editing');
      return;
    }

    if (!showEditModal) {
      await enterEditMode();
    } else {
      await exitEditMode();
    }
  }

  // 进入编辑模式
  async function enterEditMode() {
    tempFileUnavailable = false;
    showEditModal = true;
    await tick();
  }

  // 退出编辑模式（保存并关闭）
  async function exitEditMode() {
    if (!editorPoolManager) {
      logger.error('[QuestionBankStudyInterface] Cannot save: editorPoolManager not available');
      showEditModal = false;
      return;
    }

    try {
      const result = await saveCurrentCard();
      
      if (result.success && result.updatedCard) {
        new Notice(t('study.questionBankUI.studyInterface.cardSaved'));
        await handleEditorComplete(result.updatedCard);
      } else {
        handleSaveFailure(result.error);
      }
    } catch (error) {
      handleSaveError(error);
    }
  }

  // 保存当前编辑的卡片
  async function saveCurrentCard() {
    if (!editorPoolManager || !currentQuestion) {
      throw new Error('Editor or question not available');
    }

    const sessionCardId = editorSessionId;
    const actualCardId = currentQuestion.question.uuid;
    
    return await editorPoolManager.finishEditing(sessionCardId, true, {
      isStudySession: true,
      targetCardId: actualCardId
    });
  }

  // 处理保存失败
  function handleSaveFailure(error?: string) {
    handleOperationError(
      error || t('study.questionBankUI.studyInterface.unknownError'),
      '保存卡片（点击预览）',
      `${t('study.questionBankUI.studyInterface.saveFailed')}: ${error || t('study.questionBankUI.studyInterface.unknownError')}`
    );
    // 保持编辑模式，用户可以继续编辑或重试
  }

  // 处理保存异常
  function handleSaveError(error: unknown) {
    handleOperationError(error, '保存卡片（点击预览）', t('study.questionBankUI.studyInterface.saveFailed'));
    // 保持编辑模式
  }

  // 编辑器完成回调
  function syncEditedQuestionInMemory(updatedCard: Card) {
    const globalIndex = questions.findIndex((q) => q.uuid === updatedCard.uuid);
    if (globalIndex !== -1) {
      questions[globalIndex] = updatedCard;
      questions = [...questions];
    }

    if (sessionManager && currentSession) {
      const questionIndex = currentSession.questions.findIndex(
        (q) => q.questionId === updatedCard.uuid
      );
      if (questionIndex !== -1) {
        currentSession.questions[questionIndex].question = updatedCard;
      }
    }

    if (currentQuestion) {
      currentQuestion = {
        ...currentQuestion,
        question: updatedCard
      };
    }
  }

  async function handleEditorComplete(updatedCard: Card) {
    // Notice提示由调用者显示，避免重复
    
    // 四层数据同步，修正时序问题
    
    try {
      if (isStagingSession) {
        onStagingCardEdited?.(updatedCard);
        syncEditedQuestionInMemory(updatedCard);
      } else {
      // 0. 先保存到数据库
      const saveResult = await saveMemoryCard(plugin, updatedCard, 'update');
      if (!saveResult.success) {
        throw new Error(saveResult.error || t('study.questionBankUI.studyInterface.saveFailed'));
      }
      logger.debug('[QuestionBankStudyInterface] 卡片已保存到数据库:', updatedCard.uuid);
      
      // 1. 同步到会话层（最重要！确保切换题目后数据不丢失）
      if (sessionManager && currentSession) {
        const questionIndex = currentSession.questions.findIndex(
          q => q.questionId === updatedCard.uuid
        );
        if (questionIndex !== -1) {
          // 直接修改会话中的question对象
          currentSession.questions[questionIndex].question = updatedCard;
        }
      }
      
      // 2. 同步到全局questions数组
      const globalIndex = questions.findIndex(q => q.uuid === updatedCard.uuid);
      if (globalIndex !== -1) {
        questions[globalIndex] = updatedCard;
        questions = [...questions]; // 触发响应式更新
      }
      
      // 2.5 更新 QuestionBankService 的内存缓存
      // 否则 getCurrentQuestionWithRefresh 会从旧缓存加载数据
      if (plugin.questionBankService) {
        try {
          // updateQuestion 需要部分更新，传递主要字段
          await plugin.questionBankService.updateQuestion(updatedCard.uuid, {
            content: updatedCard.content,
            modified: updatedCard.modified,
            metadata: updatedCard.metadata,
            tags: updatedCard.tags,
            priority: updatedCard.priority,
            stats: updatedCard.stats
          });
          logger.debug('[QuestionBankStudyInterface] QuestionBankService 缓存已更新');
        } catch (error) {
          logger.warn('[QuestionBankStudyInterface] 更新 QuestionBankService 缓存失败:', error);
          // 不阻断流程，继续执行
        }
      }
      
      // 3. 更新界面层（currentQuestion）
      // 直接创建新对象，不要重新获取，避免时序问题
      if (currentQuestion) {
        // 创建新的 currentQuestion 对象，确保触发响应式
        currentQuestion = {
          ...currentQuestion,
          question: updatedCard  // 使用最新的卡片数据
        };
      }
      }
      
    } catch (error) {
      logger.error('[QuestionBankStudyInterface] 保存卡片到数据库失败:', error);
      new Notice(`${t('study.questionBankUI.studyInterface.saveFailed')}: ${error instanceof Error ? error.message : t('study.questionBankUI.studyInterface.unknownError')}`);
      // 发生错误时不退出编辑模式，让用户可以重试
      return;
    }
    
    // 退出编辑模式
    showEditModal = false;
    tempFileUnavailable = false;
    isClozeMode = false;
  }

  // 编辑器取消回调
  function handleEditorCancel() {
    showEditModal = false;
    tempFileUnavailable = false;
    isClozeMode = false;
  }

  // 挖空预览切换回调
  function handleToggleCloze() {
    isClozeMode = !isClozeMode;
  }

  function getCurrentQuestionPreview(): string {
    if (!currentQuestion) return '';
    return currentQuestion.question.content.slice(0, 30) || `ID: ${currentQuestion.question.uuid}`;
  }

  async function refreshCurrentQuestionAfterRemoval(): Promise<void> {
    if (!sessionManager) {
      currentQuestion = null;
      userAnswer = null;
      hasSubmitted = false;
      return;
    }

    currentQuestion = await sessionManager.getCurrentQuestionWithRefresh();
    if (currentQuestion) {
      userAnswer = mapStoredChoiceAnswerToDisplayed(currentQuestion.userAnswer || null);
      hasSubmitted =
        currentQuestion.isCorrect !== null && currentQuestion.isCorrect !== undefined;
    } else {
      userAnswer = null;
      hasSubmitted = false;
    }
    currentSession = sessionManager.getCurrentSession();
    elapsedSeconds = 0;
  }

  async function advanceAfterQuestionRemoved(removedCardId: string): Promise<'empty' | 'advanced'> {
    if (showEditModal) {
      showEditModal = false;
      tempFileUnavailable = false;
      isClozeMode = false;
    }

    questions = questions.filter((question) => question.uuid !== removedCardId);

    if (sessionManager) {
      const removalResult = await sessionManager.removeQuestionFromSession(removedCardId);
      if (removalResult === 'empty' || questions.length === 0) {
        return 'empty';
      }

      await refreshCurrentQuestionAfterRemoval();
      return 'advanced';
    }

    if (questions.length === 0) {
      return 'empty';
    }

    const nextCard = questions[0];
    currentQuestion = {
      questionId: nextCard.uuid,
      question: nextCard,
      userAnswer: null,
      correctAnswer: null,
      isCorrect: null,
      timeSpent: 0,
      submittedAt: null,
    };
    userAnswer = null;
    hasSubmitted = false;
    elapsedSeconds = 0;
    return 'advanced';
  }

  async function finalizeQuestionRemoval(
    removedCardId: string,
    successNoticeKey: string,
    options?: { stagingDiscard?: boolean }
  ): Promise<void> {
    if (options?.stagingDiscard) {
      onStagingDiscard?.(removedCardId);
    }

    const advanceResult = await advanceAfterQuestionRemoved(removedCardId);
    if (advanceResult === 'empty') {
      stopTimer();
      if (isStagingSession) {
        onStagingSessionComplete?.();
        return;
      }

      new Notice(t('study.questionBankUI.studyInterface.allQuestionsDeleted'));
      if (sessionManager?.getCurrentSession()) {
        await handleCompleteTest();
      } else {
        onExit?.();
      }
      return;
    }

    plugin.app.workspace.trigger('Weave:data-changed');
    new Notice(t(successNoticeKey));
  }

  // 移除：仅从考试题组解除引用并清理考试测试数据，保留记忆牌组卡片
  async function handleRemoveCard(skipConfirm = false) {
    if (!currentQuestion) return;

    if (!skipConfirm && !enableDirectDelete) {
      const confirmed = await showObsidianConfirm(
        plugin.app,
        t('study.questionBankUI.studyInterface.confirmRemoveMessage', {
          content: getCurrentQuestionPreview(),
        }),
        {
          title: t('study.questionBankUI.studyInterface.confirmRemoveTitle'),
          confirmText: t('study.questionBankUI.studyInterface.confirmRemoveAction'),
          cancelText: t('study.questionBankUI.studyInterface.cancel'),
          confirmClass: 'mod-warning',
        }
      );
      if (!confirmed) return;
    }

    try {
      const removedCardId = currentQuestion.question.uuid;

      if (isStagingSession) {
        await finalizeQuestionRemoval(removedCardId, 'study.questionBankUI.studyInterface.cardRemoved', {
          stagingDiscard: true,
        });
        return;
      }

      if (!plugin.questionBankService) {
        new Notice(t('study.questionBankUI.bankCollection.serviceNotReady'));
        return;
      }

      await plugin.questionBankService.removeQuestionsFromBank(bankId, [removedCardId]);
      await finalizeQuestionRemoval(removedCardId, 'study.questionBankUI.studyInterface.cardRemoved');
    } catch (error) {
      handleOperationError(
        error,
        '移除题目',
        t('study.questionBankUI.studyInterface.removeCardFailed')
      );
    }
  }

  // 删除：从记忆牌组与考试题组中彻底删除卡片
  async function handleDeleteCard(skipConfirm = false) {
    if (!currentQuestion) return;

    if (!skipConfirm && !enableDirectDelete) {
      const confirmed = await showObsidianConfirm(
        plugin.app,
        `${t('study.questionBankUI.studyInterface.confirmDeleteMessage', {
          content: getCurrentQuestionPreview(),
        })}\n${t('study.questionBankUI.studyInterface.deleteIrreversible')}`,
        {
          title: t('study.questionBankUI.studyInterface.confirmDeleteTitle'),
          confirmText: t('common.confirmDelete'),
          cancelText: t('study.questionBankUI.studyInterface.cancel'),
          confirmClass: 'mod-warning',
        }
      );
      if (!confirmed) return;
    }

    try {
      const deletedCardId = currentQuestion.question.uuid;

      if (isStagingSession) {
        await finalizeQuestionRemoval(deletedCardId, 'study.questionBankUI.studyInterface.cardDeleted', {
          stagingDiscard: true,
        });
        return;
      }

      const deleteResult = await deleteMemoryCard(plugin, deletedCardId);
      if (!deleteResult.success) {
        throw new Error(deleteResult.error || t('study.questionBankUI.studyInterface.deleteCardFailed'));
      }

      if (plugin.questionBankService) {
        await plugin.questionBankService.cleanupDeletedMemoryCards([deletedCardId]);
      }

      await finalizeQuestionRemoval(deletedCardId, 'study.questionBankUI.studyInterface.cardDeleted');
    } catch (error) {
      handleOperationError(
        error,
        '删除卡片',
        t('study.questionBankUI.studyInterface.deleteCardFailed')
      );
    }
  }

  function isValidPriority(value: unknown): value is 1 | 2 | 3 | 4 {
    return value === 1 || value === 2 || value === 3 || value === 4;
  }

  // 重要程度功能
  function handleChangePriority(priority?: 1 | 2 | 3 | 4) {
    if (!currentQuestion) return;

    if (isValidPriority(priority)) {
      void confirmChangePriority(priority);
      return;
    }

    const currentPriority = (currentQuestion.question.priority || 2) as 1 | 2 | 3 | 4;
    selectedPriority = currentPriority;

    if (isMobile) {
      const menu = new Menu();

      const priorityOptions: Array<{
        value: 1 | 2 | 3 | 4;
        label: string;
        icon: string;
      }> = [
        { value: 1, label: t('study.questionBankUI.studyInterface.importanceLow'), icon: 'chevrons-down' },
        { value: 2, label: t('study.questionBankUI.studyInterface.importanceMedium'), icon: 'minus' },
        { value: 3, label: t('study.questionBankUI.studyInterface.importanceHigh'), icon: 'chevrons-up' },
        { value: 4, label: t('study.questionBankUI.studyInterface.importanceVeryHigh'), icon: 'flame' }
      ];

      priorityOptions.forEach((option) => {
        menu.addItem((item) => {
          const title = option.value === currentPriority
            ? t('study.questionBankUI.studyInterface.currentPrefix', { label: option.label })
            : t('study.questionBankUI.studyInterface.setToPrefix', { label: option.label });

          item
            .setTitle(title)
            .setIcon(option.value === currentPriority ? 'check' : option.icon)
            .onClick(() => {
              if (option.value !== currentPriority) {
                void confirmChangePriority(option.value);
              }
            });
        });
      });

      menu.showAtPosition({
        x: Math.round(window.innerWidth / 2),
        y: Math.round(window.innerHeight / 2)
      });
      return;
    }

    showPriorityModal = true;
  }

  async function confirmChangePriority(priority: 1 | 2 | 3 | 4) {
    if (!currentQuestion) return;

    try {
      // 更新卡片的重要程度
      const updatedCard = {
        ...currentQuestion.question,
        priority,
        modified: new Date().toISOString()
      };

      // 保存卡片
      const result = await saveMemoryCard(plugin, updatedCard, 'update');
      if (result.success) {
        // 更新当前题目
        currentQuestion.question.priority = priority;
        currentQuestion = { ...currentQuestion };

        const priorityText = [
          '',
          t('study.questionBankUI.studyInterface.importanceLow'),
          t('study.questionBankUI.studyInterface.importanceMedium'),
          t('study.questionBankUI.studyInterface.importanceHigh'),
          t('study.questionBankUI.studyInterface.importanceVeryHigh')
        ][priority] || t('study.questionBankUI.studyInterface.importanceMedium');
        new Notice(t('study.questionBankUI.studyInterface.priorityUpdated', { label: priorityText }));
        showPriorityModal = false;
      }
    } catch (error) {
      handleOperationError(error, '更新重要程度', t('study.questionBankUI.studyInterface.updatePriorityFailed'));
    }
  }

  // 查看详情信息
  function handleOpenDetailedView() {
    if (!currentQuestion) return;
    void plugin.openViewCardModal(currentQuestion.question);
  }

  // 处理题目学习顺序切换
  function handleQuestionOrderChange(newOrder: 'sequential' | 'random') {
    questionOrder = newOrder;
    void plugin.saveStudyInterfaceViewPreferences({ cardOrder: newOrder });
    
    // 提示用户：顺序将在下次学习时生效
    new Notice(t('study.questionBankUI.studyInterface.questionOrderChanged', {
      order: newOrder === 'random'
        ? t('study.questionBankUI.studyInterface.randomOrder')
        : t('study.questionBankUI.studyInterface.sequentialOrder')
    }));
  }

  function handleChoiceOptionOrderChange(newOrder: ChoiceOptionOrder) {
    const storedAnswer = currentQuestion?.userAnswer || null;
    choiceOptionOrder = newOrder;
    void plugin.saveStudyInterfaceViewPreferences({ choiceOptionOrder: newOrder });
    let noticeMessage = t('study.questionBankUI.studyInterface.optionOrderChanged', {
      order: newOrder === 'random'
        ? t('study.questionBankUI.studyInterface.randomOrder')
        : t('study.questionBankUI.studyInterface.sequentialOrder')
    });
    if (choiceQuestionDerived) {
      if (hasSubmitted) {
        const nextOrderedChoice = applyChoiceQuestionOptionOrder(
          choiceQuestionDerived,
          newOrder,
          `${currentQuestion?.question.uuid || currentQuestion?.question.sourceFile || currentQuestion?.question.content || ''}::${choiceQuestionDerived.question}`
        );
        userAnswer = mapChoiceAnswerWithLabelMap(storedAnswer, nextOrderedChoice.originalToDisplayedLabelMap);
      } else {
        userAnswer = null;
        noticeMessage += t('study.questionBankUI.studyInterface.optionOrderReset');
      }
    }
    new Notice(noticeMessage);
  }

  // 处理导航列数模式切换
  function handleNavColumnModeChange(mode: 1 | 3) {
    navColumnMode = mode;
    new Notice(t('study.questionBankUI.studyInterface.navigationColumnsChanged', {
      mode: mode === 1
        ? t('study.questionBankUI.studyInterface.singleColumn')
        : t('study.questionBankUI.studyInterface.threeColumns')
    }));
  }

  // 处理紧凑模式切换
  function handleCompactModeSettingChange(setting: 'auto' | 'fixed') {
    compactModeSetting = setting;
    
    if (setting === 'fixed') {
      compactMode = true;
      new Notice(t('study.questionBankUI.studyInterface.sidebarCompactFixed'));
    } else {
      compactMode = false;
      new Notice(t('study.questionBankUI.studyInterface.sidebarCompactAuto'));
    }
  }

  function checkSidebarCompactMode() {
    if (!sidebarContentEl) return;
    const toolbarEl = sidebarContentEl.querySelector('.weave-vertical-toolbar') as HTMLElement | null;
    if (!toolbarEl) return;
    const diff = toolbarEl.scrollHeight - toolbarEl.clientHeight;
    compactMode = diff > 8;
  }

  $effect(() => {
    if (isPureExamMode) {
      showSidebar = false;
    }
  });

  $effect(() => {
    if (!showSidebar) return;

    if (compactModeSetting === 'fixed') {
      compactMode = true;
      return;
    }

    tick().then(() => {
      checkSidebarCompactMode();

      if (!sidebarContentEl) return;
      const toolbarEl = sidebarContentEl.querySelector('.weave-vertical-toolbar') as HTMLElement | null;
      if (!toolbarEl) return;

      sidebarResizeObserver?.disconnect();
      sidebarResizeObserver = new ResizeObserver(() => {
        checkSidebarCompactMode();
      });
      sidebarResizeObserver.observe(toolbarEl);
    });

    return () => {
      sidebarResizeObserver?.disconnect();
      sidebarResizeObserver = null;
    };
  });

  // 退出测试
  async function handleExit() {
    // 如果正在编辑，先保存再退出
    if (showEditModal && editorPoolManager) {
      //  使用 Obsidian Modal 代替原生确认框，避免焦点劫持问题
      const confirmExit = await showObsidianConfirm(
        plugin.app,
        t('study.questionBankUI.studyInterface.confirmExitEditing'),
        {
          title: t('study.questionBankUI.studyInterface.confirmExitTitle'),
          confirmText: t('study.questionBankUI.studyInterface.saveAndExit')
        }
      );
      if (!confirmExit) return;
      
      try {
        // 保存编辑内容
        await exitEditMode();
        logger.debug('[QuestionBankStudyInterface] 已保存编辑内容');
      } catch (error) {
        logger.error('[QuestionBankStudyInterface] 保存编辑内容失败:', error);
        new Notice(t('study.questionBankUI.studyInterface.saveFailedCancelExit'));
        return;
      }
    }
    
    //  使用 Obsidian Modal 代替原生确认框，避免焦点劫持问题
    const confirmed = await showObsidianConfirm(
      plugin.app,
      t('study.questionBankUI.studyInterface.confirmExitSession'),
      {
        title: t('study.questionBankUI.studyInterface.confirmExitTitle'),
        confirmText: t('study.questionBankUI.studyInterface.exit')
      }
    );
    if (!confirmed) return;

    if (sessionManager) {
      await sessionManager.cancelSession();
    }
    
    stopTimer();
    
    if (onExit) {
      onExit();
    }
  }

  // 跳转到指定题目
  async function handleJumpToQuestion(index: number) {
    if (!sessionManager) return;
    
    try {
      await sessionManager.jumpToQuestion(index);
      // 使用刷新方法从数据库加载最新数据
      currentQuestion = await sessionManager.getCurrentQuestionWithRefresh();
      
      // 统一答案状态判断逻辑
      if (currentQuestion) {
        userAnswer = mapStoredChoiceAnswerToDisplayed(currentQuestion.userAnswer || null);
        hasSubmitted = currentQuestion.isCorrect !== null && currentQuestion.isCorrect !== undefined;
      } else {
        userAnswer = null;
        hasSubmitted = false;
      }
      
      currentSession = sessionManager.getCurrentSession();
      
      //  调试日志：记录跳转后的状态
      logger.debug('[QuestionBankStudyInterface] 跳转到题目:', {
        index,
        hasSubmitted,
        isCorrect: currentQuestion?.isCorrect,
        userAnswer: currentQuestion?.userAnswer
      });
    } catch (error) {
      handleOperationError(error, '跳转题目', t('study.questionBankUI.studyInterface.jumpQuestionFailed'));
    }
  }

  // 暂停/继续倒计时
  function handleTogglePause() {
    if (!isPaused) {
      pauseStartedAt = Date.now();
      isPaused = true;
      return;
    }

    if (pauseStartedAt > 0) {
      totalPausedMs += Date.now() - pauseStartedAt;
      pauseStartedAt = 0;
    }
    isPaused = false;
  }

  // 初始化考试倒计时
  function initExamTimer(fromRestore = false) {
    if (currentSession?.mode !== 'exam') {
      return;
    }

    examDuration = resolveExamDurationMs();
    totalPausedMs = 0;
    pauseStartedAt = 0;
    isPaused = false;

    if (fromRestore && currentSession.startTime) {
      examStartTime = new Date(currentSession.startTime).getTime();
    } else {
      examStartTime = Date.now();
    }

    const elapsed = Date.now() - examStartTime - totalPausedMs;
    remainingTime = Math.max(0, examDuration - elapsed);
  }

  // 更新倒计时
  $effect(() => {
    if (currentSession?.mode === 'exam' && examStartTime > 0 && !isPaused) {
      const interval = window.setInterval(() => {
        const elapsed = Date.now() - examStartTime - totalPausedMs;
        remainingTime = Math.max(0, examDuration - elapsed);

        if (remainingTime === 0) {
          window.clearInterval(interval);
          handleCompleteTest();
        }
      }, 100);

      return () => window.clearInterval(interval);
    }
  });

  // 计时器
  function startTimer() {
    timerInterval = window.setInterval(() => {
      elapsedSeconds++;
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      window.clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  // 格式化时间
  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // 解析题目选项
  function parseOptions(content: string): Array<{ id: string; text: string }> {
    const lines = content.split('\n');
    const options: Array<{ id: string; text: string }> = [];

    for (const line of lines) {
      const match = line.match(/^([A-Z])[.、)]\s*(.+)$/);
      if (match) {
        options.push({
          id: match[1],
          text: match[2].trim()
        });
      }
    }

    return options;
  }

  // 提取题干（移除 YAML frontmatter）
  function extractStem(content: string): string {
    // 先移除 YAML frontmatter，参考记忆学习界面
    const bodyContent = extractBodyContent(content);
    const lines = bodyContent.split('\n');
    const stemLines: string[] = [];

    for (const line of lines) {
      if (/^[A-Z][.、)]/.test(line)) {
        break;
      }
      stemLines.push(line);
    }

    return stemLines.join('\n').trim();
  }

  // 判断是否为多选题
  // 使用实时解析的选择题数据，而不是依赖可能过时的元数据
  function isMultipleChoice(_question: Card): boolean {
    // 优先使用实时解析的结果
    if (choiceQuestionDerived?.isMultipleChoice !== undefined) {
      return choiceQuestionDerived.isMultipleChoice;
    }
    // 降级：检查元数据（可能不准确，尤其是编辑后）
    return _question.metadata?.questionMetadata?.type === 'multiple_choice';
  }

  // 处理单选答案
  function handleSingleChoiceSelect(optionId: string) {
    if (hasSubmitted) return;
    userAnswer = optionId;
  }

  // 处理多选答案
  function handleMultipleChoiceToggle(optionId: string) {
    if (hasSubmitted) return;

    if (!Array.isArray(userAnswer)) {
      userAnswer = [];
    }

    const index = userAnswer.indexOf(optionId);
    if (index > -1) {
      userAnswer = userAnswer.filter(id => id !== optionId);
    } else {
      userAnswer = [...userAnswer, optionId];
    }
  }

  // 获取进度信息
  const progress = $derived.by(() => {
    return sessionManager?.getProgress() || {
      current: 1,
      total: questions.length,
      percentage: 0,
      answered: 0,
      unanswered: questions.length
    };
  });

  // 获取统计信息
  const stats = $derived.by(() => {
    if (!currentSession) {
      return { correctCount: 0, wrongCount: 0, accuracy: 0 };
    }
    return {
      correctCount: currentSession.correctCount,
      wrongCount: currentSession.wrongCount,
      accuracy: currentSession.correctCount + currentSession.wrongCount > 0
        ? (currentSession.correctCount / (currentSession.correctCount + currentSession.wrongCount)) * 100
        : 0
    };
  });

  // 计算平均用时
  const averageTime = $derived.by(() => {
    if (!currentSession) {
      return 0;
    }

    const answeredQuestions = currentSession.questions.filter((record) => record.submittedAt);
    if (answeredQuestions.length === 0) {
      return 0;
    }

    const totalMs = answeredQuestions.reduce(
      (sum, record) => sum + (record.timeSpent || 0) * 1000,
      0
    );
    return totalMs / answeredQuestions.length;
  });


  // 初始化
  onMount(async () => {
    initSession();

    // 与记忆学习一致：标记学习会话，保留 Obsidian 原生 view-header 布局
    if (activeDocument.body.classList.contains('is-phone')) {
      activeDocument.body.classList.add('weave-study-active');
    }
    
    // 初始化EmbeddableEditorManager（旧嵌入式方案：embedRegistry，无文件池）
    try {
      const { EmbeddableEditorManager } = await import("../../services/editor/EmbeddableEditorManager");
      editorPoolManager = new EmbeddableEditorManager(plugin.app);
    } catch (error) {
      handleOperationError(error, '初始化编辑器管理器', t('study.questionBankUI.studyInterface.initEditorFailed'));
      tempFileUnavailable = true;
    }
    
    if (isMobile && viewInstance) {
      viewInstance.setPopulatePaneMenuCallback(populateQuestionBankPaneMenu);
      viewInstance.setMobilePanelStateGetter(() => ({
        showStatsBar: showMobileStatsBar,
        showNavigator,
      }));
      viewInstance.setToggleStatsBarCallback(toggleMobileStatsBar);
      viewInstance.setToggleNavigatorCallback(toggleNavigatorPanel);
      logger.debug('[QuestionBankStudyInterface] 移动端回调已设置');
    }
  });

  // 清理
  onDestroy(() => {
    if (viewInstance && typeof viewInstance.setPopulatePaneMenuCallback === 'function') {
      viewInstance.setPopulatePaneMenuCallback(null);
    }
    if (viewInstance && typeof viewInstance.setMobilePanelStateGetter === 'function') {
      viewInstance.setMobilePanelStateGetter(null);
    }
    if (viewInstance && typeof viewInstance.setSaveCallback === 'function') {
      viewInstance.setSaveCallback(async () => {});
    }
    if (viewInstance && typeof viewInstance.updateEditMode === 'function') {
      viewInstance.updateEditMode(false);
    }
    activeDocument.body.classList.remove('weave-study-active', 'weave-edit-active');
    stopTimer();
  });

  // 同步编辑模式到 QuestionBankView（移动端顶栏「保存并返回」）
  $effect(() => {
    if (viewInstance && typeof viewInstance.updateEditMode === 'function') {
      viewInstance.updateEditMode(showEditModal);
    }
  });

  $effect(() => {
    if (viewInstance && typeof viewInstance.setSaveCallback === 'function') {
      viewInstance.setSaveCallback(async () => {
        await handleToggleEdit();
      });
    }
  });

  // 移动端编辑：与记忆学习共用 weave-edit-active（隐藏插件内 study-header，保留 Obsidian view-header）
  $effect(() => {
    if (typeof activeDocument === 'undefined') return;

    const isMobileDevice =
      activeDocument.body.classList.contains('is-mobile')
      || activeDocument.body.classList.contains('is-phone');

    if (isMobileDevice) {
      activeDocument.body.classList.toggle('weave-edit-active', showEditModal);
    }

    return () => {
      activeDocument.body.classList.remove('weave-edit-active');
    };
  });

  function toggleMobileStatsBar() {
    const nextExpanded = !showMobileStatsBar;
    showMobileStatsBar = nextExpanded;

    // 移动端互斥：展开统计栏时，收起题目导航
    if (isMobile && nextExpanded) {
      showNavigator = false;
    }
  }

  function toggleNavigatorPanel() {
    const nextExpanded = !showNavigator;
    showNavigator = nextExpanded;

    // 移动端互斥：展开题目导航时，收起统计栏
    if (isMobile && nextExpanded) {
      showMobileStatsBar = false;
    }
  }

  function populateQuestionBankPaneMenu(menu: Menu): void {
    if (!currentQuestion) {
      return;
    }

    const menuCallbacks: QuestionBankMenuCallbacks = {
      onToggleEdit: handleToggleEdit,
      onRemove: handleRemoveCard,
      onDelete: handleDeleteCard,
      onToggleFavorite: handleToggleFavorite,
      onChangePriority: (priority?: number) =>
        handleChangePriority(priority as 1 | 2 | 3 | 4 | undefined),
      onOpenDetailedView: handleOpenDetailedView,
      onToggleStatsBar: toggleMobileStatsBar,
      onToggleNavigator: toggleNavigatorPanel,
      onQuestionOrderChange: handleQuestionOrderChange,
      onChoiceOptionOrderChange: handleChoiceOptionOrderChange,
      onNavColumnModeChange: handleNavColumnModeChange,
      onDirectDeleteToggle: (enabled) => {
        enableDirectDelete = enabled;
      },
    };

    populateQuestionBankMenuSession(menu, {
      card: currentQuestion.question,
      isEditing: showEditModal,
      hasSourceFile: !!currentQuestion.question.sourceFile,
      currentPriority: currentQuestion.question.priority || 2,
      enableDirectDelete,
      showStatsBar: showMobileStatsBar,
      questionOrder,
      choiceOptionOrder,
      navColumnMode,
      showNavigator,
      callbacks: menuCallbacks,
    });
  }
</script>

<div
  class="question-bank-study-interface-overlay"
  bind:this={questionBankOverlayEl}
  class:edit-active={showEditModal}
  class:mobile-edit-mode={Platform.isMobile && showEditModal}
>
  <div class="question-bank-study-interface-content" bind:this={modalRef}>
    {#if isLoading}
      <!-- 加载状态 -->
      <div class="loading-state">
        <div class="spinner"></div>
        <p>{t('study.questionBankUI.studyInterface.loadingPreparing')}</p>
      </div>
    {:else if currentSession && currentQuestion}
      <!-- 头部工具栏（移动端编辑时由 weave-edit-active 隐藏 .study-header，Obsidian 顶栏单独保留） -->
      <QuestionBankHeader
        {bankName}
        currentIndex={progress.current}
        totalQuestions={progress.total}
        {statsCollapsed}
        showSidebar={showSidebar && !isPureExamMode}
        showSidebarToggle={!isPureExamMode}
        {showNavigator}
        showNavigatorToggle={false}
        onToggleStats={() => statsCollapsed = !statsCollapsed}
        onToggleSidebar={() => {
          if (!isPureExamMode) {
            showSidebar = !showSidebar;
          }
        }}
        onToggleNavigator={isPureExamMode ? undefined : toggleNavigatorPanel}
        mode={currentSession.mode}
        {remainingTime}
        {examDuration}
        {isPaused}
        onTogglePause={handleTogglePause}
      />

      <!--  移动端答题情况信息栏 -->
      {#if isMobile && !isPureExamMode && !showEditModal}
        <MobileQuestionStatsBar
          expanded={showMobileStatsBar}
          correctCount={currentSession.correctCount}
          wrongCount={currentSession.wrongCount}
          accuracy={stats.accuracy}
          currentTime={elapsedSeconds}
          totalQuestions={currentSession.totalQuestions}
          completedQuestions={currentSession.completedQuestions}
        />
      {/if}

      <!--  移动端题目导航下拉面板（与统计栏一致，向下展开） -->
      {#if isMobile && showNavigator && currentSession}
        <div class="mobile-navigator-dropdown" role="region" aria-label={t('study.questionBankUI.studyInterface.navigatorAria')}>
          <div class="mobile-nav-dropdown-panel">
            <div class="mobile-nav-grid-scroll">
              <div class="mobile-nav-grid">
                {#each currentSession.questions as record, index}
                  {@const status = index === (sessionManager?.getCurrentIndex() || 0)
                    ? 'current'
                    : record.isCorrect === true
                      ? 'correct'
                      : record.isCorrect === false
                        ? 'wrong'
                        : 'unanswered'}
                  <button
                    class="mobile-nav-cell {status}"
                    onclick={() => { handleJumpToQuestion(index); showNavigator = false; }}
                  >
                    {index + 1}
                  </button>
                {/each}
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- 主要内容区域 -->
      <div class="study-content" class:with-navigator={showNavigator} class:with-sidebar={showSidebar && !isPureExamMode}>
      
      <!-- 左侧题目导航栏 -->
      {#if showNavigator && currentSession}
        <div class="navigator-sidebar">
          <QuestionNavigator
            questions={currentSession.questions}
            currentIndex={sessionManager?.getCurrentIndex() || 0}
            onJumpToQuestion={handleJumpToQuestion}
            columnMode={navColumnMode}
          />
        </div>
      {/if}
      
      <!-- 主学习区域 -->
      <div class="main-study-area">
        <!-- 统计卡片（可折叠）-  移动端隐藏，使用MobileQuestionStatsBar代替 -->
        {#if !statsCollapsed && !isMobile && !isPureExamMode}
          <QuestionBankStatsCards 
            session={currentSession} 
            currentQuestion={currentQuestion} 
          />
        {/if}

        <!-- 题目学习区域 -->
        <div class="card-study-container">
          <div class="card-container" class:editing={showEditModal}>
            <!-- 重要程度贴纸 - 显示在右上角 -->
            {#if currentQuestion?.question?.priority && !showEditModal}
              <ImportanceIndicator 
                importance={currentQuestion.question.priority}
                sticky={true}
              />
            {/if}
            
            {#if showEditModal}
              <!-- 编辑器模式 -->
              <CardEditorContainer
                {plugin}
                card={currentQuestion.question}
                realCardId={currentQuestion.question.uuid}
                editorSessionId={editorSessionId}
                {showEditModal}
                tempFileUnavailable={tempFileUnavailable}
                isClozeMode={isClozeMode}
                editorPoolManager={editorPoolManager}
                dataStorage={plugin.dataStorage}
                {modalRef}
                statsCollapsed={statsCollapsed}
                onEditComplete={handleEditorComplete}
                onEditCancel={handleEditorCancel}
                onToggleCloze={handleToggleCloze}
              />
            {:else}
            <!-- 题目区域 -->
            <div class="question-area">
      <!-- 题干 -->
      <div class="question-stem">
        <div class="question-header">
          {#if currentQuestion.question.difficulty}
            <span class="difficulty-badge {currentQuestion.question.difficulty}">
              {currentQuestion.question.difficulty === 'easy'
                ? t('study.questionBankUI.studyInterface.difficultyEasy')
                : currentQuestion.question.difficulty === 'medium'
                  ? t('study.questionBankUI.studyInterface.difficultyMedium')
                  : t('study.questionBankUI.studyInterface.difficultyHard')}
            </span>
          {/if}
          <span class="question-type">{currentQuestionTypeLabel}</span>
        </div>
        <div class="question-content" bind:this={questionContentEl} oninput={handleQuestionContentInput}>
          {#if choiceQuestionDerived}
            <section class="study-preview-section">
              <div class="study-preview-title">
                <span class="study-preview-chip">{t('study.questionBankUI.studyInterface.stem')}</span>
              </div>
              <div class="study-preview-card question">
                <CardContentView
                  plugin={plugin}
                  content={currentQuestion.question.content}
                  sourcePath={currentQuestion.question.sourceFile || ''}
                  section="stem"
                  showAnswer={false}
                />
              </div>
            </section>
          {:else}
            <ObsidianRenderer
              {plugin}
              content={extractStem(currentQuestion.question.content)}
              sourcePath={currentQuestion.question.sourceFile || ''}
              enableClozeProcessing={true}
              showClozeAnswers={isInputClozeQuestion && hasSubmitted && !isPureExamMode}
              clozeMode={currentQuestionClozeMode}
              clozeUserAnswers={clozeUserAnswers}
              onRenderComplete={handleQuestionRenderComplete}
            />
          {/if}
        </div>
      </div>

      <!-- 选项区域 -->
      <div class="options-area">
        {#if choiceQuestionDerived}
          <section class="study-preview-section">
            <div class="study-preview-title">
              <span class="study-preview-chip">{t('study.questionBankUI.studyInterface.options')}</span>
            </div>
            <CardContentView
              plugin={plugin}
              content={currentQuestion.question.content}
              sourcePath={currentQuestion.question.sourceFile || ''}
              section="options"
              {choiceOptionOrder}
              {userAnswer}
              {hasSubmitted}
              onSingleSelect={handleSingleChoiceSelect}
              onMultipleToggle={handleMultipleChoiceToggle}
            />
          </section>
        {:else if !isInputClozeQuestion}
          <!-- 降级渲染：使用旧版本解析，统一使用ChoiceOptionRenderer保持样式一致 -->
          {#each parseOptions(currentQuestion.question.content) as option}
            {@const isMultiple = isMultipleChoice(currentQuestion.question)}
            {@const isSelected = isMultiple 
              ? Array.isArray(userAnswer) && userAnswer.includes(option.id)
              : userAnswer === option.id}
            {@const isCorrectOption = hasSubmitted && 
              (Array.isArray(currentQuestion.correctAnswer) 
                ? currentQuestion.correctAnswer.includes(option.id)
                : currentQuestion.correctAnswer === option.id)}
            
            {@const showAsCorrect = isCorrectOption && isSelected}
            {@const showAsWrong = hasSubmitted && (
              (isCorrectOption && !isSelected) ||
              (!isCorrectOption && isSelected)
            )}

            {@const badgeText = hasSubmitted 
              ? (isCorrectOption && isSelected ? t('study.questionBankUI.studyInterface.correctSelection')
                : !isCorrectOption && isSelected ? t('study.questionBankUI.studyInterface.wrongSelection')
                : isCorrectOption && !isSelected ? t('study.questionBankUI.studyInterface.missedSelection')
                : '')
              : ''}
            {@const badgeIcon = hasSubmitted 
              ? (isCorrectOption && isSelected ? 'check' 
                : !isCorrectOption && isSelected ? 'x'
                : isCorrectOption && !isSelected ? 'alert-circle'
                : '')
              : ''}

            <ChoiceOptionRenderer
              option={{ label: option.id, content: option.text, isCorrect: isCorrectOption }}
              isSelected={isSelected}
              isCorrect={showAsCorrect}
              isWrong={showAsWrong}
              disabled={hasSubmitted}
              badgeText={badgeText}
              badgeIcon={badgeIcon}
              {plugin}
              sourcePath={currentQuestion.question.sourceFile || ''}
              onclick={() => isMultiple 
                ? handleMultipleChoiceToggle(option.id)
                : handleSingleChoiceSelect(option.id)}
            />
          {/each}
        {/if}
      </div>

      <!-- 解析区域（提交答案后显示，从content动态解析---div---后的内容） -->
      {#if hasSubmitted && !isPureExamMode && choiceQuestionDerived?.explanation}
        <div class="explanation-area">
          <div class="explanation-header">
            <EnhancedIcon name="lightbulb" size="18" />
            <span class="explanation-title">{t('study.questionBankUI.studyInterface.explanation')}</span>
          </div>
          <div class="explanation-content study-preview-card answer">
            <CardContentView
              plugin={plugin}
              content={currentQuestion.question.content}
              sourcePath={currentQuestion.question.sourceFile || ''}
              section="explanation"
              showAnswer={true}
            />
          </div>
        </div>
      {/if}
            </div>
            {/if}
          </div>

          {#if !isPureExamMode}
            <div class="content-bottom-controls">
              <button
                type="button"
                class="content-nav-btn clickable-icon"
                class:active={showNavigator}
                onclick={toggleNavigatorPanel}
                aria-label={showNavigator ? t('study.questionBankUI.header.hideNavigator') : t('study.questionBankUI.header.showNavigator')}
                title={showNavigator ? t('study.questionBankUI.header.hideNavigator') : t('study.questionBankUI.header.showNavigator')}
              >
                <ObsidianIcon name="panel-left" size={16} />
              </button>

            <button
              type="button"
              class="content-undo-btn clickable-icon"
              onclick={canUndo ? handleUndoAnswer : undefined}
              disabled={!canUndo}
              aria-label={canUndo ? t('study.questionBankUI.studyInterface.undoRemainingAria', { count: maxUndoCount - undoCount }) : t('study.questionBankUI.studyInterface.cannotUndo')}
              title={canUndo ? t('study.questionBankUI.studyInterface.undoRemainingTitle', { count: maxUndoCount - undoCount }) : t('study.questionBankUI.studyInterface.cannotUndoPlain')}
            >
              <ObsidianIcon name="rotate-ccw" size={16} />
              {#if maxUndoCount > 0 && (maxUndoCount - undoCount) > 0}
                <span class="content-undo-badge">{maxUndoCount - undoCount}</span>
              {/if}
            </button>
            </div>
          {/if}
        </div>
      </div>

      <!-- 右侧垂直工具栏 -->
      {#if showSidebar && !isPureExamMode && !(Platform.isMobile && showEditModal)}
        <div class="sidebar-content" bind:this={sidebarContentEl}>
          <QuestionBankVerticalToolbar
            card={currentQuestion.question}
            currentCardTime={elapsedSeconds * 1000}
            averageTime={averageTime}
            {navColumnMode}
            onNavColumnModeChange={handleNavColumnModeChange}
            {questionOrder}
            onQuestionOrderChange={handleQuestionOrderChange}
            {choiceOptionOrder}
            onChoiceOptionOrderChange={handleChoiceOptionOrderChange}
            {compactMode}
            {compactModeSetting}
            onCompactModeSettingChange={handleCompactModeSettingChange}
            {plugin}
            onToggleEdit={handleToggleEdit}
            isEditing={showEditModal}
            onRemove={handleRemoveCard}
            onDelete={handleDeleteCard}
            onToggleFavorite={handleToggleFavorite}
            onChangePriority={handleChangePriority}
            onPriorityAnchorChange={(element) => priorityAnchorElement = element}
            {enableDirectDelete}
            onDirectDeleteToggle={(enabled) => enableDirectDelete = enabled}
            onOpenDetailedView={handleOpenDetailedView}
          />
        </div>
      {/if}

      <!-- 底部功能栏（编辑模式隐藏，与记忆学习一致） -->
      {#if !showEditModal && !isPureExamMode}
        <div class="study-footer">
          <div class="footer-actions">
            <div class="footer-left-actions">
              <!-- 题目导航折叠按钮 -->
              <button
                class="nav-toggle-btn"
                onclick={toggleNavigatorPanel}
                title={showNavigator ? t('study.questionBankUI.header.hideNavigator') : t('study.questionBankUI.header.showNavigator')}
              >
                <EnhancedIcon name={showNavigator ? 'panel-left-close' : 'panel-left-open'} size={20} />
              </button>

              <!-- 撤销按钮 -->
              <button
                class="undo-btn"
                onclick={handleUndoAnswer}
                disabled={!canUndo}
                title={canUndo ? t('study.questionBankUI.studyInterface.undoRemainingTitle', { count: maxUndoCount - undoCount }) : t('study.questionBankUI.studyInterface.cannotUndoPlain')}
              >
                <EnhancedIcon name="undo" size={20} />
                {#if maxUndoCount > 0 && (maxUndoCount - undoCount) > 0}
                  <span class="undo-badge">{maxUndoCount - undoCount}</span>
                {/if}
              </button>
            </div>

            <div class="footer-center-actions">
              <QuestionBankActionSection
                hasSubmitted={hasSubmitted}
                hasAnswer={hasAnswerForSubmit}
                isLastQuestion={progress.current === progress.total}
                onSubmit={handleSubmitAnswer}
                onNext={handleNextQuestion}
                canUndo={canUndo}
                undoRemaining={maxUndoCount - undoCount}
                onUndo={handleUndoAnswer}
              />
            </div>
          </div>
        </div>
      {/if}
      </div>
    {/if}
    </div>
  </div>

<PriorityPickerPopover
  bind:show={showPriorityModal}
  anchor={priorityAnchorElement}
  currentPriority={selectedPriority}
  variant="importance"
  onSelect={(priority) => void confirmChangePriority(priority)}
  onClose={() => showPriorityModal = false}
/>

<style>
  .question-bank-study-interface-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(17, 17, 17, 0.88);
    backdrop-filter: blur(8px);
    z-index: var(--weave-z-float);
    pointer-events: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--weave-study-view-spacing, 12px);
  }

  .question-bank-study-interface-content {
    --weave-question-bank-page-bg: var(--weave-surface-background, var(--background-primary));
    --weave-question-bank-panel-bg: var(--weave-elevated-background, var(--background-secondary));
    --weave-question-bank-panel-alt-bg: color-mix(
      in srgb,
      var(--weave-question-bank-panel-bg) 88%,
      var(--weave-question-bank-page-bg)
    );
    background: var(--weave-question-bank-page-bg);
    border-radius: var(--radius-l, 12px);
    width: 100%;
    max-width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    box-shadow: var(--weave-shadow-xl);
    border: 1px solid var(--background-modifier-border);
    overflow: hidden;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
  }

  /* 加载状态 */
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 1rem;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--background-modifier-border);
    border-top-color: var(--interactive-accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* 主要内容区域 - Grid布局 */
  .study-content {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr; /* 默认单列布局 */
    grid-template-rows: 1fr auto; /* 内容区自适应 + 底部栏 */
    overflow: hidden;
    transition: all 0.3s ease;
    min-height: 0;
  }

  /* 左侧导航栏显示 */
  .study-content.with-navigator {
    grid-template-columns: auto 1fr; /* 导航栏自适应 + 主内容 */
  }

  /* 右侧工具栏显示 */
  .study-content.with-sidebar {
    grid-template-columns: 1fr auto; /* 主内容 + 工具栏 */
  }

  /* 三列布局：导航栏 + 主内容 + 工具栏 */
  .study-content.with-navigator.with-sidebar {
    grid-template-columns: auto 1fr auto;
  }

  /* 左侧导航栏容器 */
  .navigator-sidebar {
    grid-column: 1;
    grid-row: 1;
    border-right: 1px solid var(--background-modifier-border);
    background: var(--weave-question-bank-panel-bg);
    height: 100%;
    overflow: hidden;
  }

  /* 主学习区域 */
  .main-study-area {
    grid-column: 1;
    grid-row: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  /* 有导航栏时，主区域在第二列 */
  .study-content.with-navigator .main-study-area {
    grid-column: 2;
  }

  /* 有导航栏+工具栏时，主区域还是第二列 */
  .study-content.with-navigator.with-sidebar .main-study-area {
    grid-column: 2;
  }

  /* 侧边栏内容容器 */
  .sidebar-content {
    grid-column: 2;
    grid-row: 1;
    display: flex;
    flex-direction: column;
    width: 70px;
    flex-shrink: 0;
    height: 100%;
    overflow: hidden;
  }

  /* 有导航栏时，工具栏在第三列 */
  .study-content.with-navigator .sidebar-content {
    grid-column: 3;
  }

  /* 卡片学习容器 */
  .card-study-container {
    flex: 1;
    padding: var(--weave-space-md, 1rem);
    overflow: visible;
    display: flex;
    align-items: stretch;
    justify-content: center;
    min-height: 0;
    position: relative;
  }

  .card-container {
    position: relative;
    width: min(100%, 1300px);
    max-width: 100%;
    height: 100%;
    border: none;
    border-radius: 0;
    padding: var(--weave-space-md);
    background: transparent;
    box-shadow: none;
    display: flex;
    flex-direction: column;
    gap: 0;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .card-container.editing {
    padding: 0;
    overflow: hidden;
  }

  /* 题目区域 */
  .question-area {
    flex: 1;
    padding: 2rem 1.5rem;
    overflow-y: auto;
    position: relative;
  }

  .content-bottom-controls {
    position: absolute;
    left: clamp(10px, 1vw + 6px, 18px);
    bottom: clamp(10px, 1vw + 6px, 18px);
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    z-index: 3;
  }

  .content-nav-btn,
  .content-undo-btn {
    width: 34px;
    height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid color-mix(in srgb, var(--background-modifier-border) 78%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--weave-question-bank-page-bg) 84%, var(--weave-question-bank-panel-bg) 16%);
    color: var(--icon-color);
    cursor: pointer;
    transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }

  .content-nav-btn:hover:not(:disabled),
  .content-undo-btn:hover:not(:disabled) {
    background: var(--background-modifier-hover);
    color: var(--icon-color-hover, var(--text-normal));
    border-color: color-mix(in srgb, var(--interactive-accent) 28%, var(--background-modifier-border));
  }

  .content-nav-btn:focus-visible,
  .content-undo-btn:focus-visible {
    outline: 2px solid var(--interactive-accent);
    outline-offset: 2px;
  }

  .content-nav-btn.active {
    background: color-mix(in srgb, var(--interactive-accent) 14%, transparent);
    color: var(--interactive-accent);
    border-color: color-mix(in srgb, var(--interactive-accent) 40%, var(--background-modifier-border));
  }

  .content-nav-btn:disabled,
  .content-undo-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .content-undo-badge {
    position: absolute;
    top: -5px;
    right: -5px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--interactive-accent) 88%, #ffffff 12%);
    color: var(--text-on-accent, #fff);
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--background-primary);
    pointer-events: none;
  }

  .question-stem {
    margin-bottom: 2rem;
  }

  .question-header {
    display: flex;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .difficulty-badge,
  .question-type {
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.8rem;
    font-weight: 500;
  }

  .difficulty-badge.easy {
    background: rgba(34, 197, 94, 0.1);
    color: #22c55e;
  }

  .difficulty-badge.medium {
    background: rgba(245, 158, 11, 0.1);
    color: #f59e0b;
  }

  .difficulty-badge.hard {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }

  .question-type {
    background: var(--weave-question-bank-panel-bg);
    color: var(--text-muted);
  }

  .question-content {
    font-size: 1.1rem;
    line-height: 1.8;
    color: var(--text-normal);
    white-space: pre-wrap;
  }

  .study-preview-section {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }

  .study-preview-title {
    display: flex;
    align-items: center;
  }

  .study-preview-chip {
    display: inline-flex;
    align-items: center;
    padding: 0.25rem 0.55rem;
    background: color-mix(in srgb, var(--interactive-accent) 10%, transparent);
    color: var(--interactive-accent);
    border-radius: 0.375rem;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.025em;
  }

  .study-preview-card {
    display: flex;
    align-items: center;
    border-radius: 18px;
    padding: 1.15rem 1.35rem;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    box-shadow: none;
  }

  .study-preview-card.question {
    min-height: 84px;
  }

  .study-preview-card.answer {
    align-items: stretch;
  }

  .study-preview-card :global(.weave-obsidian-renderer) {
    padding: 0;
    margin: 0;
    background: transparent;
    border: none;
  }

  .study-preview-card :global(p) {
    margin: 0;
  }

  .study-preview-card :global(p + p) {
    margin-top: 0.6rem;
  }

  /* 选项区域 */
  .options-area {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  /* 解析区域 */
  .explanation-area {
    margin-top: 2rem;
    padding: 0;
    background: transparent;
    border-radius: 0;
    border: none;
  }

  .explanation-header {
    display: flex;
    align-items: center;
    gap: 0;
    margin-bottom: 0.7rem;
    padding-bottom: 0;
    border-bottom: none;
  }

  .explanation-title {
    display: inline-flex;
    align-items: center;
    padding: 0.25rem 0.55rem;
    background: color-mix(in srgb, var(--interactive-accent) 10%, transparent);
    color: var(--interactive-accent);
    border-radius: 0.375rem;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.025em;
  }

  .explanation-header :global(svg),
  .explanation-header :global(.weave-icon) {
    display: none;
  }

  .explanation-content {
    font-size: 1rem;
    line-height: 1.8;
    color: var(--text-normal);
  }

  /* 解析内容中的段落和列表样式 */
  .explanation-content :global(p) {
    margin: 0.75rem 0;
  }

  .explanation-content :global(p:first-child) {
    margin-top: 0;
  }

  .explanation-content :global(p:last-child) {
    margin-bottom: 0;
  }

  .explanation-content :global(ul),
  .explanation-content :global(ol) {
    margin: 0.75rem 0;
    padding-left: 1.5rem;
  }

  .explanation-content :global(li) {
    margin: 0.5rem 0;
  }

  .explanation-content :global(code) {
    background: var(--code-background);
    padding: 0.2em 0.4em;
    border-radius: 3px;
    font-size: 0.9em;
  }

  .explanation-content :global(pre) {
    background: var(--code-background);
    padding: 1rem;
    border-radius: 6px;
    overflow-x: auto;
    margin: 1rem 0;
  }

  /* 底部功能栏 - 桌面端样式 */
  .study-footer {
    grid-column: 1 / -1; /* 跨越所有列 */
    grid-row: 2;
    padding: 1rem 1.5rem 1.25rem;
  }

  /*  桌面端：有背景和边框 */
  :global(body:not(.is-mobile)) .study-footer {
    background: var(--weave-question-bank-page-bg);
    border-top: 1px solid var(--background-modifier-border);
  }

  /*  移动端：透明无边框 */
  :global(body.is-mobile) .study-footer {
    background: var(--weave-question-bank-page-bg);
    border: none;
  }

  /* 有导航栏时，底部栏依然横跨所有列，保持左侧零边距 */
  .study-content.with-navigator .study-footer {
    grid-column: 1 / -1;
  }

  .footer-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    width: 100%;
    max-width: none;
    margin: 0;
    position: static;
  }

  .footer-left-actions {
    display: none;
  }

  .footer-center-actions {
    flex: 1;
    display: flex;
    justify-content: center;
  }

  /* 导航切换按钮 */
  .nav-toggle-btn {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    padding: 0.5rem;
    background: transparent;
    border: none;
    outline: none;
    border-radius: 8px;
    color: var(--text-normal);
    cursor: pointer;
    transition: all 0.3s ease;
  }

  .nav-toggle-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--interactive-accent);
    transform: translateY(-2px);
  }
  
  .nav-toggle-btn:focus {
    outline: none;
    border: none;
  }
  
  .nav-toggle-btn:active {
    border: none;
  }

  /* 撤销按钮 - 渐变紫色角标 */
  .undo-btn {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    width: 2.5rem;
    height: 2.5rem;
    padding: 0.5rem;
    background: transparent;
    border: none;
    outline: none;
    border-radius: 8px;
    color: var(--text-normal);
    cursor: pointer;
    transition: all 0.3s ease;
  }

  .undo-btn:hover:not(:disabled) {
    background: var(--background-modifier-hover);
    color: var(--interactive-accent);
    transform: translateY(-2px);
  }
  
  .undo-btn:focus {
    outline: none;
    border: none;
  }
  
  .undo-btn:active {
    border: none;
  }

  .undo-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* 渐变紫色角标 */
  .undo-badge {
    position: absolute;
    top: -6px;
    right: -6px;
    min-width: 22px;
    height: 22px;
    padding: 0 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border-radius: 11px;
    font-size: 12px;
    font-weight: 700;
    box-shadow: 0 2px 12px rgba(102, 126, 234, 0.5);
    border: 2px solid var(--background-primary);
    pointer-events: none;
  }

  .undo-btn:disabled .undo-badge {
    opacity: 0.5;
    background: linear-gradient(135deg, #888 0%, #666 100%);
    box-shadow: none;
  }

  .nav-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    background: var(--weave-question-bank-panel-bg);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    font-size: 0.95rem;
    font-weight: 500;
    color: var(--text-normal);
    cursor: pointer;
    transition: all 0.2s;
  }

  .nav-btn:hover:not(:disabled) {
    background: var(--background-modifier-hover);
  }

  .nav-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* 桌面端不进行布局重排，侧边栏始终在右侧 */
  /* 移动端布局由 :global(body.is-mobile) 控制 */

  /* 优先级模态窗样式 */
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
    z-index: var(--weave-z-sticky);
    backdrop-filter: blur(2px);
    pointer-events: none;
  }

  .modal-backdrop {
    position: absolute;
    background: white;
    border-radius: 50%;
  }

  .priority-low {
    color: #22c55e;
  }

  .priority-medium {
    color: #eab308;
  }

  .priority-high {
    color: #f97316;
  }

  .priority-urgent {
    color: #ef4444;
  }

  @keyframes shake {
    0%, 100% { transform: translateX(0) scale(1.02); }
    25% { transform: translateX(-2px) scale(1.02); }
    75% { transform: translateX(2px) scale(1.02); }
  }

  .priority-urgent:hover {
    animation: shake 0.5s;
  }

  .modal-footer {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
    padding: 1rem 1.5rem;
    background: var(--weave-question-bank-panel-alt-bg);
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
    background: var(--weave-question-bank-page-bg);
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

  /* ==================== Obsidian 移动端适配 ==================== */
  
  /* 所有移动设备通用样式 */
  :global(.study-side-panel-menu) {
    min-width: 300px;
    max-width: 340px;
  }

  .study-side-panel,
  .priority-modal {
    position: relative;
    background: var(--weave-question-bank-panel-bg);
    border: 1px solid var(--background-modifier-border);
    border-radius: 12px;
    box-shadow: var(--shadow-s);
    min-width: 300px;
    max-width: 340px;
    max-height: min(70vh, 720px);
    overflow: hidden;
    animation: slideInRight 0.2s ease-out;
  }

  @keyframes slideInRight {
    from {
      opacity: 0;
      transform: translateX(12px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--background-modifier-border);
    background: var(--weave-question-bank-panel-alt-bg);
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

  .priority-options {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .priority-option {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 1rem;
    padding: 1rem;
    border: 1.5px solid var(--background-modifier-border);
    border-radius: 8px;
    background: color-mix(
      in srgb,
      var(--weave-question-bank-panel-bg) 88%,
      var(--weave-question-bank-page-bg)
    );
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
  }

  .priority-option:hover {
    background: var(--background-modifier-hover);
    border-color: var(--background-modifier-border-hover);
  }

  .priority-option.selected {
    background: color-mix(in srgb, var(--text-accent) 10%, var(--weave-question-bank-panel-bg));
    border-color: var(--text-accent);
  }

  .priority-stars {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    color: #fbbf24;
  }

  .priority-label {
    color: var(--text-normal);
    font-weight: 500;
  }

  .priority-option.selected .priority-label {
    color: var(--text-accent);
    font-weight: 600;
  }

  :global(body.is-mobile) .question-bank-study-interface-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: var(
      --weave-workspace-bottom-offset,
      var(--weave-modal-bottom, env(safe-area-inset-bottom, 0px))
    );
    width: 100%;
    height: auto;
    padding: 0;
    background: transparent;
    backdrop-filter: none;
    z-index: 1;
    overflow: hidden;
  }

  :global(body.is-mobile.weave-edit-active) .question-bank-study-interface-overlay,
  :global(body.is-phone.weave-edit-active) .question-bank-study-interface-overlay {
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    height: 100%;
    max-height: none;
  }

  :global(body.is-mobile) .question-bank-study-interface-content {
    /* 使用 100% 而非固定高度，让容器适应 Obsidian 的可用空间 */
    height: 100%;
    max-width: 100%;
    border-radius: 0;
    margin: 0;
    border: none;
    box-shadow: none;
  }

  :global(body.is-mobile) .card-study-container {
    padding: 0;
  }

  :global(body.is-mobile) .card-container {
    padding: var(--weave-mobile-spacing-sm, 0.5rem);
    border: none;
    box-shadow: none;
  }

  :global(body.is-mobile) .question-bank-study-interface-overlay.edit-active .card-container.editing,
  :global(body.is-phone) .question-bank-study-interface-overlay.edit-active .card-container.editing {
    padding: 0;
    overflow: hidden;
  }

  :global(body.is-mobile) .study-footer {
    background: var(--weave-question-bank-page-bg) !important;
    padding: 0;
    margin: 0;
    border: none !important;
  }

  /* 手机端专用样式 */
  :global(body.is-phone) .study-content {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  :global(body.is-phone) .question-bank-study-interface-content {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  
  :global(body.is-phone) .question-bank-study-interface-overlay {
    /*  确保不覆盖 Obsidian 顶部栏 */
    display: flex;
    flex-direction: column;
    /*  移动端隐藏底部导航折叠按钮（移到顶部菜单） */
  }
  
  /*  移动端隐藏底部左侧操作区（导航折叠按钮移到顶部菜单） */
  :global(body.is-phone) .footer-left-actions {
    display: none !important;
  }

  :global(body.is-phone) .content-bottom-controls {
    display: none !important;
  }

  /*  移动端题目导航下拉面板 */
  .mobile-navigator-dropdown {
    margin: 8px 12px;
    animation: mobileNavigatorDropdownIn 0.2s ease-out;
    flex-shrink: 0;
  }

  .mobile-nav-dropdown-panel {
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 12px;
    overflow: hidden;
  }

  @keyframes mobileNavigatorDropdownIn {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .mobile-nav-grid-scroll {
    overflow-y: auto;
    padding: 0.75rem;
    max-height: 220px;
  }

  /*  网格布局 - 每行6个 */
  .mobile-nav-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 6px;
  }

  /*  题号单元格 */
  .mobile-nav-cell {
    aspect-ratio: 1 / 1;
    min-width: 36px;
    min-height: 36px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    border: none;
    padding: 0;
  }

  /* 未答题 - 浅灰背景 */
  .mobile-nav-cell.unanswered {
    background: var(--background-modifier-border);
    color: var(--text-muted);
  }

  .mobile-nav-cell.unanswered:active {
    transform: scale(0.95);
  }

  /* 答对 - 绿色 */
  .mobile-nav-cell.correct {
    background: #22c55e;
    color: white;
  }

  /* 答错 - 红色 */
  .mobile-nav-cell.wrong {
    background: #ef4444;
    color: white;
  }

  /* 当前题 - 蓝色边框高亮 */
  .mobile-nav-cell.current {
    background: #3b82f6;
    color: white;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.4);
  }

  /* 手机端隐藏导航栏和侧边栏 */
  :global(body.is-phone) .navigator-sidebar,
  :global(body.is-phone) .sidebar-content {
    display: none !important;
  }

  :global(body.is-phone) .card-container {
    width: 100%;
    border-radius: 0;
    padding: 0.25rem 0;
    margin: 0;
  }

  :global(body.is-phone) .card-study-container {
    padding: 0;
    flex: 1;
    min-height: 0;
  }

  :global(body.is-phone) .study-footer {
    background: var(--weave-question-bank-page-bg);
    padding: 0.5rem 0;
    margin: 0;
    border: none;
  }

  /*  移动端底部功能栏透明，移除遮罩效果 */
  :global(body.is-phone) .footer-actions {
    background: transparent;
  }

  :global(body.is-phone) .footer-center-actions {
    width: 100%;
  }

  :global(body.is-phone) .main-study-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  /*  考试界面整体底部安全区域 */
  :global(body.is-phone) .question-bank-study-interface-content {
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }

  :global(body.is-phone) .question-bank-study-interface-overlay.edit-active .question-bank-study-interface-content,
  :global(body.is-mobile) .question-bank-study-interface-overlay.edit-active .question-bank-study-interface-content {
    height: 100%;
    overflow: hidden;
  }

  :global(body.is-phone) .question-bank-study-interface-overlay.edit-active .study-footer,
  :global(body.is-mobile) .question-bank-study-interface-overlay.edit-active .study-footer {
    display: none;
  }

  :global(body.is-phone) .question-bank-study-interface-overlay.edit-active .card-study-container,
  :global(body.is-mobile) .question-bank-study-interface-overlay.edit-active .card-study-container {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    padding: 0;
  }

  :global(body.is-phone) .question-bank-study-interface-overlay.edit-active .card-container,
  :global(body.is-mobile) .question-bank-study-interface-overlay.edit-active .card-container {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    padding: 0;
  }

  /* 平板端专用样式 */
  :global(body.is-tablet) .question-bank-study-interface-content {
    max-width: 95vw;
    height: 95%;
    border-radius: var(--radius-l, 12px);
  }

  :global(body.is-tablet) .card-container {
    width: min(100%, 1100px);
    padding: var(--weave-mobile-spacing-lg, 1.25rem);
  }
</style>
