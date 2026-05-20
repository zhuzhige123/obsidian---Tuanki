<script lang="ts">
/**
 * 考试模式配置模态窗 - 重构版
 * 支持分步式配置流程：场景选择 -> 核心配置 -> 高级选项
 */

import type { QuestionBankModeConfig } from "../../types/question-bank-types";
import { Notice } from "obsidian";
import { tr } from "../../utils/i18n";

interface Props {
  open: boolean;
  bankName: string;
  totalQuestions: number;
  onSelect: (mode: 'exam', config?: QuestionBankModeConfig) => void;
  onCancel: () => void;
}

let { open, bankName, totalQuestions, onSelect, onCancel }: Props = $props();
let t = $derived($tr);

// 配置流程状态
let currentStep = $state(2);
let maxStep = 3;

$effect(() => {
  if (open) {
    currentStep = 2;
  }
});

// 配置数据状态
let config = $state<QuestionBankModeConfig>({
  questionTypeRatio: { single_choice: 40, multiple_choice: 30, cloze: 20, short_answer: 10 },
  difficultyDistribution: { easy: 20, medium: 50, hard: 30 },
  questionSource: 'all',
  customQuestionCount: { exam: null },
  examTimeLimit: { exam: 60 },
  options: { shuffleQuestions: true, shuffleOptions: true, autoSave: true, pureExamMode: false }
});

// 确保options总是存在
function ensureOptions() {
  if (!config.options) {
    config.options = { shuffleQuestions: true, shuffleOptions: true, autoSave: true, pureExamMode: false };
    return;
  }

  config.options = {
    shuffleQuestions: config.options.shuffleQuestions ?? true,
    shuffleOptions: config.options.shuffleOptions ?? true,
    autoSave: config.options.autoSave ?? true,
    pureExamMode: config.options.pureExamMode ?? false
  };
}

// 初始化时确保options存在
ensureOptions();

// 步骤导航
function nextStep() {
  if (currentStep < maxStep) {
    currentStep++;
  } else {
    // 完成配置，开始考试
    handleComplete();
  }
}

function prevStep() {
  // 禁止回到第1步（模式选择已移除）
  if (currentStep > 2) {
    currentStep--;
  }
}

function handleComplete() {
  const selectedTimeLimitMinutes = config.examTimeLimit?.exam;
  const normalizedConfig: QuestionBankModeConfig = {
    ...config,
    shuffleQuestions: config.options?.shuffleQuestions ?? config.shuffleQuestions,
    shuffleOptions: config.options?.shuffleOptions ?? config.shuffleOptions,
    timeLimit: selectedTimeLimitMinutes ? selectedTimeLimitMinutes * 60 * 1000 : undefined
  };

  onSelect('exam', normalizedConfig);
  new Notice(t('study.questionBankUI.configModal.applied'));
}

function handleCancel() {
  if (typeof onCancel === 'function') {
    onCancel();
  }
}

function handleOverlayClick(e: MouseEvent) {
  if (e.target === e.currentTarget) {
    handleCancel();
  }
}

function handleKeydown(_e: KeyboardEvent) {
}

// 计算预览数据
function getEstimatedCount(): number {
  const modeCount = config.customQuestionCount?.exam;
  if (modeCount === null || modeCount === undefined) {
    return totalQuestions; // 全部题目
  }
  return Math.min(modeCount, totalQuestions);
}

