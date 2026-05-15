<script lang="ts">
  import { onMount } from 'svelte';
  import type { ChoiceQuestion, ChoiceOption } from '../../parsing/choice-question-parser';
  import type { Card } from '../../data/types';
  import type { WeavePlugin } from '../../main';
  import ChoiceOptionRenderer from '../atoms/ChoiceOptionRenderer.svelte';
  import ChoiceAccuracySticker from '../study/ChoiceAccuracySticker.svelte';
  import ObsidianRenderer from '../atoms/ObsidianRenderer.svelte';

  interface Props {
    question: ChoiceQuestion;
    showAnswer: boolean;
    onOptionSelect?: (label: string) => void;
    onShowAnswer?: () => void;
    selectedOptions?: string[];
    plugin: WeavePlugin;
    enableAnimations?: boolean;
    card?: Card;
    onAddToErrorBook?: () => void;
    onRemoveFromErrorBook?: () => void;
    currentResponseTime?: number;
  }

  let {
    question,
    showAnswer,
    onOptionSelect,
    onShowAnswer,
    selectedOptions = $bindable([]),
    plugin,
    enableAnimations = true,
    card,
    onAddToErrorBook,
    onRemoveFromErrorBook,
    currentResponseTime
  }: Props = $props();

  const sourcePath = $derived(card?.sourceFile || plugin.app.workspace.getActiveFile()?.path || '');

  let hasAnswerKey = $derived(
    Array.isArray(question.correctAnswers) && question.correctAnswers.length > 0
  );

  let hasAnswered = $derived(selectedOptions.length > 0);

  let isCorrect = $derived.by(() => {
    if (selectedOptions.length === 0 || !hasAnswerKey) return false;

    if (question.isMultipleChoice) {
      const correctLabels = question.options.filter((opt) => opt.isCorrect).map((opt) => opt.label);
      const selectedSet = new Set(selectedOptions);
      const correctSet = new Set(correctLabels);
      if (selectedSet.size !== correctSet.size) return false;
      for (const label of selectedOptions) {
        if (!correctSet.has(label)) return false;
      }
      return true;
    }

    const selectedOption = question.options.find((opt) => opt.label === selectedOptions[0]);
    return selectedOption?.isCorrect || false;
  });

  let correctAnswerLabels = $derived(
    question.options.filter((opt) => opt.isCorrect).map((opt) => opt.label)
  );

  function handleOptionClick(option: ChoiceOption) {
    if (showAnswer) return;
    const label = option.label;

    if (question.isMultipleChoice) {
      if (selectedOptions.includes(label)) {
        selectedOptions = selectedOptions.filter((value) => value !== label);
      } else {
        selectedOptions = [...selectedOptions, label];
      }
    } else {
      selectedOptions = [label];
      onShowAnswer?.();
    }

    onOptionSelect?.(label);
  }

  function handleKeyPress(event: KeyboardEvent) {
    if (showAnswer) return;

    const target = event.target as HTMLElement;
    if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) {
      return;
    }

    const key = event.key.toUpperCase();
    const option = question.options.find((opt) => opt.label === key);
    if (!option) return;

    event.preventDefault();
    handleOptionClick(option);
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeyPress, { capture: false });

    return () => {
      window.removeEventListener('keydown', handleKeyPress, { capture: false });
    };
  });
</script>

