import type { ChoiceQuestion } from '../../parsing/choice-question-parser';
import { applyChoiceQuestionOptionOrder } from './choiceOptionOrder';

describe('applyChoiceQuestionOptionOrder', () => {
  const question: ChoiceQuestion = {
    type: 'choice',
    question: '以下哪项是正确的？',
    options: [
      { label: 'A', content: '选项甲', isCorrect: false },
      { label: 'B', content: '选项乙', isCorrect: false },
      { label: 'C', content: '选项丙', isCorrect: false },
      { label: 'D', content: '正确内容', isCorrect: true },
    ],
    correctAnswers: ['D'],
    explanation: '解释',
    isMultipleChoice: false,
  };

  it('keeps sequential order labels unchanged', () => {
    const result = applyChoiceQuestionOptionOrder(question, 'sequential', 'seed-1');

    expect(result.question.options.map((option) => option.label)).toEqual(['A', 'B', 'C', 'D']);
    expect(result.question.correctAnswers).toEqual(['D']);
    expect(result.displayedToOriginalLabelMap).toEqual({
      A: 'A',
      B: 'B',
      C: 'C',
      D: 'D',
    });
  });

  it('relabels shuffled option contents to sequential labels and remaps correct answer', () => {
    const result = applyChoiceQuestionOptionOrder(question, 'random', 'seed-2');

    expect(result.question.options.map((option) => option.label)).toEqual(['A', 'B', 'C', 'D']);
    expect(result.question.options.map((option) => option.content)).not.toEqual(['选项甲', '选项乙', '选项丙', '正确内容']);

    const correctOption = result.question.options.find((option) => option.isCorrect);
    expect(correctOption).toBeTruthy();
    expect(result.question.correctAnswers).toEqual(correctOption ? [correctOption.label] : []);
    expect(result.displayedToOriginalLabelMap[correctOption?.label || '']).toBe('D');
  });
});