function getEstimatedTime(): string {
  const count = getEstimatedCount();
  const baseTimePerQuestion = 1.5; // 分钟/题
  const totalMinutes = Math.ceil(count * baseTimePerQuestion);
  
  if (totalMinutes < 60) {
    return t('study.questionBankUI.configModal.minutesUnit', { count: totalMinutes });
  } else {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes > 0
      ? t('study.questionBankUI.configModal.hoursMinutesUnit', { hours, minutes })
      : t('study.questionBankUI.configModal.hoursUnit', { count: hours });
  }
}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
<div class="modal-overlay" onclick={handleOverlayClick} onkeydown={handleKeydown} role="dialog" aria-modal="true" tabindex="-1">
  <div class="modal-container" onkeydown={handleKeydown} role="dialog" tabindex="0">
    
    <!-- 模态窗头部 -->
    <header class="modal-header">
      <div class="header-left">
        <h1 class="modal-title">{t('study.questionBankUI.configModal.title')}</h1>
      </div>
      <div class="header-center">
        <span class="bank-name">{bankName}</span>
      </div>
      <div class="header-right">
        <button class="close-button" onclick={handleCancel} aria-label={t('study.questionBankUI.configModal.close')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </header>

    <!-- 主内容区域 -->
    <main class="modal-content">

      <!-- 第二步：核心配置 -->
      {#if currentStep === 2}
      <section class="config-step active">
        <div class="config-grid">
          <div class="config-group config-section question-count">
            <div class="section-header">
              <h3 class="section-title">{t('study.questionBankUI.configModal.questionCount')}</h3>
            </div>
            <div class="option-buttons">
              <button class="option-btn" class:active={config.customQuestionCount?.exam === null} onclick={() => config.customQuestionCount = {...config.customQuestionCount, exam: null}}>{t('study.questionBankUI.configModal.smartRecommended')}</button>
              <button class="option-btn" class:active={config.customQuestionCount?.exam === 20} onclick={() => config.customQuestionCount = {...config.customQuestionCount, exam: 20}}>20{t('study.questionBankUI.configModal.questionsUnit')}</button>
              <button class="option-btn" class:active={config.customQuestionCount?.exam === 30} onclick={() => config.customQuestionCount = {...config.customQuestionCount, exam: 30}}>30{t('study.questionBankUI.configModal.questionsUnit')}</button>
              <button class="option-btn" class:active={config.customQuestionCount?.exam === 50} onclick={() => config.customQuestionCount = {...config.customQuestionCount, exam: 50}}>50{t('study.questionBankUI.configModal.questionsUnit')}</button>
              <button class="option-btn" class:active={config.customQuestionCount?.exam === totalQuestions} onclick={() => config.customQuestionCount = {...config.customQuestionCount, exam: totalQuestions}}>{t('study.questionBankUI.configModal.all')}</button>
            </div>
          </div>

          <div class="config-group config-section question-source">
            <div class="section-header">
              <h3 class="section-title">{t('study.questionBankUI.configModal.questionSource')}</h3>
            </div>
            <div class="option-buttons">
              <button class="option-btn" class:active={config.questionSource === 'all'} onclick={() => config.questionSource = 'all'}>{t('study.questionBankUI.configModal.allQuestions')}</button>
              <button class="option-btn" class:active={config.questionSource === 'untested'} onclick={() => config.questionSource = 'untested'}>{t('study.questionBankUI.configModal.untested')}</button>
              <button class="option-btn" class:active={config.questionSource === 'incorrect'} onclick={() => config.questionSource = 'incorrect'}>{t('study.questionBankUI.configModal.incorrect')}</button>
              <button class="option-btn" class:active={config.questionSource === 'marked'} onclick={() => config.questionSource = 'marked'}>{t('study.questionBankUI.configModal.marked')}</button>
            </div>
          </div>

          <div class="config-group config-section time-limit">
            <div class="section-header">
              <h3 class="section-title">{t('study.questionBankUI.configModal.timeLimit')}</h3>
            </div>
            <div class="option-buttons">
              <button class="option-btn" class:active={!config.examTimeLimit?.exam} onclick={() => config.examTimeLimit = {...config.examTimeLimit, exam: undefined}}>{t('study.questionBankUI.configModal.unlimited')}</button>
              <button class="option-btn" class:active={config.examTimeLimit?.exam === 15} onclick={() => config.examTimeLimit = {...config.examTimeLimit, exam: 15}}>{t('study.questionBankUI.configModal.minutesUnit', { count: 15 })}</button>
              <button class="option-btn" class:active={config.examTimeLimit?.exam === 30} onclick={() => config.examTimeLimit = {...config.examTimeLimit, exam: 30}}>{t('study.questionBankUI.configModal.minutesUnit', { count: 30 })}</button>
              <button class="option-btn" class:active={config.examTimeLimit?.exam === 60} onclick={() => config.examTimeLimit = {...config.examTimeLimit, exam: 60}}>{t('study.questionBankUI.configModal.minutesUnit', { count: 60 })}</button>
            </div>
          </div>
        </div>

        <!-- 配置预览 -->
        <div class="config-preview">
          <div class="preview-stats">
            <div class="stat-item">
              <span class="stat-label">{t('study.questionBankUI.configModal.estimatedCount')}</span>
              <span class="stat-value">{getEstimatedCount()}{t('study.questionBankUI.configModal.questionsUnit')}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">{t('study.questionBankUI.configModal.estimatedTime')}</span>
              <span class="stat-value">{getEstimatedTime()}</span>
            </div>
          </div>
        </div>
      </section>
      {/if}

      <!-- 第三步：高级选项 -->
      {#if currentStep === 3}
      <section class="config-step active">
        <div class="advanced-config">
          <div class="config-section question-type">
            <div class="section-header">
              <h3 class="section-title">{t('study.questionBankUI.configModal.questionTypeDistribution')}</h3>
            </div>
            <div class="slider-group">
              <div class="slider-item">
                <div class="slider-header">
                  <span class="slider-label">{t('study.questionBankUI.configModal.singleChoice')}</span>
                  <span class="slider-value">{config.questionTypeRatio?.single_choice || 40}%</span>
                </div>
                <input type="range" class="config-slider" min="0" max="100" value={config.questionTypeRatio?.single_choice || 40} step="5" oninput={(e) => config.questionTypeRatio = {...config.questionTypeRatio, single_choice: parseInt(e.currentTarget.value)}}>
              </div>
              <div class="slider-item">
                <div class="slider-header">
                  <span class="slider-label">{t('study.questionBankUI.configModal.multipleChoice')}</span>
                  <span class="slider-value">{config.questionTypeRatio?.multiple_choice || 30}%</span>
                </div>
                <input type="range" class="config-slider" min="0" max="100" value={config.questionTypeRatio?.multiple_choice || 30} step="5" oninput={(e) => config.questionTypeRatio = {...config.questionTypeRatio, multiple_choice: parseInt(e.currentTarget.value)}}>
              </div>
              <div class="slider-item">
                <div class="slider-header">
                  <span class="slider-label">{t('study.questionBankUI.configModal.cloze')}</span>
                  <span class="slider-value">{config.questionTypeRatio?.cloze || 20}%</span>
                </div>
                <input type="range" class="config-slider" min="0" max="100" value={config.questionTypeRatio?.cloze || 20} step="5" oninput={(e) => config.questionTypeRatio = {...config.questionTypeRatio, cloze: parseInt(e.currentTarget.value)}}>
              </div>
              <div class="slider-item">
                <div class="slider-header">
                  <span class="slider-label">{t('study.questionBankUI.configModal.shortAnswer')}</span>
                  <span class="slider-value">{config.questionTypeRatio?.short_answer || 10}%</span>
                </div>
                <input type="range" class="config-slider" min="0" max="100" value={config.questionTypeRatio?.short_answer || 10} step="5" oninput={(e) => config.questionTypeRatio = {...config.questionTypeRatio, short_answer: parseInt(e.currentTarget.value)}}>
              </div>
            </div>
          </div>

          <div class="config-section difficulty">
            <div class="section-header">
              <h3 class="section-title">{t('study.questionBankUI.configModal.difficultyDistribution')}</h3>
            </div>
            <div class="slider-group">
              <div class="slider-item">
                <div class="slider-header">
                  <span class="slider-label">{t('study.questionBankUI.configModal.easy')}</span>
                  <span class="slider-value">{config.difficultyDistribution?.easy || 30}%</span>
                </div>
                <input type="range" class="config-slider" min="0" max="100" value={config.difficultyDistribution?.easy || 30} step="5" oninput={(e) => config.difficultyDistribution = {...config.difficultyDistribution, easy: parseInt(e.currentTarget.value)}}>
              </div>
              <div class="slider-item">
                <div class="slider-header">
                  <span class="slider-label">{t('study.questionBankUI.configModal.medium')}</span>
                  <span class="slider-value">{config.difficultyDistribution?.medium || 50}%</span>
                </div>
                <input type="range" class="config-slider" min="0" max="100" value={config.difficultyDistribution?.medium || 50} step="5" oninput={(e) => config.difficultyDistribution = {...config.difficultyDistribution, medium: parseInt(e.currentTarget.value)}}>
              </div>
              <div class="slider-item">
                <div class="slider-header">
                  <span class="slider-label">{t('study.questionBankUI.configModal.hard')}</span>
                  <span class="slider-value">{config.difficultyDistribution?.hard || 20}%</span>
                </div>
                <input type="range" class="config-slider" min="0" max="100" value={config.difficultyDistribution?.hard || 20} step="5" oninput={(e) => config.difficultyDistribution = {...config.difficultyDistribution, hard: parseInt(e.currentTarget.value)}}>
              </div>
            </div>
          </div>

          <div class="config-section advanced-options">
            <div class="section-header">
              <h3 class="section-title">{t('study.questionBankUI.configModal.otherOptions')}</h3>
            </div>
            <div class="checkbox-group">
              <label class="checkbox-item">
                <input type="checkbox" class="config-checkbox" bind:checked={config.options!.shuffleQuestions}>
                <span class="checkbox-custom"></span>
                <div class="checkbox-content">
                  <span class="checkbox-title">{t('study.questionBankUI.configModal.shuffleQuestions')}</span>
                  <span class="checkbox-desc">{t('study.questionBankUI.configModal.shuffleQuestionsDesc')}</span>
                </div>
              </label>
              <label class="checkbox-item">
                <input type="checkbox" class="config-checkbox" bind:checked={config.options!.shuffleOptions}>
                <span class="checkbox-custom"></span>
                <div class="checkbox-content">
                  <span class="checkbox-title">{t('study.questionBankUI.configModal.shuffleOptions')}</span>
                  <span class="checkbox-desc">{t('study.questionBankUI.configModal.shuffleOptionsDesc')}</span>
                </div>
              </label>
              <label class="checkbox-item">
                <input type="checkbox" class="config-checkbox" bind:checked={config.options!.autoSave}>
                <span class="checkbox-custom"></span>
                <div class="checkbox-content">
                  <span class="checkbox-title">{t('study.questionBankUI.configModal.autoSave')}</span>
                  <span class="checkbox-desc">{t('study.questionBankUI.configModal.autoSaveDesc')}</span>
                </div>
              </label>
              <label class="checkbox-item">
                <input type="checkbox" class="config-checkbox" bind:checked={config.options!.pureExamMode}>
                <span class="checkbox-custom"></span>
                <div class="checkbox-content">
                  <span class="checkbox-title">{t('study.questionBankUI.configModal.pureExamMode')}</span>
                  <span class="checkbox-desc">{t('study.questionBankUI.configModal.pureExamModeDesc')}</span>
                </div>
              </label>
            </div>
          </div>
        </div>
      </section>
      {/if}

    </main>

    <!-- 模态窗底部 -->
    {#if currentStep > 1}
    <footer class="modal-footer">
      <button class="btn-secondary" onclick={prevStep} disabled={currentStep <= 2}>{t('study.questionBankUI.configModal.prevStep')}</button>
      <button class="btn-primary" onclick={nextStep}>
        {currentStep === maxStep ? t('study.questionBankUI.configModal.startExam') : t('study.questionBankUI.configModal.nextStep')}
      </button>
    </footer>
    {/if}

  </div>
</div>
{/if}

<style>
/* 深色主题变量 */
.modal-overlay {
  --color-primary: #4f94f4;
  --color-primary-hover: #6ba6f7;
  --color-primary-light: rgba(79, 148, 244, 0.1);
  --color-secondary: #8b949e;
  --bg-primary: var(--background-primary);
  --bg-secondary: var(--background-secondary);
  --bg-tertiary: var(--background-secondary-alt);
  --bg-overlay: rgba(0, 0, 0, 0.85);
  --bg-card: var(--background-secondary);
  --bg-hover: var(--background-modifier-hover);
  --bg-modal: var(--background-primary);
  --text-primary: var(--text-normal);
  --text-secondary: var(--text-muted);
  --text-muted: var(--text-faint);
  --border-color: var(--background-modifier-border);
  --border-light: var(--background-modifier-border-hover);
  --space-xs: 0.25rem;
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 1.5rem;
  --space-xl: 2rem;
  --space-2xl: 3rem;
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-base: 200ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* 遮罩层 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--bg-overlay);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--weave-z-popup);
  padding: var(--space-lg);
  animation: fadeIn var(--transition-base);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* 模态窗容器 */
.modal-container {
  background: var(--bg-modal);
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 800px;
  max-height: 90vh;
  overflow: hidden;
  box-shadow: var(--shadow-l);
  border: 1px solid var(--border-color);
  animation: slideUp var(--transition-base);
  display: flex;
  flex-direction: column;
  position: relative;
  min-width: 650px;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* 模态窗头部 */
.modal-header {
  padding: var(--space-lg) var(--space-xl);
  border-bottom: 1px solid var(--border-light);
  display: grid;
  grid-template-columns: 1fr 2fr 1fr;
  align-items: center;
  gap: var(--space-lg);
  flex-shrink: 0;
  background: var(--bg-modal);
  min-height: 60px;
  width: 100%;
}

.header-left {
  display: flex;
  align-items: center;
  justify-content: flex-start;
}

.header-center {
  display: flex;
  justify-content: center;
  align-items: center;
  text-align: center;
}

.modal-title {
  font-size: 1.25rem;
  font-weight: 500;
  color: var(--text-primary);
  margin: 0;
  white-space: nowrap;
}

.bank-name {
  font-size: 1.1rem;
  font-weight: 400;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 400px;
}

.header-right {
  display: flex;
  justify-content: flex-end;
  align-items: center;
}

.close-button {
  width: 2rem;
  height: 2rem;
  border: none;
  background: transparent;
  color: var(--text-muted);
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}

.close-button:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

/* 主内容区域 - 为场景卡片提供最大显示宽度 */
.modal-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-xl) var(--space-lg);
}

.modal-content::-webkit-scrollbar {
  width: 6px;
}

.modal-content::-webkit-scrollbar-track {
  background: transparent;
}

.modal-content::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

/* 配置步骤 */
.config-step {
  animation: fadeInStep var(--transition-base);
}

@keyframes fadeInStep {
  from {
    opacity: 0;
    transform: translateX(10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

/* 配置网格 */
.config-grid {
  display: grid;
  gap: var(--space-lg);
  margin-bottom: var(--space-lg);
  max-width: 900px;
  margin: 0 auto var(--space-lg) auto;
  width: 100%;
}

.config-group {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: var(--space-md);
}

/* 标题行 - 带彩色侧边条 */
.section-header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  margin-bottom: var(--space-md);
  position: relative;
  padding-left: var(--space-lg);
}

.section-header::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 1.2em;
  border-radius: 2px;
}

/* 多彩侧边条 */
.config-section.question-type .section-header::before {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.8), rgba(37, 99, 235, 0.6));
}

.config-section.difficulty .section-header::before {
  background: linear-gradient(135deg, rgba(249, 115, 22, 0.8), rgba(234, 88, 12, 0.6));
}

.config-section.advanced-options .section-header::before {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.8), rgba(5, 150, 105, 0.6));
}

