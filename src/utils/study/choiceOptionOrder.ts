import type { ChoiceQuestion } from "../../parsing/choice-question-parser";

export type ChoiceOptionOrder = "sequential" | "random";

export interface OrderedChoiceQuestionResult {
  question: ChoiceQuestion;
  displayedToOriginalLabelMap: Record<string, string>;
  originalToDisplayedLabelMap: Record<string, string>;
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getDisplayLabel(index: number): string {
  let currentIndex = index;
  let label = "";

  do {
    label = String.fromCharCode(65 + (currentIndex % 26)) + label;
    currentIndex = Math.floor(currentIndex / 26) - 1;
  } while (currentIndex >= 0);

  return label;
}

export function applyChoiceOptionOrder<T>(
  options: T[],
  order: ChoiceOptionOrder,
  seedSource: string,
  getIdentity: (option: T, index: number) => string
): T[] {
  if (order !== "random" || options.length <= 1) {
    return options;
  }

  return [...options]
    .map((option, index) => ({
      option,
      index,
      sortKey: hashString(`${seedSource}::${getIdentity(option, index)}`),
    }))
    .sort((left, right) => left.sortKey - right.sortKey || left.index - right.index)
    .map(({ option }) => option);
}

export function applyChoiceQuestionOptionOrder(
  question: ChoiceQuestion,
  order: ChoiceOptionOrder,
  seedSource: string
): OrderedChoiceQuestionResult {
  const orderedOptions = applyChoiceOptionOrder(
    question.options,
    order,
    seedSource,
    (option, index) => `${option.label}::${option.content}::${index}`
  );

  const displayedToOriginalLabelMap: Record<string, string> = {};
  const originalToDisplayedLabelMap: Record<string, string> = {};

  const remappedOptions = orderedOptions.map((option, index) => {
    const displayLabel = getDisplayLabel(index);
    displayedToOriginalLabelMap[displayLabel] = option.label;
    originalToDisplayedLabelMap[option.label] = displayLabel;

    return {
      ...option,
      label: displayLabel,
    };
  });

  return {
    question: {
      ...question,
      options: remappedOptions,
      correctAnswers: remappedOptions.filter((option) => option.isCorrect).map((option) => option.label),
    },
    displayedToOriginalLabelMap,
    originalToDisplayedLabelMap,
  };
}

export function getChoiceOptionOrderLabel(order: ChoiceOptionOrder): string {
  return order === "sequential" ? "正序" : "乱序";
}