<div class="choice-question-container" class:animations-enabled={enableAnimations}>
  {#if card?.stats?.choiceStats && card.stats.choiceStats.totalAttempts > 0}
    {@const total = card.stats.choiceStats.totalAttempts}
    {@const correct = card.stats.choiceStats.correctAttempts}
    {@const accuracy = total > 0 ? (correct / total) * 100 : 0}
    <ChoiceAccuracySticker
      {accuracy}
      {correct}
      {total}
    />
  {/if}

  {#if selectedOptions.length > 0 && !showAnswer}
    <div class="choice-selection-hint">已选 {selectedOptions.length} 项</div>
  {/if}

  <section class="preview-section">
    <div class="section-title">
      <span class="section-title-chip">题干</span>
    </div>
    <div class="section-card question-card">
      <div class="question-text">
        <ObsidianRenderer
          {plugin}
          content={question.question}
          {sourcePath}
        />
      </div>
    </div>
  </section>

  {#if !hasAnswerKey}
    <div class="missing-answer-hint">该选择题缺少答案标记，建议修复原卡内容</div>
  {/if}

  <section class="preview-section">
    <div class="section-title">
      <span class="section-title-chip">选项</span>
    </div>
    <div class="options-container">
      {#each question.options as option (option.label)}
        {@const isSelected = selectedOptions.includes(option.label)}
        {@const isCorrectAnswer = option.isCorrect}
        {@const isWrongAnswer = isSelected && !isCorrectAnswer}

        <ChoiceOptionRenderer
          {option}
          isSelected={isSelected}
          isCorrect={hasAnswerKey && showAnswer && isCorrectAnswer}
          isWrong={hasAnswerKey && showAnswer && isWrongAnswer}
          disabled={showAnswer}
          showStatusIcon={hasAnswerKey && showAnswer}
          {plugin}
          {sourcePath}
          onclick={() => handleOptionClick(option)}
          className="memory-study-option"
        />
      {/each}
    </div>
  </section>

  {#if hasAnswerKey && showAnswer && hasAnswered}
    <div class="answer-comparison">
      <div class="comparison-line your-answer-line">
        <span class="comparison-label">你的答案</span>
        <span class="comparison-value" class:incorrect={!isCorrect}>
          {selectedOptions.sort().join('、')}
        </span>
      </div>
      <div class="comparison-line correct-answer-line">
        <span class="comparison-label">正确答案</span>
        <span class="comparison-value correct">
          {correctAnswerLabels.sort().join('、')}
        </span>
      </div>
    </div>
  {/if}

  {#if showAnswer && question.explanation}
    <section class="preview-section">
      <div class="section-title">
        <span class="section-title-chip">解析</span>
      </div>
      <div class="section-card answer explanation-card">
        <div class="explanation-content">
          <ObsidianRenderer
            {plugin}
            content={question.explanation}
            {sourcePath}
          />
        </div>
      </div>
    </section>
  {/if}
</div>

<style>
  .choice-question-container {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    width: min(100%, 1120px);
    margin: 0 auto;
    padding: 1.25rem 1rem 1rem;
  }

  .choice-selection-hint {
    font-size: 0.82rem;
    color: var(--text-muted);
    font-weight: 600;
    margin-bottom: -0.25rem;
  }

  .preview-section {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }

  .section-title {
    display: flex;
    align-items: center;
  }

  .section-title-chip {
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

  .section-card {
    display: flex;
    align-items: center;
    border-radius: 18px;
    padding: 1.15rem 1.35rem;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    box-shadow: none;
  }

  .section-card.answer {
    background: var(--background-secondary);
  }

  .question-card {
    min-height: 84px;
  }

  .question-text {
    width: 100%;
    font-size: 1.16rem;
    font-weight: 650;
    user-select: text;
    -webkit-user-select: text;
    cursor: text;
    color: var(--text-normal);
    line-height: 1.75;
  }

  .question-text :global(.weave-obsidian-renderer) {
    padding: 0;
    margin: 0;
    background: transparent;
    border: none;
  }

  .question-text :global(p) {
    margin: 0;
  }

  .question-text :global(p + p) {
    margin-top: 0.6rem;
  }

  .missing-answer-hint {
    font-size: 0.82rem;
    color: var(--text-warning);
    font-weight: 600;
    margin-top: -0.25rem;
  }

  .options-container {
    display: flex;
    flex-direction: column;
    gap: 0.95rem;
    border: none;
    border-radius: 0;
    overflow: visible;
    padding: 0;
  }

  .answer-comparison {
    margin: 0;
    padding: 1.05rem 1.2rem;
    background: var(--background-secondary);
    border-radius: 18px;
    border: 1px solid var(--background-modifier-border);
    align-items: stretch;
  }

  .comparison-line {
    display: flex;
    align-items: baseline;
    gap: 0.45rem;
    padding: 0.72rem 0;
    flex-wrap: wrap;
  }

  .comparison-line + .comparison-line {
    border-top: 1px solid var(--background-modifier-border);
  }

  .comparison-label {
    font-size: 0.92rem;
    color: var(--text-muted);
    font-weight: 700;
    flex-shrink: 0;
  }

  .comparison-value {
    font-size: 1.08rem;
    font-weight: 800;
    color: var(--text-normal);
  }

  .comparison-value.correct {
    color: var(--color-green);
  }

  .comparison-value.incorrect {
    color: var(--color-red);
  }

  .explanation-content {
    width: 100%;
    color: var(--text-normal);
    line-height: 1.8;
    font-size: 1rem;
  }

  .explanation-content :global(.weave-obsidian-renderer) {
    padding: 0;
    margin: 0;
    background: transparent;
    border: none;
  }

  .explanation-content :global(p) {
    margin: 0.5rem 0;
  }

  .explanation-content :global(p:first-child) {
    margin-top: 0;
  }

  .explanation-content :global(p:last-child) {
    margin-bottom: 0;
  }

  .explanation-content :global(code) {
    padding: 0.125rem 0.375rem;
    background: var(--background-modifier-border);
    border-radius: 3px;
    font-family: var(--font-monospace);
    font-size: 0.9em;
  }

  .explanation-content :global(ul),
  .explanation-content :global(ol) {
    margin: 0.75rem 0;
    padding-left: 1.5rem;
  }

  .explanation-content :global(li) {
    margin: 0.375rem 0;
  }

  .explanation-content :global(strong) {
    font-weight: 600;
    color: var(--text-normal);
  }

  @media (max-width: 768px) {
    .choice-question-container {
      width: 100%;
      padding: 0.75rem;
      gap: 1.25rem;
    }

    .section-card,
    .answer-comparison {
      padding: 1rem;
      border-radius: 16px;
    }

    .question-text {
      font-size: 1rem;
    }

    .comparison-line {
      padding: 0.5rem 0;
    }
  }
</style>