.config-section.question-count .section-header::before {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.8), rgba(124, 58, 237, 0.6));
}

.config-section.question-source .section-header::before {
  background: linear-gradient(135deg, rgba(236, 72, 153, 0.8), rgba(219, 39, 119, 0.6));
}

.config-section.time-limit .section-header::before {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.8), rgba(22, 163, 74, 0.6));
}

.section-title {
  flex: 1;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

/* 选项按钮 */
.option-buttons {
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.option-btn {
  padding: var(--space-md) var(--space-lg);
  border: 2px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-secondary);
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.option-btn:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
  color: var(--color-primary);
}

.option-btn.active {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: white;
}

/* 配置预览 */
.config-preview {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  margin-top: var(--space-lg);
}

.preview-stats {
  display: flex;
  justify-content: center;
  gap: var(--space-2xl);
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.stat-label {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-bottom: var(--space-xs);
  text-transform: uppercase;
  letter-spacing: 0.025em;
  font-weight: 500;
}

.stat-value {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-primary);
}

/* 高级配置 */
.advanced-config {
  display: grid;
  gap: var(--space-lg);
  max-width: 900px;
  margin: 0 auto;
  width: 100%;
}

.config-section {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: var(--space-md);
}

/* 滑块组 */
.slider-group {
  display: grid;
  gap: var(--space-md);
}

.slider-item {
  display: grid;
  gap: var(--space-sm);
}

.slider-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.slider-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary);
}

