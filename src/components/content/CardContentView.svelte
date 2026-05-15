<script lang="ts">
  import ObsidianRenderer from '../atoms/ObsidianRenderer.svelte';
  import ChoiceQuestionPreview from '../preview/ChoiceQuestionPreview.svelte';
  import ChoiceOptionRenderer from '../atoms/ChoiceOptionRenderer.svelte';
  import { resolveClozeModeForRender } from '../../utils/cloze-mode';

  import type { WeavePlugin } from '../../main';
  import type { Card } from '../../data/types';

  import { parseCardContent } from '../../parsing/card-content-parser';
  import type { ChoiceQuestion } from '../../parsing/choice-question-parser';
  import { stripHintBlock } from '../../utils/hint-block-utils';
  import {
    applyChoiceQuestionOptionOrder,
    type ChoiceOptionOrder,
  } from '../../utils/study/choiceOptionOrder';

  interface Props {
    content: string;
    plugin: WeavePlugin;
    sourcePath?: string;
    section?: 'full' | 'stem' | 'options' | 'explanation';
    showAnswer?: boolean;
    selectedOptions?: string[];
    onOptionSelect?: (label: string) => void;
    onShowAnswer?: () => void;
    enableAnimations?: boolean;
    card?: Card;
    onAddToErrorBook?: () => void;
    onRemoveFromErrorBook?: () => void;
    currentResponseTime?: number;
    userAnswer?: string | string[] | null;
    hasSubmitted?: boolean;
    onSingleSelect?: (label: string) => void;
    onMultipleToggle?: (label: string) => void;
    choiceOptionOrder?: ChoiceOptionOrder;
  }

  let {
    content,
    plugin,
    sourcePath = '',
    section = 'full',
    showAnswer = false,
    selectedOptions = $bindable([]),
    onOptionSelect,
    onShowAnswer,
    enableAnimations = true,
    card,
    onAddToErrorBook,
    onRemoveFromErrorBook,
    currentResponseTime,
    userAnswer = null,
    hasSubmitted = false,
    onSingleSelect,
    onMultipleToggle,
    choiceOptionOrder = 'sequential'
  }: Props = $props();

  const sanitizedContent = $derived(stripHintBlock(content || ''));
  const parsed = $derived(parseCardContent(sanitizedContent));
  const clozeMode = $derived.by(() => resolveClozeModeForRender(card?.content, content));
  const orderedChoiceQuestion = $derived.by<ChoiceQuestion | null>(() => {
    if (parsed.kind !== 'choice') {
      return null;
    }

    const seedSource = `${card?.uuid || sourcePath || sanitizedContent}::${parsed.choice.question}`;
    return applyChoiceQuestionOptionOrder(
      parsed.choice,
      choiceOptionOrder,
      seedSource
    ).question;
  });
</script>

{#if parsed.kind === 'choice'}
  {#if section === 'stem'}
    <ObsidianRenderer
      {plugin}
      content={orderedChoiceQuestion?.question ?? parsed.choice.question}
      sourcePath={sourcePath}
      enableClozeProcessing={true}
      showClozeAnswers={showAnswer}
      clozeMode={clozeMode}
    />
  {:else if section === 'explanation'}
    {#if parsed.choice.explanation}
      <ObsidianRenderer
        {plugin}
        content={parsed.choice.explanation}
        sourcePath={sourcePath}
        enableClozeProcessing={true}
        showClozeAnswers={showAnswer}
        clozeMode={clozeMode}
      />
    {/if}
  {:else if section === 'options'}
    {@const renderedChoice = orderedChoiceQuestion ?? parsed.choice}
    {@const hasAnswerKey = Array.isArray(renderedChoice.correctAnswers) && renderedChoice.correctAnswers.length > 0}
    {#each renderedChoice.options as option}
      {@const isMultiple = renderedChoice.isMultipleChoice}
      {@const isSelected = isMultiple
        ? Array.isArray(userAnswer) && userAnswer.includes(option.label)
        : userAnswer === option.label}
      {@const isCorrectOption = hasAnswerKey ? option.isCorrect : false}
      {@const showAsCorrect = hasAnswerKey && !!hasSubmitted && isCorrectOption && isSelected}
      {@const showAsWrong = hasAnswerKey && !!hasSubmitted && (
        (isCorrectOption && !isSelected) ||
        (!isCorrectOption && isSelected)
      )}
      {@const badgeText = hasAnswerKey && hasSubmitted
        ? (isCorrectOption && isSelected ? '你选对了'
          : !isCorrectOption && isSelected ? '你选错了'
          : isCorrectOption && !isSelected ? '漏选'
          : '')
        : ''}
      {@const badgeIcon = hasAnswerKey && hasSubmitted
        ? (isCorrectOption && isSelected ? 'check'
          : !isCorrectOption && isSelected ? 'x'
          : isCorrectOption && !isSelected ? 'alert-circle'
          : '')
        : ''}

      <ChoiceOptionRenderer
        {option}
        isSelected={isSelected}
        isCorrect={showAsCorrect}
        isWrong={showAsWrong}
        disabled={!!hasSubmitted}
        badgeText={badgeText}
        badgeIcon={badgeIcon}
        {plugin}
        {sourcePath}
        onclick={() => isMultiple
          ? onMultipleToggle?.(option.label)
          : onSingleSelect?.(option.label)}
      />
    {/each}
  {:else}
    <ChoiceQuestionPreview
      question={orderedChoiceQuestion ?? parsed.choice}
      {plugin}
      {showAnswer}
      {selectedOptions}
      {onOptionSelect}
      {onShowAnswer}
      {enableAnimations}
      {card}
      {onAddToErrorBook}
      {onRemoveFromErrorBook}
      {currentResponseTime}
    />
  {/if}
{:else}
  <ObsidianRenderer
    {plugin}
    content={parsed.markdown}
    sourcePath={sourcePath}
    enableClozeProcessing={true}
    showClozeAnswers={showAnswer}
    clozeMode={clozeMode}
  />
{/if}