.slider-value {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-primary);
  min-width: 3rem;
  text-align: right;
}

.config-slider {
  width: 100%;
  height: 6px;
  -webkit-appearance: none;
  appearance: none;
  background: #484f58;
  border-radius: 3px;
  outline: none;
  cursor: pointer;
  position: relative;
}

.config-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--color-primary);
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
  transition: all var(--transition-fast);
  border: 2px solid var(--bg-modal);
}

.config-slider::-webkit-slider-thumb:hover {
  transform: scale(1.1);
  box-shadow: 0 4px 8px rgba(79, 148, 244, 0.4);
}

.config-slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--color-primary);
  border: 2px solid var(--bg-modal);
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
}

/* 复选框组 - 单行布局 */
.checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-lg);
}

.checkbox-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-md);
  cursor: pointer;
  padding: var(--space-md);
  border-radius: var(--radius-md);
  transition: background-color var(--transition-fast);
  flex: 1;
  min-width: 200px;
}

.checkbox-item:hover {
  background: var(--bg-hover);
}

.config-checkbox {
  display: none;
}

.checkbox-custom {
  width: 1.25rem;
  height: 1.25rem;
  border: 2px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all var(--transition-fast);
  position: relative;
}

.config-checkbox:checked + .checkbox-custom {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.config-checkbox:checked + .checkbox-custom::after {
  content: '✓';
  color: white;
  font-size: 0.875rem;
  font-weight: 600;
}

.checkbox-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  flex: 1;
}

.checkbox-title {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary);
}

.checkbox-desc {
  font-size: 0.75rem;
  color: var(--text-secondary);
  line-height: 1.4;
}

/* 模态窗底部 */
.modal-footer {
  padding: var(--space-md) var(--space-xl);
  border-top: 1px solid var(--border-light);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-md);
  flex-shrink: 0;
}

/* 按钮样式 */
.btn-primary,
.btn-secondary {
  padding: var(--space-md) var(--space-xl);
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
  border: none;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.btn-primary {
  background: var(--color-primary);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
  transform: translateY(-1px);
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
}

.btn-secondary {
  background: var(--bg-primary);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--color-primary);
}

.btn-primary:disabled,
.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

@media (max-width: 900px) {
  .modal-container {
    max-width: 90vw;
    min-width: 500px;
  }
  
  .modal-header {
    grid-template-columns: 1fr 1.5fr 1fr;
  }
  
}

/* 响应式设计 */
@media (max-width: 768px) {
  .modal-container {
    max-width: 95vw;
    max-height: 95vh;
    margin: var(--space-sm);
    min-width: 350px;
  }
  
  .modal-header {
    padding: var(--space-md) var(--space-lg);
    grid-template-columns: 1fr;
    grid-template-rows: auto auto;
    gap: var(--space-xs);
    position: relative;
  }
  
  .header-left {
    justify-content: center;
    grid-column: 1;
    grid-row: 1;
  }
  
  .header-center {
    grid-column: 1;
    grid-row: 2;
  }
  
  .header-right {
    position: absolute;
    top: var(--space-md);
    right: var(--space-lg);
  }
  
  .checkbox-group {
    flex-direction: column;
  }
  
  .checkbox-item {
    min-width: auto;
  }
  
  .preview-stats {
    flex-direction: column;
    gap: var(--space-md);
  }
}

@media (max-width: 480px) {
  .modal-container {
    min-width: 320px;
  }
  
  .modal-title {
    font-size: 1.1rem;
  }
  
  .bank-name {
    font-size: 1rem;
  }
  
  .config-group {
    padding: var(--space-md);
  }
  
  .config-section {
    padding: var(--space-md);
  }
  
  .checkbox-item {
    padding: var(--space-sm);
  }
}

/* ==================== Obsidian 移动端适配 ==================== */
:global(body.is-mobile) .modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  /* 
   * Obsidian 移动端安全区域：
   * - 顶部：48px（Obsidian 顶部工具栏高度）+ 8px 间距 = 56px
   * - 底部：56px（Obsidian 底部导航栏高度）+ 8px 间距 = 64px
   * - 左右：8px 间距
   */
  padding: 56px 8px 64px 8px;
  display: flex;
  align-items: center; /* 垂直居中 */
  justify-content: center; /* 水平居中 */
  overflow: hidden;
  box-sizing: border-box;
}

:global(body.is-mobile) .modal-container {
  min-width: unset;
  width: 100%;
  max-width: 100%;
  /* 最大高度受限于 overlay 的 padding 区域 */
  max-height: 100%;
  height: auto;
  margin: 0;
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

/* 移动端头部 - 单行布局：标题左侧带多彩侧边条，牌组名称右侧 */
:global(body.is-mobile) .modal-header {
  padding: var(--space-md);
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: var(--space-sm);
  min-height: auto;
  position: relative;
  flex-shrink: 0;
  box-sizing: border-box;
}

:global(body.is-mobile) .header-left {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  position: relative;
  padding-left: var(--space-md);
}

/* 标题多彩侧边条 - 使用插件统一风格的渐变色 */
:global(body.is-mobile) .header-left::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 1.4em;
  border-radius: 2px;
  background: linear-gradient(135deg, rgba(79, 148, 244, 0.9), rgba(59, 130, 246, 0.7));
}

:global(body.is-mobile) .header-center {
  display: flex;
  align-items: center;
  justify-content: center;
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: calc(100% - 112px);
  min-width: 0;
  pointer-events: none;
}

:global(body.is-mobile) .header-right {
  position: absolute;
  top: 50%;
  right: var(--space-md);
  transform: translateY(-50%);
}

:global(body.is-mobile) .modal-title {
  font-size: 1rem;
  font-weight: 600;
  white-space: nowrap;
}

:global(body.is-mobile) .bank-name {
  font-size: 0.875rem;
  color: var(--text-muted);
  text-align: center;
  margin: 0 auto;
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global(body.is-mobile) .close-button {
  border: none;
  border-radius: 0;
  box-shadow: none;
  outline: none;
  background: transparent;
}

:global(body.is-mobile) .close-button:hover,
:global(body.is-mobile) .close-button:active,
:global(body.is-mobile) .close-button:focus,
:global(body.is-mobile) .close-button:focus-visible {
  background: transparent;
  box-shadow: none;
  outline: none;
}

/* 移动端内容区域统一样式 */
:global(body.is-mobile) .modal-content {
  padding: var(--space-md);
  flex: 1 1 auto;
  min-height: 0; /* 关键：允许flex子元素收缩 */
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  width: 100%;
  box-sizing: border-box;
}

/* 所有步骤容器统一占满宽度 */
:global(body.is-mobile) .config-step {
  width: 100%;
  box-sizing: border-box;
}

/* 第二步：配置网格移动端适配 */
:global(body.is-mobile) .config-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  width: 100%;
  max-width: none;
  padding: 0;
  margin: 0;
  box-sizing: border-box;
}

/* 第三步：高级配置移动端适配 */
:global(body.is-mobile) .advanced-config {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  width: 100%;
  max-width: none;
  padding: 0;
  margin: 0;
  box-sizing: border-box;
}

/* 统一配置区块样式 */
:global(body.is-mobile) .config-group,
:global(body.is-mobile) .config-section {
  width: 100%;
  padding: var(--space-md);
  margin: 0;
  border-radius: var(--radius-md);
  box-sizing: border-box;
}

:global(body.is-mobile) .section-header {
  padding-left: var(--space-md);
  margin-bottom: var(--space-sm);
}

:global(body.is-mobile) .section-title {
  font-size: 0.9rem;
}

/* 选项按钮移动端适配 - 更紧凑的布局 */
:global(body.is-mobile) .option-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  width: 100%;
}

:global(body.is-mobile) .option-btn {
  padding: var(--space-sm) var(--space-md);
  font-size: 0.8125rem;
  flex: 1;
  min-width: 0;
  text-align: center;
}

/* 配置预览移动端适配 */
:global(body.is-mobile) .config-preview {
  width: 100%;
  padding: var(--space-sm) var(--space-md);
  margin-top: var(--space-md);
  box-sizing: border-box;
}

:global(body.is-mobile) .preview-stats {
  flex-direction: row;
  gap: var(--space-lg);
}

:global(body.is-mobile) .stat-label {
  font-size: 0.6875rem;
}

:global(body.is-mobile) .stat-value {
  font-size: 1.1rem;
}

/* 滑块组移动端适配 */
:global(body.is-mobile) .slider-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  width: 100%;
  box-sizing: border-box;
}

:global(body.is-mobile) .slider-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  width: 100%;
  box-sizing: border-box;
}

:global(body.is-mobile) .slider-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  margin-bottom: var(--space-xs);
  padding: 0;
}

:global(body.is-mobile) .slider-label {
  font-size: 0.875rem;
}

:global(body.is-mobile) .slider-value {
  font-size: 0.875rem;
  min-width: 2.5rem;
}

:global(body.is-mobile) .config-slider {
  display: block;
  width: 100%;
  height: 8px;
  margin: 0;
  box-sizing: border-box;
}

:global(body.is-mobile) .config-slider::-webkit-slider-thumb {
  width: 24px;
  height: 24px;
}

:global(body.is-mobile) .config-slider::-moz-range-thumb {
  width: 24px;
  height: 24px;
}

/* 复选框移动端适配 */
:global(body.is-mobile) .checkbox-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  width: 100%;
  box-sizing: border-box;
}

:global(body.is-mobile) .checkbox-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-md);
  width: 100%;
  min-width: auto;
  padding: var(--space-sm) var(--space-md);
  min-height: 48px;
  background: var(--bg-primary);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  box-sizing: border-box;
}

:global(body.is-mobile) .checkbox-item:active {
  background: var(--bg-hover);
}

:global(body.is-mobile) .checkbox-custom {
  width: 1.5rem;
  height: 1.5rem;
  flex-shrink: 0;
}

:global(body.is-mobile) .checkbox-content {
  flex: 1;
  min-width: 0;
}

:global(body.is-mobile) .checkbox-title {
  font-size: 0.875rem;
}

:global(body.is-mobile) .checkbox-desc {
  font-size: 0.75rem;
  line-height: 1.3;
}

/* 底部按钮移动端适配 */
:global(body.is-mobile) .modal-footer {
  padding: var(--space-md);
  gap: var(--space-sm);
  flex-shrink: 0;
  box-sizing: border-box;
}

:global(body.is-mobile) .btn-primary,
:global(body.is-mobile) .btn-secondary {
  padding: var(--space-md) var(--space-lg);
  font-size: 0.875rem;
  min-height: 44px;
  flex: 1;
  justify-content: center;
}
</style>
